import { Order } from '../models/order.model';
import { normalizeToE164 } from './phone.util';

export function buildWhatsAppBillMessage(
  restaurantName: string,
  ord: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
  } | null,
): string {
  const custName =
    ord.customerName && ord.customerName.trim() && ord.customerName !== 'Walk-in Guest'
      ? ord.customerName.trim()
      : 'Valued Guest';

  const orderRef = ord.orderNumber || `ORD-${(ord.id || '').slice(0, 8).toUpperCase()}`;
  const serviceType =
    ord.orderType === 'TAKEAWAY'
      ? `Takeaway (${ord.pickupReference || orderRef})`
      : `Table ${ord.tableNumber || 'Dine-In'}`;

  const isSplit = !!split;
  const totalAmount = isSplit ? split!.totalAmount : ord.totalAmount;
  const tender = (isSplit ? split!.paymentMethod : ord.paymentMethod) || 'SETTLED';
  const payStatus =
    (isSplit ? split!.paymentStatus : ord.paymentStatus) === 'PAID'
      ? `PAID (${tender})`
      : 'PENDING';

  const itemsLines = (ord.items || [])
    .map((it) => `• ${it.name} x ${it.quantity} = ₹${(it.quantity * it.unitPrice).toFixed(2)}`)
    .join('\n');

  const lines = [
    `*Namaste ${custName}!* 🙏`,
    `Thank you for dining at *${restaurantName || 'Our Restaurant'}*. Here is your bill receipt:`,
    '',
    `🧾 *DIGITAL TAX INVOICE*`,
    `━━━━━━━━━━━━━━━━━━`,
    `*Order Ref:* ${orderRef}${isSplit ? ` (Split Bill #${split!.splitIndex}/${split!.splitTotalCount})` : ''}`,
    `*Service:* ${serviceType}`,
    `*Date:* ${new Date(ord.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    '',
    `🍽️ *ORDER SUMMARY:*`,
    itemsLines || '• Dining Bill',
    `━━━━━━━━━━━━━━━━━━`,
    `*Net Total:* *₹${totalAmount}*`,
    `*Payment Status:* *${payStatus}*`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    `✨ *Thank you for dining with ${restaurantName || 'us'}!*`,
    `We look forward to serving you again soon. Have a wonderful day! 😊`,
  ];

  return lines.join('\n');
}

export function getWhatsAppPhoneDigits(phone: string): string {
  if (!phone) return '';
  const e164 = normalizeToE164(phone);
  return e164.replace(/\D/g, '');
}

export function getWhatsAppWebUrl(
  phone: string,
  restaurantName: string,
  ord: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
  } | null,
): string {
  const digits = getWhatsAppPhoneDigits(phone);
  if (digits.length < 10) return '';
  const msg = buildWhatsAppBillMessage(restaurantName, ord, split);
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`;
}

export function getWhatsAppAppUrl(
  phone: string,
  restaurantName: string,
  ord: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
  } | null,
): string {
  const digits = getWhatsAppPhoneDigits(phone);
  if (digits.length < 10) return '';
  const msg = buildWhatsAppBillMessage(restaurantName, ord, split);
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`;
}

export function launchExternalUrl(url: string): void {
  if (typeof window === 'undefined' || !url) return;

  // 1. Try Tauri native shell invoke (if running inside Tauri desktop app)
  try {
    const w = window as any;
    const tauriInvoke =
      w.__TAURI__?.core?.invoke || w.__TAURI__?.invoke || w.__TAURI_INTERNALS__?.invoke;
    if (typeof tauriInvoke === 'function') {
      tauriInvoke('open_external_url', { url }).catch(() => {
        // Fallback to window.open if Tauri command fails
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      return;
    }
  } catch {}

  // 2. Standard browser-level link navigation fallback
  try {
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 100);
    }
  } catch {
    window.location.href = url;
  }
}

export function openWhatsAppBill(
  phone: string,
  restaurantName: string,
  ord: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
  } | null,
  preferWeb = true,
): boolean {
  if (typeof window === 'undefined') return false;
  const digits = getWhatsAppPhoneDigits(phone);
  if (digits.length < 10) return false;

  const targetUrl = preferWeb
    ? getWhatsAppWebUrl(phone, restaurantName, ord, split)
    : getWhatsAppAppUrl(phone, restaurantName, ord, split);

  if (!targetUrl) return false;

  launchExternalUrl(targetUrl);
  return true;
}
