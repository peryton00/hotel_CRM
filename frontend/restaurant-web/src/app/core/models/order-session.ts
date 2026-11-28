import { Order, OrderStatus } from './order.model';
export interface OrderSessionGroup {
  sessionId: string;
  primaryOrder: Order;
  latestOrder: Order;
  orders: Order[];
  isMultiRound: boolean;
  orderCount: number;
  tableNumber?: string;
  tableId?: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  pickupReference?: string;
  customerName: string;
  customerPhone?: string;
  serverStaffId?: string;
  createdAt: string;
  latestCreatedAt: string;
  grandSubtotal: number;
  grandTax: number;
  grandDiscount: number;
  grandTotal: number;
  effectiveStatus: OrderStatus;
  isAllCompleted: boolean;
  isAllPaid: boolean;
  isSplit?: boolean;
  splitCount?: number;
  printCount?: number;
  paymentMethod?: string;
}

export function needsKitchen(order: Order) {
  return (
    order.paymentStatus !== 'PAID' && (order.status === 'PENDING' || order.status === 'ACCEPTED')
  );
}
export function groupOrdersIntoSessions(ordersList: Order[]): OrderSessionGroup[] {
  const sessionMap = new Map<string, Order[]>();

  // Older tills could reuse a visit after closing only its first round.
  const closures = new Map<string, number[]>();
  for (const order of ordersList) {
    if (!order.seatingSessionId || !order.settledAt || order.paymentStatus !== 'PAID') continue;
    const times = closures.get(order.seatingSessionId) ?? [];
    times.push(Date.parse(order.settledAt));
    closures.set(order.seatingSessionId, times);
  }

  for (const ord of ordersList) {
    let key = '';
    if (ord.seatingSessionId) {
      const visit = (closures.get(ord.seatingSessionId) ?? []).filter(
        (t) => t < Date.parse(ord.createdAt),
      ).length;
      key = `sess_${ord.seatingSessionId}_${visit}_${ord.paymentStatus === 'PAID' || ord.paymentStatus === 'REFUNDED' ? 'closed' : ord.status === 'CANCELLED' ? ord.id : ord.isSplit ? 'split_' + ord.splitCount : 'open'}`;
    } else {
      // No session ID → each order is its own standalone session.
      // Never group by table alone: different customer visits at the same table
      // must stay separate. seatingSessionId is the ONLY grouping key.
      key = `single_${ord.id}`;
    }

    if (!sessionMap.has(key)) {
      sessionMap.set(key, []);
    }
    sessionMap.get(key)!.push(ord);
  }

  const groups: OrderSessionGroup[] = [];

  for (const [sId, groupOrders] of sessionMap.entries()) {
    const sorted = [...groupOrders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const primary = sorted[0];
    const latest = sorted[sorted.length - 1];

    const grandSubtotal =
      Math.round(sorted.reduce((sum, r) => sum + (r.subtotal || 0), 0) * 100) / 100;
    const grandTax = Math.round(sorted.reduce((sum, r) => sum + (r.taxAmount || 0), 0) * 100) / 100;
    const grandDiscount =
      Math.round(sorted.reduce((sum, r) => sum + (r.discountAmount || 0), 0) * 100) / 100;
    const grandTotal = sorted.reduce((sum, r) => sum + Math.round(r.totalAmount * 100), 0) / 100;

    const isAllCompleted = sorted.every((r) => r.status === 'COMPLETED');
    const isAllPaid = sorted.every((r) => r.paymentStatus === 'PAID');

    // Determine highest operational priority status across active rounds
    let effectiveStatus: OrderStatus = latest.status;
    if (sorted.some((r) => r.status === 'PENDING')) {
      effectiveStatus = 'PENDING';
    } else if (sorted.some((r) => r.status === 'ACCEPTED')) {
      effectiveStatus = 'ACCEPTED';
    } else if (sorted.some((r) => r.status === 'PREPARING')) {
      effectiveStatus = 'PREPARING';
    } else if (sorted.some((r) => r.status === 'READY')) {
      effectiveStatus = 'READY';
    } else if (sorted.some((r) => r.status === 'DISPATCHED')) {
      effectiveStatus = 'DISPATCHED';
    } else if (sorted.every((r) => r.status === 'SERVED')) {
      effectiveStatus = 'SERVED';
    } else if (isAllCompleted) {
      effectiveStatus = 'COMPLETED';
    } else if (sorted.every((r) => r.status === 'CANCELLED')) {
      effectiveStatus = 'CANCELLED';
    }

    const maxPrint = Math.max(0, ...sorted.map((r) => r.printCount || 0));
    const hasSplit = sorted.some((r) => r.isSplit);
    const splitCnt = sorted.find((r) => r.isSplit)?.splitCount;

    groups.push({
      sessionId: sId,
      primaryOrder: primary,
      latestOrder: latest,
      orders: sorted,
      isMultiRound: sorted.length > 1,
      orderCount: sorted.length,
      tableNumber: primary.tableNumber,
      tableId: primary.tableId,
      orderType: primary.orderType || 'DINE_IN',
      pickupReference: primary.pickupReference,
      customerName: primary.customerName || 'Walk-in Guest',
      customerPhone: primary.customerPhone,
      serverStaffId: sorted.find((r) => r.serverStaffId)?.serverStaffId || primary.serverStaffId,
      createdAt: primary.createdAt,
      latestCreatedAt: latest.createdAt,
      grandSubtotal,
      grandTax,
      grandDiscount,
      grandTotal,
      effectiveStatus,
      isAllCompleted,
      isAllPaid,
      isSplit: hasSplit,
      splitCount: splitCnt,
      printCount: maxPrint,
      paymentMethod: sorted.find((r) => r.paymentMethod)?.paymentMethod || primary.paymentMethod,
    });
  }

  return groups;
}
