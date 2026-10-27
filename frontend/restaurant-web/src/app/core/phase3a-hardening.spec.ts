import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import {
  Ingredient,
  Recipe,
  StockMovement,
  StockReservation,
  roundStock,
  convertUnit,
  sanitizeStockQuantity,
} from './models/inventory.model';

function createMockOrderItem(
  menuItemId: string,
  name: string,
  quantity: number,
  unitPrice = 300,
): OrderItem {
  return {
    id: `oi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    menuItemId,
    name,
    unitPrice,
    quantity,
    itemTotal: unitPrice * quantity,
    selectedVariants: [],
    selectedAddons: [],
  };
}

function createMockOrder(
  orderId: string,
  orderNumber: string,
  items: OrderItem[],
  status: Order['status'] = 'PENDING',
): Order {
  const subtotal = items.reduce((sum, it) => sum + it.itemTotal, 0);
  const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
  return {
    id: orderId,
    orderNumber,
    restaurantSlug: 'gurukripa-dhaba',
    tableId: 'tbl-01',
    tableNumber: 'T-01',
    customerName: 'Rohit Sharma',
    customerPhone: '+91 98765 22222',
    items,
    subtotal,
    discountAmount: 0,
    taxAmount,
    cgstAmount: taxAmount / 2,
    sgstAmount: taxAmount / 2,
    totalAmount: subtotal + taxAmount,
    status,
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [{ status, timestamp: new Date().toISOString(), note: `Initial order ${status}` }],
  };
}

describe('Phase 3A — Inventory Transaction Integrity and Order Lifecycle Hardening', () => {
  let mock: MockDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [MockDataService, provideHttpClient()],
    });
    mock = TestBed.inject(MockDataService);
  });

  describe('1. Two Orders Competing for the Same Limited Ingredient (Oversell Prevention)', () => {
    it('prevents two accepted orders from overselling available-to-promise stock', () => {
      // 1. Constrain paneer stock to exactly 0.5 kg (2 portions of Paneer Tikka @ 0.25kg each)
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -(currentPaneer - 0.5),
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Constrain stock to 0.5kg for contention test',
      });

      expect(mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock).toBe(0.5);
      expect(mock.getAvailableStock('ing-02')).toBe(0.5);

      // 2. Order 1 requests 2 servings = 0.5 kg
      const item1 = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order1 = createMockOrder('ord-contend-1', '#ORD-901', [item1], 'PENDING');
      mock.orders.set([order1, ...mock.orders()]);

      // 3. Order 2 requests 2 servings = 0.5 kg
      const item2 = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order2 = createMockOrder('ord-contend-2', '#ORD-902', [item2], 'PENDING');
      mock.orders.set([order2, ...mock.orders()]);

      // 4. Accept Order 1: succeeds and reserves all 0.5 kg
      const res1 = mock.updateOrderStatusAtomic(order1.id, 'ACCEPTED');
      expect(res1.success).toBe(true);
      expect(res1.order?.status).toBe('ACCEPTED');

      // Verify available stock dropped to 0 while physical on-hand stock remains 0.5 kg
      expect(mock.getReservedQuantity('ing-02')).toBe(0.5);
      expect(mock.getAvailableStock('ing-02')).toBe(0.0);
      expect(mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock).toBe(0.5);

      // 5. Accept Order 2: must FAIL because available-to-promise stock is 0
      const res2 = mock.updateOrderStatusAtomic(order2.id, 'ACCEPTED');
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/insufficient available stock/i);

      // Verify Order 2 status was NOT changed to ACCEPTED and remains PENDING
      const order2InDb = mock.orders().find((o) => o.id === order2.id)!;
      expect(order2InDb.status).toBe('PENDING');

      // Verify no extra reservation was created for Order 2
      const order2Reservations = mock.stockReservations().filter((r) => r.orderId === order2.id);
      expect(order2Reservations.length).toBe(0);
    });
  });

  describe('2. Atomic Rollback and Preservation of Prior Valid State on Failure', () => {
    it('leaves order in its previous valid state when stock consumption fails at serving transition', () => {
      // Order is accepted and prepared
      const item = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-atomic-1', '#ORD-903', [item], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      // Transition to ACCEPTED -> PREPARING -> READY
      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      mock.updateOrderStatusAtomic(order.id, 'PREPARING');
      mock.updateOrderStatusAtomic(order.id, 'READY');

      const readyOrder = mock.orders().find((o) => o.id === order.id)!;
      expect(readyOrder.status).toBe('READY');

      // Simulate unexpected physical stock loss (e.g. batch spoiled before serving)
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -currentPaneer,
        type: 'WASTAGE',
        reason: 'Total paneer spoilage in chiller',
      });

      // Attempt transition to SERVED
      const serveRes = mock.updateOrderStatusAtomic(order.id, 'SERVED');
      expect(serveRes.success).toBe(false);
      expect(serveRes.error).toMatch(/insufficient stock/i);

      // Order must REMAIN in READY status with previous timeline intact
      const afterOrder = mock.orders().find((o) => o.id === order.id)!;
      expect(afterOrder.status).toBe('READY');
      expect(afterOrder.timeline[afterOrder.timeline.length - 1].status).toBe('READY');

      // No consumption movements created
      const movements = mock
        .stockMovements()
        .filter((m) => m.referenceId === order.id && m.type === 'RECIPE_CONSUMPTION');
      expect(movements.length).toBe(0);
    });
  });

  describe('3. All-or-Nothing Atomicity: No Partial Ingredient Deductions', () => {
    it('does not deduct any ingredients if one ingredient in a multi-item recipe is insufficient', () => {
      // Dish item-005 recipe (rec-005) uses Paneer (ing-02) and Fresh Cream (ing-06)
      const paneerBefore = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      const creamBefore = mock.ingredients().find((i) => i.id === 'ing-06')!.currentStock;

      // Deplete Fresh Cream to 0 while leaving Paneer abundant
      mock.adjustStock({
        ingredientId: 'ing-06',
        delta: -creamBefore,
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Zero out cream for partial deduction test',
      });

      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-partial-1', '#ORD-904', [orderItem], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      // Attempt consumption
      const res = mock.consumeStockForOrder(order.id);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/insufficient stock/i);

      // Paneer must remain untouched (no partial deduction)
      const paneerAfter = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(paneerAfter).toBe(paneerBefore);

      // Zero consumption movements logged
      const movements = mock
        .stockMovements()
        .filter((m) => m.referenceId === order.id && m.type === 'RECIPE_CONSUMPTION');
      expect(movements.length).toBe(0);
    });
  });

  describe('4. Reservation Creation, Lifecycle, and Cancellation Release', () => {
    it('creates reservations on ACCEPTED and automatically releases them on pre-service cancellation', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2); // 0.5 kg paneer
      const order = createMockOrder('ord-lifecycle-1', '#ORD-905', [orderItem], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      const initialAvailable = mock.getAvailableStock('ing-02');

      // 1. Acceptance creates reservation
      const acceptRes = mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      expect(acceptRes.success).toBe(true);

      expect(mock.getReservedQuantity('ing-02')).toBe(0.5);
      expect(mock.getAvailableStock('ing-02')).toBe(roundStock(initialAvailable - 0.5));

      // 2. Cancellation before serving releases reservation
      const cancelRes = mock.updateOrderStatusAtomic(order.id, 'CANCELLED');
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.order?.status).toBe('CANCELLED');

      // Reservations for order must be completely removed
      const orderReservations = mock.stockReservations().filter((r) => r.orderId === order.id);
      expect(orderReservations.length).toBe(0);
      expect(mock.getReservedQuantity('ing-02')).toBe(0);
      expect(mock.getAvailableStock('ing-02')).toBe(initialAvailable);
    });
  });

  describe('5. Duplicate Order-Status Events (Idempotency)', () => {
    it('does not duplicate reservations or consumption on repeated status updates', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1);
      const order = createMockOrder('ord-idem-events', '#ORD-906', [orderItem], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      // First acceptance
      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      const resCount1 = mock.stockReservations().filter((r) => r.orderId === order.id).length;
      expect(resCount1).toBeGreaterThan(0);

      // Repeated acceptance (simulating duplicate webhook / UI click)
      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      const resCount2 = mock.stockReservations().filter((r) => r.orderId === order.id).length;
      expect(resCount2).toBe(resCount1);

      // Advance to SERVED
      const paneerBeforeServe = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      const serve1 = mock.updateOrderStatusAtomic(order.id, 'SERVED');
      expect(serve1.success).toBe(true);

      const paneerAfterServe = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(paneerAfterServe).toBe(roundStock(paneerBeforeServe - 0.25));

      // Repeated SERVED call
      const serve2 = mock.updateOrderStatusAtomic(order.id, 'SERVED');
      expect(serve2.success).toBe(true);

      const paneerAfterSecondServe = mock
        .ingredients()
        .find((i) => i.id === 'ing-02')!.currentStock;
      expect(paneerAfterSecondServe).toBe(paneerAfterServe); // Zero duplicate deduction!

      // Repeated cancellation calls
      const cancel1 = mock.releaseStockReservation(order.id);
      const cancel2 = mock.releaseStockReservation(order.id);
      expect(cancel1.success).toBe(true);
      expect(cancel2.success).toBe(true);
    });
  });

  describe('6. Cancellation Before and After Physical Consumption', () => {
    it('does NOT silently restore physically consumed stock if cancelled after SERVED', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-cancel-after-prep', '#ORD-907', [orderItem], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      // Advance to SERVED
      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      mock.updateOrderStatusAtomic(order.id, 'SERVED');

      const stockAfterServe = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      // Cancel after served
      const cancelRes = mock.updateOrderStatusAtomic(order.id, 'CANCELLED');
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.order?.status).toBe('CANCELLED');

      // Stock must NOT be silently restored
      const stockAfterCancel = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterCancel).toBe(stockAfterServe);
    });
  });

  describe('7. Reversal Idempotency', () => {
    it('prevents restoring stock twice when reversal is requested repeatedly', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1);
      const order = createMockOrder('ord-reversal-idem', '#ORD-908', [orderItem], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      mock.updateOrderStatusAtomic(order.id, 'SERVED');

      const stockBeforeReversal = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      // First reversal: succeeds
      const rev1 = mock.reverseOrderStockConsumption(
        order.id,
        'Guest returned dish due to wrong preparation',
      );
      expect(rev1.success).toBe(true);

      const stockAfterFirstRev = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterFirstRev).toBe(roundStock(stockBeforeReversal + 0.25));

      // Second reversal: must FAIL
      const rev2 = mock.reverseOrderStockConsumption(order.id, 'Duplicate reversal attempt');
      expect(rev2.success).toBe(false);
      expect(rev2.error).toMatch(/already been reversed/i);

      // Stock must NOT increase again
      const stockAfterSecondRev = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterSecondRev).toBe(stockAfterFirstRev);
    });
  });

  describe('8. Quantity Changes After Acceptance (Delta Re-balancing)', () => {
    it('adjusts reservations accurately when order item quantities are modified', () => {
      const item = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1); // 0.25kg paneer
      const order = createMockOrder('ord-qty-mod-1', '#ORD-909', [item], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');
      expect(mock.getReservedQuantity('ing-02')).toBe(0.25);

      // Update quantity from 1 to 3 portions (0.75kg total)
      const updatedItem = { ...item, quantity: 3, itemTotal: item.unitPrice * 3 };
      const modRes = mock.updateOrderItems(order.id, [updatedItem]);
      expect(modRes.success).toBe(true);
      expect(modRes.order?.items[0].quantity).toBe(3);

      // Reservation must now be exactly 0.75kg
      expect(mock.getReservedQuantity('ing-02')).toBe(0.75);

      // Reject modification that demands more than available stock
      const hugeItem = { ...item, quantity: 500, itemTotal: item.unitPrice * 500 };
      const failRes = mock.updateOrderItems(order.id, [hugeItem]);
      expect(failRes.success).toBe(false);
      expect(failRes.error).toMatch(/insufficient stock/i);

      // Original reservation remains 0.75kg
      expect(mock.getReservedQuantity('ing-02')).toBe(0.75);
    });
  });

  describe('9. LocalStorage Persistence Across Operations', () => {
    it('persists reservations and order transitions consistently to localStorage', () => {
      const item = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-persist-1', '#ORD-910', [item], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');

      // Verify localStorage contains active reservation
      const savedReservations = mock.loadLocalArray<StockReservation>('stock_reservations');
      expect(savedReservations).toBeDefined();
      expect(savedReservations?.some((r) => r.orderId === order.id)).toBe(true);

      // Verify order status in localStorage is ACCEPTED
      const savedOrders = mock.loadLocalArray<Order>('orders');
      const persistedOrder = savedOrders?.find((o) => o.id === order.id);
      expect(persistedOrder?.status).toBe('ACCEPTED');
    });
  });

  describe('10. Menu Availability Matches Service-Level Available-to-Promise Policy', () => {
    it('synchronizes customer-menu and POS availability with active reservations', () => {
      // 1. Constrain paneer stock to 0.5 kg (2 portions)
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -(currentPaneer - 0.5),
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Constrain for menu availability sync',
      });

      // Before order: 2 portions producible -> LOW_STOCK (<= 5)
      const checkBefore = mock.checkMenuItemAvailability('item-005');
      expect(checkBefore.status).toBe('LOW_STOCK');
      expect(checkBefore.produciblePortions).toBe(2);

      // 2. Accept an order for 2 portions
      const item = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-avail-sync-1', '#ORD-911', [item], 'PENDING');
      mock.orders.set([order, ...mock.orders()]);

      mock.updateOrderStatusAtomic(order.id, 'ACCEPTED');

      // After acceptance: available portions drop to 0 -> OUT_OF_STOCK
      const checkAfter = mock.checkMenuItemAvailability('item-005');
      expect(checkAfter.status).toBe('OUT_OF_STOCK');
      expect(checkAfter.produciblePortions).toBe(0);
      expect(mock.getMenuItemAvailability('item-005')).toBe('OUT_OF_STOCK');

      // 3. Cancelling the order releases reservation -> restores availability
      mock.updateOrderStatusAtomic(order.id, 'CANCELLED');
      const checkRestored = mock.checkMenuItemAvailability('item-005');
      expect(checkRestored.status).toBe('LOW_STOCK');
      expect(checkRestored.produciblePortions).toBe(2);
    });

    it('correctly reports UNTRACKED for dishes without recipes or inactive recipes', () => {
      // Dish item-004 has no recipe
      const checkUntracked = mock.checkMenuItemAvailability('item-004');
      expect(checkUntracked.status).toBe('UNTRACKED');
      expect(checkUntracked.produciblePortions).toBe(999);

      // Dish item-005 with active recipe
      const recipe = mock.recipes().find((r) => r.menuItemId === 'item-005')!;
      mock.updateRecipe(recipe.id, { isActive: false });

      const checkInactive = mock.checkMenuItemAvailability('item-005');
      expect(checkInactive.status).toBe('UNTRACKED');
      expect(checkInactive.produciblePortions).toBe(999);

      // Restore recipe active state
      mock.updateRecipe(recipe.id, { isActive: true });
    });
  });

  describe('11. Measurement Precision and Discrete Units Verification', () => {
    it('preserves exact integer counts for discrete pcs and prevents fractional drift', () => {
      expect(sanitizeStockQuantity(5, 'pcs')).toBe(5);
      expect(() => sanitizeStockQuantity(2.5, 'pcs')).toThrowError(
        /Discrete items \('pcs'\) must have integer quantities/,
      );
      expect(() => sanitizeStockQuantity(-1, 'pcs')).toThrowError(/Invalid stock quantity/);
      expect(() => sanitizeStockQuantity(Infinity, 'pcs')).toThrowError(/Invalid stock quantity/);
    });

    it('converts units cleanly without floating point accumulation across repeated cycles', () => {
      let qty = 1.0; // 1 kg
      for (let i = 0; i < 100; i++) {
        const grams = convertUnit(qty, 'kg', 'g');
        qty = convertUnit(grams, 'g', 'kg');
      }
      expect(qty).toBe(1.0);
    });
  });
});
