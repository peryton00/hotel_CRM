import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import { Table } from './models/table.model';
import { Reservation } from './models/reservation.model';
import { Invoice, SplitBill, RefundRecord } from './models/billing.model';
import { ReportsComponent } from '../features/admin/reports/reports.component';

function createMockOrderItem(
  id: string,
  name: string,
  unitPrice: number,
  quantity: number,
): OrderItem {
  return {
    id,
    menuItemId: `item-${id}`,
    name,
    unitPrice,
    quantity,
    itemTotal: Math.round(unitPrice * quantity * 100) / 100,
    selectedVariants: [],
    selectedAddons: [],
  };
}

function createConsistentMockOrder(overrides: Partial<Order> = {}): Order {
  const items = overrides.items || [
    createMockOrderItem('item-1', 'Butter Chicken', 320, 1),
    createMockOrderItem('item-2', 'Garlic Naan', 60, 2),
  ];
  const subtotal = overrides.subtotal ?? items.reduce((sum, it) => sum + it.itemTotal, 0); // 440
  const discountAmount = overrides.discountAmount ?? 40;
  const taxable = subtotal - discountAmount; // 400
  const cgstAmount = overrides.cgstAmount ?? Math.round(taxable * 0.025 * 100) / 100; // 10.00
  const sgstAmount = overrides.sgstAmount ?? Math.round(taxable * 0.025 * 100) / 100; // 10.00
  const taxAmount = overrides.taxAmount ?? cgstAmount + sgstAmount; // 20.00
  const totalAmount = overrides.totalAmount ?? taxable + taxAmount; // 420.00

  return {
    id: `ord-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNumber: '#ORD-999',
    idempotencyKey: `idem-${Date.now()}`,
    restaurantSlug: 'royal-spice',
    tableId: 'tbl-001',
    tableNumber: 'T-01',
    customerName: 'Rohit Verma',
    customerPhone: '+91 9876500000',
    customerPhoneE164: '+919876500000',
    items,
    subtotal,
    discountAmount,
    taxAmount,
    cgstAmount,
    sgstAmount,
    totalAmount,
    status: 'SERVED',
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

describe('Phase 2A Acceptance Hardening & Financial Consistency Audit', () => {
  let mockData: MockDataService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), MockDataService],
    });

    mockData = TestBed.inject(MockDataService);

    const initialTables: Table[] = [
      {
        id: 'tbl-001',
        number: 'T-01',
        capacity: 2,
        section: 'Main Dining',
        status: 'OCCUPIED',
        qrToken: 'tbl-01',
        qrUrl: '/menu/royal-spice/table/tbl-01',
        orderingEnabled: true,
      },
      {
        id: 'tbl-002',
        number: 'T-02',
        capacity: 4,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tbl-02',
        qrUrl: '/menu/royal-spice/table/tbl-02',
        orderingEnabled: true,
      },
      {
        id: 'tbl-003',
        number: 'T-03',
        capacity: 6,
        section: 'Terrace Garden',
        status: 'RESERVED',
        qrToken: 'tbl-03',
        qrUrl: '/menu/royal-spice/table/tbl-03',
        orderingEnabled: true,
      },
      {
        id: 'tbl-004',
        number: 'T-04',
        capacity: 4,
        section: 'Private Lounge',
        status: 'DIRTY',
        qrToken: 'tbl-04',
        qrUrl: '/menu/royal-spice/table/tbl-04',
        orderingEnabled: false,
      },
    ];

    mockData.tables.set(initialTables);
    mockData.orders.set([]);
    mockData.splitBills.set([]);
    mockData.refunds.set([]);
    mockData.reservations.set([]);
    mockData.tableTransfers.set([]);
  });

  // ==========================================================================
  // 1. REFUND & PAYMENT STATE INVARIANTS (Section 2)
  // ==========================================================================
  describe('Refund and Payment-State Invariants', () => {
    it('supports multiple sequential partial refunds and prevents exceeding settled amount by ₹0.01', () => {
      const order = createConsistentMockOrder({
        id: 'ord-ref-1',
        totalAmount: 420,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(420);

      // First partial refund ₹150
      const ref1 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 150,
        reason: 'Late starter item',
      });
      expect(ref1.success).toBe(true);
      expect(ref1.refund?.status).toBe('COMPLETED');
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(270);

      // Second partial refund ₹200
      const ref2 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 200,
        reason: 'Beverage spilled by runner',
      });
      expect(ref2.success).toBe(true);
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(70);

      // Order should still be PAID because ₹70 refundable balance remains
      const updatedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(updatedOrder.paymentStatus).toBe('PAID');
      expect(updatedOrder.totalRefunded).toBe(350);

      // Refund exceeding remaining balance by ₹0.01 (₹70.01) must be strictly rejected
      const overRef = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 70.01,
        reason: 'Over refund attempt by 1 paise',
      });
      expect(overRef.success).toBe(false);
      expect(overRef.error).toMatch(/exceeds maximum refundable balance/i);
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(70);

      // Final partial refund of exact remaining balance ₹70
      const ref3 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 70,
        reason: 'Goodwill gesture for remaining balance',
      });
      expect(ref3.success).toBe(true);
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(0);

      // Now order is fully refunded
      const fullyRefundedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(fullyRefundedOrder.paymentStatus).toBe('REFUNDED');
      expect(fullyRefundedOrder.totalRefunded).toBe(420);
    });

    it('enforces idempotency key and suppresses rapid duplicate refund submissions', () => {
      const order = createConsistentMockOrder({
        id: 'ord-ref-dup',
        totalAmount: 300,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      const idempotencyKey = 'idem-refund-test-123';
      const ref1 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 50,
        reason: 'Wrong dish served',
        idempotencyKey,
      });
      expect(ref1.success).toBe(true);

      // Repeat with same idempotency key
      const ref2 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 50,
        reason: 'Wrong dish served',
        idempotencyKey,
      });
      expect(ref2.success).toBe(true);
      expect(ref2.refund?.id).toBe(ref1.refund?.id);

      // Total recorded refunds must still be exactly 1
      expect(mockData.refunds().length).toBe(1);
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(250);
    });

    it('manages PENDING refund lifecycle: does not deduct balance until COMPLETED, and restores on CANCELLED', () => {
      const order = createConsistentMockOrder({
        id: 'ord-ref-lifecycle',
        totalAmount: 500,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      // Create a PENDING refund of ₹120
      const pendingRes = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 120,
        reason: 'Manager review pending',
        status: 'PENDING',
      });
      expect(pendingRes.success).toBe(true);
      const pendingRefund = pendingRes.refund!;
      expect(pendingRefund.status).toBe('PENDING');

      // Remaining refundable balance must NOT be reduced by pending refund
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(500);

      // Complete the refund
      const completeRes = mockData.updateRefundStatus(pendingRefund.id, 'COMPLETED');
      expect(completeRes.success).toBe(true);
      expect(completeRes.refund?.status).toBe('COMPLETED');

      // Now remaining refundable balance is reduced to ₹380
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(380);

      // Create another PENDING refund of ₹100 and then CANCEL it
      const pendingRes2 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 100,
        reason: 'Guest dispute under review',
        status: 'PENDING',
      });
      expect(pendingRes2.success).toBe(true);
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(380);

      const cancelRes = mockData.updateRefundStatus(pendingRes2.refund!.id, 'CANCELLED');
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.refund?.status).toBe('CANCELLED');

      // Balance remains ₹380
      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(380);
    });

    it('isolates split-bill refunds when sibling split bills remain unpaid', () => {
      const order = createConsistentMockOrder({ id: 'ord-split-iso', totalAmount: 200 });
      mockData.orders.set([order]);

      const splitRes = mockData.splitOrderEqual({ orderId: order.id, splitCount: 2 });
      const [split1, split2] = splitRes.splitBills!;

      // Settle ONLY split bill 1
      mockData.settleSplitBill({ orderId: order.id, splitBillId: split1.id, paymentMethod: 'UPI' });

      // Split 1 is settled, split 2 is unpaid
      expect(mockData.getRemainingRefundableAmount(order.id, split1.id)).toBe(100);
      expect(mockData.getRemainingRefundableAmount(order.id, split2.id)).toBe(0);

      // Attempting refund on unpaid split 2 must fail
      const refundSplit2 = mockData.recordRefund({
        orderId: order.id,
        splitBillId: split2.id,
        refundAmount: 50,
        reason: 'Refund unpaid split',
      });
      expect(refundSplit2.success).toBe(false);
      expect(refundSplit2.error).toMatch(/not settled/i);

      // Refund on settled split 1 succeeds
      const refundSplit1 = mockData.recordRefund({
        orderId: order.id,
        splitBillId: split1.id,
        refundAmount: 40,
        reason: 'Partial return on split 1',
      });
      expect(refundSplit1.success).toBe(true);
      expect(mockData.getRemainingRefundableAmount(order.id, split1.id)).toBe(60);

      // Verify split 2 was completely unaffected
      const recheckedSplit2 = mockData.splitBills().find((b) => b.id === split2.id)!;
      expect(recheckedSplit2.paymentStatus).toBe('UNPAID');
      expect(recheckedSplit2.totalRefunded).toBe(0);
    });
  });

  // ==========================================================================
  // 2. SPLIT-BILL ARITHMETIC & RECONCILIATION (Section 3)
  // ==========================================================================
  describe('Split-Bill Arithmetic and Reconciliation', () => {
    it('reconciles ₹100.00 split into 3 bills: internal bill math and sum of bills match exactly', () => {
      const order = createConsistentMockOrder({
        id: 'ord-100-awkward',
        subtotal: 95.24,
        discountAmount: 0,
        taxAmount: 4.76,
        cgstAmount: 2.38,
        sgstAmount: 2.38,
        totalAmount: 100.0,
      });
      mockData.orders.set([order]);

      const res = mockData.splitOrderEqual({ orderId: order.id, splitCount: 3 });
      expect(res.success).toBe(true);
      const splits = res.splitBills!;
      expect(splits.length).toBe(3);

      // Every bill must satisfy: subtotal - discountAmount + taxAmount === totalAmount
      for (const bill of splits) {
        const computedTotal =
          Math.round((bill.subtotal - bill.discountAmount + bill.taxAmount) * 100) / 100;
        expect(computedTotal).toBe(bill.totalAmount);
      }

      // Sum of all split totals must equal 100.00 exactly
      const sumTotals = splits.reduce((sum, b) => sum + b.totalAmount, 0);
      expect(Math.round(sumTotals * 100) / 100).toBe(100.0);

      // Sum of all split subtotals must equal parent subtotal 95.24
      const sumSubtotals = splits.reduce((sum, b) => sum + b.subtotal, 0);
      expect(Math.round(sumSubtotals * 100) / 100).toBe(95.24);

      // Sum of all split taxes must equal parent tax 4.76
      const sumTaxes = splits.reduce((sum, b) => sum + b.taxAmount, 0);
      expect(Math.round(sumTaxes * 100) / 100).toBe(4.76);
    });

    it('handles awkward 1-paise remainders and uneven distributions without rounding drift', () => {
      // ₹100.01 split 3 ways: 33.34, 33.34, 33.33
      const order = createConsistentMockOrder({
        id: 'ord-100-01',
        subtotal: 95.25,
        discountAmount: 0,
        taxAmount: 4.76,
        cgstAmount: 2.38,
        sgstAmount: 2.38,
        totalAmount: 100.01,
      });
      mockData.orders.set([order]);

      const res = mockData.splitOrderEqual({ orderId: order.id, splitCount: 3 });
      expect(res.success).toBe(true);
      const splits = res.splitBills!;

      const sumTotals = splits.reduce((sum, b) => sum + b.totalAmount, 0);
      expect(Math.round(sumTotals * 100) / 100).toBe(100.01);

      for (const bill of splits) {
        const internalReconciliation =
          Math.round((bill.subtotal - bill.discountAmount + bill.taxAmount) * 100) / 100;
        expect(internalReconciliation).toBe(bill.totalAmount);
      }
    });

    it('rejects invalid, negative, or unallocated quantities in item-based split', () => {
      const it1 = createMockOrderItem('it-1', 'Paneer Tikka', 200, 2);
      const it2 = createMockOrderItem('it-2', 'Butter Naan', 40, 3);
      const order = createConsistentMockOrder({
        id: 'ord-invalid-item-split',
        items: [it1, it2],
        subtotal: 520,
        discountAmount: 0,
        taxAmount: 26,
        totalAmount: 546,
      });
      mockData.orders.set([order]);

      // Negative quantity
      const negRes = mockData.splitOrderItemBased({
        orderId: order.id,
        splits: [
          { allocatedItems: [{ orderItemId: 'it-1', quantity: -1 }] },
          { allocatedItems: [{ orderItemId: 'it-1', quantity: 3 }] },
        ],
      });
      expect(negRes.success).toBe(false);
      expect(negRes.error).toMatch(/greater than zero/i);

      // Unknown orderItemId
      const unknownRes = mockData.splitOrderItemBased({
        orderId: order.id,
        splits: [
          { allocatedItems: [{ orderItemId: 'non-existent-item', quantity: 1 }] },
          { allocatedItems: [{ orderItemId: 'it-1', quantity: 2 }] },
        ],
      });
      expect(unknownRes.success).toBe(false);
      expect(unknownRes.error).toMatch(/invalid item id/i);

      // Under-allocated total quantity (allocated 1 out of 2 for it-1)
      const underRes = mockData.splitOrderItemBased({
        orderId: order.id,
        splits: [
          {
            allocatedItems: [
              { orderItemId: 'it-1', quantity: 1 },
              { orderItemId: 'it-2', quantity: 3 },
            ],
          },
          { allocatedItems: [] },
        ],
      });
      expect(underRes.success).toBe(false);
      expect(underRes.error).toMatch(/must be fully allocated/i);
    });
  });

  // ==========================================================================
  // 3. PARENT-ORDER & SPLIT-BILL STATE CONSISTENCY (Section 4)
  // ==========================================================================
  describe('Parent-Order and Split-Bill State Consistency', () => {
    it('prevents settling split parent orders directly', () => {
      const order = createConsistentMockOrder({ id: 'ord-split-settle-protect', totalAmount: 400 });
      mockData.orders.set([order]);

      // Split order
      mockData.splitOrderEqual({ orderId: order.id, splitCount: 2 });

      // Direct settlement of parent order must be rejected
      const directSettle = mockData.settleOrder({
        orderId: order.id,
        paymentMethod: 'CASH',
      });
      expect(directSettle.success).toBe(false);
      expect(directSettle.error).toMatch(/is split into individual bills/i);
    });

    it('rejects settling split bills that are already paid or refunded', () => {
      const order = createConsistentMockOrder({ id: 'ord-split-resettle', totalAmount: 200 });
      mockData.orders.set([order]);

      const splitRes = mockData.splitOrderEqual({ orderId: order.id, splitCount: 2 });
      const [split1] = splitRes.splitBills!;

      // Settle split 1
      const settle1 = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      expect(settle1.success).toBe(true);

      // Settle again must fail
      const settleAgain = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      expect(settleAgain.success).toBe(false);
      expect(settleAgain.error).toMatch(/already settled/i);

      // Fully refund split 1
      mockData.recordRefund({
        orderId: order.id,
        splitBillId: split1.id,
        refundAmount: 100,
        reason: 'Complete refund on split 1',
      });

      // Attempting to re-settle a refunded split bill must fail
      const settleRefunded = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'UPI',
      });
      expect(settleRefunded.success).toBe(false);
      expect(settleRefunded.error).toMatch(/cannot settle a refunded/i);
    });

    it('marks parent order PAID only when all split bills are paid', () => {
      const order = createConsistentMockOrder({ id: 'ord-split-all-paid', totalAmount: 300 });
      mockData.orders.set([order]);

      const splitRes = mockData.splitOrderEqual({ orderId: order.id, splitCount: 3 });
      const [split1, split2, split3] = splitRes.splitBills!;

      mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      expect(mockData.orders().find((o) => o.id === order.id)!.paymentStatus).toBe(
        'PARTIALLY_PAID',
      );

      mockData.settleSplitBill({ orderId: order.id, splitBillId: split2.id, paymentMethod: 'UPI' });
      expect(mockData.orders().find((o) => o.id === order.id)!.paymentStatus).toBe(
        'PARTIALLY_PAID',
      );

      mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split3.id,
        paymentMethod: 'CASH',
      });
      expect(mockData.orders().find((o) => o.id === order.id)!.paymentStatus).toBe('PAID');
    });
  });

  // ==========================================================================
  // 4. TABLE-TRANSFER CONSISTENCY (Section 5)
  // ==========================================================================
  describe('Table-Transfer Consistency', () => {
    it('rejects transfer to destination table with active confirmed reservation', () => {
      const order = createConsistentMockOrder({
        id: 'ord-tx-res',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
      });
      mockData.orders.set([order]);

      // Add a confirmed reservation on T-02
      const resv: Reservation = {
        id: 'res-001',
        customerName: 'Priya Kapoor',
        customerPhone: '+91 9876543210',
        customerEmail: 'priya@example.com',
        partySize: 4,
        tableId: 'tbl-002',
        tableNumber: 'T-02',
        reservationDate: '2026-10-26',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      };
      mockData.reservations.set([resv]);

      const res = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-002',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/reserved for customer Priya Kapoor/i);
    });

    it('source table updates to RESERVED if a confirmed reservation exists after transfer', () => {
      const order = createConsistentMockOrder({
        id: 'ord-tx-src-res',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
      });
      mockData.orders.set([order]);

      // Reservation confirmed on T-01
      const resv: Reservation = {
        id: 'res-src-01',
        customerName: 'Dev Patel',
        customerPhone: '+91 9876511111',
        customerEmail: 'dev@example.com',
        partySize: 2,
        tableId: 'tbl-001',
        tableNumber: 'T-01',
        reservationDate: '2026-10-26',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      };
      mockData.reservations.set([resv]);

      const res = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-002',
      });

      expect(res.success).toBe(true);

      // Destination T-02 becomes OCCUPIED
      expect(mockData.tables().find((t) => t.id === 'tbl-002')!.status).toBe('OCCUPIED');

      // Source T-01 becomes RESERVED because of the confirmed reservation
      expect(mockData.tables().find((t) => t.id === 'tbl-001')!.status).toBe('RESERVED');
    });

    it('table occupancy check prevents freeing a table when another active order remains', () => {
      const order1 = createConsistentMockOrder({
        id: 'ord-shared-1',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
        status: 'SERVED',
      });
      const order2 = createConsistentMockOrder({
        id: 'ord-shared-2',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
        status: 'PREPARING',
      });
      mockData.orders.set([order1, order2]);

      // Complete order1
      const updatedOrders = mockData
        .orders()
        .map((o) => (o.id === order1.id ? { ...o, status: 'COMPLETED' as const } : o));
      mockData.orders.set(updatedOrders);

      // Recalculate table status
      const status = mockData.recalculateTableStatus('tbl-001');
      expect(status).toBe('OCCUPIED');
      expect(mockData.tables().find((t) => t.id === 'tbl-001')!.status).toBe('OCCUPIED');
    });
  });

  // ==========================================================================
  // 5. DEFENSIVE LOCALSTORAGE PARSING (Section 6)
  // ==========================================================================
  describe('Defensive LocalStorage Parsing', () => {
    it('loadLocalArray safely recovers from non-array or malformed data in localStorage', () => {
      // Corrupt localStorage with an object instead of array
      localStorage.setItem('royal_spice_orders', JSON.stringify({ corrupted: 'not-an-array' }));
      const resultObj = mockData.loadLocalArray<Order>('orders');
      expect(resultObj).toBeNull();

      // Corrupt localStorage with invalid JSON syntax
      localStorage.setItem('royal_spice_orders', 'INVALID_JSON{{{[');
      const resultSyntax = mockData.loadLocalArray<Order>('orders');
      expect(resultSyntax).toBeNull();

      // Valid array returns parsed data
      localStorage.setItem('royal_spice_orders', JSON.stringify([{ id: 'valid-ord' }]));
      const resultValid = mockData.loadLocalArray<{ id: string }>('orders');
      expect(resultValid).toBeDefined();
      expect(resultValid?.length).toBe(1);
      expect(resultValid?.[0].id).toBe('valid-ord');
    });
  });

  // ==========================================================================
  // 6. REPORTING FINANCIAL ANALYTICS & INVARIANTS (Section 7)
  // ==========================================================================
  describe('Reporting Financial Analytics and Invariants', () => {
    it('verifies gross sales, collected revenue, net revenue, and refunds formulas', () => {
      // 1. Order 1: Regular settled order ₹500
      const ord1 = createConsistentMockOrder({
        id: 'ord-rep-1',
        totalAmount: 500,
        subtotal: 480,
        taxAmount: 20,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
      });

      // 2. Order 2: Cancelled order ₹300 (must NOT count towards gross sales)
      const ord2 = createConsistentMockOrder({
        id: 'ord-rep-2',
        totalAmount: 300,
        subtotal: 280,
        taxAmount: 20,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
      });

      // 3. Order 3: Split order into two bills of ₹200 each (parent is PARTIALLY_PAID)
      const ord3 = createConsistentMockOrder({
        id: 'ord-rep-3',
        totalAmount: 400,
        subtotal: 380,
        taxAmount: 20,
        status: 'SERVED',
        isSplit: true,
        splitCount: 2,
        paymentStatus: 'PARTIALLY_PAID',
      });

      const split1: SplitBill = {
        id: 'split-rep-3-1',
        orderId: ord3.id,
        orderNumber: ord3.orderNumber,
        tableNumber: ord3.tableNumber,
        splitIndex: 1,
        splitTotalCount: 2,
        splitType: 'EQUAL',
        subtotal: 190,
        discountAmount: 0,
        taxAmount: 10,
        totalAmount: 200,
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        settledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        totalRefunded: 0,
      };

      const split2: SplitBill = {
        id: 'split-rep-3-2',
        orderId: ord3.id,
        orderNumber: ord3.orderNumber,
        tableNumber: ord3.tableNumber,
        splitIndex: 2,
        splitTotalCount: 2,
        splitType: 'EQUAL',
        subtotal: 190,
        discountAmount: 0,
        taxAmount: 10,
        totalAmount: 200,
        paymentStatus: 'UNPAID',
        totalRefunded: 0,
      };

      mockData.orders.set([ord1, ord2, ord3]);
      mockData.splitBills.set([split1, split2]);

      // 4. Add refunds: 1 COMPLETED (₹50) and 1 PENDING (₹30)
      const refCompleted: RefundRecord = {
        id: 'ref-comp-1',
        orderId: ord1.id,
        orderNumber: ord1.orderNumber,
        tableNumber: ord1.tableNumber,
        customerName: ord1.customerName,
        originalPaymentMethod: 'CASH',
        refundAmount: 50,
        reason: 'Dessert quality issue',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      };

      const refPending: RefundRecord = {
        id: 'ref-pend-1',
        orderId: ord1.id,
        orderNumber: ord1.orderNumber,
        tableNumber: ord1.tableNumber,
        customerName: ord1.customerName,
        originalPaymentMethod: 'CASH',
        refundAmount: 30,
        reason: 'Manager review pending',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      mockData.refunds.set([refCompleted, refPending]);

      // Instantiate ReportsComponent
      const fixture = TestBed.createComponent(ReportsComponent);
      const reports = fixture.componentInstance;

      // Gross Sales: ord1 (500) + ord3 (400) = 900. Excludes ord2 (cancelled 300)
      expect(reports.grossSales()).toBe(900);

      // Collected Revenue: ord1 paid (500) + ord3 split1 paid (200) = 700. (ord3 parent 400 not double-counted)
      expect(reports.collectedRevenue()).toBe(700);

      // Total Completed Refunds: only ₹50 (excludes pending ₹30)
      expect(reports.totalRefunds()).toBe(50);
      expect(reports.completedRefundsCount()).toBe(1);

      // Net Collected Revenue: 700 - 50 = 650
      expect(reports.netRevenue()).toBe(650);

      // Outstanding split balance: split2 is UNPAID (₹200)
      expect(reports.outstandingSplitBalance()).toBe(200);

      // Paid orders count: 1 (ord1 is PAID, ord3 is PARTIALLY_PAID)
      expect(reports.paidOrdersCount()).toBe(1);
    });

    it('tracks invoice print count, limits reprint, and logs audit trail for duplicate copies', () => {
      const order = createConsistentMockOrder({
        id: 'ord-print-audit-1',
        orderNumber: '#ORD-777',
      });
      mockData.orders.set([order]);

      // Initial print: Copy #1
      const p1 = mockData.recordOrderPrint(order.id, false, 'Counter Staff');
      expect(p1.success).toBe(true);
      expect(p1.printCount).toBe(1);

      let saved = mockData.orders().find((o) => o.id === order.id);
      expect(saved?.printCount).toBe(1);
      expect(saved?.timeline.some((t) => t.note?.includes('Copy #1'))).toBe(true);

      // Second print: Reprint (Copy #2)
      const p2 = mockData.recordOrderPrint(order.id, true, 'Manager Override');
      expect(p2.success).toBe(true);
      expect(p2.printCount).toBe(2);

      saved = mockData.orders().find((o) => o.id === order.id);
      expect(saved?.printCount).toBe(2);
      expect(saved?.timeline.some((t) => t.note?.includes('reprinted (Copy #2)'))).toBe(true);
    });
  });
});
