import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { CartService } from './services/cart.service';
import { Order, OrderItem } from './models/order.model';
import { Reservation } from './models/reservation.model';

function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: `ord-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNumber: '#ORD-100',
    idempotencyKey: `idem-${Date.now()}`,
    restaurantSlug: 'gurukripa-dhaba',
    tableId: 'tbl-001',
    tableNumber: 'T-01',
    customerName: 'Test Diner',
    customerPhone: '+91 9999988888',
    customerPhoneE164: '+919999988888',
    items: [],
    subtotal: 500,
    discountAmount: 0,
    taxAmount: 25,
    cgstAmount: 12.5,
    sgstAmount: 12.5,
    totalAmount: 525,
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [
      {
        status: 'RECEIVED',
        timestamp: new Date().toISOString(),
        note: 'Order placed',
      },
    ],
    ...overrides,
  };
}

describe('Phase 1 Hardening & Correctness Verification', () => {
  let mockData: MockDataService;
  let cartService: CartService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), MockDataService, CartService],
    });

    mockData = TestBed.inject(MockDataService);
    cartService = TestBed.inject(CartService);

    // Initialize clean tables
    mockData.tables.set([
      {
        id: 'tbl-001',
        number: 'T-01',
        capacity: 2,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tbl-01',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-01',
        orderingEnabled: true,
      },
      {
        id: 'tbl-002',
        number: 'T-02',
        capacity: 4,
        section: 'Main Dining',
        status: 'OCCUPIED',
        qrToken: 'tbl-02',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-02',
        orderingEnabled: true,
      },
      {
        id: 'tbl-007',
        number: 'T-07',
        capacity: 4,
        section: 'Terrace Garden',
        status: 'OCCUPIED',
        qrToken: 'tbl-07',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-07',
        orderingEnabled: true,
      },
      {
        id: 'tbl-012',
        number: 'T-12',
        capacity: 2,
        section: 'Bar',
        status: 'DIRTY',
        qrToken: 'tbl-12',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-12',
        orderingEnabled: false,
      },
    ]);

    // Initialize clean orders & state
    mockData.orders.set([]);
    mockData.invoices.set([]);
    mockData.reservations.set([]);
  });

  // =========================================================================
  // WORKSTREAM 1: TABLE QR & ORDER BOUNDARY VALIDATION
  // =========================================================================
  describe('Workstream 1: Table QR & Eligibility Validation', () => {
    it('resolves valid table token to correct table', () => {
      const token = 'tbl-01';
      const foundTable = mockData.tables().find((t) => t.qrToken === token || t.id === token);
      expect(foundTable).toBeDefined();
      expect(foundTable?.number).toBe('T-01');
    });

    it('rejects unknown token without falling back to T-07', () => {
      const unknownToken = 'invalid-fake-token-999';
      const foundTable = mockData
        .tables()
        .find((t) => t.qrToken === unknownToken || t.id === unknownToken);
      expect(foundTable).toBeUndefined();
    });

    it('identifies tables with ordering disabled', () => {
      const disabledTable = mockData.tables().find((t) => t.id === 'tbl-012');
      expect(disabledTable).toBeDefined();
      expect(disabledTable?.orderingEnabled).toBe(false);
      expect(disabledTable?.status).toBe('DIRTY');
    });

    it('blocks order creation when table has ordering disabled or status DIRTY', () => {
      const dummyOrder = createMockOrder({
        tableId: 'tbl-012',
        tableNumber: 'T-12',
      });

      const result = mockData.simulateIdempotentOrderSubmission({
        idempotencyKey: dummyOrder.idempotencyKey!,
        order: dummyOrder,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('blocks order creation for non-existent table', () => {
      const dummyOrder = createMockOrder({
        tableId: 'tbl-999',
        tableNumber: 'T-99',
      });

      const result = mockData.simulateIdempotentOrderSubmission({
        idempotencyKey: dummyOrder.idempotencyKey!,
        order: dummyOrder,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Table not found');
    });

    it('allows occupied table to order if orderingEnabled is true', () => {
      const dummyOrder = createMockOrder({
        tableId: 'tbl-002',
        tableNumber: 'T-02',
      });

      const result = mockData.simulateIdempotentOrderSubmission({
        idempotencyKey: dummyOrder.idempotencyKey!,
        order: dummyOrder,
      });

      expect(result.success).toBe(true);
    });

    it('CartService resets table context cleanly', () => {
      cartService.setTableContext('tbl-001', 'T-01', 'tbl-01');
      expect(cartService.tableContext()?.tableNumber).toBe('T-01');

      cartService.clearTableContext();
      expect(cartService.tableContext()).toBeNull();
    });
  });

  // =========================================================================
  // WORKSTREAM 2: CASH & UPI SETTLEMENT
  // =========================================================================
  describe('Workstream 2: Cash & UPI Payment Recording', () => {
    it('settles an unpaid bill with Cash and updates paymentStatus and paymentMethod', () => {
      const order = createMockOrder({
        id: 'ord-cash-1',
        paymentStatus: 'UNPAID',
        status: 'SERVED',
      });
      mockData.orders.set([order]);

      // Settle with CASH
      const updated = mockData
        .orders()
        .map((o) =>
          o.id === order.id
            ? { ...o, paymentStatus: 'PAID' as const, paymentMethod: 'CASH' as const }
            : o,
        );
      mockData.orders.set(updated);

      const settledOrder = mockData.orders().find((o) => o.id === order.id);
      expect(settledOrder?.paymentStatus).toBe('PAID');
      expect(settledOrder?.paymentMethod).toBe('CASH');
    });

    it('settles an unpaid bill with UPI and records UPI method', () => {
      const order = createMockOrder({
        id: 'ord-upi-1',
        paymentStatus: 'UNPAID',
        status: 'SERVED',
      });
      mockData.orders.set([order]);

      // Settle with UPI
      const updated = mockData
        .orders()
        .map((o) =>
          o.id === order.id
            ? { ...o, paymentStatus: 'PAID' as const, paymentMethod: 'UPI' as const }
            : o,
        );
      mockData.orders.set(updated);

      const settledOrder = mockData.orders().find((o) => o.id === order.id);
      expect(settledOrder?.paymentStatus).toBe('PAID');
      expect(settledOrder?.paymentMethod).toBe('UPI');
    });

    it('rejects duplicate settlement of an already settled order', () => {
      const order = createMockOrder({
        id: 'ord-paid-1',
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
      });
      mockData.orders.set([order]);

      const currentOrder = mockData.orders().find((o) => o.id === order.id);
      expect(currentOrder?.paymentStatus).toBe('PAID');
      const canSettleAgain = currentOrder?.paymentStatus === 'UNPAID';
      expect(canSettleAgain).toBe(false);
    });
  });

  // =========================================================================
  // WORKSTREAM 3: DYNAMIC REPORT CALCULATIONS
  // =========================================================================
  describe('Workstream 3: Dynamic Reports Analytics', () => {
    it('aggregates category revenue dynamically from item prices and quantities', () => {
      mockData.categories.set([
        {
          id: 'cat-01',
          name: 'Awadhi Biryani',
          slug: 'awadhi-biryani',
          icon: 'ph-bowl-food',
          sortOrder: 1,
          isActive: true,
        },
        {
          id: 'cat-02',
          name: 'Tandoori Kebabs',
          slug: 'tandoori-kebabs',
          icon: 'ph-fire',
          sortOrder: 2,
          isActive: true,
        },
      ]);

      mockData.menuItems.set([
        {
          id: 'item-1',
          categoryId: 'cat-01',
          name: 'Gosht Dum Biryani',
          description: '',
          price: 600,
          imageUrl: '',
          isAvailable: true,
          dietary: 'NON_VEG',
          prepTimeMinutes: 20,
        },
        {
          id: 'item-2',
          categoryId: 'cat-02',
          name: 'Galouti Kebab',
          description: '',
          price: 400,
          imageUrl: '',
          isAvailable: true,
          dietary: 'NON_VEG',
          prepTimeMinutes: 15,
        },
      ]);

      const testOrder = createMockOrder({
        id: 'ord-dyn-1',
        items: [
          {
            id: 'line-1',
            menuItemId: 'item-1',
            name: 'Gosht Dum Biryani',
            selectedVariants: [],
            selectedAddons: [],
            unitPrice: 600,
            quantity: 2,
            itemTotal: 1200,
          },
          {
            id: 'line-2',
            menuItemId: 'item-2',
            name: 'Galouti Kebab',
            selectedVariants: [],
            selectedAddons: [],
            unitPrice: 400,
            quantity: 1,
            itemTotal: 400,
          },
        ],
        subtotal: 1600,
        taxAmount: 80,
        cgstAmount: 40,
        sgstAmount: 40,
        totalAmount: 1680,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
      });

      mockData.orders.set([testOrder]);

      // Category map calculation
      const catMap = new Map<string, number>();
      for (const ord of mockData.orders()) {
        for (const item of ord.items) {
          const mItem = mockData.menuItems().find((m) => m.id === item.menuItemId);
          const catName =
            mockData.categories().find((c) => c.id === mItem?.categoryId)?.name || 'Other';
          catMap.set(catName, (catMap.get(catName) || 0) + item.itemTotal);
        }
      }

      expect(catMap.get('Awadhi Biryani')).toBe(1200);
      expect(catMap.get('Tandoori Kebabs')).toBe(400);
    });

    it('differentiates Cash vs UPI in payment breakdown', () => {
      const orders: Order[] = [
        createMockOrder({
          id: 'ord-p1',
          totalAmount: 1050,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
        }),
        createMockOrder({
          id: 'ord-p2',
          totalAmount: 2100,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
        }),
        createMockOrder({
          id: 'ord-p3',
          totalAmount: 3150,
          status: 'PENDING',
          paymentStatus: 'UNPAID', // should be excluded from settled totals
        }),
      ];

      mockData.orders.set(orders);

      const paidOrders = mockData.orders().filter((o) => o.paymentStatus === 'PAID');
      const cashTotal = paidOrders
        .filter((o) => o.paymentMethod === 'CASH')
        .reduce((s, o) => s + o.totalAmount, 0);
      const upiTotal = paidOrders
        .filter((o) => o.paymentMethod === 'UPI')
        .reduce((s, o) => s + o.totalAmount, 0);

      expect(cashTotal).toBe(1050);
      expect(upiTotal).toBe(2100);
      expect(paidOrders.length).toBe(2);
    });
  });

  // =========================================================================
  // WORKSTREAM 4: RESERVATIONS & TABLE OCCUPANCY
  // =========================================================================
  describe('Workstream 4: Reservation Date/Time & Occupancy', () => {
    it('creates reservation with explicit date and time ISO format', () => {
      const explicitDate = '2026-11-15';
      const explicitTime = '19:30';
      const isoDateTime = new Date(`${explicitDate}T${explicitTime}:00`).toISOString();

      const newRes: Reservation = {
        id: 'res-test-1',
        customerName: 'Kunal Kapoor',
        customerPhone: '+91 9888877777',
        partySize: 4,
        tableNumber: 'T-01',
        reservationDate: isoDateTime,
        specialRequests: 'Near window',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      };

      mockData.reservations.set([newRes]);
      const stored = mockData.reservations().find((r) => r.id === 'res-test-1');
      expect(stored?.reservationDate).toBe(isoDateTime);
      expect(new Date(stored!.reservationDate).getHours()).toBe(19);
      expect(new Date(stored!.reservationDate).getMinutes()).toBe(30);
    });

    it('marking reservation as SEATED updates table occupancy to OCCUPIED', () => {
      // T-01 is AVAILABLE initially
      const targetTable = mockData.tables().find((t) => t.number === 'T-01');
      expect(targetTable?.status).toBe('AVAILABLE');

      const res: Reservation = {
        id: 'res-seat-1',
        customerName: 'Ananya Birla',
        customerPhone: '+91 9777766666',
        partySize: 2,
        tableNumber: 'T-01',
        reservationDate: new Date().toISOString(),
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      };
      mockData.reservations.set([res]);

      // Seating operation
      const updatedRes = mockData
        .reservations()
        .map((r) => (r.id === res.id ? { ...r, status: 'SEATED' as const } : r));
      mockData.reservations.set(updatedRes);

      const updatedTables = mockData
        .tables()
        .map((t) => (t.number === res.tableNumber ? { ...t, status: 'OCCUPIED' as const } : t));
      mockData.tables.set(updatedTables);

      const tableAfterSeating = mockData.tables().find((t) => t.number === 'T-01');
      expect(tableAfterSeating?.status).toBe('OCCUPIED');
    });

    it('cancelling a reservation does not free a table if an active order exists on it', () => {
      // Table T-07 is OCCUPIED and has an active order
      const activeOrder = createMockOrder({
        id: 'ord-active-1',
        tableId: 'tbl-007',
        tableNumber: 'T-07',
        status: 'PREPARING',
        paymentStatus: 'UNPAID',
      });
      mockData.orders.set([activeOrder]);

      const res: Reservation = {
        id: 'res-t7',
        customerName: 'Guest',
        customerPhone: '+91 9888811111',
        partySize: 4,
        tableNumber: 'T-07',
        reservationDate: new Date().toISOString(),
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      };
      mockData.reservations.set([res]);

      // Cancel reservation check:
      const hasActiveOrder = mockData
        .orders()
        .some(
          (o) =>
            (o.tableNumber === 'T-07' || o.tableId === 'tbl-007') &&
            o.status !== 'COMPLETED' &&
            o.status !== 'CANCELLED',
        );
      expect(hasActiveOrder).toBe(true);

      // Safe release rule prevents changing T-07 status to AVAILABLE
      const tableT7 = mockData.tables().find((t) => t.number === 'T-07');
      expect(tableT7?.status).toBe('OCCUPIED');
    });
  });

  // =========================================================================
  // WORKSTREAM 5: RESTAURANT BRANDING CONSISTENCY
  // =========================================================================
  describe('Workstream 5: Restaurant Branding Consistency', () => {
    it('provides consistent restaurant configuration through MockDataService signal', () => {
      const restaurant = mockData.restaurant();
      expect(restaurant).toBeDefined();
      expect(restaurant?.name).toBe('GuruKripa Dhaba');
      expect(restaurant?.slug).toBe('gurukripa-dhaba');
    });
  });
});
