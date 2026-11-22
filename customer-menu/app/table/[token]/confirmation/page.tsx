'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Check, ForkKnife, Printer, Receipt, CheckCircle, ArrowLeft, X } from '@phosphor-icons/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CustomerAccountDrawer, AccountButton } from '@/components/CustomerAccountDrawer';
import { getCustomerOrders } from '@/lib/api';
import type { CustomerPastOrder, TableInfo } from '@/lib/types';

const fmt = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

interface StoredOrder {
  order_id: string;
  order_number: string;
  table_number: string;
  section: string;
  customer_name: string;
  customer_phone: string;
  items: {
    menu_item_id: string;
    item_name: string;
    quantity: number;
    unit_price_paise: number;
    notes?: string;
  }[];
  subtotal_paise: number;
  discount_paise?: number;
  applied_coupon_code?: string;
  cgst_paise: number;
  sgst_paise: number;
  cgst_rate?: number;
  sgst_rate?: number;
  grand_total_paise: number;
  created_at: string;
}

function ConfirmationContent() {
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) || '';

  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [pastOrders, setPastOrders] = useState<CustomerPastOrder[]>([]);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState<CustomerPastOrder | null>(null);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    try {
      const ti = sessionStorage.getItem('tableInfo');
      if (ti) setTableInfo(JSON.parse(ti));
    } catch {}
  }, []);

  const cgstRate = typeof tableInfo?.cgst_rate === 'number'
    ? tableInfo.cgst_rate
    : (typeof tableInfo?.gst_rate === 'number'
        ? tableInfo.gst_rate / 2
        : (order?.subtotal_paise && order?.cgst_paise ? Math.round((order.cgst_paise / order.subtotal_paise) * 1000) / 10 : 2.5));
  const sgstRate = typeof tableInfo?.sgst_rate === 'number'
    ? tableInfo.sgst_rate
    : (typeof tableInfo?.gst_rate === 'number'
        ? tableInfo.gst_rate / 2
        : (order?.subtotal_paise && order?.sgst_paise ? Math.round((order.sgst_paise / order.subtotal_paise) * 1000) / 10 : 2.5));

  const currentOrderCgstRate = typeof order?.cgst_rate === 'number'
    ? order.cgst_rate
    : (order?.subtotal_paise && order?.cgst_paise
        ? Math.round((order.cgst_paise / order.subtotal_paise) * 1000) / 10
        : cgstRate);
  const currentOrderSgstRate = typeof order?.sgst_rate === 'number'
    ? order.sgst_rate
    : (order?.subtotal_paise && order?.sgst_paise
        ? Math.round((order.sgst_paise / order.subtotal_paise) * 1000) / 10
        : sgstRate);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('lastOrder');
      if (stored) {
        const parsed: StoredOrder = JSON.parse(stored);
        setOrder(parsed);
        if (parsed.customer_phone) {
          getCustomerOrders(parsed.customer_phone, tableInfo?.id)
            .then((res) => {
              if (res && Array.isArray(res.data)) {
                // Keep only previous orders (different id from current one)
                const earlier = res.data.filter(
                  (po: CustomerPastOrder) => (po.id || po.order?.id) !== parsed.order_id
                );
                setPastOrders(earlier);
              }
            })
            .catch(() => {});
        }
      } else {
        router.replace(`/table/${token}`);
      }
    } catch {
      router.replace(`/table/${token}`);
    }
  }, [router, token]);

  if (!order) {
    return (
      <div className="max-w-md mx-auto min-h-dvh p-8 flex items-center justify-center text-neutral-400 text-xs font-sans">
        Loading receipt...
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 p-4 pb-16 flex flex-col justify-between font-sans selection:bg-orange-100 dark:selection:bg-orange-950 transition-colors duration-200">
      <div className="space-y-4">
        {/* Top Header with Theme Toggle */}
        <div className="flex items-center justify-between pb-1">
          <button
            onClick={() => router.push(`/table/${token}`)}
            className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} weight="bold" />
            <span>Table Menu</span>
          </button>
          <div className="flex items-center gap-2">
            <AccountButton onClick={() => setAccountOpen(true)} />
            <ThemeToggle />
          </div>
        </div>

        {/* Success Banner */}
        <div className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/80 dark:border-white/10 p-6 text-center shadow-xs double-bezel animate-fade-in-up stagger-1 transition-colors duration-200">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs animate-pop-in">
            <Check size={32} weight="bold" />
          </div>
          <h1 className="text-xl font-extrabold font-display text-neutral-900 dark:text-neutral-100 tracking-tight">
            Order Sent to Kitchen!
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Ticket <span className="font-bold text-neutral-800 dark:text-neutral-200">#{order.order_number}</span> • Table{' '}
            <span className="font-bold text-neutral-800 dark:text-neutral-200">{order.table_number}</span>
          </p>

          {/* Live Kitchen Status Steps */}
          <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-white/10 flex items-center justify-between text-left px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">Kitchen KOT Printed</div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Chef preparing your food</div>
              </div>
            </div>
            <span className="text-xs bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200/60 dark:border-orange-800/40 font-bold px-2 py-0.5 rounded-full">
              ~15-20 mins
            </span>
          </div>
        </div>

        {/* Itemized Digital Bill Card */}
        <div className="bg-white dark:bg-[#16181e] rounded-3xl border border-neutral-200/80 dark:border-white/10 p-5 shadow-xs text-xs double-bezel animate-fade-in-up stagger-2 transition-colors duration-200">
          <div className="text-center pb-3 border-b border-neutral-100 dark:border-white/10">
            <div className="font-black font-display text-sm text-neutral-900 dark:text-neutral-100 tracking-tight">
              GuruKripa Dhaba
            </div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
              Dine-In Digital Receipt • {new Date(order.created_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
          </div>

          {/* Dining Meta */}
          <div className="py-3 border-b border-neutral-100 dark:border-white/10 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Table & Section:</span>
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                Table {order.table_number} ({order.section})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Guest:</span>
              <span className="font-bold text-neutral-800 dark:text-neutral-200">{order.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 dark:text-neutral-400">Mobile:</span>
              <span className="font-bold text-neutral-800 dark:text-neutral-200 tabular-nums">+91 {order.customer_phone}</span>
            </div>
          </div>

          {/* Line Items */}
          <div className="py-3 border-b border-neutral-100 dark:border-white/10 space-y-2.5">
            <div className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Dishes Ordered
            </div>
            {order.items.map((i, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="flex-1 pr-3">
                  <div className="text-neutral-900 dark:text-neutral-100 font-bold">
                    {i.quantity} × {i.item_name}
                  </div>
                  {i.notes && <div className="text-[10px] text-neutral-400 dark:text-neutral-500 italic">({i.notes})</div>}
                </div>
                <span className="text-neutral-900 dark:text-neutral-100 font-bold tabular-nums">
                  {fmt(i.unit_price_paise * i.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
              <span>Item Total</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">{fmt(order.subtotal_paise)}</span>
            </div>
            {order.discount_paise && order.discount_paise > 0 ? (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                <span>Coupon ({order.applied_coupon_code || 'PROMO'})</span>
                <span className="tabular-nums">-{fmt(order.discount_paise)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
              <span>CGST ({currentOrderCgstRate}%)</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">{fmt(order.cgst_paise)}</span>
            </div>
            <div className="flex justify-between text-neutral-500 dark:text-neutral-400">
              <span>SGST ({currentOrderSgstRate}%)</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">{fmt(order.sgst_paise)}</span>
            </div>
            <div className="border-t border-dashed border-neutral-200 dark:border-white/10 pt-2.5 flex justify-between items-baseline font-black text-sm text-neutral-900 dark:text-neutral-100">
              <span>Total Payable</span>
              <span className="text-base text-emerald-700 dark:text-emerald-400 tabular-nums">{fmt(order.grand_total_paise)}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-white/10 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
            Payment accepted via UPI QR, Cash, or Card at your table when served.
          </div>
        </div>

        {/* Earlier Rounds Delivered */}
        {pastOrders.length > 0 && (
          <div className="space-y-3 pt-1 animate-fade-in-up stagger-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 font-black text-xs font-display text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                <Receipt size={16} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
                <span>Earlier Rounds Delivered ({pastOrders.length})</span>
              </div>
              <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle size={12} weight="fill" />
                Delivered
              </span>
            </div>

            <div className="space-y-3">
              {pastOrders.map((po, idx) => {
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
                          Round #{idx + 1}
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
        )}

        {/* Modal for Earlier Round Receipt */}
        {selectedOrderForBill && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
            onClick={() => setSelectedOrderForBill(null)}
          >
            <div
              className="w-full max-w-md bg-white dark:bg-[#16181e] rounded-t-3xl sm:rounded-3xl border border-neutral-200/80 dark:border-white/10 p-5 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar space-y-4 text-neutral-900 dark:text-neutral-100 double-bezel animate-slide-up-spring sm:animate-scale-spring"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-white/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                    <Receipt size={16} weight="bold" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-neutral-900 dark:text-neutral-100">
                      Order Receipt #{selectedOrderForBill.order_number || selectedOrderForBill.order?.order_number || 'ORD'}
                    </h3>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Table {order.table_number} • {order.section}
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
      </div>

      {/* Action Buttons */}
      <div className="mt-6 space-y-2.5">
        <button
          onClick={() => router.push(`/table/${token}`)}
          className="w-full bg-[#c21807] hover:bg-[#a91c12] active:scale-[0.99] text-white font-extrabold py-3.5 px-4 rounded-2xl text-xs transition-all shadow-md shadow-red-950/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ForkKnife size={16} weight="fill" />
          <span>Order More Dishes for This Table</span>
        </button>

        <button
          onClick={() => window.print()}
          className="w-full bg-white dark:bg-[#16181e] hover:bg-neutral-50 dark:hover:bg-white/5 active:scale-[0.99] border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 font-bold py-3 px-4 rounded-2xl text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <Printer size={16} weight="bold" />
          <span>Save / Print Bill</span>
        </button>
      </div>

      <CustomerAccountDrawer
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        tableToken={token}
        tableId={tableInfo?.id}
        tableNumber={tableInfo?.table_number}
      />
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto min-h-dvh flex items-center justify-center text-xs text-neutral-400">
          Loading receipt...
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}