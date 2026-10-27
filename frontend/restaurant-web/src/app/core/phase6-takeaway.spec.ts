import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import { Table } from './models/table.model';
import { calculateFinancialSummary, calculateOrderTypeBreakdown } from './utils/financial.utils';

function createMockOrderItem(
  menuItemId = 'item-005',
  name = 'Paneer Tikka Angara',
  quantity = 1,
  unitPrice = 320,
): OrderItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    menuItemId,
    name,
    unitPrice,
    quantity,
    itemTotal: unitPrice * quantity,
    selectedVariants: [],
    selectedAddons: [],
  };
}

function submitTestOrder(
  mock: MockDataService,
  orderData: Partial<Order>,
): ReturnType<MockDataService['simulateIdempotentOrderSubmission']> {
  const now = new Date().toISOString();
  const subtotal = orderData.subtotal ?? 320;
  const taxAmount = orderData.taxAmount ?? 16;
  const totalAmount = orderData.totalAmount ?? subtotal + taxAmount;

  const fullOrder: Order = {
    id: orderData.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNumber: orderData.orderNumber || `ORD-${Math.floor(100 + Math.random() * 900)}`,
    restaurantSlug: 'gurukripa-dhaba',
    customerName: orderData.customerName || 'Test Customer',
    customerPhone: orderData.customerPhone || '+91 98765 43210',
    orderType: orderData.orderType || 'DINE_IN',
    tableId: orderData.tableId,
    tableNumber: orderData.tableNumber,
    pickupReference: orderData.pickupReference,
    items: orderData.items || [createMockOrderItem()],
    subtotal,
    discountAmount: orderData.discountAmount ?? 0,
    taxAmount,
    cgstAmount: orderData.cgstAmount ?? taxAmount / 2,
    sgstAmount: orderData.sgstAmount ?? taxAmount / 2,
    totalAmount,
    status: orderData.status || 'PENDING',
    paymentStatus: orderData.paymentStatus || 'UNPAID',
    createdAt: now,
    updatedAt: now,
    timeline: [{ status: orderData.status || 'PENDING', timestamp: now }],
  };

  return mock.simulateIdempotentOrderSubmission({
    idempotencyKey: `idemp-${Date.now()}-${Math.random()}`,
    order: fullOrder,
  });
}

describe('Phase 6 — Takeaway and Counter Ordering Regression Tests', () => {
  let mock: MockDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([]), MockDataService],
    });
    mock = TestBed.inject(MockDataService);

    // Baseline restaurant with takeaway enabled
    mock.initFallbackRestaurant();
    mock.restaurant.update((r) => ({
      ...r!,
      orderingSettings: {
        ...r!.orderingSettings,
        takeawayEnabled: true,
      },
    }));

    // Baseline dining tables
    const defaultTables: Table[] = [
      {
        id: 'tbl-01',
        number: 'T-01',
        capacity: 4,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tok-t01',
        qrUrl: '',
        orderingEnabled: true,
      },
      {
        id: 'tbl-02',
        number: 'T-02',
        capacity: 2,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tok-t02',
        qrUrl: '',
        orderingEnabled: true,
      },
      {
        id: 'tbl-03',
        number: 'T-03',
        capacity: 6,
        section: 'Terrace Garden',
        status: 'AVAILABLE',
        qrToken: 'tok-t03',
        qrUrl: '',
        orderingEnabled: true,
      },
    ];
    mock.tables.set(defaultTables);
    mock.ingredients.set(mock.getDefaultIngredients());
    mock.recipes.set(mock.getDefaultRecipes());
    mock.menuItems.set(mock.getDefaultMenuItems());
    mock.orders.set([]);
    mock.invoices.set([]);
    mock.splitBills.set([]);
    mock.refunds.set([]);
    mock.stockReservations.set([]);
    mock.stockMovements.set([]);
    mock.reservations.set([]);
  });

  // 1. Creating a takeaway order without a table
  it('1. creates a takeaway order without assigning a table and generates a pickup reference', () => {
    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Aarav Patel',
      customerPhone: '+91 98765 43210',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });

    expect(result.success).toBe(true);
    expect(result.order).toBeDefined();
    expect(result.order!.orderType).toBe('TAKEAWAY');
    expect(result.order!.pickupReference).toBeDefined();
    expect(result.order!.pickupReference).toMatch(/^TK-\d+$/);
    expect(result.order!.tableId).toBeUndefined();
    expect(result.order!.tableNumber).toBeUndefined();
    expect(result.order!.customerName).toBe('Aarav Patel');

    // Confirm dining tables are completely untouched
    const tables = mock.tables();
    expect(tables.every((t) => t.status === 'AVAILABLE')).toBe(true);
  });

  // 2. Creating a dine-in order with a valid table
  it('2. creates a dine-in order with a valid table and marks table OCCUPIED', () => {
    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'DINE_IN',
      tableId: 'tbl-01',
      customerName: 'Meera Rao',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });

    expect(result.success).toBe(true);
    expect(result.order).toBeDefined();
    expect(result.order!.orderType).toBe('DINE_IN');
    expect(result.order!.tableId).toBe('tbl-01');
    expect(result.order!.tableNumber).toBe('T-01');

    const table1 = mock.tables().find((t) => t.id === 'tbl-01');
    expect(table1?.status).toBe('OCCUPIED');
  });

  // 3. Rejecting malformed dine-in orders without valid table associations
  it('3. rejects malformed dine-in orders missing table associations', () => {
    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'DINE_IN',
      tableId: undefined, // invalid for dine-in
      tableNumber: undefined,
      customerName: 'Ghost Guest',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dine-in orders must be linked to a valid table');
    expect(mock.orders().length).toBe(0);
  });

  // 4. Supporting legacy dine-in orders without an explicit order type
  it('4. supports legacy orders without explicit orderType when valid table exists and avoids silent dummy migration', () => {
    const legacyValidOrder: any = {
      id: 'ord-legacy-1',
      orderNumber: 'ORD-LEG-01',
      restaurantSlug: 'gurukripa-dhaba',
      tableId: 'tbl-01',
      tableNumber: 'T-01',
      customerName: 'Legacy Diner',
      items: [createMockOrderItem()],
      subtotal: 320,
      discountAmount: 0,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      totalAmount: 336,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [],
    };

    const legacyMalformedOrder: any = {
      id: 'ord-legacy-2',
      orderNumber: 'ORD-LEG-02',
      restaurantSlug: 'gurukripa-dhaba',
      // No tableId, no tableNumber, no orderType
      customerName: 'Malformed Order',
      items: [createMockOrderItem()],
      subtotal: 320,
      discountAmount: 0,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      totalAmount: 336,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [],
    };

    const normalized = mock.normalizeLegacyOrders([legacyValidOrder, legacyMalformedOrder]);
    expect(normalized[0].orderType).toBe('DINE_IN');
    expect(normalized[0].tableNumber).toBe('T-01');

    // Malformed legacy order must not have fake table fabricated
    expect(normalized[1].orderType).toBeUndefined();
    expect(normalized[1].tableId).toBeUndefined();
    expect(normalized[1].tableNumber).toBeUndefined();
  });

  // 5. Rejecting takeaway creation when restaurant has disabled it
  it('5. rejects takeaway creation through service boundary when takeaway is disabled', () => {
    mock.restaurant.update((r) => ({
      ...r!,
      orderingSettings: { ...r!.orderingSettings, takeawayEnabled: false },
    }));

    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Rohit Sharma',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Takeaway ordering is currently disabled');
    expect(mock.orders().length).toBe(0);
  });

  // 6. Validating menu availability and ATP stock for takeaway orders
  it('6. validates menu item enabled state and stock for takeaway orders', () => {
    // Disable an item in the menu
    mock.menuItems.update((items) =>
      items.map((i) => (i.id === 'item-005' ? { ...i, isAvailable: false } : i)),
    );

    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Vikram',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('is currently unavailable');
  });

  // 7. Reserving and consuming inventory through the existing lifecycle
  it('7. reserves stock on ACCEPTED and consumes stock on COMPLETED for takeaway orders', () => {
    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 2, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Sanjay',
      items,
      subtotal: 640,
      taxAmount: 32,
      cgstAmount: 16,
      sgstAmount: 16,
      discountAmount: 0,
      totalAmount: 672,
    });
    expect(result.success).toBe(true);
    const orderId = result.order!.id;

    // Transition PENDING -> ACCEPTED: creates stock reservations
    const acceptRes = mock.updateOrderStatusAtomic(orderId, 'ACCEPTED', { note: 'Manager Accept' });
    expect(acceptRes.success).toBe(true);

    const reservations = mock.stockReservations().filter((r) => r.orderId === orderId);
    expect(reservations.length).toBeGreaterThan(0);

    // Transition ACCEPTED -> PREPARING -> READY -> COMPLETED
    mock.updateOrderStatusAtomic(orderId, 'PREPARING', { note: 'Cooking' });
    mock.updateOrderStatusAtomic(orderId, 'READY', { note: 'Ready at counter' });

    const initialMovementsCount = mock.stockMovements().length;
    const completeRes = mock.updateOrderStatusAtomic(orderId, 'COMPLETED', { note: 'Handed over' });
    expect(completeRes.success).toBe(true);

    // Stock consumption occurred, reservation cleaned up
    const activeReservations = mock.stockReservations().filter((r) => r.orderId === orderId);
    expect(activeReservations.length).toBe(0);
    expect(mock.stockMovements().length).toBeGreaterThan(initialMovementsCount);
  });

  // 8. Competing dine-in and takeaway orders against limited stock
  it('8. enforces fair ATP stock limits between competing takeaway and dine-in orders', () => {
    // Find the primary ingredient for item-005 (Paneer Tikka Angara -> ing-paneer)
    const paneerRecipe = mock.recipes().find((r) => r.menuItemId === 'item-005');
    expect(paneerRecipe).toBeDefined();
    const paneerItem = paneerRecipe!.items[0];
    const qtyPerDish = paneerItem.quantity; // e.g. 0.2 kg

    // Set on-hand paneer to exactly enough for 2 dishes
    mock.ingredients.update((list) =>
      list.map((ing) =>
        ing.id === paneerItem.ingredientId
          ? { ...ing, currentStock: qtyPerDish * 2, minThreshold: 1 }
          : ing,
      ),
    );

    // Order 1 (Takeaway) orders 2 dishes -> consumes all available stock
    const takeawayResult = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Takeaway Customer',
      items: [createMockOrderItem('item-005', 'Paneer Tikka Angara', 2, 320)],
      subtotal: 640,
      taxAmount: 32,
      cgstAmount: 16,
      sgstAmount: 16,
      discountAmount: 0,
      totalAmount: 672,
    });
    expect(takeawayResult.success).toBe(true);

    // Transition takeaway order to ACCEPTED to lock the reservation
    mock.updateOrderStatusAtomic(takeawayResult.order!.id, 'ACCEPTED');

    // Order 2 (Dine-in) attempts to order 1 dish -> must be rejected due to ATP depletion
    const dineInResult = submitTestOrder(mock, {
      orderType: 'DINE_IN',
      tableId: 'tbl-01',
      customerName: 'Dine-In Customer',
      items: [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    expect(dineInResult.success).toBe(false);
    expect(dineInResult.error).toContain('Insufficient available stock');
  });

  // 9. Cancelling a takeaway order and releasing eligible reservations
  it('9. releases ATP stock reservations when a takeaway order is cancelled', () => {
    const items = [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)];
    const result = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Kunal',
      items,
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    const orderId = result.order!.id;
    mock.updateOrderStatusAtomic(orderId, 'ACCEPTED');

    const resBeforeCancel = mock.stockReservations().filter((r) => r.orderId === orderId);
    expect(resBeforeCancel.length).toBeGreaterThan(0);

    // Cancel order
    const cancelRes = mock.updateOrderStatusAtomic(orderId, 'CANCELLED', {
      note: 'Customer changed mind',
    });
    expect(cancelRes.success).toBe(true);

    const resAfterCancel = mock.stockReservations().filter((r) => r.orderId === orderId);
    expect(resAfterCancel.length).toBe(0);
  });

  // 10. Ensuring takeaway orders never occupy or release dining tables
  it('10. guarantees takeaway orders never occupy, block, or modify table status', () => {
    // T-01 is currently occupied by a dine-in order
    submitTestOrder(mock, {
      orderType: 'DINE_IN',
      tableId: 'tbl-01',
      customerName: 'Table Diner',
      items: [createMockOrderItem()],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    expect(mock.tables().find((t) => t.id === 'tbl-01')?.status).toBe('OCCUPIED');

    // Create, accept, serve, complete, and settle a takeaway order
    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Counter Customer',
      items: [createMockOrderItem()],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    mock.updateOrderStatusAtomic(takeaway.order!.id, 'ACCEPTED');
    mock.updateOrderStatusAtomic(takeaway.order!.id, 'COMPLETED');
    mock.settleOrder({ orderId: takeaway.order!.id, paymentMethod: 'CASH' });

    // T-01 is still OCCUPIED by its own dine-in order, and T-02 & T-03 remain AVAILABLE
    expect(mock.tables().find((t) => t.id === 'tbl-01')?.status).toBe('OCCUPIED');
    expect(mock.tables().find((t) => t.id === 'tbl-02')?.status).toBe('AVAILABLE');
    expect(mock.tables().find((t) => t.id === 'tbl-03')?.status).toBe('AVAILABLE');

    // Cancelling a takeaway order also never affects any table
    const takeaway2 = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Cancel Takeaway',
      items: [createMockOrderItem()],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    mock.updateOrderStatusAtomic(takeaway2.order!.id, 'CANCELLED');
    expect(mock.tables().find((t) => t.id === 'tbl-01')?.status).toBe('OCCUPIED');
  });

  // 11. Correct order type and pickup reference in order details and receipts
  it('11. retains orderType and pickupReference in invoice and generated receipts', () => {
    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Ananya',
      customerPhone: '+91 99999 88888',
      items: [createMockOrderItem('item-005', 'Paneer Tikka Angara', 1, 320)],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    const orderId = takeaway.order!.id;
    const pickupRef = takeaway.order!.pickupReference;

    const settleRes = mock.settleOrder({ orderId, paymentMethod: 'UPI' });
    expect(settleRes.success).toBe(true);
    expect(settleRes.invoice).toBeDefined();
    expect(settleRes.invoice!.orderType).toBe('TAKEAWAY');
    expect(settleRes.invoice!.pickupReference).toBe(pickupRef);
    expect(settleRes.invoice!.tableNumber).toBeUndefined();
    expect(settleRes.invoice!.customerName).toBe('Ananya');
  });

  // 12. Cash and UPI settlement using existing payment-recording rules
  it('12. supports Cash and UPI settlement for takeaway orders using identical financial rules', () => {
    const cashOrder = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Cash Guest',
      items: [createMockOrderItem('item-005', 'Paneer Tikka', 1, 400)],
      subtotal: 400,
      taxAmount: 20,
      cgstAmount: 10,
      sgstAmount: 10,
      discountAmount: 0,
      totalAmount: 420,
    });
    const upiOrder = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'UPI Guest',
      items: [createMockOrderItem('item-005', 'Paneer Tikka', 1, 400)],
      subtotal: 400,
      taxAmount: 20,
      cgstAmount: 10,
      sgstAmount: 10,
      discountAmount: 0,
      totalAmount: 420,
    });

    const cashSettle = mock.settleOrder({ orderId: cashOrder.order!.id, paymentMethod: 'CASH' });
    const upiSettle = mock.settleOrder({ orderId: upiOrder.order!.id, paymentMethod: 'UPI' });

    expect(cashSettle.success).toBe(true);
    expect(cashSettle.invoice!.paymentMethod).toBe('CASH');
    expect(cashSettle.invoice!.finalTotal).toBe(420);

    expect(upiSettle.success).toBe(true);
    expect(upiSettle.invoice!.paymentMethod).toBe('UPI');
    expect(upiSettle.invoice!.finalTotal).toBe(420);
  });

  // 13. Preventing duplicate settlements and stock consumption
  it('13. prevents duplicate settlements and duplicate stock consumption for takeaway orders', () => {
    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Ravi',
      items: [createMockOrderItem('item-005', 'Paneer Tikka', 1, 320)],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    const orderId = takeaway.order!.id;
    mock.updateOrderStatusAtomic(orderId, 'ACCEPTED');
    mock.updateOrderStatusAtomic(orderId, 'COMPLETED');

    const firstSettle = mock.settleOrder({ orderId, paymentMethod: 'CASH' });
    expect(firstSettle.success).toBe(true);

    // Second settlement attempt
    const secondSettle = mock.settleOrder({ orderId, paymentMethod: 'UPI' });
    expect(secondSettle.success).toBe(false);
    expect(secondSettle.error).toContain('already settled');

    // Attempting duplicate consumption or redundant completion does not re-consume stock
    const movementsCountBefore = mock.stockMovements().length;
    const dupConsume = mock.consumeStockForOrder(orderId);
    expect(dupConsume.alreadyConsumed).toBe(true);
    expect(mock.stockMovements().length).toBe(movementsCountBefore);

    const dupTransition = mock.updateOrderStatusAtomic(orderId, 'COMPLETED');
    expect(dupTransition.success).toBe(true);
    expect(mock.stockMovements().length).toBe(movementsCountBefore);
  });

  // 14. Maintaining refund and split-bill reconciliation
  it('14. maintains financial reconciliation and prevents over-refunding on takeaway orders', () => {
    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Priya',
      items: [createMockOrderItem('item-005', 'Paneer Tikka', 1, 500)],
      subtotal: 500,
      taxAmount: 25,
      cgstAmount: 12.5,
      sgstAmount: 12.5,
      discountAmount: 0,
      totalAmount: 525,
    });
    const orderId = takeaway.order!.id;
    mock.settleOrder({ orderId, paymentMethod: 'CASH' });

    const refund1 = mock.recordRefund({
      orderId,
      refundAmount: 200,
      reason: 'CUSTOMER_DISSATISFACTION',
    });
    expect(refund1.success).toBe(true);

    // Over-refund attempt
    const refund2 = mock.recordRefund({
      orderId,
      refundAmount: 350, // 200 + 350 = 550 > 525
      reason: 'ACCIDENTAL_DOUBLE_PAY',
    });
    expect(refund2.success).toBe(false);
    expect(refund2.error).toContain('exceeds maximum refundable balance');
  });

  // 15. Dashboard and Reports financial consistency and order type breakdown
  it('15. verifies dashboard financial summary and order type breakdown consistency', () => {
    const dineIn = submitTestOrder(mock, {
      orderType: 'DINE_IN',
      tableId: 'tbl-01',
      customerName: 'Dine Diner',
      items: [createMockOrderItem('item-005', 'Dish 1', 1, 1000)],
      subtotal: 1000,
      taxAmount: 50,
      cgstAmount: 25,
      sgstAmount: 25,
      discountAmount: 0,
      totalAmount: 1050,
    });
    mock.settleOrder({ orderId: dineIn.order!.id, paymentMethod: 'CASH' });

    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Takeaway Guest',
      items: [createMockOrderItem('item-005', 'Dish 2', 1, 600)],
      subtotal: 600,
      taxAmount: 30,
      cgstAmount: 15,
      sgstAmount: 15,
      discountAmount: 0,
      totalAmount: 630,
    });
    mock.settleOrder({ orderId: takeaway.order!.id, paymentMethod: 'UPI' });

    const orders = mock.orders();
    const summary = calculateFinancialSummary(orders, [], []);
    expect(summary.grossSales).toBe(1680);
    expect(summary.collectedRevenue).toBe(1680);
    expect(summary.netRevenue).toBe(1680);

    const breakdown = calculateOrderTypeBreakdown(orders, [], []);
    expect(breakdown.dineIn.ordersCount).toBe(1);
    expect(breakdown.dineIn.netRevenue).toBe(1050);
    expect(breakdown.takeaway.ordersCount).toBe(1);
    expect(breakdown.takeaway.netRevenue).toBe(630);
    expect(breakdown.dineIn.netRevenue + breakdown.takeaway.netRevenue).toBe(summary.netRevenue);
  });

  // 16. Table transfer rejection for takeaway orders
  it('16. rejects table transfers for takeaway orders', () => {
    const takeaway = submitTestOrder(mock, {
      orderType: 'TAKEAWAY',
      customerName: 'Counter Guest',
      items: [createMockOrderItem()],
      subtotal: 320,
      taxAmount: 16,
      cgstAmount: 8,
      sgstAmount: 8,
      discountAmount: 0,
      totalAmount: 336,
    });
    const orderId = takeaway.order!.id;

    const transferRes = mock.transferTable({ orderId, destinationTableId: 'tbl-02' });
    expect(transferRes.success).toBe(false);
    expect(transferRes.error).toContain(
      'Table transfers are available only for valid dine-in orders',
    );
  });
});
