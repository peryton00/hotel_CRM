import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import { SplitBill, RefundRecord } from './models/billing.model';
import { Table, TableStatus } from './models/table.model';
import { Reservation } from './models/reservation.model';
import { MenuItem } from './models/menu.model';
import { calculateFinancialSummary } from './utils/financial.utils';
import { AdminDashboardComponent } from '../features/admin/dashboard/dashboard.component';
import { ReportsComponent } from '../features/admin/reports/reports.component';
import { TableListComponent } from '../features/admin/tables/table-list.component';
import { MenuManagementComponent } from '../features/admin/menu/menu-management.component';
import { CartService } from './services/cart.service';

import { provideRouter } from '@angular/router';

function createMockItem(
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

function createMockOrder(
  id: string,
  orderNumber: string,
  totalAmount: number,
  status: Order['status'] = 'COMPLETED',
  paymentStatus: Order['paymentStatus'] = 'PAID',
  tableId = 'tbl-01',
  tableNumber = 'T-01',
): Order {
  const taxAmount = Math.round(totalAmount * 0.05 * 100) / 100;
  return {
    id,
    orderNumber,
    restaurantSlug: 'gurukripa-dhaba',
    tableId,
    tableNumber,
    customerName: 'Test Diner',
    customerPhone: '+91 98765 00000',
    items: [createMockItem('item-005', 'Paneer Tikka Angara', 1, totalAmount - taxAmount)],
    subtotal: totalAmount - taxAmount,
    discountAmount: 0,
    taxAmount,
    cgstAmount: taxAmount / 2,
    sgstAmount: taxAmount / 2,
    totalAmount,
    status,
    paymentStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [{ status, timestamp: new Date().toISOString() }],
  };
}

describe('Phase 5 — Operational Consistency & Financial Reconciliation', () => {
  let mock: MockDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([]), MockDataService],
    });
    mock = TestBed.inject(MockDataService);

    // Initialize baseline domain datasets synchronously for Vitest environment
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
    mock.splitBills.set([]);
    mock.refunds.set([]);
    mock.stockReservations.set([]);
    mock.reservations.set([]);
  });

  // =========================================================================
  // FIX A: FINANCIAL METRICS RECONCILIATION
  // =========================================================================
  describe('Fix A: Financial Metrics Reconciliation', () => {
    it('excludes cancelled orders from recognized gross sales and collected revenue', () => {
      const orders: Order[] = [
        createMockOrder('ord-1', 'ORD-001', 1000, 'COMPLETED', 'PAID'),
        createMockOrder('ord-2', 'ORD-002', 500, 'CANCELLED', 'PAID'),
        createMockOrder('ord-3', 'ORD-003', 750, 'CANCELLED', 'UNPAID'),
      ];

      const summary = calculateFinancialSummary(orders, [], []);
      expect(summary.grossSales).toBe(1000);
      expect(summary.collectedRevenue).toBe(1000);
      expect(summary.netRevenue).toBe(1000);
      expect(summary.cancelledOrdersCount).toBe(2);
      expect(summary.paidOrdersCount).toBe(1);
    });

    it('subtracts completed refunds exactly once from net collected revenue', () => {
      const orders: Order[] = [
        createMockOrder('ord-1', 'ORD-001', 1000, 'COMPLETED', 'PAID'),
        createMockOrder('ord-2', 'ORD-002', 800, 'COMPLETED', 'PAID'),
      ];
      const refunds: RefundRecord[] = [
        {
          id: 'ref-1',
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 300,
          reason: 'CUSTOMER_DISSATISFACTION',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      const summary = calculateFinancialSummary(orders, [], refunds);
      expect(summary.grossSales).toBe(1800);
      expect(summary.collectedRevenue).toBe(1800);
      expect(summary.totalRefunds).toBe(300);
      expect(summary.netRevenue).toBe(1500);
      expect(summary.completedRefundsCount).toBe(1);
    });

    it('ignores pending or cancelled refunds and does not deduct them from revenue', () => {
      const orders: Order[] = [createMockOrder('ord-1', 'ORD-001', 1000, 'COMPLETED', 'PAID')];
      const refunds: RefundRecord[] = [
        {
          id: 'ref-pending',
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 400,
          reason: 'BILLING_DISPUTE',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'ref-cancelled',
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 200,
          reason: 'CUSTOMER_DISSATISFACTION',
          status: 'CANCELLED',
          createdAt: new Date().toISOString(),
        },
      ];

      const summary = calculateFinancialSummary(orders, [], refunds);
      expect(summary.totalRefunds).toBe(0);
      expect(summary.collectedRevenue).toBe(1000);
      expect(summary.netRevenue).toBe(1000);
      expect(summary.completedRefundsCount).toBe(0);
    });

    it('excludes unpaid orders from collected revenue', () => {
      const orders: Order[] = [
        createMockOrder('ord-1', 'ORD-001', 1200, 'SERVED', 'UNPAID'),
        createMockOrder('ord-2', 'ORD-002', 800, 'COMPLETED', 'PAID'),
      ];

      const summary = calculateFinancialSummary(orders, [], []);
      expect(summary.grossSales).toBe(2000);
      expect(summary.collectedRevenue).toBe(800);
      expect(summary.netRevenue).toBe(800);
      expect(summary.paidOrdersCount).toBe(1);
    });

    it('correctly reconciles fully refunded orders without negative net revenue', () => {
      const orders: Order[] = [createMockOrder('ord-1', 'ORD-001', 500, 'COMPLETED', 'REFUNDED')];
      const refunds: RefundRecord[] = [
        {
          id: 'ref-full',
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 500,
          reason: 'ORDER_CANCELLED_POST_PAYMENT',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      const summary = calculateFinancialSummary(orders, [], refunds);
      expect(summary.grossSales).toBe(500);
      expect(summary.collectedRevenue).toBe(500);
      expect(summary.totalRefunds).toBe(500);
      expect(summary.netRevenue).toBe(0);
    });

    it('ensures Dashboard and Reports calculate identical financial figures for equivalent datasets', () => {
      const testOrders: Order[] = [
        createMockOrder('ord-1', 'ORD-001', 1500, 'COMPLETED', 'PAID'),
        createMockOrder('ord-2', 'ORD-002', 800, 'COMPLETED', 'PAID'),
        createMockOrder('ord-3', 'ORD-003', 600, 'CANCELLED', 'PAID'),
      ];
      const testRefunds: RefundRecord[] = [
        {
          id: 'ref-1',
          orderId: 'ord-1',
          orderNumber: 'ORD-001',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 300,
          reason: 'CUSTOMER_DISSATISFACTION',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      mock.orders.set(testOrders);
      mock.refunds.set(testRefunds);
      mock.splitBills.set([]);

      const dashboardFixture = TestBed.createComponent(AdminDashboardComponent);
      const dashboard = dashboardFixture.componentInstance;
      dashboard.selectedTimeframe.set('all');

      const reportsFixture = TestBed.createComponent(ReportsComponent);
      const reports = reportsFixture.componentInstance;

      // Both must compute exact net revenue and gross sales
      expect(dashboard.netRevenue()).toBe(2000);
      expect(reports.netRevenue()).toBe(2000);
      expect(dashboard.grossSales()).toBe(2300);
      expect(reports.grossSales()).toBe(2300);
      expect(reports.collectedRevenue()).toBe(2300);
      expect(reports.totalRefunds()).toBe(300);
      expect(dashboard.avgOrderValue()).toBe(reports.averageOrderValue());
    });
  });

  // =========================================================================
  // FIX B: PRE-CHECKOUT STOCK & ATP VALIDATION
  // =========================================================================
  describe('Fix B: Pre-Checkout Stock & ATP Validation', () => {
    it('rejects checkout when a tracked ingredient has zero available stock', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(ing).toBeDefined();

      // Zero out the paneer stock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -ing.currentStock,
        type: 'WASTAGE',
        reason: 'Testing zero stock checkout rejection',
      });

      const orderToSubmit = createMockOrder('ord-test', 'ORD-TEST', 500, 'PENDING', 'UNPAID');
      orderToSubmit.items = [createMockItem('item-005', 'Paneer Tikka Angara', 2)];

      const initialOrderCount = mock.orders().length;
      const initialReservationsCount = mock.stockReservations().length;

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-zero-stock-1',
        order: orderToSubmit,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient available stock');
      expect(mock.orders().length).toBe(initialOrderCount);
      expect(mock.stockReservations().length).toBe(initialReservationsCount);
    });

    it('rejects checkout when aggregate recipe demand exceeds ATP stock', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(ing).toBeDefined();

      // Set paneer to 0.5 kg (one portion requires 0.25 kg)
      const current = ing.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 0.5 - current,
        type: 'STOCK_CORRECTION',
        reason: 'Set to exactly 0.5kg',
      });

      // Request 5 portions (needs 1.25 kg > 0.5 kg available)
      const orderToSubmit = createMockOrder('ord-excess', 'ORD-EXCESS', 1500, 'PENDING', 'UNPAID');
      orderToSubmit.items = [createMockItem('item-005', 'Paneer Tikka Angara', 5)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-excess-1',
        order: orderToSubmit,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient available stock');
    });

    it('respects active reservations belonging to other orders during checkout validation', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(ing).toBeDefined();

      // Set physical stock to 1.0 kg
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 1.0 - ing.currentStock,
        type: 'STOCK_CORRECTION',
        reason: 'Set to 1.0kg',
      });

      // Existing order has an active reservation for 0.8 kg
      mock.stockReservations.set([
        {
          id: 'res-other',
          orderId: 'ord-prior',
          ingredientId: 'ing-02',
          quantity: 0.8,
          unit: 'kg',
          createdAt: new Date().toISOString(),
        },
      ]);

      // Available-to-promise is now 1.0 - 0.8 = 0.2 kg.
      // 1 paneer portion needs 0.25 kg > 0.2 kg ATP!
      const orderToSubmit = createMockOrder('ord-atp', 'ORD-ATP', 400, 'PENDING', 'UNPAID');
      orderToSubmit.items = [createMockItem('item-005', 'Paneer Tikka Angara', 1)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-atp-1',
        order: orderToSubmit,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient available stock');
    });

    it('creates no order, reservation, stock movement, or deduction on failed checkout', () => {
      // Force stockout on paneer
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock,
        type: 'WASTAGE',
        reason: 'Stockout',
      });

      const ordersBefore = mock.orders().length;
      const reservationsBefore = mock.stockReservations().length;
      const movementsBefore = mock.stockMovements().length;
      const paneerStockBefore = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      const orderToSubmit = createMockOrder('ord-fail', 'ORD-FAIL', 500, 'PENDING', 'UNPAID');
      orderToSubmit.items = [createMockItem('item-005', 'Paneer Tikka Angara', 1)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-fail-check',
        order: orderToSubmit,
      });

      expect(result.success).toBe(false);
      expect(mock.orders().length).toBe(ordersBefore);
      expect(mock.stockReservations().length).toBe(reservationsBefore);
      expect(mock.stockMovements().length).toBe(movementsBefore);
      expect(mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock).toBe(
        paneerStockBefore,
      );
    });

    it('creates exactly one valid PENDING order on successful checkout without early stock deduction', () => {
      // Ensure sufficient stock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 10,
        type: 'RESTOCK',
        reason: 'Restock paneer for successful order',
      });

      const ordersBefore = mock.orders().length;
      const reservationsBefore = mock.stockReservations().length;
      const paneerBefore = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      const validOrder = createMockOrder('ord-valid-1', 'ORD-V01', 600, 'PENDING', 'UNPAID');
      validOrder.items = [createMockItem('item-005', 'Paneer Tikka Angara', 1)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-valid-1',
        order: validOrder,
      });

      expect(result.success).toBe(true);
      expect(result.order.status).toBe('PENDING');
      expect(mock.orders().length).toBe(ordersBefore + 1);

      // Customer checkout creates PENDING order; stock is reserved at authoritative ACCEPTANCE time
      expect(mock.stockReservations().length).toBe(reservationsBefore);
      expect(mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock).toBe(paneerBefore);
    });

    it('retrying with the same idempotency key does not duplicate the order', () => {
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 10,
        type: 'RESTOCK',
        reason: 'Restock for idempotency test',
      });

      const order = createMockOrder('ord-idem-check', 'ORD-IDEM', 500, 'PENDING', 'UNPAID');
      order.items = [createMockItem('item-005', 'Paneer Tikka Angara', 1)];

      const first = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-key-duplicate-test',
        order,
      });
      expect(first.success).toBe(true);
      expect(first.isCachedReplay).toBe(false);

      const countAfterFirst = mock.orders().length;

      // Duplicate submission
      const second = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-key-duplicate-test',
        order,
      });
      expect(second.success).toBe(true);
      expect(second.isCachedReplay).toBe(true);
      expect(mock.orders().length).toBe(countAfterFirst);
      expect(second.order.id).toBe(first.order.id);
    });

    it('preserves cart contents when checkout is rejected', () => {
      const cart = TestBed.inject(CartService);
      cart.clearCart();

      const item = mock.menuItems().find((m) => m.id === 'item-005')!;
      cart.addItem(item, 2);
      expect(cart.itemCount()).toBe(2);

      // Deplete paneer stock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock,
        type: 'WASTAGE',
        reason: 'Deplete for cart check',
      });

      const orderToSubmit = createMockOrder(
        'ord-cart-preserve',
        'ORD-CP',
        600,
        'PENDING',
        'UNPAID',
      );
      orderToSubmit.items = [createMockItem('item-005', 'Paneer Tikka Angara', 2)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-cart-check',
        order: orderToSubmit,
      });

      expect(result.success).toBe(false);
      // Cart items remain intact
      expect(cart.itemCount()).toBe(2);
      expect(cart.items().length).toBe(1);
    });

    it('allows untracked items without recipes to check out normally', () => {
      const untracked = mock.menuItems().find((m) => m.id === 'item-004') || {
        id: 'item-004',
        name: 'Roomali Roti',
        price: 50,
        categoryId: 'cat-01',
        dietary: 'VEG',
        prepTimeMinutes: 5,
        description: 'Hand-tossed thin flatbread',
        imageUrl: '',
        isAvailable: true,
      };

      const order = createMockOrder('ord-untracked', 'ORD-UT', 100, 'PENDING', 'UNPAID');
      order.items = [createMockItem(untracked.id, untracked.name, 2, 50)];

      const result = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-untracked-1',
        order,
      });

      expect(result.success).toBe(true);
      expect(result.order.status).toBe('PENDING');
    });

    it('maintains acceptance-time ATP stock validation and reservation', () => {
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 10,
        type: 'RESTOCK',
        reason: 'Restock paneer for acceptance test',
      });

      const order = createMockOrder('ord-accept-time', 'ORD-AT', 500, 'PENDING', 'UNPAID');
      order.items = [createMockItem('item-005', 'Paneer Tikka Angara', 1)];

      const submission = mock.simulateIdempotentOrderSubmission({
        idempotencyKey: 'idem-accept-time',
        order,
      });
      expect(submission.success).toBe(true);

      // Now accept the order through updateOrderStatusAtomic
      const acceptResult = mock.updateOrderStatusAtomic(submission.order.id, 'ACCEPTED');
      expect(acceptResult.success).toBe(true);
      expect(acceptResult.order?.status).toBe('ACCEPTED');

      // Reservations must now be created
      const reservations = mock
        .stockReservations()
        .filter((r) => r.orderId === submission.order.id);
      expect(reservations.length).toBeGreaterThan(0);
      expect(reservations[0].quantity).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // FIX C: TABLE OCCUPANCY PROTECTION
  // =========================================================================
  describe('Fix C: Table Occupancy Protection', () => {
    it('prevents staff from manually marking a table AVAILABLE when an active dining order is present', () => {
      // Create an active dining order for table T-01
      const activeOrder = createMockOrder(
        'ord-active-1',
        'ORD-A01',
        500,
        'PREPARING',
        'UNPAID',
        'tbl-01',
        'T-01',
      );
      mock.orders.set([activeOrder]);

      // Set table to OCCUPIED
      mock.tables.set(
        mock.tables().map((t) => (t.id === 'tbl-01' ? { ...t, status: 'OCCUPIED' } : t)),
      );

      // Attempt to mark table AVAILABLE
      const result = mock.updateTableStatus('tbl-01', 'AVAILABLE');
      expect(result.success).toBe(false);
      expect(result.error).toContain('has active order');
      expect(result.status).toBe('OCCUPIED');

      // Verify authoritative stored status was unchanged
      const tableAfter = mock.tables().find((t) => t.id === 'tbl-01')!;
      expect(tableAfter.status).toBe('OCCUPIED');
    });

    it('allows releasing a table to AVAILABLE when historical orders are COMPLETED or CANCELLED', () => {
      // Historical completed orders
      const historicalOrder = createMockOrder(
        'ord-hist-1',
        'ORD-H01',
        500,
        'COMPLETED',
        'PAID',
        'tbl-01',
        'T-01',
      );
      mock.orders.set([historicalOrder]);
      mock.reservations.set([]);

      // Set table to DIRTY
      mock.tables.set(
        mock.tables().map((t) => (t.id === 'tbl-01' ? { ...t, status: 'DIRTY' } : t)),
      );

      const result = mock.updateTableStatus('tbl-01', 'AVAILABLE');
      expect(result.success).toBe(true);
      expect(result.status).toBe('AVAILABLE');

      const tableAfter = mock.tables().find((t) => t.id === 'tbl-01')!;
      expect(tableAfter.status).toBe('AVAILABLE');
    });

    it('prevents marking a table AVAILABLE when a SEATED or CONFIRMED reservation exists', () => {
      mock.orders.set([]);

      // Add a SEATED reservation on tbl-02
      mock.reservations.set([
        {
          id: 'res-seated',
          tableId: 'tbl-02',
          tableNumber: 'T-02',
          customerName: 'Aarav Gupta',
          customerPhone: '+91 99999 11111',
          partySize: 4,
          reservationDate: new Date().toISOString(),
          status: 'SEATED',
          createdAt: new Date().toISOString(),
        },
      ]);
      mock.tables.set(
        mock.tables().map((t) => (t.id === 'tbl-02' ? { ...t, status: 'OCCUPIED' } : t)),
      );

      const result = mock.updateTableStatus('tbl-02', 'AVAILABLE');
      expect(result.success).toBe(false);
      expect(result.error).toContain('has seated guests');

      const tableAfter = mock.tables().find((t) => t.id === 'tbl-02')!;
      expect(tableAfter.status).toBe('OCCUPIED');
    });

    it('preserves authoritative table status in UI when TableListComponent status change fails', () => {
      const activeOrder = createMockOrder(
        'ord-act-ui',
        'ORD-AUI',
        400,
        'ACCEPTED',
        'UNPAID',
        'tbl-01',
        'T-01',
      );
      mock.orders.set([activeOrder]);
      mock.tables.set(
        mock.tables().map((t) => (t.id === 'tbl-01' ? { ...t, status: 'OCCUPIED' } : t)),
      );

      const fixture = TestBed.createComponent(TableListComponent);
      const component = fixture.componentInstance;

      const tbl = mock.tables().find((t) => t.id === 'tbl-01')!;
      component.onStatusChange(tbl.id, 'AVAILABLE');

      // Table must still be OCCUPIED
      const currentStored = mock.tables().find((t) => t.id === 'tbl-01')!;
      expect(currentStored.status).toBe('OCCUPIED');
    });
  });

  // =========================================================================
  // FIX D: LIVE INVENTORY AVAILABILITY IN ADMIN MENU MANAGEMENT
  // =========================================================================
  describe('Fix D: Live Inventory Availability in Admin Menu Management', () => {
    let menuComponent: MenuManagementComponent;

    beforeEach(() => {
      const fixture = TestBed.createComponent(MenuManagementComponent);
      menuComponent = fixture.componentInstance;
    });

    it('distinguishes IN_STOCK, LOW_STOCK, OUT_OF_STOCK, and UNTRACKED correctly', () => {
      const item005 = mock.menuItems().find((m) => m.id === 'item-005')!; // Tracked dish

      // 1. Ample stock -> AVAILABLE
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 20,
        type: 'RESTOCK',
        reason: 'Ample stock',
      });
      const ampleStatus = menuComponent.getItemStatus(item005);
      expect(ampleStatus.code).toBe('AVAILABLE');
      expect(ampleStatus.label).toContain('In Stock');
      expect(ampleStatus.icon).toBe('ph-check-circle');

      // 2. Low stock (<= 5 portions) -> LOW_STOCK
      // Paneer Tikka uses 0.25 kg paneer. 2 portions = 0.5 kg.
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 0.5 - mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock,
        type: 'STOCK_CORRECTION',
        reason: 'Set to 2 portions',
      });
      const lowStatus = menuComponent.getItemStatus(item005);
      expect(lowStatus.code).toBe('LOW_STOCK');
      expect(lowStatus.label).toContain('Low Stock (2 left)');
      expect(lowStatus.icon).toBe('ph-warning-circle');

      // 3. 0 stock -> OUT_OF_STOCK
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock,
        type: 'WASTAGE',
        reason: 'Stockout',
      });
      const outStatus = menuComponent.getItemStatus(item005);
      expect(outStatus.code).toBe('OUT_OF_STOCK');
      expect(outStatus.label).toBe('Out of Stock');
      expect(outStatus.icon).toBe('ph-x-circle');

      // 4. Untracked recipe -> UNTRACKED
      const untrackedItem = mock.menuItems().find((m) => m.id === 'item-004') || {
        id: 'item-004',
        name: 'Roomali Roti',
        price: 50,
        categoryId: 'cat-01',
        dietary: 'VEG',
        prepTimeMinutes: 5,
        description: 'Flatbread',
        imageUrl: '',
        isAvailable: true,
      };
      const untrackedStatus = menuComponent.getItemStatus(untrackedItem);
      expect(untrackedStatus.code).toBe('UNTRACKED');
      expect(untrackedStatus.label).toBe('Untracked Recipe');
    });

    it('ensures manually disabled dishes remain MANUALLY_DISABLED even if inventory stock is available', () => {
      // Dish has ample stock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 20,
        type: 'RESTOCK',
        reason: 'Ample stock',
      });

      const disabledDish: MenuItem = {
        id: 'item-005',
        name: 'Paneer Tikka Angara',
        price: 320,
        categoryId: 'cat-01',
        dietary: 'VEG',
        prepTimeMinutes: 20,
        description: 'Tikka',
        imageUrl: '',
        isAvailable: false, // Staff manually disabled
      };

      const status = menuComponent.getItemStatus(disabledDish);
      expect(status.code).toBe('MANUALLY_DISABLED');
      expect(status.label).toBe('Manually Disabled');
      expect(status.icon).toBe('ph-prohibit');
    });

    it('reactively updates menu availability displays when inventory is adjusted', () => {
      const item = mock.menuItems().find((m) => m.id === 'item-005')!;

      // Deplete stock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock,
        type: 'WASTAGE',
        reason: 'Stockout',
      });
      expect(menuComponent.getItemStatus(item).code).toBe('OUT_OF_STOCK');

      // Restock
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 10,
        type: 'RESTOCK',
        reason: 'Restock batch',
      });
      expect(menuComponent.getItemStatus(item).code).toBe('AVAILABLE');
    });

    it('handles missing or malformed menu item data safely without crashing', () => {
      const malformedItem: MenuItem = {
        id: 'item-non-existent-999',
        name: 'Ghost Item',
        price: 100,
        categoryId: 'cat-01',
        dietary: 'VEG',
        prepTimeMinutes: 10,
        description: 'Does not exist in DB',
        imageUrl: '',
        isAvailable: true,
      };

      expect(() => {
        const status = menuComponent.getItemStatus(malformedItem);
        expect(status.code).toBe('UNTRACKED');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // PHASE 5A: SPLIT-BILL ACCOUNTING & FINANCIAL REGRESSION AUDIT
  // =========================================================================
  describe('Phase 5A: Split-Bill Accounting & Financial Regression Audit', () => {
    function createMockSplit(
      id: string,
      orderId: string,
      totalAmount: number,
      paymentStatus: SplitBill['paymentStatus'] = 'PAID',
      splitIndex = 1,
    ): SplitBill {
      const tax = Math.round(totalAmount * 0.05 * 100) / 100;
      return {
        id,
        orderId,
        orderNumber: 'ORD-SPLIT',
        tableNumber: 'T-01',
        splitIndex,
        splitTotalCount: 2,
        splitType: 'EQUAL',
        subtotal: totalAmount - tax,
        discountAmount: 0,
        taxAmount: tax,
        totalAmount,
        paymentStatus,
        paymentMethod: paymentStatus === 'PAID' ? 'UPI' : undefined,
        settledAt: paymentStatus === 'PAID' ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      };
    }

    it('1. Parent order plus fully settled split bills does not double-count revenue', () => {
      const parentOrder = createMockOrder('ord-sp-1', 'ORD-SP01', 1200, 'COMPLETED', 'PAID');
      parentOrder.isSplit = true;
      parentOrder.splitCount = 2;

      const splits = [
        createMockSplit('sp-1-1', 'ord-sp-1', 600, 'PAID', 1),
        createMockSplit('sp-1-2', 'ord-sp-1', 600, 'PAID', 2),
      ];

      const summary = calculateFinancialSummary([parentOrder], splits, []);
      expect(summary.grossSales).toBe(1200);
      expect(summary.collectedRevenue).toBe(1200);
      expect(summary.netRevenue).toBe(1200);
      expect(summary.paidOrdersCount).toBe(1);
    });

    it('2. A partially settled split bill counts only the amount collected', () => {
      const parentOrder = createMockOrder('ord-sp-2', 'ORD-SP02', 1500, 'SERVED', 'PARTIALLY_PAID');
      parentOrder.isSplit = true;
      parentOrder.splitCount = 3;

      const splits = [
        createMockSplit('sp-2-1', 'ord-sp-2', 500, 'PAID', 1),
        createMockSplit('sp-2-2', 'ord-sp-2', 500, 'UNPAID', 2),
        createMockSplit('sp-2-3', 'ord-sp-2', 500, 'UNPAID', 3),
      ];

      const summary = calculateFinancialSummary([parentOrder], splits, []);
      expect(summary.grossSales).toBe(1500);
      expect(summary.collectedRevenue).toBe(500);
      expect(summary.netRevenue).toBe(500);
      expect(summary.paidOrdersCount).toBe(0);
    });

    it('3. Unsettled splits contribute no collected revenue', () => {
      const parentOrder = createMockOrder('ord-sp-3', 'ORD-SP03', 800, 'SERVED', 'PARTIALLY_PAID');
      parentOrder.isSplit = true;
      parentOrder.splitCount = 2;

      const splits = [
        createMockSplit('sp-3-1', 'ord-sp-3', 400, 'UNPAID', 1),
        createMockSplit('sp-3-2', 'ord-sp-3', 400, 'UNPAID', 2),
      ];

      const summary = calculateFinancialSummary([parentOrder], splits, []);
      expect(summary.grossSales).toBe(800);
      expect(summary.collectedRevenue).toBe(0);
      expect(summary.netRevenue).toBe(0);
      expect(summary.paidOrdersCount).toBe(0);
    });

    it('4. Completed refunds reduce net collected revenue exactly once', () => {
      const order1 = createMockOrder('ord-w-1', 'ORD-W01', 1000, 'COMPLETED', 'PAID');
      const order2 = createMockOrder('ord-sp-4', 'ORD-SP04', 800, 'COMPLETED', 'PAID');
      order2.isSplit = true;
      order2.splitCount = 2;

      const splits = [
        createMockSplit('sp-4-1', 'ord-sp-4', 400, 'PAID', 1),
        createMockSplit('sp-4-2', 'ord-sp-4', 400, 'PAID', 2),
      ];

      const refunds: RefundRecord[] = [
        {
          id: 'ref-w-1',
          orderId: 'ord-w-1',
          orderNumber: 'ORD-W01',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 200,
          reason: 'Item issue',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'ref-sp-1',
          orderId: 'ord-sp-4',
          orderNumber: 'ORD-SP04',
          splitBillId: 'sp-4-1',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 150,
          reason: 'Dish returned',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      const summary = calculateFinancialSummary([order1, order2], splits, refunds);
      // Collected: 1000 + 400 + 400 = 1800
      expect(summary.collectedRevenue).toBe(1800);
      // Refunds: 200 + 150 = 350
      expect(summary.totalRefunds).toBe(350);
      // Net: 1800 - 350 = 1450
      expect(summary.netRevenue).toBe(1450);
      expect(summary.completedRefundsCount).toBe(2);
    });

    it('5. Dashboard and Reports agree for identical datasets and filters', () => {
      const mixedOrders: Order[] = [
        createMockOrder('ord-dash-1', 'ORD-D01', 1000, 'COMPLETED', 'PAID'),
        createMockOrder('ord-dash-2', 'ORD-D02', 600, 'COMPLETED', 'PAID'),
      ];
      mixedOrders[1].isSplit = true;

      const splits = [
        createMockSplit('sp-d-1', 'ord-dash-2', 300, 'PAID', 1),
        createMockSplit('sp-d-2', 'ord-dash-2', 300, 'PAID', 2),
      ];

      const refunds: RefundRecord[] = [
        {
          id: 'ref-d-1',
          orderId: 'ord-dash-1',
          orderNumber: 'ORD-D01',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 100,
          reason: 'Dispute',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      mock.orders.set(mixedOrders);
      mock.splitBills.set(splits);
      mock.refunds.set(refunds);

      const dashboardFixture = TestBed.createComponent(AdminDashboardComponent);
      const dashboard = dashboardFixture.componentInstance;
      dashboard.selectedTimeframe.set('all');

      const reportsFixture = TestBed.createComponent(ReportsComponent);
      const reports = reportsFixture.componentInstance;
      reports.setPreset('all');

      expect(dashboard.netRevenue()).toBe(1500);
      expect(reports.netRevenue()).toBe(1500);
      expect(dashboard.grossSales()).toBe(1600);
      expect(reports.grossSales()).toBe(1600);
      expect(reports.collectedRevenue()).toBe(1600);
      expect(reports.totalRefunds()).toBe(100);
      expect(dashboard.avgOrderValue()).toBe(reports.averageOrderValue());
    });

    it('6. Mixed full-order and split-order settlements reconcile correctly', () => {
      const ord1 = createMockOrder('ord-m-1', 'ORD-M01', 700, 'COMPLETED', 'PAID');
      const ord2 = createMockOrder('ord-m-2', 'ORD-M02', 300, 'SERVED', 'UNPAID');
      const ord3 = createMockOrder('ord-m-3', 'ORD-M03', 1000, 'SERVED', 'PARTIALLY_PAID');
      ord3.isSplit = true;
      const ord4 = createMockOrder('ord-m-4', 'ORD-M04', 600, 'COMPLETED', 'PAID');
      ord4.isSplit = true;

      const splits: SplitBill[] = [
        createMockSplit('sp-m-3-1', 'ord-m-3', 500, 'PAID', 1),
        createMockSplit('sp-m-3-2', 'ord-m-3', 500, 'UNPAID', 2),
        createMockSplit('sp-m-4-1', 'ord-m-4', 300, 'PAID', 1),
        createMockSplit('sp-m-4-2', 'ord-m-4', 300, 'PAID', 2),
      ];

      const summary = calculateFinancialSummary([ord1, ord2, ord3, ord4], splits, []);
      // Gross: 700 + 300 + 1000 + 600 = 2600
      expect(summary.grossSales).toBe(2600);
      // Collected: 700 (ord1) + 0 (ord2 unpaid) + 500 (ord3 split 1) + 600 (ord4 splits 1 & 2) = 1800
      expect(summary.collectedRevenue).toBe(1800);
      expect(summary.netRevenue).toBe(1800);
      // Paid orders: ord1 (whole PAID) + ord4 (all splits settled) = 2
      expect(summary.paidOrdersCount).toBe(2);
      expect(summary.cancelledOrdersCount).toBe(0);
    });

    it('7. Cancelled and refunded orders do not produce inconsistent financial totals', () => {
      const ordValid = createMockOrder('ord-v-1', 'ORD-V01', 500, 'COMPLETED', 'PAID');
      const ordCancelledPaid = createMockOrder('ord-c-1', 'ORD-C01', 400, 'CANCELLED', 'PAID');
      const ordCancelledUnpaid = createMockOrder('ord-c-2', 'ORD-C02', 600, 'CANCELLED', 'UNPAID');
      const ordRefunded = createMockOrder('ord-r-1', 'ORD-R01', 300, 'COMPLETED', 'REFUNDED');

      const refunds: RefundRecord[] = [
        {
          id: 'ref-cancel-1',
          orderId: 'ord-c-1',
          orderNumber: 'ORD-C01',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 400,
          reason: 'Voided order refunded',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'ref-valid-refund',
          orderId: 'ord-r-1',
          orderNumber: 'ORD-R01',
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 300,
          reason: 'Customer return',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        },
      ];

      const summary = calculateFinancialSummary(
        [ordValid, ordCancelledPaid, ordCancelledUnpaid, ordRefunded],
        [],
        refunds,
      );

      // Gross: 500 (ordValid) + 300 (ordRefunded) = 800 (cancelled orders excluded)
      expect(summary.grossSales).toBe(800);
      // Collected: 500 (ordValid) + 400 (ordCancelledPaid) + 300 (ordRefunded) = 1200
      expect(summary.collectedRevenue).toBe(1200);
      // Total completed refunds: 400 (cancelled order refund) + 300 (valid order refund) = 700
      expect(summary.totalRefunds).toBe(700);
      // Net revenue: 1200 - 700 = 500 (signed net collections preserve ordValid revenue)
      expect(summary.netRevenue).toBe(500);
      expect(summary.cancelledOrdersCount).toBe(2);
    });
  });
});
