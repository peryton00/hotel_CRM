import { Order } from '../models/order.model';
import { Restaurant } from '../models/restaurant.model';

export interface EscPosPrinterConfig {
  target: 'WINDOWS' | 'NETWORK' | 'BROWSER';
  printerName?: string;
  networkAddress?: string; // e.g. "192.168.1.100:9100"
  paperWidth: '80mm' | '58mm';
  autoCut: boolean;
  openCashDrawer: boolean;
}

export const DEFAULT_PRINTER_CONFIG: EscPosPrinterConfig = {
  target: 'WINDOWS',
  printerName: '',
  networkAddress: '192.168.1.100:9100',
  paperWidth: '80mm',
  autoCut: true,
  openCashDrawer: false,
};

// Standard ESC/POS Command Byte Sequences
const ESC = 0x1b;
const GS = 0x1d;

export const ESCPOS_COMMANDS = {
  INIT: [ESC, 0x40], // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  TEXT_NORMAL: [ESC, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  TEXT_DOUBLE_WIDTH: [ESC, 0x21, 0x20],
  TEXT_DOUBLE_SIZE: [ESC, 0x21, 0x30], // Double Height & Width
  LINE_FEED: [0x0a],
  DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xfa], // Pulse pin 2 for 50ms
  FEED_AND_CUT: [GS, 0x56, 0x41, 0x03], // Feed 3 lines & partial cut
};

function padRight(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return str + ' '.repeat(length - str.length);
}

function padLeft(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  return ' '.repeat(length - str.length) + str;
}

function padCenter(str: string, length: number): string {
  if (str.length >= length) return str.slice(0, length);
  const left = Math.floor((length - str.length) / 2);
  const right = length - str.length - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

export class EscPosBuilder {
  private buffer: number[] = [];
  private cols: number;

  constructor(paperWidth: '80mm' | '58mm' = '80mm') {
    this.cols = paperWidth === '58mm' ? 32 : 48;
    this.init();
  }

  init(): this {
    this.buffer.push(...ESCPOS_COMMANDS.INIT);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_LEFT);
    return this;
  }

  alignCenter(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_CENTER);
    return this;
  }

  alignRight(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_RIGHT);
    return this;
  }

  bold(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS_COMMANDS.BOLD_ON : ESCPOS_COMMANDS.BOLD_OFF));
    return this;
  }

  size(mode: 'normal' | 'double-height' | 'double-width' | 'double-size'): this {
    switch (mode) {
      case 'double-size':
        this.buffer.push(...ESCPOS_COMMANDS.TEXT_DOUBLE_SIZE);
        break;
      case 'double-height':
        this.buffer.push(...ESCPOS_COMMANDS.TEXT_DOUBLE_HEIGHT);
        break;
      case 'double-width':
        this.buffer.push(...ESCPOS_COMMANDS.TEXT_DOUBLE_WIDTH);
        break;
      default:
        this.buffer.push(...ESCPOS_COMMANDS.TEXT_NORMAL);
        break;
    }
    return this;
  }

  lineFeed(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(...ESCPOS_COMMANDS.LINE_FEED);
    }
    return this;
  }

  text(str: string): this {
    // Convert ascii/utf8 string to bytes (sanitize non-ascii symbols for thermal printers)
    const sanitized = str
      .replace(/₹/g, 'Rs.')
      .replace(/•/g, '-')
      .replace(/—/g, '-');
    for (let i = 0; i < sanitized.length; i++) {
      const code = sanitized.charCodeAt(i);
      this.buffer.push(code <= 255 ? code : 63); // 63 is '?'
    }
    return this;
  }

  textLine(str: string = ''): this {
    this.text(str);
    this.lineFeed(1);
    return this;
  }

  divider(char: string = '-'): this {
    this.alignLeft();
    this.textLine(char.repeat(this.cols));
    return this;
  }

  doubleDivider(): this {
    return this.divider('=');
  }

  twoColumnRow(left: string, right: string): this {
    const rLen = right.length;
    const lMax = Math.max(1, this.cols - rLen - 1);
    const lTrunc = left.length > lMax ? left.slice(0, lMax) : left;
    const spaces = Math.max(1, this.cols - lTrunc.length - rLen);
    this.textLine(lTrunc + ' '.repeat(spaces) + right);
    return this;
  }

  tableHeader(): this {
    if (this.cols === 32) {
      // 58mm: Item (16) Qty (4) Total (10) + 2 spaces = 32
      this.textLine(padRight('ITEM', 16) + ' ' + padRight('QTY', 4) + ' ' + padLeft('AMT', 10));
    } else {
      // 80mm: Item (22) Qty (5) Rate (8) Total (11) + 2 spaces = 48
      this.textLine(
        padRight('ITEM DESCRIPTION', 22) +
          ' ' +
          padRight('QTY', 5) +
          ' ' +
          padLeft('RATE', 8) +
          ' ' +
          padLeft('AMOUNT', 10),
      );
    }
    return this;
  }

  tableItem(name: string, qty: number, rate: number, total: number): this {
    if (this.cols === 32) {
      // 58mm
      const namePart = name.slice(0, 16);
      this.textLine(
        padRight(namePart, 16) +
          ' ' +
          padRight(String(qty), 4) +
          ' ' +
          padLeft(total.toFixed(2), 10),
      );
      if (name.length > 16) {
        this.textLine('  ' + name.slice(16, 30));
      }
    } else {
      // 80mm
      const namePart = name.slice(0, 22);
      this.textLine(
        padRight(namePart, 22) +
          ' ' +
          padRight(String(qty), 5) +
          ' ' +
          padLeft(rate.toFixed(2), 8) +
          ' ' +
          padLeft(total.toFixed(2), 10),
      );
      if (name.length > 22) {
        this.textLine('  ' + name.slice(22, 44));
      }
    }
    return this;
  }

  cut(): this {
    this.buffer.push(...ESCPOS_COMMANDS.FEED_AND_CUT);
    return this;
  }

  kickDrawer(): this {
    this.buffer.push(...ESCPOS_COMMANDS.DRAWER_KICK);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  buildByteArray(): number[] {
    return [...this.buffer];
  }
}

/**
 * Builds a complete ESC/POS binary receipt byte buffer for an order
 */
export function buildEscPosReceipt(
  restaurant: Partial<Restaurant>,
  order: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
    printCount?: number;
  } | null,
  config: Partial<EscPosPrinterConfig> = {},
): Uint8Array {
  const paper = config.paperWidth || '80mm';
  const b = new EscPosBuilder(paper);

  if (config.openCashDrawer) {
    b.kickDrawer();
  }

  // 1. Header (Restaurant Details)
  b.alignCenter();
  b.size('double-size');
  b.bold(true);
  b.textLine(restaurant.name || 'HOTEL & RESTAURANT');
  b.size('normal');
  b.bold(false);

  if (restaurant.tagline) {
    b.textLine(restaurant.tagline);
  }
  const street = restaurant.address?.street;
  if (street) {
    b.textLine(street);
  }
  const cityState = [restaurant.address?.city, restaurant.address?.state].filter(Boolean).join(', ');
  if (cityState) {
    b.textLine(cityState);
  }
  const phone = restaurant.contact?.phone;
  if (phone) {
    b.textLine(`Tel: ${phone}`);
  }
  const gstin = restaurant.taxSettings?.gstNumber;
  if (gstin) {
    b.textLine(`GSTIN: ${gstin}`);
  }
  const fssai = (restaurant as any).fssaiNumber;
  if (fssai) {
    b.textLine(`FSSAI Lic: ${fssai}`);
  }

  b.lineFeed(1);
  b.bold(true);
  b.textLine('*** TAX INVOICE ***');
  b.bold(false);

  // Reprint / Duplicate Warning
  const printCount = split?.printCount ?? order.printCount ?? 0;
  if (printCount > 1) {
    b.lineFeed(1);
    b.bold(true);
    b.textLine(`*** DUPLICATE COPY #${printCount} (REPRINT) ***`);
    b.bold(false);
  }

  b.divider();

  // 2. Order Metadata
  b.alignLeft();
  const orderRef = order.orderNumber || `ORD-${(order.id || '').slice(0, 8).toUpperCase()}`;
  b.twoColumnRow('Invoice / Order No:', orderRef);

  if (split && split.splitIndex && split.splitTotalCount) {
    b.twoColumnRow('Split Part:', `Part ${split.splitIndex} of ${split.splitTotalCount}`);
  }

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  b.twoColumnRow('Date & Time:', dateStr);

  const service =
    order.orderType === 'TAKEAWAY'
      ? `Takeaway (${order.pickupReference || 'Counter'})`
      : `Table ${order.tableNumber || 'Dine-In'}`;
  b.twoColumnRow('Service:', service);

  const serverName = (order as any).serverStaffName;
  if (serverName) {
    b.twoColumnRow('Captain / Server:', serverName);
  }
  if (order.customerName && order.customerName !== 'Walk-in Guest') {
    b.twoColumnRow('Guest:', order.customerName);
  }
  if (order.customerPhone) {
    b.twoColumnRow('Mobile:', order.customerPhone);
  }

  b.divider();

  // 3. Line Items Table
  b.tableHeader();
  b.divider();

  for (const it of order.items || []) {
    b.tableItem(it.name, it.quantity, it.unitPrice, it.quantity * it.unitPrice);
  }

  b.divider();

  // 4. Financial Calculations
  const isSplit = !!split;
  const subtotal = isSplit ? split!.totalAmount || 0 : order.subtotal || order.totalAmount;
  const grandTotal = isSplit ? split!.totalAmount || 0 : order.totalAmount;

  b.twoColumnRow('Sub Total:', `Rs. ${subtotal.toFixed(2)}`);

  if (!isSplit) {
    const tax = (order as any)?.taxBreakdown;
    const cgstAmount = tax?.cgstAmount ?? order.cgstAmount;
    const sgstAmount = tax?.sgstAmount ?? order.sgstAmount;
    const cgstRate =
      tax?.cgstRate ??
      (order as any)?.cgstRate ??
      (order.subtotal > 0 && cgstAmount
        ? Math.round((cgstAmount / order.subtotal) * 1000) / 10
        : restaurant?.taxSettings?.cgstRate ?? 2.5);
    const sgstRate =
      tax?.sgstRate ??
      (order as any)?.sgstRate ??
      (order.subtotal > 0 && sgstAmount
        ? Math.round((sgstAmount / order.subtotal) * 1000) / 10
        : restaurant?.taxSettings?.sgstRate ?? 2.5);
    if (cgstAmount) {
      b.twoColumnRow(`CGST (${cgstRate}%):`, `Rs. ${cgstAmount.toFixed(2)}`);
    }
    if (sgstAmount) {
      b.twoColumnRow(`SGST (${sgstRate}%):`, `Rs. ${sgstAmount.toFixed(2)}`);
    }
    if (tax?.serviceChargeAmount) {
      b.twoColumnRow(`Service Charge:`, `Rs. ${tax.serviceChargeAmount.toFixed(2)}`);
    }
    if (tax?.discountAmount) {
      b.twoColumnRow(`Discount:`, `-Rs. ${tax.discountAmount.toFixed(2)}`);
    }
    if (tax?.roundOffAmount) {
      b.twoColumnRow(`Round Off:`, `Rs. ${tax.roundOffAmount.toFixed(2)}`);
    }
    if (!cgstAmount && !sgstAmount && order.taxAmount) {
      b.twoColumnRow('Taxes:', `Rs. ${order.taxAmount.toFixed(2)}`);
    }
    if (order.discountAmount && !tax?.discountAmount) {
      b.twoColumnRow('Discount:', `-Rs. ${order.discountAmount.toFixed(2)}`);
    }
  }

  b.doubleDivider();

  // Grand Total Highlight
  b.size('double-height');
  b.bold(true);
  b.twoColumnRow('NET TOTAL:', `Rs. ${grandTotal.toFixed(2)}`);
  b.size('normal');
  b.bold(false);

  b.doubleDivider();

  // Payment Settlement
  const tender = (isSplit ? split!.paymentMethod : order.paymentMethod) || 'SETTLED';
  const payStatus = (isSplit ? split!.paymentStatus : order.paymentStatus) || 'PAID';
  b.twoColumnRow('Payment Status:', `${payStatus} (${tender})`);

  b.divider();

  // 5. Footer & Greetings
  b.alignCenter();
  const footer = (restaurant as any).invoiceFooter;
  if (footer) {
    b.textLine(footer);
  } else {
    b.textLine('Thank you for dining with us!');
    b.textLine('Please visit again.');
  }

  b.lineFeed(2);

  if (config.autoCut !== false) {
    b.cut();
  }

  return b.build();
}

/**
 * Renders the exact monospace thermal text representation for UI preview
 */
export function renderEscPosPreviewText(
  restaurant: Partial<Restaurant>,
  order: Order,
  split?: {
    splitIndex?: number;
    splitTotalCount?: number;
    totalAmount?: number;
    paymentStatus?: string;
    paymentMethod?: string;
    printCount?: number;
  } | null,
  config: Partial<EscPosPrinterConfig> = {},
): string {
  const cols = config.paperWidth === '58mm' ? 32 : 48;
  const lines: string[] = [];

  const divider = (char: string = '-') => char.repeat(cols);
  const center = (text: string) => padCenter(text, cols);
  const row = (left: string, right: string) => {
    const rLen = right.length;
    const lMax = Math.max(1, cols - rLen - 1);
    const lTrunc = left.length > lMax ? left.slice(0, lMax) : left;
    const spaces = Math.max(1, cols - lTrunc.length - rLen);
    return lTrunc + ' '.repeat(spaces) + right;
  };

  // Header
  lines.push(center(restaurant.name || 'HOTEL & RESTAURANT'));
  if (restaurant.tagline) lines.push(center(restaurant.tagline));
  const street = restaurant.address?.street;
  if (street) lines.push(center(street));
  const cityState = [restaurant.address?.city, restaurant.address?.state].filter(Boolean).join(', ');
  if (cityState) lines.push(center(cityState));
  const phone = restaurant.contact?.phone;
  if (phone) lines.push(center(`Tel: ${phone}`));
  const gstin = restaurant.taxSettings?.gstNumber;
  if (gstin) lines.push(center(`GSTIN: ${gstin}`));
  const fssai = (restaurant as any)?.fssaiNumber;
  if (fssai) lines.push(center(`FSSAI Lic: ${fssai}`));

  lines.push('');
  lines.push(center('*** TAX INVOICE ***'));

  const printCount = split?.printCount ?? order.printCount ?? 0;
  if (printCount > 1) {
    lines.push(center(`*** DUPLICATE COPY #${printCount} (REPRINT) ***`));
  }

  lines.push(divider('-'));

  // Order Details
  const orderRef = order.orderNumber || `ORD-${(order.id || '').slice(0, 8).toUpperCase()}`;
  lines.push(row('Invoice / Order No:', orderRef));
  if (split && split.splitIndex && split.splitTotalCount) {
    lines.push(row('Split Part:', `Part ${split.splitIndex} of ${split.splitTotalCount}`));
  }
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  lines.push(row('Date & Time:', dateStr));
  const service =
    order.orderType === 'TAKEAWAY'
      ? `Takeaway (${order.pickupReference || 'Counter'})`
      : `Table ${order.tableNumber || 'Dine-In'}`;
  lines.push(row('Service:', service));
  const server = (order as any)?.serverStaffName;
  if (server) lines.push(row('Captain / Server:', server));
  if (order.customerName && order.customerName !== 'Walk-in Guest') {
    lines.push(row('Guest:', order.customerName));
  }
  if (order.customerPhone) {
    lines.push(row('Mobile:', order.customerPhone));
  }

  lines.push(divider('-'));

  // Items table
  if (cols === 32) {
    lines.push(padRight('ITEM', 16) + ' ' + padRight('QTY', 4) + ' ' + padLeft('AMT', 10));
    lines.push(divider('-'));
    for (const it of order.items || []) {
      lines.push(
        padRight(it.name.slice(0, 16), 16) +
          ' ' +
          padRight(String(it.quantity), 4) +
          ' ' +
          padLeft(it.itemTotal.toFixed(2), 10),
      );
      if (it.name.length > 16) {
        lines.push('  ' + it.name.slice(16, 30));
      }
    }
  } else {
    lines.push(
      padRight('ITEM DESCRIPTION', 22) +
        ' ' +
        padRight('QTY', 5) +
        ' ' +
        padLeft('RATE', 8) +
        ' ' +
        padLeft('AMOUNT', 10),
    );
    lines.push(divider('-'));
    for (const it of order.items || []) {
      lines.push(
        padRight(it.name.slice(0, 22), 22) +
          ' ' +
          padRight(String(it.quantity), 5) +
          ' ' +
          padLeft(it.unitPrice.toFixed(2), 8) +
          ' ' +
          padLeft(it.itemTotal.toFixed(2), 10),
      );
      if (it.name.length > 22) {
        lines.push('  ' + it.name.slice(22, 44));
      }
    }
  }

  lines.push(divider('-'));

  // Totals
  const isSplit = !!split;
  const subtotal = isSplit ? split!.totalAmount || 0 : order.subtotal || order.totalAmount;
  const grandTotal = isSplit ? split!.totalAmount || 0 : order.totalAmount;

  lines.push(row('Sub Total:', `Rs. ${subtotal.toFixed(2)}`));

  if (!isSplit) {
    const tax = (order as any)?.taxBreakdown;
    const cgstAmount = tax?.cgstAmount ?? order.cgstAmount;
    const sgstAmount = tax?.sgstAmount ?? order.sgstAmount;
    const cgstRate =
      tax?.cgstRate ??
      (order as any)?.cgstRate ??
      (order.subtotal > 0 && cgstAmount
        ? Math.round((cgstAmount / order.subtotal) * 1000) / 10
        : restaurant?.taxSettings?.cgstRate ?? 2.5);
    const sgstRate =
      tax?.sgstRate ??
      (order as any)?.sgstRate ??
      (order.subtotal > 0 && sgstAmount
        ? Math.round((sgstAmount / order.subtotal) * 1000) / 10
        : restaurant?.taxSettings?.sgstRate ?? 2.5);
    if (cgstAmount) {
      lines.push(row(`CGST (${cgstRate}%):`, `Rs. ${cgstAmount.toFixed(2)}`));
    }
    if (sgstAmount) {
      lines.push(row(`SGST (${sgstRate}%):`, `Rs. ${sgstAmount.toFixed(2)}`));
    }
    if (tax?.serviceChargeAmount) {
      lines.push(row(`Service Charge:`, `Rs. ${tax.serviceChargeAmount.toFixed(2)}`));
    }
    if (tax?.discountAmount) {
      lines.push(row(`Discount:`, `-Rs. ${tax.discountAmount.toFixed(2)}`));
    }
    if (tax?.roundOffAmount) {
      lines.push(row(`Round Off:`, `Rs. ${tax.roundOffAmount.toFixed(2)}`));
    }
    if (!cgstAmount && !sgstAmount && order.taxAmount) {
      lines.push(row('Taxes:', `Rs. ${order.taxAmount.toFixed(2)}`));
    }
    if (order.discountAmount && !tax?.discountAmount) {
      lines.push(row('Discount:', `-Rs. ${order.discountAmount.toFixed(2)}`));
    }
  }

  lines.push(divider('='));
  lines.push(row('NET TOTAL:', `Rs. ${grandTotal.toFixed(2)}`));
  lines.push(divider('='));

  const tender = (isSplit ? split!.paymentMethod : order.paymentMethod) || 'SETTLED';
  const payStatus = (isSplit ? split!.paymentStatus : order.paymentStatus) || 'PAID';
  lines.push(row('Payment Status:', `${payStatus} (${tender})`));

  lines.push(divider('-'));

  const footer = (restaurant as any)?.invoiceFooter;
  if (footer) {
    lines.push(center(footer));
  } else {
    lines.push(center('Thank you for dining with us!'));
    lines.push(center('Please visit again.'));
  }

  lines.push('');
  lines.push(center('[ --- HARDWARE PAPER CUT --- ]'));

  return lines.join('\n');
}

/**
 * Builds an ESC/POS Test Print receipt
 */
export function buildEscPosTestReceipt(
  restaurantName: string = 'Hotel CRM Thermal POS',
  paperWidth: '80mm' | '58mm' = '80mm',
): Uint8Array {
  const b = new EscPosBuilder(paperWidth);
  b.alignCenter();
  b.size('double-size');
  b.bold(true);
  b.textLine(restaurantName);
  b.size('normal');
  b.bold(false);
  b.textLine('Thermal Printer Test Receipt');
  b.divider();
  b.alignLeft();
  b.textLine(`Paper Width: ${paperWidth}`);
  b.textLine(`Timestamp: ${new Date().toLocaleString('en-IN')}`);
  b.textLine('Status: Hardware connected & online!');
  b.divider();
  b.textLine('Characters Test:');
  b.textLine('ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789');
  b.divider();
  b.alignCenter();
  b.bold(true);
  b.textLine('*** PRINTER TEST PASSED ***');
  b.bold(false);
  b.lineFeed(2);
  b.cut();
  return b.build();
}
