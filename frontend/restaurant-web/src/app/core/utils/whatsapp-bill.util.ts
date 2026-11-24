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
  const totalAmount = isSplit ? split!.totalAmount ?? 0 : ord.totalAmount ?? 0;
  const tender = (isSplit ? split!.paymentMethod : ord.paymentMethod) || 'SETTLED';
  const payStatus =
    (isSplit ? split!.paymentStatus : ord.paymentStatus) === 'PAID'
      ? `PAID (${tender})`
      : 'PENDING';

  // 1. Items itemization with proper currency spacing
  const itemsLines = (ord.items || [])
    .map((it) => `• ${it.name} x ${it.quantity} = ₹${(it.itemTotal ?? it.quantity * it.unitPrice).toFixed(2)}`)
    .join('\n');

  // 2. Subtotal calculation
  const subtotal =
    typeof ord.subtotal === 'number' && ord.subtotal > 0
      ? ord.subtotal
      : (ord.items || []).reduce(
          (sum, it) => sum + (it.itemTotal || it.quantity * it.unitPrice),
          0,
        );

  // 3. Discount calculation
  const discountAmount = ord.discountAmount || 0;
  const couponCode = ord.appliedCouponCode
    ? ord.appliedCouponCode.trim().replace(/[*_~`]/g, '')
    : '';

  // 4. Tax / GST calculations
  const cgstAmount = ord.cgstAmount || 0;
  const sgstAmount = ord.sgstAmount || 0;
  const totalTaxAmount = ord.taxAmount || cgstAmount + sgstAmount;

  // Rate detection: from order property or inferred from taxable base
  const taxableValue = Math.max(0, subtotal - discountAmount);
  const cgstRate =
    ord.cgstRate ??
    (ord as any).cgst_rate ??
    (taxableValue > 0 && cgstAmount
      ? Math.round((cgstAmount / taxableValue) * 1000) / 10
      : undefined);
  const sgstRate =
    ord.sgstRate ??
    (ord as any).sgst_rate ??
    (taxableValue > 0 && sgstAmount
      ? Math.round((sgstAmount / taxableValue) * 1000) / 10
      : undefined);

  // 5. Build financial breakdown rows
  const financialLines: string[] = [];

  if (subtotal > 0) {
    financialLines.push(`*Subtotal:* ₹${subtotal.toFixed(2)}`);
  }

  if (discountAmount > 0) {
    const discountLabel = couponCode ? `*Discount (${couponCode}):*` : `*Discount:*`;
    financialLines.push(`${discountLabel} -₹${discountAmount.toFixed(2)}`);
  }

  if (cgstAmount > 0) {
    const cgstLabel = cgstRate != null ? `*CGST (${cgstRate}%):*` : `*CGST:*`;
    financialLines.push(`${cgstLabel} ₹${cgstAmount.toFixed(2)}`);
  }

  if (sgstAmount > 0) {
    const sgstLabel = sgstRate != null ? `*SGST (${sgstRate}%):*` : `*SGST:*`;
    financialLines.push(`${sgstLabel} ₹${sgstAmount.toFixed(2)}`);
  } else if (!cgstAmount && totalTaxAmount > 0) {
    financialLines.push(`*Taxes & GST:* ₹${totalTaxAmount.toFixed(2)}`);
  }

  if (ord.serviceChargeAmount && ord.serviceChargeAmount > 0) {
    financialLines.push(`*Service Charge:* ₹${ord.serviceChargeAmount.toFixed(2)}`);
  }

  const formattedTotal =
    typeof totalAmount === 'number'
      ? Number.isInteger(totalAmount)
        ? totalAmount.toString()
        : totalAmount.toFixed(2)
      : String(totalAmount);

  if (isSplit) {
    const ordTotalFormatted =
      typeof ord.totalAmount === 'number'
        ? Number.isInteger(ord.totalAmount)
          ? ord.totalAmount.toString()
          : ord.totalAmount.toFixed(2)
        : String(ord.totalAmount ?? 0);
    financialLines.push(`*Total Order Bill:* ₹${ordTotalFormatted}`);
    financialLines.push(
      `*Split Share (#${split!.splitIndex}/${split!.splitTotalCount}):* *₹${formattedTotal}*`,
    );
  }

  // Assemble clean structured WhatsApp message
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
    ...financialLines,
    `*Net Total:* *₹${formattedTotal}*`,
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
