'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  X,
  Receipt,
  Ticket,
  Sparkle,
  Phone,
  Check,
  PencilSimple,
  SignOut,
  Fire,
  ChefHat,
  ArrowRight,
  CaretLeft,
  CaretRight,
  Copy,
} from '@phosphor-icons/react';
import { getCustomerOrders, getCustomerLoyalty, getCoupons, updateCustomerProfile } from '@/lib/api';
import { CustomerPastOrder, Coupon } from '@/lib/types';

const fmt = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export function AccountButton({
  onClick,
  activeOrderCount = 0,
}: {
  onClick: () => void;
  activeOrderCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer shrink-0"
      aria-label="Open Account"
      title="My Account, Orders & Coupons"
    >
      <User size={17} weight="bold" />
      {activeOrderCount > 0 && (
        <>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
        </>
      )}
    </button>
  );
}

interface CustomerAccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tableToken?: string;
  tableId?: string;
  tableNumber?: string;
  onApplyCoupon?: (code: string) => void;
}

export function CustomerAccountDrawer({
  isOpen,
  onClose,
  tableToken,
  tableId,
  tableNumber,
  onApplyCoupon,
}: CustomerAccountDrawerProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');

  const [pastOrders, setPastOrders] = useState<CustomerPastOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [loyaltyData, setLoyaltyData] = useState<{
    visit_count: number;
    target_visits: number;
    milestone_unlocked: boolean;
    eligible_coupon_code: string;
    reward_title: string;
    reward_description: string;
    loyalty_tier?: string;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerPastOrder | null>(null);

  // Pagination for previous orders
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 4;

  // Active tab inside the drawer
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'coupons' | 'history'>('all');

  // Load stored customer details on mount
  useEffect(() => {
    try {
      const savedPhone = localStorage.getItem('customer_phone') || '';
      const savedName = localStorage.getItem('customer_name') || '';
      if (savedPhone) {
        setPhone(savedPhone);
        setPhoneInput(savedPhone);
      }
      if (savedName) {
        setName(savedName);
        setNameInput(savedName);
      }
    } catch {}
  }, []);

  // Fetch orders, coupons, loyalty when drawer opens or phone changes
  useEffect(() => {
    if (!isOpen) return;

    const currentPhone = phone || (typeof window !== 'undefined' ? localStorage.getItem('customer_phone') || '' : '');
    if (currentPhone && currentPhone.length >= 10) {
      setPhone(currentPhone);
      refreshCustomerData(currentPhone);
    } else {
      setIsEditingPhone(true);
      fetchCoupons();
    }
  }, [isOpen, phone]);

  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await getCoupons();
      if (res?.data && Array.isArray(res.data)) {
        setCoupons(res.data.filter((c: Coupon) => c.is_active));
      }
    } catch {
      setCoupons([]);
    } finally {
      setLoadingCoupons(false);
    }
  };

  const refreshCustomerData = async (userPhone: string) => {
    const clean = userPhone.replace(/\D/g, '');
    if (clean.length < 10) return;

    setLoadingOrders(true);
    setLoadingCoupons(true);

    try {
      const [ordersRes, loyaltyRes, couponsRes] = await Promise.all([
        getCustomerOrders(clean, tableId),
        getCustomerLoyalty(clean),
        getCoupons(),
      ]);

      if (ordersRes?.data && Array.isArray(ordersRes.data)) {
        setPastOrders(ordersRes.data);
      } else {
        setPastOrders([]);
      }

      if (loyaltyRes) {
        setLoyaltyData(loyaltyRes);
        if (loyaltyRes.name && !name) {
          setName(loyaltyRes.name);
          setNameInput(loyaltyRes.name);
          try {
            localStorage.setItem('customer_name', loyaltyRes.name);
          } catch {}
        }
      }

      if (couponsRes?.data && Array.isArray(couponsRes.data)) {
        setCoupons(couponsRes.data.filter((c: Coupon) => c.is_active));
      }
    } catch {
      setPastOrders([]);
    } finally {
      setLoadingOrders(false);
      setLoadingCoupons(false);
    }
  };

  // Quick lookup when typing phone number
  const handlePhoneInputChange = async (val: string) => {
    const clean = val.replace(/\D/g, '');
    setPhoneInput(clean);
    setLookupMessage('');

    if (clean.length === 10) {
      setLookupLoading(true);
      try {
        const info = await getCustomerLoyalty(clean);
        if (info?.name) {
          setNameInput(info.name);
          setLookupMessage(`Found existing customer: ${info.name} 🎉`);
        } else {
          setLookupMessage('New diner! Enter your name below to register.');
        }
      } catch {
        setLookupMessage('');
      } finally {
        setLookupLoading(false);
      }
    }
  };

  const handleSaveProfile = async () => {
    const clean = phoneInput.replace(/\D/g, '');
    const trimmedName = nameInput.trim();
    if (clean.length < 10) return;

    setPhone(clean);
    setName(trimmedName);
    setIsEditingPhone(false);

    try {
      localStorage.setItem('customer_phone', clean);
      if (trimmedName) {
        localStorage.setItem('customer_name', trimmedName);
      }
    } catch {}

    if (trimmedName) {
      await updateCustomerProfile(clean, trimmedName);
    }

    refreshCustomerData(clean);
  };

  const handleSignOut = () => {
    try {
      localStorage.removeItem('customer_phone');
      localStorage.removeItem('customer_name');
    } catch {}
    setPhone('');
    setName('');
    setPhoneInput('');
    setNameInput('');
    setPastOrders([]);
    setLoyaltyData(null);
    setIsEditingPhone(true);
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Sort orders descending (newest first)
  const sortedOrders = useMemo(() => {
    return [...pastOrders].sort((a, b) => {
      const timeA = new Date(a.created_at || a.order?.created_at || 0).getTime();
      const timeB = new Date(b.created_at || b.order?.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [pastOrders]);

  // Separate active kitchen orders from delivered/settled orders
  const { activeOrders, completedOrders } = useMemo(() => {
    const active: CustomerPastOrder[] = [];
    const completed: CustomerPastOrder[] = [];

    for (const po of sortedOrders) {
      const st = (po.status || po.order?.status || '').toLowerCase();
      if (
        ['placed', 'confirmed', 'accepted', 'in_preparation', 'preparing', 'cooking', 'ready', 'pending'].includes(st)
      ) {
        active.push(po);
      } else {
        completed.push(po);
      }
    }
    return { activeOrders: active, completedOrders: completed };
  }, [sortedOrders]);

  // Pagination calculations for completed orders
  const totalCompletedPages = Math.max(1, Math.ceil(completedOrders.length / ordersPerPage));
  const paginatedCompletedOrders = useMemo(() => {
    const start = (currentPage - 1) * ordersPerPage;
    return completedOrders.slice(start, start + ordersPerPage);
  }, [completedOrders, currentPage]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#16181e] h-full shadow-2xl flex flex-col text-neutral-900 dark:text-neutral-100 overflow-hidden animate-slide-left border-l border-neutral-200/80 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top App Bar Header */}
        <header className="px-5 py-4 border-b border-neutral-100 dark:border-white/10 flex items-center justify-between bg-neutral-50/70 dark:bg-white/5 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              {name ? name.slice(0, 2).toUpperCase() : <User size={18} weight="bold" />}
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>{name || 'Guest Diner'}</span>
                {loyaltyData?.loyalty_tier && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
                    {loyaltyData.loyalty_tier}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                {phone ? `+91 ${phone}` : 'Account & Orders'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close Account"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          {/* Profile Details / Mobile Login Form */}
          {(!phone || isEditingPhone) ? (
            <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-200 dark:border-amber-800/40 rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Phone size={15} weight="bold" />
                  <span>Link Your Mobile Number</span>
                </span>
                {phone && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(false)}
                    className="text-[11px] font-bold text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                Enter your mobile number to view live cooking progress, saved coupons, and unlocked dining rewards.
              </p>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="bg-neutral-100 dark:bg-white/10 border border-neutral-200 dark:border-white/10 rounded-xl px-2.5 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phoneInput}
                    onChange={(e) => handlePhoneInputChange(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="flex-1 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                {lookupLoading && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-2.5 h-2.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    <span>Checking customer profile...</span>
                  </div>
                )}
                {lookupMessage && !lookupLoading && (
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {lookupMessage}
                  </p>
                )}

                <div>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Your Name (e.g. Rahul Sharma)"
                    className="w-full bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={phoneInput.replace(/\D/g, '').length < 10}
                  onClick={handleSaveProfile}
                  className="w-full bg-[#c21807] hover:bg-[#a91c12] disabled:opacity-50 text-white text-xs font-extrabold py-2.5 rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span>Save &amp; View My Account</span>
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-3xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-neutral-900 dark:text-neutral-100">
                    Profile Information
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput(phone);
                      setNameInput(name);
                      setIsEditingPhone(true);
                    }}
                    className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PencilSimple size={12} weight="bold" />
                    <span>Edit</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-[10px] font-bold text-neutral-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <SignOut size={12} weight="bold" />
                  <span>Switch</span>
                </button>
              </div>

              {/* Loyalty Progress Card */}
              <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 dark:from-amber-950/40 dark:to-orange-950/30 rounded-2xl p-3 border border-amber-300/60 dark:border-amber-700/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkle size={16} weight="fill" className="text-amber-500" />
                    <span className="text-xs font-black text-amber-900 dark:text-amber-200">
                      7-Visit Loyalty Reward
                    </span>
                  </div>
                  <span className="text-[11px] font-black text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-full tabular-nums">
                    {loyaltyData?.visit_count || 0} / {loyaltyData?.target_visits || 7} Visits
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round(((loyaltyData?.visit_count || 0) / (loyaltyData?.target_visits || 7)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                  {loyaltyData?.milestone_unlocked
                    ? '🎉 7th Visit Milestone Unlocked! Use code VISIT7FREE for 50% off.'
                    : `${Math.max(0, (loyaltyData?.target_visits || 7) - (loyaltyData?.visit_count || 0))} more visits to unlock your 50% discount.`}
                </p>
              </div>
            </div>
          )}

          {/* Tab Filter Pills (Swiggy/Zomato style) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                  : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'active'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              <Fire size={13} weight="fill" className={activeOrders.length > 0 ? 'text-amber-200 animate-pulse' : ''} />
              <span>Live Orders ({activeOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('coupons')}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'coupons'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              <Ticket size={13} weight="fill" />
              <span>Coupons ({coupons.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                  : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              <Receipt size={13} weight="fill" />
              <span>History ({completedOrders.length})</span>
            </button>
          </div>

          {/* PRIORITY 1: ACTIVE LIVE ORDERS */}
          {(activeTab === 'all' || activeTab === 'active') && (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-black font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  <ChefHat size={16} weight="bold" className="text-amber-500" />
                  <span>Active Live Orders ({activeOrders.length})</span>
                </div>
                {activeOrders.length > 0 && (
                  <span className="text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse">
                    Cooking Now
                  </span>
                )}
              </div>

              {activeOrders.length > 0 ? (
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
                        onClick={() => setSelectedReceipt(po)}
                        className="bg-white dark:bg-[#16181e] rounded-3xl p-4 border-2 border-amber-400/90 dark:border-amber-500/60 shadow-lg shadow-amber-500/5 hover:border-amber-500 transition-all cursor-pointer space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                            <span className="font-extrabold text-xs text-amber-800 dark:text-amber-300 capitalize">
                              {orderStatus} in Kitchen
                            </span>
                          </div>
                          <span className="text-xs font-black text-neutral-900 dark:text-neutral-100 tabular-nums">
                            {fmt(orderTotal)}
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                          <span>Order #{orderNum}</span>
                          <span>
                            {orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Dish preview list */}
                        <div className="space-y-1 pt-1 border-t border-neutral-100 dark:border-white/5">
                          {orderItems.map((pi) => (
                            <div key={pi.id} className="flex items-center justify-between text-xs">
                              <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                                <strong className="font-bold">{pi.quantity}×</strong> {pi.item_name}
                              </span>
                              <span className="text-neutral-500 dark:text-neutral-400 text-[11px] tabular-nums">
                                {fmt(pi.unit_price_paise * pi.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-bold">
                          <span className="text-[10px] text-neutral-400">Tap to inspect bill breakdown</span>
                          <span className="inline-flex items-center gap-1 hover:underline">
                            <Receipt size={13} weight="bold" />
                            <span>View Bill</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl p-4 text-center border border-neutral-200/60 dark:border-white/5 space-y-1">
                  <p className="text-xs font-extrabold text-neutral-700 dark:text-neutral-300">
                    No active kitchen orders
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Dishes you send to kitchen will appear live here.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* PRIORITY 2: AVAILABLE RESTAURANT COUPONS & OFFERS */}
          {(activeTab === 'all' || activeTab === 'coupons') && (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-black font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  <Ticket size={16} weight="bold" className="text-emerald-500" />
                  <span>Available Coupons &amp; Offers</span>
                </div>
                <span className="text-[10px] text-neutral-400">Tap to copy code</span>
              </div>

              {/* Milestone Unlocked Coupon Banner */}
              {loyaltyData?.milestone_unlocked && (
                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-emerald-500/15 border-2 border-dashed border-amber-400 dark:border-amber-600 rounded-3xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      Loyalty Milestone Unlocked
                    </span>
                    <div className="font-extrabold text-xs text-neutral-900 dark:text-neutral-100 pt-1">
                      {loyaltyData.reward_title}
                    </div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                      Code: <span className="font-mono">{loyaltyData.eligible_coupon_code}</span> • 50% OFF up to ₹500
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(loyaltyData.eligible_coupon_code)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                    >
                      {copiedCode === loyaltyData.eligible_coupon_code ? (
                        <>
                          <Check size={13} weight="bold" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} weight="bold" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    {onApplyCoupon && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyCoupon(loyaltyData.eligible_coupon_code);
                          onClose();
                        }}
                        className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline text-center"
                      >
                        Apply to Cart
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* List of Coupons */}
              {loadingCoupons ? (
                <div className="p-4 text-center text-xs text-neutral-400">Loading coupons...</div>
              ) : coupons.length > 0 ? (
                <div className="space-y-2.5">
                  {coupons.map((coupon) => {
                    const isPercentage = coupon.discount_type === 'PERCENTAGE';
                    const discountText = isPercentage
                      ? `${coupon.discount_value}% OFF`
                      : `₹${(coupon.discount_value / 100).toFixed(0)} FLAT OFF`;

                    return (
                      <div
                        key={coupon.id}
                        className="bg-white dark:bg-[#16181e] border border-dashed border-emerald-300 dark:border-emerald-700/60 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs hover:border-emerald-500 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                              {coupon.code}
                            </span>
                            <span className="text-[11px] font-extrabold text-neutral-900 dark:text-neutral-100">
                              {discountText}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                            {coupon.description || coupon.title || 'Special discount on your meal'}
                          </p>
                          {coupon.min_order_amount_paise ? (
                            <p className="text-[9px] text-neutral-400">
                              Min order: {fmt(coupon.min_order_amount_paise)}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(coupon.code)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            {copiedCode === coupon.code ? (
                              <>
                                <Check size={12} weight="bold" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} weight="bold" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          {onApplyCoupon && (
                            <button
                              type="button"
                              onClick={() => {
                                onApplyCoupon(coupon.code);
                                onClose();
                              }}
                              className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline text-center"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl p-4 text-center border border-neutral-200/60 dark:border-white/5 text-xs text-neutral-400">
                  No active coupon promotions currently. Check back soon!
                </div>
              )}
            </section>
          )}

          {/* PRIORITY 3: PREVIOUS ORDERS & DINING HISTORY (WITH PAGINATION) */}
          {(activeTab === 'all' || activeTab === 'history') && (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-black font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  <Receipt size={16} weight="bold" className="text-neutral-700 dark:text-neutral-300" />
                  <span>Previous Orders ({completedOrders.length})</span>
                </div>
                {completedOrders.length > 0 && (
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Page {currentPage} of {totalCompletedPages}
                  </span>
                )}
              </div>

              {loadingOrders ? (
                <div className="p-4 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  <span>Fetching dining history...</span>
                </div>
              ) : completedOrders.length > 0 ? (
                <div className="space-y-3">
                  {paginatedCompletedOrders.map((po, idx) => {
                    const orderId = po.id || po.order?.id || idx;
                    const orderNum = po.order_number || po.order?.order_number || 'ORD';
                    const orderTotal = po.total_amount_paise ?? po.order?.total_amount_paise ?? 0;
                    const orderDate = new Date(po.created_at || po.order?.created_at || Date.now());
                    const orderItems = po.items || [];

                    return (
                      <div
                        key={orderId}
                        onClick={() => setSelectedReceipt(po)}
                        className="bg-white dark:bg-[#16181e] rounded-2xl p-3.5 border border-neutral-200/80 dark:border-white/10 shadow-xs hover:border-neutral-300 dark:hover:border-white/20 transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="font-extrabold text-xs text-neutral-900 dark:text-neutral-100">
                              Delivered &amp; Settled
                            </span>
                          </div>
                          <span className="text-xs font-black text-neutral-900 dark:text-neutral-100 tabular-nums">
                            {fmt(orderTotal)}
                          </span>
                        </div>

                        <div className="text-[10px] text-neutral-400 flex items-center justify-between font-mono">
                          <span>#{orderNum}</span>
                          <span>
                            {orderDate.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            • {orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs pt-1 border-t border-neutral-100 dark:border-white/5">
                          {orderItems.slice(0, 3).map((pi) => (
                            <div key={pi.id} className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                              <span className="truncate">
                                <strong className="font-bold text-neutral-800 dark:text-neutral-200">{pi.quantity}×</strong> {pi.item_name}
                              </span>
                              <span className="text-[11px] tabular-nums shrink-0 ml-2">
                                {fmt(pi.unit_price_paise * pi.quantity)}
                              </span>
                            </div>
                          ))}
                          {orderItems.length > 3 && (
                            <div className="text-[10px] text-neutral-400 font-medium">
                              +{orderItems.length - 3} more items...
                            </div>
                          )}
                        </div>

                        <div className="pt-2 flex items-center justify-between text-xs border-t border-neutral-100 dark:border-white/5">
                          <span className="text-[10px] text-neutral-400">Tap to see invoice breakdown</span>
                          <span className="text-[11px] font-bold text-[#c21807] dark:text-orange-400 inline-flex items-center gap-1 hover:underline">
                            <Receipt size={12} weight="bold" />
                            <span>View Bill</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Clean Pagination Controls */}
                  {totalCompletedPages > 1 && (
                    <div className="pt-2 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-neutral-700 dark:text-neutral-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <CaretLeft size={14} weight="bold" />
                        <span>Prev</span>
                      </button>

                      <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                        {currentPage} / {totalCompletedPages}
                      </span>

                      <button
                        type="button"
                        disabled={currentPage >= totalCompletedPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalCompletedPages, p + 1))}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-neutral-700 dark:text-neutral-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Next</span>
                        <CaretRight size={14} weight="bold" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl p-4 text-center border border-neutral-200/60 dark:border-white/5 text-xs text-neutral-400">
                  No past orders found under this phone number.
                </div>
              )}
            </section>
          )}
        </div>

        {/* Digital Bill Receipt Modal */}
        {selectedReceipt && (
          <div
            className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setSelectedReceipt(null)}
          >
            <div
              className="w-full max-w-sm bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/80 dark:border-white/10 p-5 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar space-y-4 text-neutral-900 dark:text-neutral-100 animate-scale-spring"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Receipt Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-white/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                    <Receipt size={16} weight="bold" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-neutral-900 dark:text-neutral-100">
                      Receipt #{selectedReceipt.order_number || selectedReceipt.order?.order_number || 'ORD'}
                    </h3>
                    <p className="text-[10px] text-neutral-400">
                      {new Date(selectedReceipt.created_at || selectedReceipt.order?.created_at || Date.now()).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  Dishes
                </div>
                <div className="space-y-1.5 divide-y divide-neutral-100 dark:divide-white/5 text-xs">
                  {(selectedReceipt.items || []).map((item) => (
                    <div key={item.id} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
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

              {/* Calculation Totals */}
              <div className="pt-2 border-t border-neutral-100 dark:border-white/10 space-y-1 text-xs">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-bold">
                    {fmt(selectedReceipt.subtotal_paise ?? selectedReceipt.order?.subtotal_paise ?? 0)}
                  </span>
                </div>
                {(selectedReceipt.discount_paise ?? selectedReceipt.order?.discount_paise ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      -{fmt(selectedReceipt.discount_paise ?? selectedReceipt.order?.discount_paise ?? 0)}
                    </span>
                  </div>
                )}
                {(selectedReceipt.tax_paise ?? selectedReceipt.order?.tax_paise ?? 0) > 0 && (
                  <div className="flex justify-between text-neutral-500">
                    <span>Taxes (GST)</span>
                    <span className="tabular-nums font-bold">
                      {fmt(selectedReceipt.tax_paise ?? selectedReceipt.order?.tax_paise ?? 0)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-neutral-200 dark:border-white/10 flex justify-between font-black text-sm text-neutral-900 dark:text-neutral-100">
                  <span>Grand Total</span>
                  <span className="tabular-nums text-[#c21807] dark:text-orange-400">
                    {fmt(selectedReceipt.total_amount_paise ?? selectedReceipt.order?.total_amount_paise ?? 0)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-extrabold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Close Receipt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
