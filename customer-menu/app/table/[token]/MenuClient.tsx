"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { getTable } from "@/lib/api";
import { dynaura } from "dynaura";
import type { MenuCategory, MenuItem, TableInfo } from "@/lib/types";
import { CustomerAccountDrawer, AccountButton } from "@/components/CustomerAccountDrawer";
import {
  ForkKnife,
  MagnifyingGlass,
  X,
  BowlFood,
  ListDashes,
  Plus,
  Minus,
  ArrowRight,
  Sun,
  Moon,
  ShoppingCart,
  Armchair,
  Lock,
  ArrowsClockwise,
} from "@phosphor-icons/react";

const fmt = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

export default function MenuClient({
  table,
  categories,
  items,
  token,
}: {
  table: TableInfo;
  categories: MenuCategory[];
  items: MenuItem[];
  token: string;
}) {
  const { selectSession, add, update, items: cartItems, count, total } = useCart();
  const [menuItems, setMenuItems] = useState<MenuItem[]>(items);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "veg" | "non-veg">(
    "all",
  );
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [tableStatus, setTableStatus] = useState<string>(
    (table.status || "AVAILABLE").toUpperCase(),
  );
  const [isPosOnline, setIsPosOnline] = useState<boolean>(table.is_pos_online ?? true);
  const [seatingSessionId, setSeatingSessionId] = useState<string | undefined>(
    table.current_seating_session_id,
  );
  useEffect(() => { selectSession(token, seatingSessionId); }, [selectSession, token, seatingSessionId]);
  const prevStatusRef = useRef((table.status || "AVAILABLE").toUpperCase());

  useEffect(() => {
    prevStatusRef.current = (tableStatus || '').toUpperCase();
  }, [tableStatus]);

  const [isCheckingTable, setIsCheckingTable] = useState(false);
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isTableSeated =
    (tableStatus || '').toUpperCase() === "OCCUPIED" && table.ordering_enabled !== false;

  const checkStatusNow = async (silent = false) => {
    setIsCheckingTable(true);
    try {
      const res = await getTable(token);
      if (res?.data?.is_pos_online !== undefined) {
        setIsPosOnline(Boolean(res.data.is_pos_online));
      }
      const newStatus = res?.data?.status ? res.data.status.toUpperCase() : undefined;
      if (res?.data?.current_seating_session_id) {
        setSeatingSessionId(res.data.current_seating_session_id);
      } else if (newStatus && newStatus !== "OCCUPIED") {
        setSeatingSessionId(undefined);
      }
      if (newStatus) {
        setTableStatus(newStatus);
        if (newStatus === "OCCUPIED" && (!silent || prevStatusRef.current !== newStatus)) {
          dynaura.success({
            title: `Table ${table.table_number || token} Seated!`,
            description: "Ordering unlocked! Welcome to GuruKripa Dhaba.",
          });
        } else if (!silent) {
          dynaura.info({
            title: `Table ${table.table_number || token} Unseated`,
            description:
              "Please ask our floor host or waiter to open your table.",
          });
        }
      }
    } catch {
      if (!silent) {
        dynaura.error({
          title: "Connection Error",
          description: "Could not reach server to check table status.",
        });
      }
    } finally {
      setIsCheckingTable(false);
    }
  };

  // Auto-poll table & POS online status
  useEffect(() => {
    const interval = setInterval(() => {
      checkStatusNow(true);
    }, tableStatus === "OCCUPIED" ? 12000 : 6000);
    return () => clearInterval(interval);
  }, [tableStatus, token]);

  // Initialize theme from document/localStorage
  useEffect(() => {
    try {
      const isHtmlDark = document.documentElement.classList.contains("dark");
      setIsDark(isHtmlDark);
    } catch {}
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    const themeStr = nextDark ? "dark" : "light";
    if (nextDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
    try {
      localStorage.setItem("customer_theme", themeStr);
    } catch {}
  };

  // Persist table context in sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "tableInfo",
        JSON.stringify({
          id: table.id,
          table_number: table.table_number,
          section: table.section,
          status: tableStatus,
          ordering_enabled: table.ordering_enabled,
          current_seating_session_id: seatingSessionId,
          token,
          gst_rate: table.gst_rate ?? 5.0,
          cgst_rate: table.cgst_rate ?? (table.gst_rate ?? 5.0) / 2,
          sgst_rate: table.sgst_rate ?? (table.gst_rate ?? 5.0) / 2,
          service_charge_rate: table.service_charge_rate ?? 0.0,
          restaurant_phone: table.restaurant_phone,
          is_pos_online: table.is_pos_online ?? true,
          restaurant_status: table.restaurant_status ?? "ONLINE",
        }),
      );
    } catch {}
  }, [table, token, tableStatus]);

  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.is_active)
        .sort((a, b) => a.display_order - b.display_order),
    [categories],
  );

  const filtered = useMemo(() => {
    let list = menuItems.filter((i) => i.is_available);
    if (filterType === "veg") list = list.filter((i) => i.is_veg);
    if (filterType === "non-veg") list = list.filter((i) => !i.is_veg);
    if (activeCat) list = list.filter((i) => i.category_id === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [menuItems, activeCat, search, filterType]);

  const getQty = (id: string) =>
    cartItems.find((i) => i.item.id === id)?.quantity ?? 0;

  // Group items by category for realistic Swiggy/Zomato menu sections
  const groupedSections = useMemo(() => {
    if (activeCat || search.trim() || filterType !== "all") {
      return [{ category: null, items: filtered }];
    }
    return activeCategories
      .map((cat) => ({
        category: cat,
        items: menuItems.filter((i) => i.category_id === cat.id && i.is_available),
      }))
      .filter((section) => section.items.length > 0);
  }, [filtered, activeCat, search, filterType, activeCategories, menuItems]);

  return (
    <div className="max-w-md mx-auto pb-32 min-h-dvh bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans selection:bg-orange-100 dark:selection:bg-orange-950 transition-colors duration-200">
      {/* 1. Brand & Table Dine-In Header */}
      <header className="bg-white dark:bg-[#16181e] border-b border-neutral-200/70 dark:border-white/10 px-4 pt-3.5 pb-3 sticky top-0 z-30 shadow-xs transition-colors duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
              <img
                src="/logo.svg"
                alt="Restaurant Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold font-display text-neutral-900 dark:text-neutral-100 text-base tracking-tight leading-tight">
                  GuruKripa Dhaba
                </h1>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !isPosOnline
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  } animate-pulse`}
                  title={
                    !isPosOnline
                      ? "Kitchen System Offline"
                      : "Kitchen System Online"
                  }
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px]">
                  Table {table.table_number}
                </span>
                <span>•</span>
                <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                  {table.section}
                </span>
                {!isPosOnline && (
                  <>
                    <span>•</span>
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      Offline Mode
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cart Button near Theme Toggle */}
            <button
              onClick={() => router.push(`/table/${token}/checkout`)}
              className="relative w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer touch-tactile active:scale-90"
              aria-label="View Cart"
            >
              <ShoppingCart size={17} weight="bold" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#c21807] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center tabular-nums shadow-xs animate-pop-in">
                  {count}
                </span>
              )}
            </button>

            {/* Account & Orders Drawer */}
            <AccountButton onClick={() => setAccountOpen(true)} />

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer touch-tactile active:scale-90"
              aria-label="Toggle light and dark theme"
            >
              {isDark ? (
                <Sun size={17} weight="bold" className="text-amber-400" />
              ) : (
                <Moon size={17} weight="bold" />
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-3 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
            <MagnifyingGlass size={16} weight="bold" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="w-full bg-neutral-100/90 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 border border-transparent focus:border-[#c21807] dark:focus:border-[#ea580c] focus:bg-white dark:focus:bg-[#1a1e27] rounded-xl pl-9 pr-8 py-2.5 text-xs font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-3 focus:ring-[#c21807]/15 transition-all"
            placeholder="Search for dishes, starters, breads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              aria-label="Clear search"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Offline Restaurant Banner */}
        {!isPosOnline && (
          <div className="mt-2.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 flex items-start gap-2.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-900 dark:text-amber-200 text-[11px] uppercase tracking-wide">
                Digital Ordering Paused (Kitchen Offline)
              </div>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-relaxed mt-0.5">
                Our restaurant kitchen system is currently offline. Please call staff to place your order directly.
              </p>
            </div>
            {table.restaurant_phone ? (
              <a
                href={`tel:${table.restaurant_phone}`}
                className="px-2.5 py-1 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100 font-bold text-[10px] shrink-0 hover:bg-amber-300 transition-colors"
              >
                Call Staff
              </a>
            ) : null}
          </div>
        )}

        {/* Veg / Non-Veg Filter Chips */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-neutral-100 dark:border-white/5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterType("all")}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all shrink-0 cursor-pointer touch-tactile active:scale-95 ${
              filterType === "all"
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 border-neutral-900 dark:border-neutral-100 shadow-xs"
                : "bg-white dark:bg-[#1f232b] text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5"
            }`}
          >
            All Items
          </button>

          <button
            onClick={() => setFilterType(filterType === "veg" ? "all" : "veg")}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all shrink-0 cursor-pointer touch-tactile active:scale-95 ${
              filterType === "veg"
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-500 shadow-xs ring-1 ring-emerald-500"
                : "bg-white dark:bg-[#1f232b] text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5"
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-xs border-2 border-emerald-600 dark:border-emerald-400 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            </span>
            Veg Only
          </button>

          <button
            onClick={() =>
              setFilterType(filterType === "non-veg" ? "all" : "non-veg")
            }
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all shrink-0 cursor-pointer touch-tactile active:scale-95 ${
              filterType === "non-veg"
                ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-500 shadow-xs ring-1 ring-rose-500"
                : "bg-white dark:bg-[#1f232b] text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5"
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-xs border-2 border-rose-600 dark:border-rose-400 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
            </span>
            Non-Veg
          </button>

          <div className="hidden min-[360px]:block ml-auto text-[11px] text-neutral-400 dark:text-neutral-500 font-medium whitespace-nowrap pl-2">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </div>
        </div>
      </header>

      {/* 2. Sticky Category Bar */}
      <nav className="bg-white/95 dark:bg-[#16181e]/95 backdrop-blur-md border-b border-neutral-200/70 dark:border-white/10 px-3 py-2 sticky top-[138px] z-20 flex gap-2 overflow-x-auto no-scrollbar transition-colors duration-200">
        <button
          onClick={() => setActiveCat(null)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer touch-tactile active:scale-95 ${
            activeCat === null
              ? "bg-[#c21807] text-white shadow-xs"
              : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
          }`}
        >
          All
        </button>
        {activeCategories.map((c) => {
          const isSelected = activeCat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer touch-tactile active:scale-95 ${
                isSelected
                  ? "bg-[#c21807] text-white shadow-xs"
                  : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      {/* 3. Main Dishes Feed */}
      <main className="p-4 space-y-6 flex-1">
        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/80 dark:border-white/10 p-8 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-white/5 text-orange-500 dark:text-orange-400 flex items-center justify-center mx-auto mb-3">
              <BowlFood size={32} weight="duotone" />
            </div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              No dishes found
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs mx-auto">
              We couldn't find any dishes matching your current search or diet
              filter.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setFilterType("all");
                setActiveCat(null);
              }}
              className="mt-4 px-4 py-2 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-950/60 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          groupedSections.map((section, idx) => (
            <div
              key={section.category ? section.category.id : `group-${idx}`}
              className="space-y-4"
            >
              {section.category && (
                <div className="pt-2">
                  <h2 className="text-base font-extrabold font-display text-neutral-900 dark:text-neutral-100 tracking-tight">
                    {section.category.name}
                  </h2>
                </div>
              )}

              <div className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 divide-y divide-neutral-100 dark:divide-white/5 overflow-hidden shadow-xs double-bezel transition-colors duration-200">
                {section.items.map((item, itemIdx) => {
                  const qty = getQty(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`group p-4 flex items-start justify-between gap-4 transition-all duration-300 hover:bg-neutral-50/70 dark:hover:bg-white/3 animate-fade-in-up ${
                        itemIdx < 6 ? `stagger-${Math.min(itemIdx + 1, 6)}` : ""
                      }`}
                    >
                      {/* Left: Metadata & Pricing */}
                      <div className="flex-1 min-w-0 pr-1">
                        {/* Veg / Non-Veg Indicator */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`w-3.5 h-3.5 rounded-xs border-2 flex items-center justify-center shrink-0 ${
                              item.is_veg
                                ? "border-emerald-600 dark:border-emerald-400"
                                : "border-rose-600 dark:border-rose-400"
                            }`}
                            title={
                              item.is_veg ? "Vegetarian" : "Non-Vegetarian"
                            }
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.is_veg
                                  ? "bg-emerald-600 dark:bg-emerald-400"
                                  : "bg-rose-600 dark:bg-rose-400"
                              }`}
                            />
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-wide ${
                              item.is_veg
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {item.is_veg ? "Veg" : "Non-Veg"}
                          </span>
                        </div>

                        {/* Dish Name */}
                        <h3 className="font-bold font-display text-[15px] text-neutral-900 dark:text-neutral-100 leading-snug tracking-tight">
                          {item.name}
                        </h3>

                        {/* Price */}
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="font-extrabold text-neutral-900 dark:text-neutral-100 text-sm tabular-nums">
                            {fmt(item.base_price_paise)}
                          </span>
                        </div>

                        {/* Description */}
                        {item.description && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-1.5 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Right: Food Image with Overlapping Add Stepper */}
                      <div className="relative shrink-0 flex flex-col items-center">
                        <div className="w-28 h-24 sm:w-32 sm:h-26 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-white/5 border border-neutral-100 dark:border-white/10 shadow-2xs relative">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 bg-neutral-50 dark:bg-white/3">
                              <BowlFood
                                size={28}
                                weight="duotone"
                                className="text-neutral-400 dark:text-neutral-500"
                              />
                              <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mt-1">
                                Kitchen Fresh
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Overlapping Action Button */}
                        <div className="absolute -bottom-2.5 inset-x-2 flex justify-center">
                          {qty === 0 ? (
                            <button
                              onClick={() => {
                                if (!isTableSeated) {
                                  dynaura.warning({
                                    title: `Table ${table.table_number || token} Unseated`,
                                    description: 'Please ask our floor captain to open your dining table before adding dishes.',
                                  });
                                  return;
                                }
                                add(item);
                              }}
                              className={`w-full max-w-[100px] ${
                                !isTableSeated
                                  ? 'bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400 border-neutral-300/80 dark:border-white/10 cursor-not-allowed'
                                  : 'bg-white dark:bg-[#20242d] hover:bg-neutral-50 dark:hover:bg-[#272c37] text-emerald-700 dark:text-emerald-400 border-neutral-200/90 dark:border-white/15 cursor-pointer'
                              } active:scale-90 border font-extrabold text-xs uppercase py-1.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1 touch-tactile`}
                              aria-label={`Add ${item.name} to cart`}
                            >
                              <span>ADD</span>
                              <Plus
                                size={12}
                                weight="bold"
                                className={!isTableSeated ? "text-neutral-400" : "text-emerald-500 dark:text-emerald-400"}
                              />
                            </button>
                          ) : (
                            <div className="w-full max-w-[100px] bg-emerald-600 dark:bg-emerald-600 text-white rounded-xl py-1 px-2 shadow-md flex items-center justify-between border border-emerald-700 dark:border-emerald-500 transition-all animate-pop-in">
                              <button
                                onClick={() => update(item.id, qty - 1)}
                                className="font-black p-1 hover:opacity-80 active:scale-80 transition-transform cursor-pointer touch-tactile"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={12} weight="bold" />
                              </button>
                              <span className="text-xs font-extrabold tabular-nums select-none">
                                {qty}
                              </span>
                              <button
                                onClick={() => {
                                  if (!isTableSeated) {
                                    dynaura.warning({
                                      title: `Table ${table.table_number || token} Unseated`,
                                      description: 'Please ask our floor captain to open your dining table before adding dishes.',
                                    });
                                    return;
                                  }
                                  add(item);
                                }}
                                className="font-black p-1 hover:opacity-80 active:scale-80 transition-transform cursor-pointer touch-tactile"
                                aria-label="Increase quantity"
                              >
                                <Plus size={12} weight="bold" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* 4. Floating Browse Menu Button */}
      {!isMenuDrawerOpen && (
        <div className="fixed bottom-20 right-4 z-20 animate-slide-up-spring">
          <button
            onClick={() => setIsMenuDrawerOpen(true)}
            className="bg-neutral-900/95 dark:bg-[#20242d]/95 hover:bg-neutral-900 dark:hover:bg-[#272c37] text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 border border-neutral-800 dark:border-white/15 backdrop-blur-md active:scale-95 transition-all cursor-pointer touch-tactile"
            aria-label="Open menu category drawer"
          >
            <ListDashes size={16} weight="bold" />
            <span>Menu</span>
          </button>
        </div>
      )}

      {/* Menu Category Modal / Bottom Sheet */}
      {isMenuDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#16181e] w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-neutral-100 dark:border-white/10 max-h-[70vh] flex flex-col animate-slide-up-spring double-bezel">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/10">
              <h3 className="font-extrabold font-display text-neutral-900 dark:text-neutral-100 text-sm">
                Jump to Category
              </h3>
              <button
                onClick={() => setIsMenuDrawerOpen(false)}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors cursor-pointer touch-tactile active:scale-90"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <div className="py-2 overflow-y-auto space-y-1 divide-y divide-neutral-50 dark:divide-white/5 flex-1">
              <button
                onClick={() => {
                  setActiveCat(null);
                  setIsMenuDrawerOpen(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer touch-tactile active:scale-[0.98]"
              >
                <span className="font-bold text-xs text-neutral-800 dark:text-neutral-200">
                  All Dishes
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 font-semibold">
                  {items.filter((i) => i.is_available).length}
                </span>
              </button>
              {activeCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCat(c.id);
                    setIsMenuDrawerOpen(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer touch-tactile active:scale-[0.98]"
                >
                  <span className="font-bold text-xs text-neutral-800 dark:text-neutral-200">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Floating Bottom Cart Bar */}
      {count > 0 && (
        <aside
          aria-label="Cart summary"
          className="fixed bottom-4 left-0 right-0 px-4 z-40 pointer-events-none animate-slide-up-spring"
        >
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={() => router.push(`/table/${token}/checkout`)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl py-3.5 px-4 flex items-center justify-between shadow-2xl shadow-emerald-950/30 border border-emerald-500/40 transition-all cursor-pointer touch-tactile"
            >
              <div className="flex items-center gap-3">
                <div className="bg-emerald-700 text-white text-xs font-black px-2.5 py-1 rounded-lg tabular-nums">
                  {count} {count === 1 ? "ITEM" : "ITEMS"}
                </div>
                <div className="text-left">
                  <div className="font-black text-sm leading-tight tabular-nums">
                    {fmt(total)}
                  </div>
                  <div className="text-[10px] text-emerald-100 font-medium">
                    plus taxes
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 font-extrabold text-sm tracking-wide">
                <span>View Cart</span>
                <ArrowRight size={16} weight="bold" />
              </div>
            </button>
          </div>
        </aside>
      )}

      {/* Swiggy/Zomato style Customer Account Drawer */}
      <CustomerAccountDrawer
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        tableToken={token}
        tableId={table.id}
        tableNumber={table.table_number}
      />
    </div>
  );
}
