'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { placeOrder, getCustomerOrders, getTable } from '@/lib/api';
import type { CustomerPastOrder, TableInfo } from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { dynaura } from 'dynaura';
import {
  ShoppingCart,
  ArrowLeft,
  Armchair,
  ChefHat,
  Phone,
  WarningCircle,
  PaperPlaneTilt,
  Plus,
  Minus,
  CheckCircle,
  Clock,
  Receipt,
  User,
  X,
  Flame,
  Lock,
} from '@phosphor-icons/react';

const fmt = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

function CheckoutContent() {
  const { items, total, clear, update, add } = useCart();
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) || '';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tableInfo, setTableInfo] = useState<TableInfo | any>({});
  const [pastOrders, setPastOrders] = useState<CustomerPastOrder[]>([]);
  const [loadingPastOrders, setLoadingPastOrders] = useState(false);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState<CustomerPastOrder | null>(null);
  const [showOfflineWaiterModal, setShowOfflineWaiterModal] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('tableInfo');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTableInfo(parsed);
      }
      const savedName = localStorage.getItem('customer_name');
      const savedPhone = localStorage.getItem('customer_phone');
      if (savedName) setName(savedName);
      if (savedPhone) {
        setPhone(savedPhone);
        setPhoneInput(savedPhone);
        loadPast(savedPhone, stored ? JSON.parse(stored).id : undefined);
      } else {
        setIsEditingPhone(true);
      }
    } catch {}

    if (token) {
      getTable(token)
        .then((res) => {
          if (res?.data) {
            setTableInfo((prev: any) => ({
              ...prev,
              ...res.data,
              token,
            }));
            try {
              sessionStorage.setItem('tableInfo', JSON.stringify({ ...res.data, token }));
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [token]);

  const loadPast = async (ph: string, tId?: string) => {
    const clean = ph.replace(/\D/g, '');
    if (clean.length < 10) {
      setPastOrders([]);
      return;
    }
    setLoadingPastOrders(true);
    try {
      const res = await getCustomerOrders(clean, tId);
      if (res && Array.isArray(res.data)) {
        setPastOrders(res.data);
      } else {
        setPastOrders([]);
      }
    } catch {
      setPastOrders([]);
    } finally {
      setLoadingPastOrders(false);
    }
  };

  const handleSavePhone = () => {
    const clean = phoneInput.replace(/\D/g, '');
    if (clean.length >= 10) {
      setPhone(clean);
      setIsEditingPhone(false);
      try {
        localStorage.setItem('customer_phone', clean);
      } catch {}
      loadPast(clean, tableInfo.id);
    }
  };

  // Sort past orders descending: recent ones on top
  const sortedPastOrders = useMemo(() => {
    return [...pastOrders].sort((a, b) => {
      const timeA = new Date(a.created_at || a.order?.created_at || 0).getTime();
      const timeB = new Date(b.created_at || b.order?.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [pastOrders]);

  // Separate active kitchen orders from delivered/completed orders
  const { activeOrders, completedOrders } = useMemo(() => {
    const active: CustomerPastOrder[] = [];
    const completed: CustomerPastOrder[] = [];

    for (const po of sortedPastOrders) {
      const st = (po.status || po.order?.status || '').toLowerCase();
      if (['placed', 'confirmed', 'accepted', 'in_preparation', 'preparing', 'cooking', 'ready', 'pending'].includes(st)) {
        active.push(po);
      } else {
        completed.push(po);
      }
    }
    return { activeOrders: active, completedOrders: completed };
  }, [sortedPastOrders]);

  // Tax rates dynamically loaded from database (configured by admin)
  const isTableSeated = tableInfo?.status === 'OCCUPIED' && tableInfo?.ordering_enabled !== false;
  const gstRate = typeof tableInfo?.gst_rate === 'number' ? tableInfo.gst_rate : 5.0;
  const cgstRate = typeof tableInfo?.cgst_rate === 'number' ? tableInfo.cgst_rate : gstRate / 2;
  const sgstRate = typeof tableInfo?.sgst_rate === 'number' ? tableInfo.sgst_rate : gstRate / 2;
  const cgst = Math.round(total * (cgstRate / 100));
  const sgst = Math.round(total * (sgstRate / 100));
  const grandTotal = total + cgst + sgst;

  const quickNotes = ['Less Spicy', 'Extra Chutney', 'Serve Warm', 'No Onion/Garlic'];

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setIsEditingPhone(true);
      return;
    }

    if (items.length === 0) {
      setError('Your cart is empty. Add dishes from the menu.');
      return;
    }

    if (!isTableSeated) {
      setError(`Table ${tableInfo.table_number || ''} is unseated. Please ask floor staff to seat you before placing your order.`);
      dynaura.warning({
        title: `Table ${tableInfo.table_number || ''} Unseated`,
        description: 'Please ask floor captain to open your table before placing an order.',
      });
      return;
    }

    if (tableInfo.is_pos_online === false) {
      setShowOfflineWaiterModal(true);
      return;
    }

    setLoading(true);

    try {
      const orderItems = items.map((i) => ({
        menu_item_id: i.item.id,
        item_name: i.item.name,
        quantity: i.quantity,
        unit_price_paise: i.item.base_price_paise,
        notes: i.notes,
      }));

      const res = await placeOrder({
        table_id: tableInfo.id,
        table_number: tableInfo.table_number,
        customer_name: trimmedName,
        customer_phone: cleanPhone,
        items: orderItems,
        notes: notes.trim() || undefined,
      });

      const orderData = res.data;

      // Store in sessionStorage for the bill/confirmation page
      sessionStorage.setItem(
        'lastOrder',
        JSON.stringify({
          order_id: orderData.id,
          order_number: orderData.order_number,
          table_number: tableInfo.table_number || 'Dining',
          section: tableInfo.section || 'Main Floor',
          customer_name: trimmedName,
          customer_phone: cleanPhone,
          items: orderItems,
          subtotal_paise: total,
          cgst_paise: cgst,
          sgst_paise: sgst,
          cgst_rate: cgstRate,
          sgst_rate: sgstRate,
          grand_total_paise: grandTotal,
          created_at: new Date().toISOString(),
        })
      );

      try {
        localStorage.setItem('customer_name', trimmedName);
        localStorage.setItem('customer_phone', cleanPhone);
      } catch {}

      clear();
      router.push(`/table/${token}/confirmation`);
    } catch (err: any) {
      if (err.isPosOffline || String(err.message).includes('RESTAURANT_POS_OFFLINE')) {
        setShowOfflineWaiterModal(true);
        return;
      }
      setError(err.message || 'Failed to submit order. Please try again or alert staff.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-dvh bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 pb-28 flex flex-col font-sans selection:bg-orange-100 dark:selection:bg-orange-950 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-[#16181e] border-b border-neutral-200/70 dark:border-white/10 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-xs transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/table/${token}`)}
            className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Back to menu"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
          <div>
            <h1 className="font-extrabold text-neutral-900 dark:text-neutral-100 text-sm leading-tight">Cart & Table Orders</h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Table {tableInfo.table_number || 'Dining'} • {tableInfo.section || 'Dine-In Floor'}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <form onSubmit={submitOrder} className="p-4 space-y-4 flex-1">
        {/* Offline Restaurant Warning Banner */}
        {tableInfo.is_pos_online === false && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 rounded-2xl text-xs flex items-start gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-900 dark:text-amber-200 text-[11px] uppercase tracking-wide">
                Kitchen Terminal is Offline
              </div>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-relaxed mt-0.5">
                Our restaurant kitchen dispatch is currently in offline mode. Please review your dishes and notify our staff to confirm your order.
              </p>
            </div>
            {tableInfo.restaurant_phone && (
              <a
                href={`tel:${tableInfo.restaurant_phone}`}
                className="px-2.5 py-1 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100 font-bold text-[10px] shrink-0 hover:bg-amber-300 transition-colors"
              >
                Call
              </a>
            )}
          </div>
        )}
        {/* Top: Customer Mobile Number Card (Shows user number at top of cart) */}
        {phone && !isEditingPhone ? (
          <div className="bg-white dark:bg-[#16181e] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-3 flex items-center justify-between shadow-xs transition-colors duration-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Phone size={15} weight="bold" />
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider">
                  Customer Mobile Number
                </div>
                <div className="font-extrabold text-xs text-neutral-900 dark:text-neutral-100 tabular-nums">
                  +91 {phone}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhoneInput(phone);
                setIsEditingPhone(true);
              }}
              className="text-xs font-bold text-[#c21807] dark:text-orange-400 hover:underline cursor-pointer px-2 py-1 rounded-lg"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#16181e] border border-amber-200/90 dark:border-amber-900/40 rounded-2xl p-3.5 shadow-xs space-y-2 transition-colors duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <Phone size={15} weight="bold" className="text-[#c21807]" />
                <span>Enter Mobile Number</span>
              </span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">To view & link your table orders</span>
            </div>
            <div className="flex gap-2">
              <span className="bg-neutral-100 dark:bg-white/10 border border-neutral-200 dark:border-white/10 rounded-xl px-2.5 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile number"
                className="flex-1 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c21807]/20 focus:border-[#c21807]"
              />
              <button
                type="button"
                disabled={phoneInput.replace(/\D/g, '').length < 10}
                onClick={handleSavePhone}
                className="bg-[#c21807] hover:bg-[#a91c12] disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Table Banner Card (Pattern 3: Host-Seated State Machine) */}
        {isTableSeated ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/40 rounded-2xl p-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="text-emerald-700 dark:text-emerald-400">
                <Armchair size={22} weight="duotone" />
              </div>
              <div>
                <div className="font-bold text-emerald-950 dark:text-emerald-200 text-xs">
                  Dine-in at Table {tableInfo.table_number || 'Dining'}
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Instant Kitchen Dispatch • Live Table Sync
                </div>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">
              Active
            </span>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/30 border border-amber-300/80 dark:border-amber-700/60 rounded-2xl p-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Lock size={18} weight="bold" />
              </div>
              <div>
                <div className="font-extrabold text-amber-950 dark:text-amber-200 text-xs uppercase tracking-wide">
                  Table {tableInfo.table_number || 'Dining'} • Unseated
                </div>
                <div className="text-[10px] text-amber-800/90 dark:text-amber-300/80 mt-0.5">
                  Ask floor captain to seat table to activate order placement
                </div>
              </div>
            </div>
            <span className="text-[10px] bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Locked
            </span>
          </div>
        )}

        {/* Current Round (In Cart) or Empty Cart State (Hidden if phone is registered) */}
        {items.length > 0 ? (
          <>
            <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-4 shadow-xs transition-colors duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5">
                <h2 className="text-xs font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  Current Round ({items.length})
                </h2>
                <button
                  type="button"
                  onClick={() => router.push(`/table/${token}`)}
                  className="text-xs font-bold text-[#c21807] dark:text-orange-400 hover:underline cursor-pointer"
                >
                  + Add More
                </button>
              </div>

              <div className="space-y-3 pt-3 divide-y divide-neutral-100 dark:divide-white/5">
                {items.map(({ item, quantity }) => (
                  <div key={item.id} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span
                        className={`w-3.5 h-3.5 rounded-xs border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          item.is_veg
                            ? 'border-emerald-600 dark:border-emerald-400'
                            : 'border-rose-600 dark:border-rose-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.is_veg
                              ? 'bg-emerald-600 dark:bg-emerald-400'
                              : 'bg-rose-600 dark:bg-rose-400'
                          }`}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-neutral-900 dark:text-neutral-100 truncate">{item.name}</div>
                        <div className="text-[11px] font-extrabold text-neutral-700 dark:text-neutral-400 tabular-nums mt-0.5">
                          {fmt(item.base_price_paise)}
                        </div>
                      </div>
                    </div>

                    {/* Inline Stepper Button */}
                    <div className="bg-emerald-600 dark:bg-emerald-600 text-white rounded-lg py-1 px-2 shadow-2xs flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => update(item.id, quantity - 1)}
                        className="font-black text-xs hover:opacity-80 active:scale-90 transition-transform cursor-pointer p-0.5"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={11} weight="bold" />
                      </button>
                      <span className="text-xs font-extrabold tabular-nums select-none">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => add(item)}
                        className="font-black text-xs hover:opacity-80 active:scale-90 transition-transform cursor-pointer p-0.5"
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} weight="bold" />
                      </button>
                    </div>

                    <div className="w-16 text-right font-extrabold text-xs text-neutral-900 dark:text-neutral-100 tabular-nums shrink-0">
                      {fmt(item.base_price_paise * quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Cooking Instructions Card */}
            <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-4 shadow-xs transition-colors duration-200">
              <label htmlFor="notes" className="block text-xs font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <ChefHat size={16} weight="bold" className="text-neutral-700 dark:text-neutral-300" />
                <span>Cooking Instructions / Note for Chef</span>
              </label>
              <input
                id="notes"
                type="text"
                className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-[#1f242d] focus:outline-none focus:ring-2 focus:ring-[#c21807]/20 focus:border-[#c21807] transition-all"
                placeholder="e.g. Less spicy, extra onions, serve together..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {/* Quick chips */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
                {quickNotes.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setNotes((prev) => (prev ? `${prev}, ${note}` : note))}
                    className="text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-600 dark:text-neutral-300 px-2.5 py-1 rounded-full shrink-0 transition-colors cursor-pointer"
                  >
                    + {note}
                  </button>
                ))}
              </div>
            </section>

            {/* Guest Name Card */}
            <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-4 shadow-xs space-y-2 transition-colors duration-200">
              <div className="flex items-center gap-1.5 text-xs font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                <User size={15} weight="bold" />
                <span>Guest Name</span>
              </div>
              <input
                type="text"
                required
                className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-[#1f242d] focus:outline-none focus:ring-2 focus:ring-[#c21807]/20 focus:border-[#c21807] transition-all font-medium"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </section>
          </>
        ) : !phone ? (
          <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-5 shadow-xs text-center space-y-2 transition-colors duration-200">
            <div className="w-12 h-12 bg-orange-100 dark:bg-white/10 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center mx-auto mb-1">
              <ShoppingCart size={22} weight="duotone" />
            </div>
            <h2 className="text-xs font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
              Current Cart is Empty
            </h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-xs mx-auto">
              No dishes in your current round yet. Browse our menu to add new items.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/table/${token}`)}
              className="bg-[#c21807] hover:bg-[#a91c12] active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus size={14} weight="bold" />
              <span>Add Dishes from Menu</span>
            </button>
          </section>
        ) : null}

        {/* ACTIVE KITCHEN ORDERS (Separated from past delivered orders) */}
        {phone && activeOrders.length > 0 && (
          <div className="space-y-3 animate-fade-in-up stagger-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-black font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                <Clock size={16} weight="bold" className="text-amber-600 dark:text-amber-400 animate-pulse" />
                <span>Active Kitchen Orders ({activeOrders.length})</span>
              </div>
              <span className="text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                Live in Kitchen
              </span>
            </div>

            <div className="space-y-3">
              {activeOrders.map((po, idx) => {
                const orderId = po.id || po.order?.id || idx;
                const orderNum = po.order_number || po.order?.order_number || 'ORD';
                const orderTotal = po.total_amount_paise ?? po.order?.total_amount_paise ?? 0;
                const orderStatus = po.status || po.order?.status || 'preparing';
                const orderItems = po.items || [];
                const orderDate = new Date(po.created_at || po.order?.created_at || Date.now());

                return (
                  <div
                    key={orderId}
                    onClick={() => setSelectedOrderForBill(po)}
                    className="bg-white dark:bg-[#16181e] rounded-2xl p-4 border border-amber-300/80 dark:border-amber-600/40 shadow-xs hover:border-amber-400 dark:hover:border-amber-500 active:scale-[0.99] transition-all cursor-pointer space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                        <span className="font-extrabold text-xs text-amber-800 dark:text-amber-300 capitalize">
                          {orderStatus} in Kitchen
                        </span>
                        <span className="text-neutral-300 dark:text-neutral-700">•</span>
                        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                          {orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-xs font-black text-neutral-900 dark:text-neutral-100 tabular-nums">
                        {fmt(orderTotal)}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {orderItems.map((pi) => (
                        <div key={pi.id} className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums text-[11px] shrink-0">
                              {pi.quantity} ×
                            </span>
                            <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                              {pi.item_name}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400 shrink-0 ml-2">
                            {fmt(pi.unit_price_paise * pi.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2.5 flex items-center justify-between text-xs border-t border-neutral-100 dark:border-white/5">
                      <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                        #{orderNum}
                      </span>
                      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline">
                        <Receipt size={13} weight="bold" />
                        <span>View Bill</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DELIVERED & PAST ORDERS */}
        {phone && (
          loadingPastOrders ? (
            <div className="p-5 text-center text-xs text-neutral-400 bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-neutral-400/30 border-t-neutral-600 rounded-full animate-spin" />
              <span>Fetching your order history...</span>
            </div>
          ) : completedOrders.length > 0 ? (
            <div className="space-y-3 animate-fade-in-up stagger-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-black font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  <Receipt size={16} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
                  <span>Delivered Orders ({completedOrders.length})</span>
                </div>
                <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} weight="fill" />
                  Served & Delivered
                </span>
              </div>

              <div className="space-y-3">
                {completedOrders.map((po, idx) => {
                  const orderId = po.id || po.order?.id || idx;
                  const orderNum = po.order_number || po.order?.order_number || 'ORD';
                  const orderTotal = po.total_amount_paise ?? po.order?.total_amount_paise ?? 0;
                  const orderItems = po.items || [];
                  const orderDate = new Date(po.created_at || po.order?.created_at || Date.now());

                  return (
                    <div
                      key={orderId}
                      onClick={() => setSelectedOrderForBill(po)}
                      className="bg-white dark:bg-[#16181e] rounded-2xl p-4 border border-neutral-200/80 dark:border-white/10 shadow-xs hover:border-neutral-300 dark:hover:border-white/20 active:scale-[0.99] transition-all cursor-pointer space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-extrabold text-xs text-neutral-900 dark:text-neutral-100">
                            Delivered
                          </span>
                          <span className="text-neutral-300 dark:text-neutral-700">•</span>
                          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                            {orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className="text-xs font-black text-neutral-900 dark:text-neutral-100 tabular-nums">
                          {fmt(orderTotal)}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {orderItems.map((pi) => (
                          <div key={pi.id} className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums text-[11px] shrink-0">
                                {pi.quantity} ×
                              </span>
                              <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                {pi.item_name}
                              </span>
                            </div>
                            <span className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400 shrink-0 ml-2">
                              {fmt(pi.unit_price_paise * pi.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2.5 flex items-center justify-between text-xs border-t border-neutral-100 dark:border-white/5">
                        <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                          #{orderNum}
                        </span>
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#c21807] dark:text-orange-400 hover:underline">
                          <Receipt size={13} weight="bold" />
                          <span>View Bill</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeOrders.length === 0 ? (
            <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-5 text-center shadow-xs space-y-1 transition-colors duration-200">
              <div className="w-10 h-10 bg-neutral-100 dark:bg-white/10 text-neutral-400 rounded-full flex items-center justify-center mx-auto mb-1">
                <Receipt size={20} weight="duotone" />
              </div>
              <div className="font-extrabold text-xs text-neutral-800 dark:text-neutral-200">
                No Order History Found
              </div>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                No previous orders found for mobile +91 {phone} at this table.
              </p>
            </section>
          ) : null
        )}

        {/* Bill Summary - Only shown for dishes in current round */}
        {items.length > 0 && (
          <section className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/70 dark:border-white/10 p-4 shadow-xs space-y-2 transition-colors duration-200">
            <h2 className="text-xs font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mb-2">Bill Summary</h2>

            <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400">
              <span>Current Round Items</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{fmt(total)}</span>
            </div>

            <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>CGST ({cgstRate}%)</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">{fmt(cgst)}</span>
            </div>

            <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>SGST ({sgstRate}%)</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">{fmt(sgst)}</span>
            </div>

            <div className="border-t border-neutral-100 dark:border-white/10 pt-2 flex justify-between items-baseline font-bold text-xs text-neutral-800 dark:text-neutral-200">
              <span>This Round Total</span>
              <span className="text-sm font-extrabold text-[#c21807] dark:text-orange-400 tabular-nums">{fmt(grandTotal)}</span>
            </div>
          </section>
        )}

        {/* Error Notice */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
            <WarningCircle size={16} weight="bold" className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Fixed Sticky Order Bar */}
        <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#16181e] border-t border-neutral-200 dark:border-white/10 p-4 z-40 shadow-xl transition-colors duration-200">
          <div className="max-w-md mx-auto flex items-center justify-between gap-4">
            {items.length > 0 ? (
              <>
                <div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider">
                    To Pay
                  </div>
                  <div className="text-lg font-black text-neutral-900 dark:text-neutral-100 leading-tight tabular-nums">
                    {fmt(grandTotal)}
                  </div>
                </div>

                {!isTableSeated ? (
                  <button
                    type="button"
                    onClick={() => {
                      dynaura.warning({
                        title: `Table ${tableInfo.table_number || ''} is Unseated`,
                        description: 'Please ask restaurant staff to seat this table before ordering.',
                      });
                    }}
                    className="flex-1 bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-600 dark:text-neutral-300 font-extrabold text-xs py-3.5 px-4 rounded-2xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 border border-neutral-300/80 dark:border-white/10"
                  >
                    <Lock size={16} weight="bold" />
                    <span>Table Unseated • Ask Host</span>
                  </button>
                ) : tableInfo.is_pos_online === false ? (
                  <button
                    type="button"
                    onClick={() => setShowOfflineWaiterModal(true)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-extrabold text-xs py-3.5 px-4 rounded-2xl shadow-lg shadow-amber-950/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ChefHat size={16} weight="bold" />
                    <span>Call Staff to Order</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 text-white font-extrabold text-xs py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending to Kitchen...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Order to Kitchen</span>
                        <PaperPlaneTilt size={16} weight="bold" />
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => router.push(`/table/${token}`)}
                className="w-full bg-[#c21807] hover:bg-[#a91c12] active:scale-[0.98] text-white font-extrabold text-xs py-3.5 px-5 rounded-2xl shadow-lg shadow-red-950/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus size={16} weight="bold" />
                <span>Add Dishes from Menu</span>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Digital Bill Receipt Modal (Shown when clicking any order) */}
      {selectedOrderForBill && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setSelectedOrderForBill(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#16181e] rounded-t-3xl sm:rounded-3xl border border-neutral-200/80 dark:border-white/10 p-5 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar space-y-4 text-neutral-900 dark:text-neutral-100 double-bezel animate-slide-up-spring sm:animate-scale-spring"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-white/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                  <Receipt size={16} weight="bold" />
                </div>
                <div>
                  <h3 className="font-black font-display text-sm text-neutral-900 dark:text-neutral-100">
                    Order Receipt #{selectedOrderForBill.order_number || selectedOrderForBill.order?.order_number || 'ORD'}
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Table {tableInfo.table_number || 'Dining'} • {tableInfo.section || 'Main Floor'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForBill(null)}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close bill"
              >
                <X size={15} weight="bold" />
              </button>
            </div>

            {/* Order Status & Time */}
            <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl p-3 border border-neutral-100 dark:border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">Ordered At</span>
                <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                  {new Date(selectedOrderForBill.created_at || selectedOrderForBill.order?.created_at || Date.now()).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">Status</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  {selectedOrderForBill.status || selectedOrderForBill.order?.status || 'Confirmed'}
                </span>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Dishes Ordered</div>
              <div className="space-y-2 divide-y divide-neutral-100 dark:divide-white/5">
                {(selectedOrderForBill.items || []).map((item) => (
                  <div key={item.id} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">
                        {item.quantity} × {item.item_name}
                      </div>
                      {item.notes && <div className="text-[10px] text-neutral-400 italic">({item.notes})</div>}
                    </div>
                    <span className="font-extrabold text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {fmt(item.unit_price_paise * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill Breakdown with dynamic GST */}
            {(() => {
              const subtotal = selectedOrderForBill.subtotal_paise ?? selectedOrderForBill.order?.subtotal_paise ?? 0;
              const totalAmt = selectedOrderForBill.total_amount_paise ?? selectedOrderForBill.order?.total_amount_paise ?? 0;
              const taxAmt = selectedOrderForBill.tax_paise ?? selectedOrderForBill.order?.tax_paise ?? Math.max(0, totalAmt - subtotal);

              const billCgstRate = typeof selectedOrderForBill.cgst_rate === 'number'
                ? selectedOrderForBill.cgst_rate
                : (typeof selectedOrderForBill.order?.cgst_rate === 'number'
                    ? selectedOrderForBill.order.cgst_rate
                    : (subtotal > 0 && taxAmt > 0
                        ? Math.round(((taxAmt / subtotal) * 50.0) * 10) / 10
                        : cgstRate));

              const billSgstRate = typeof selectedOrderForBill.sgst_rate === 'number'
                ? selectedOrderForBill.sgst_rate
                : (typeof selectedOrderForBill.order?.sgst_rate === 'number'
                    ? selectedOrderForBill.order.sgst_rate
                    : (subtotal > 0 && taxAmt > 0
                        ? Math.round(((taxAmt / subtotal) * 50.0) * 10) / 10
                        : sgstRate));

              const totalRate = billCgstRate + billSgstRate;
              const cgstAmtPaise = totalRate > 0 ? Math.round(taxAmt * (billCgstRate / totalRate)) : Math.round(taxAmt / 2);
              const sgstAmtPaise = taxAmt - cgstAmtPaise;

              return (
                <div className="pt-3 border-t border-neutral-200/70 dark:border-white/10 space-y-1.5 text-xs">
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Items Subtotal</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
                    <span>CGST ({billCgstRate}%)</span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">{fmt(cgstAmtPaise)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
                    <span>SGST ({billSgstRate}%)</span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">{fmt(sgstAmtPaise)}</span>
                  </div>
                  <div className="border-t border-dashed border-neutral-200 dark:border-white/10 pt-2 flex justify-between items-baseline font-black text-sm text-neutral-900 dark:text-neutral-100">
                    <span>Round Total Bill</span>
                    <span className="text-base text-[#c21807] dark:text-orange-400 tabular-nums">{fmt(totalAmt)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Bill Footer info */}
            <div className="p-2.5 rounded-xl bg-neutral-100/70 dark:bg-white/5 text-[10px] text-neutral-500 dark:text-neutral-400 text-center font-medium">
              Tax rates & billing synchronized live from GuruKripa Dhaba POS system.
            </div>

            <button
              type="button"
              onClick={() => setSelectedOrderForBill(null)}
              className="w-full bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
            >
              Done / Close Receipt
            </button>
          </div>
        </div>
      )}

      {/* Offline Restaurant POS Modal: Call Staff For Order Confirmation */}
      {showOfflineWaiterModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowOfflineWaiterModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#16181e] rounded-t-3xl sm:rounded-3xl border border-neutral-200/80 dark:border-white/10 p-5 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4 text-neutral-900 dark:text-neutral-100 animate-slide-up-spring sm:animate-scale-spring"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200/70 dark:border-amber-800/40 shrink-0">
                  <WarningCircle size={22} weight="bold" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-neutral-900 dark:text-neutral-100">
                    Restaurant System Offline
                  </h3>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                    Please call staff for order confirmation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOfflineWaiterModal(false)}
                className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X size={15} weight="bold" />
              </button>
            </div>

            {/* Table Info Badge */}
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3 border border-amber-200/80 dark:border-amber-800/40 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-extrabold uppercase tracking-wider block">
                  Your Table Location
                </span>
                <span className="font-extrabold text-neutral-900 dark:text-neutral-100 text-sm">
                  Table {tableInfo.table_number || 'Dining'} • {tableInfo.section || 'Main Floor'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">
                  Guest
                </span>
                <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                  {name.trim() || 'Guest'}
                </span>
              </div>
            </div>

            {/* Items Selected */}
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase text-neutral-400 dark:text-neutral-500 tracking-wider">
                Dishes to Confirm with Waiter ({items.reduce((acc, i) => acc + i.quantity, 0)})
              </div>
              <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl p-3 border border-neutral-100 dark:border-white/5 space-y-2">
                {items.map((i) => (
                  <div key={i.item.id} className="flex justify-between items-start text-xs">
                    <div className="flex-1 pr-2">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">
                        {i.quantity} × {i.item.name}
                      </div>
                      {i.notes && <div className="text-[10px] text-neutral-400 italic">({i.notes})</div>}
                    </div>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {fmt(i.item.base_price_paise * i.quantity)}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-neutral-200/60 dark:border-white/10 flex justify-between items-baseline font-black text-xs">
                  <span>Estimated Total</span>
                  <span className="text-sm text-[#c21807] dark:text-orange-400 tabular-nums">{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Instructions Callout */}
            <div className="p-3 rounded-2xl bg-neutral-100/80 dark:bg-white/5 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
              <div className="font-bold text-neutral-800 dark:text-neutral-200">What to do next:</div>
              <p className="leading-relaxed">
                Our kitchen dispatch computer is currently offline, so online submissions cannot be received automatically. Please call your server or show them this screen so they can confirm and prepare your dishes immediately.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {tableInfo.restaurant_phone && (
                <a
                  href={`tel:${tableInfo.restaurant_phone}`}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  <Phone size={14} weight="bold" />
                  <span>Call Staff Directly ({tableInfo.restaurant_phone})</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowOfflineWaiterModal(false)}
                className="w-full bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
              >
                I Have Informed the Staff / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto min-h-dvh flex items-center justify-center text-xs text-neutral-400">
          Loading checkout...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
