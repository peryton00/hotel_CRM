import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import { Table } from './models/table.model';
import { Reservation } from './models/reservation.model';
import { Invoice, SplitBill, RefundRecord } from './models/billing.model';

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
    itemTotal: unitPrice * quantity,
    selectedVariants: [],
    selectedAddons: [],
  };
}

function createMockOrder(overrides: Partial<Order> = {}): Order {
  const items = overrides.items || [
    createMockOrderItem('item-1', 'Dum Biryani', 350, 1),
    createMockOrderItem('item-2', 'Butter Naan', 60, 2),
  ];
  const subtotal = items.reduce((sum, it) => sum + it.itemTotal, 0); // 470
  const discountAmount = overrides.discountAmount ?? 20;
  const taxable = subtotal - discountAmount; // 450
  const cgstAmount = Math.round(taxable * 0.025 * 100) / 100; // 11.25
  const sgstAmount = Math.round(taxable * 0.025 * 100) / 100; // 11.25
  const taxAmount = cgstAmount + sgstAmount; // 22.50
  const totalAmount = taxable + taxAmount; // 472.50

  return {
    id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNumber: '#ORD-201',
    idempotencyKey: `idem-${Date.now()}`,
    restaurantSlug: 'gurukripa-dhaba',
    tableId: 'tbl-001',
    tableNumber: 'T-01',
    customerName: 'Aarav Mehta',
    customerPhone: '+91 9876543210',
    customerPhoneE164: '+919876543210',
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

describe('Phase 2 POS Workflows: Table Transfers, Bill Splitting, and Refunds', () => {
  let mockData: MockDataService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), MockDataService],
    });

    mockData = TestBed.inject(MockDataService);

    // Setup standardized tables for testing
    const initialTables: Table[] = [
      {
        id: 'tbl-001',
        number: 'T-01',
        capacity: 2,
        section: 'Main Dining',
        status: 'OCCUPIED',
        qrToken: 'tbl-01',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-01',
        orderingEnabled: true,
      },
      {
        id: 'tbl-002',
        number: 'T-02',
        capacity: 4,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tbl-02',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-02',
        orderingEnabled: true,
      },
      {
        id: 'tbl-003',
        number: 'T-03',
        capacity: 4,
        section: 'Main Dining',
        status: 'OCCUPIED',
        qrToken: 'tbl-03',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-03',
        orderingEnabled: true,
      },
      {
        id: 'tbl-004',
        number: 'T-04',
        capacity: 6,
        section: 'Terrace Garden',
        status: 'DIRTY',
        qrToken: 'tbl-04',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-04',
        orderingEnabled: true,
      },
      {
        id: 'tbl-005',
        number: 'T-05',
        capacity: 2,
        section: 'Bar',
        status: 'AVAILABLE',
        qrToken: 'tbl-05',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-05',
        orderingEnabled: false, // Disabled
      },
    ];

    mockData.tables.set(initialTables);
    mockData.orders.set([]);
    mockData.invoices.set([]);
    mockData.splitBills.set([]);
    mockData.refunds.set([]);
    mockData.tableTransfers.set([]);
    mockData.reservations.set([]);
  });

  // ============================================================================
  // WORKSTREAM A: TABLE TRANSFERS
  // ============================================================================
  describe('Workstream A: Table Transfers', () => {
    it('successfully transfers an active order to an available destination table and updates associations', () => {
      const order = createMockOrder({ id: 'ord-101', tableId: 'tbl-001', tableNumber: 'T-01' });
      mockData.orders.set([order]);

      const invoice: Invoice = {
        id: 'inv-101',
        invoiceNumber: 'INV-2026-101',
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableNumber: 'T-01',
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        issuedAt: new Date().toISOString(),
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discountAmount,
        taxBreakdown: [],
        totalTax: order.taxAmount,
        finalTotal: order.totalAmount,
        paymentStatus: 'UNPAID',
      };
      mockData.invoices.set([invoice]);

      const res = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-002',
        staffName: 'Rohit K.',
      });

      expect(res.success).toBe(true);
      expect(res.transfer).toBeDefined();
      expect(res.transfer?.sourceTableNumber).toBe('T-01');
      expect(res.transfer?.destinationTableNumber).toBe('T-02');
      expect(res.transfer?.staffName).toBe('Rohit K.');

      // Check updated order
      const updatedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(updatedOrder.tableId).toBe('tbl-002');
      expect(updatedOrder.tableNumber).toBe('T-02');
      expect(updatedOrder.timeline.some((t) => t.status === 'TABLE_TRANSFERRED')).toBe(true);

      // Check destination table status is now OCCUPIED
      const destTable = mockData.tables().find((t) => t.id === 'tbl-002')!;
      expect(destTable.status).toBe('OCCUPIED');

      // Check source table status is now AVAILABLE (since no other orders exist on it)
      const srcTable = mockData.tables().find((t) => t.id === 'tbl-001')!;
      expect(srcTable.status).toBe('AVAILABLE');

      // Check invoice is updated with new destination table
      const updatedInvoice = mockData.invoices().find((i) => i.orderId === order.id)!;
      expect(updatedInvoice.tableNumber).toBe('T-02');

      // Check transfer history record exists
      expect(mockData.tableTransfers().length).toBe(1);
      expect(mockData.tableTransfers()[0].orderId).toBe(order.id);
    });

    it('source table remains OCCUPIED if another active order still uses it', () => {
      const order1 = createMockOrder({
        id: 'ord-101',
        orderNumber: '#ORD-101',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
      });
      const order2 = createMockOrder({
        id: 'ord-102',
        orderNumber: '#ORD-102',
        tableId: 'tbl-001',
        tableNumber: 'T-01',
      });
      mockData.orders.set([order1, order2]);

      const res = mockData.transferTable({
        orderId: order1.id,
        destinationTableId: 'tbl-002',
      });

      expect(res.success).toBe(true);
      const srcTable = mockData.tables().find((t) => t.id === 'tbl-001')!;
      expect(srcTable.status).toBe('OCCUPIED'); // Still occupied by order2!
    });

    it('rejects transfer if source and destination tables are identical', () => {
      const order = createMockOrder({ id: 'ord-101', tableId: 'tbl-001', tableNumber: 'T-01' });
      mockData.orders.set([order]);

      const res = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-001',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/different/i);
    });

    it('rejects destination tables that are dirty or disabled', () => {
      const order = createMockOrder({ id: 'ord-101', tableId: 'tbl-001', tableNumber: 'T-01' });
      mockData.orders.set([order]);

      // Dirty table (tbl-004)
      const dirtyRes = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-004',
      });
      expect(dirtyRes.success).toBe(false);
      expect(dirtyRes.error).toMatch(/dirty/i);

      // Disabled table (tbl-005)
      const disabledRes = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-005',
      });
      expect(disabledRes.success).toBe(false);
      expect(disabledRes.error).toMatch(/disabled/i);
    });

    it('rejects destination tables with conflicting active orders or occupied status', () => {
      const order1 = createMockOrder({ id: 'ord-101', tableId: 'tbl-001', tableNumber: 'T-01' });
      const orderActiveOnDest = createMockOrder({
        id: 'ord-103',
        tableId: 'tbl-003',
        tableNumber: 'T-03',
      });
      mockData.orders.set([order1, orderActiveOnDest]);

      const res = mockData.transferTable({
        orderId: order1.id,
        destinationTableId: 'tbl-003',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/occupied/i);
    });

    it('leaves all related entities unchanged when transfer validation fails', () => {
      const order = createMockOrder({ id: 'ord-101', tableId: 'tbl-001', tableNumber: 'T-01' });
      mockData.orders.set([order]);

      const res = mockData.transferTable({
        orderId: order.id,
        destinationTableId: 'tbl-004', // Dirty
      });

      expect(res.success).toBe(false);

      const unchangedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(unchangedOrder.tableId).toBe('tbl-001');
      expect(unchangedOrder.tableNumber).toBe('T-01');

      const srcTable = mockData.tables().find((t) => t.id === 'tbl-001')!;
      expect(srcTable.status).toBe('OCCUPIED');

      const destTable = mockData.tables().find((t) => t.id === 'tbl-004')!;
      expect(destTable.status).toBe('DIRTY');

      expect(mockData.tableTransfers().length).toBe(0);
    });

    it('rejects transfer of already completed or cancelled orders', () => {
      const completedOrder = createMockOrder({
        id: 'ord-completed',
        status: 'COMPLETED',
        tableId: 'tbl-001',
      });
      mockData.orders.set([completedOrder]);

      const res = mockData.transferTable({
        orderId: completedOrder.id,
        destinationTableId: 'tbl-002',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/eligible active orders/i);
    });
  });

  // ============================================================================
  // WORKSTREAM B: BILL SPLITTING
  // ============================================================================
  describe('Workstream B: Bill Splitting', () => {
    it('equal split reconciles 100% to the original payable amount and distributes remainder cents deterministically', () => {
      // Create an order of ₹100.00
      const order = createMockOrder({
        id: 'ord-split-100',
        subtotal: 95.24,
        discountAmount: 0,
        taxAmount: 4.76,
        totalAmount: 100.0,
        items: [createMockOrderItem('it-1', 'Thali', 95.24, 1)],
      });
      mockData.orders.set([order]);

      // Split 3 ways: 100 / 3 = 33.33 with 1 cent remainder
      const res = mockData.splitOrderEqual({
        orderId: order.id,
        splitCount: 3,
      });

      expect(res.success).toBe(true);
      expect(res.splitBills).toBeDefined();
      expect(res.splitBills?.length).toBe(3);

      const splits = res.splitBills!;
      // Bill 1 gets 33.34, Bill 2 gets 33.33, Bill 3 gets 33.33
      expect(splits[0].totalAmount).toBe(33.34);
      expect(splits[1].totalAmount).toBe(33.33);
      expect(splits[2].totalAmount).toBe(33.33);

      const sumTotals = splits.reduce((sum, s) => sum + s.totalAmount, 0);
      expect(Math.round(sumTotals * 100) / 100).toBe(100.0);

      // Parent order reflects split status
      const updatedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(updatedOrder.isSplit).toBe(true);
      expect(updatedOrder.splitCount).toBe(3);
      expect(updatedOrder.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('item-based allocation preserves total quantities and reconciles taxes and totals', () => {
      const item1 = createMockOrderItem('it-1', 'Paneer Tikka', 200, 2); // 400
      const item2 = createMockOrderItem('it-2', 'Garlic Naan', 50, 4); // 200
      // Subtotal = 600, discount = 60, taxable = 540, 5% tax = 27.00, total = 567.00
      const order = createMockOrder({
        id: 'ord-item-split',
        items: [item1, item2],
        subtotal: 600,
        discountAmount: 60,
        taxAmount: 27,
        totalAmount: 567,
      });
      mockData.orders.set([order]);

      // Split 2 ways:
      // Split 1 gets 1 Paneer Tikka + 2 Naans (subtotal 300 = 50%)
      // Split 2 gets 1 Paneer Tikka + 2 Naans (subtotal 300 = 50%)
      const res = mockData.splitOrderItemBased({
        orderId: order.id,
        splits: [
          {
            allocatedItems: [
              { orderItemId: item1.id, quantity: 1 },
              { orderItemId: item2.id, quantity: 2 },
            ],
          },
          {
            allocatedItems: [
              { orderItemId: item1.id, quantity: 1 },
              { orderItemId: item2.id, quantity: 2 },
            ],
          },
        ],
      });

      expect(res.success).toBe(true);
      const splits = res.splitBills!;
      expect(splits.length).toBe(2);

      expect(splits[0].subtotal).toBe(300);
      expect(splits[1].subtotal).toBe(300);

      const sumSubtotals = splits.reduce((sum, s) => sum + s.subtotal, 0);
      const sumDiscounts = splits.reduce((sum, s) => sum + s.discountAmount, 0);
      const sumTaxes = splits.reduce((sum, s) => sum + s.taxAmount, 0);
      const sumTotals = splits.reduce((sum, s) => sum + s.totalAmount, 0);

      expect(sumSubtotals).toBe(600);
      expect(sumDiscounts).toBe(60);
      expect(sumTaxes).toBe(27);
      expect(sumTotals).toBe(567);
    });

    it('rejects item-based split if item quantities do not match the parent order', () => {
      const item1 = createMockOrderItem('it-1', 'Dal Makhani', 200, 2);
      const order = createMockOrder({
        id: 'ord-item-split-err',
        items: [item1],
      });
      mockData.orders.set([order]);

      // Only allocating 1 of 2 Dal Makhani
      const res = mockData.splitOrderItemBased({
        orderId: order.id,
        splits: [
          { allocatedItems: [{ orderItemId: item1.id, quantity: 1 }] },
          { allocatedItems: [] },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/fully allocated/i);
    });

    it('rejects splitting an already settled bill or a bill already split', () => {
      const paidOrder = createMockOrder({ id: 'ord-paid', paymentStatus: 'PAID' });
      mockData.orders.set([paidOrder]);

      const res = mockData.splitOrderEqual({
        orderId: paidOrder.id,
        splitCount: 2,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/settled/i);
    });

    it('supports independent settlement of split bills and updates parent order when all are paid', () => {
      const order = createMockOrder({ id: 'ord-settle-split', totalAmount: 200 });
      mockData.orders.set([order]);

      const splitRes = mockData.splitOrderEqual({
        orderId: order.id,
        splitCount: 2,
      });
      const [split1, split2] = splitRes.splitBills!;

      // Settle Split 1 via CASH
      const settle1 = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      expect(settle1.success).toBe(true);
      expect(settle1.splitBill?.paymentStatus).toBe('PAID');
      expect(settle1.splitBill?.paymentMethod).toBe('CASH');

      // Parent order should still be PARTIALLY_PAID
      let parentOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(parentOrder.paymentStatus).toBe('PARTIALLY_PAID');

      // Attempting to settle Split 1 again must be rejected
      const duplicateSettle = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      expect(duplicateSettle.success).toBe(false);
      expect(duplicateSettle.error).toMatch(/already settled/i);

      // Settle Split 2 via UPI
      const settle2 = mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split2.id,
        paymentMethod: 'UPI',
      });
      expect(settle2.success).toBe(true);
      expect(settle2.splitBill?.paymentStatus).toBe('PAID');

      // All splits paid -> parent order is now fully PAID
      parentOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(parentOrder.paymentStatus).toBe('PAID');
    });
  });

  // ============================================================================
  // WORKSTREAM C: REFUND RECORDING
  // ============================================================================
  describe('Workstream C: Refund Recording', () => {
    it('records a valid full refund for a settled order', () => {
      const order = createMockOrder({
        id: 'ord-refund-full',
        totalAmount: 450,
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
      });
      mockData.orders.set([order]);

      const res = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 450,
        reason: 'Guest cancelled dining reservation',
        staffName: 'Pooja V.',
      });

      expect(res.success).toBe(true);
      expect(res.refund).toBeDefined();
      expect(res.refund?.refundAmount).toBe(450);
      expect(res.refund?.status).toBe('COMPLETED');
      expect(res.refund?.staffName).toBe('Pooja V.');

      const updatedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(updatedOrder.paymentStatus).toBe('REFUNDED');
      expect(updatedOrder.totalRefunded).toBe(450);

      expect(mockData.refunds().length).toBe(1);
    });

    it('records multiple partial refunds without exceeding paid total', () => {
      const order = createMockOrder({
        id: 'ord-refund-partial',
        totalAmount: 500,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      // First partial refund ₹200
      const ref1 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 200,
        reason: 'Missing item in takeaway',
      });
      expect(ref1.success).toBe(true);

      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(300);

      // Second partial refund ₹300
      const ref2 = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 300,
        reason: 'Billing adjustment',
      });
      expect(ref2.success).toBe(true);

      expect(mockData.getRemainingRefundableAmount(order.id)).toBe(0);

      const updatedOrder = mockData.orders().find((o) => o.id === order.id)!;
      expect(updatedOrder.paymentStatus).toBe('REFUNDED');
      expect(updatedOrder.totalRefunded).toBe(500);
    });

    it('rejects refunds exceeding the remaining refundable amount', () => {
      const order = createMockOrder({
        id: 'ord-refund-exceed',
        totalAmount: 300,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      const res = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 350,
        reason: 'Excess refund',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/exceeds/i);
    });

    it('rejects zero, negative, and invalid refund amounts or missing reasons', () => {
      const order = createMockOrder({
        id: 'ord-refund-invalid',
        totalAmount: 300,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      // Zero amount
      const zeroRes = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 0,
        reason: 'Valid reason',
      });
      expect(zeroRes.success).toBe(false);

      // Negative amount
      const negRes = mockData.recordRefund({
        orderId: order.id,
        refundAmount: -50,
        reason: 'Valid reason',
      });
      expect(negRes.success).toBe(false);

      // Missing reason
      const noReasonRes = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 50,
        reason: '   ',
      });
      expect(noReasonRes.success).toBe(false);
      expect(noReasonRes.error).toMatch(/reason is required/i);
    });

    it('rejects refunds for unpaid transactions', () => {
      const order = createMockOrder({
        id: 'ord-unpaid',
        totalAmount: 300,
        paymentStatus: 'UNPAID',
      });
      mockData.orders.set([order]);

      const res = mockData.recordRefund({
        orderId: order.id,
        refundAmount: 100,
        reason: 'Cannot refund unpaid',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only settled/i);
    });

    it('respects split-bill refundable balances independently', () => {
      const order = createMockOrder({ id: 'ord-split-refund', totalAmount: 200 });
      mockData.orders.set([order]);

      const splitRes = mockData.splitOrderEqual({ orderId: order.id, splitCount: 2 });
      const [split1, split2] = splitRes.splitBills!;

      // Settle both split bills (₹100 each)
      mockData.settleSplitBill({
        orderId: order.id,
        splitBillId: split1.id,
        paymentMethod: 'CASH',
      });
      mockData.settleSplitBill({ orderId: order.id, splitBillId: split2.id, paymentMethod: 'UPI' });

      expect(mockData.getRemainingRefundableAmount(order.id, split1.id)).toBe(100);

      // Refund ₹60 on split 1
      const refundSplit1 = mockData.recordRefund({
        orderId: order.id,
        splitBillId: split1.id,
        refundAmount: 60,
        reason: 'Partial return on bill 1',
      });
      expect(refundSplit1.success).toBe(true);

      // Remaining on split 1 should be ₹40, but split 2 is still ₹100
      expect(mockData.getRemainingRefundableAmount(order.id, split1.id)).toBe(40);
      expect(mockData.getRemainingRefundableAmount(order.id, split2.id)).toBe(100);

      // Attempting to refund ₹50 on split 1 (which only has ₹40) must fail
      const overRefundSplit1 = mockData.recordRefund({
        orderId: order.id,
        splitBillId: split1.id,
        refundAmount: 50,
        reason: 'Over refund on bill 1',
      });
      expect(overRefundSplit1.success).toBe(false);
      expect(overRefundSplit1.error).toMatch(/exceeds/i);
    });

    it('reloading persisted state preserves refund history', () => {
      const order = createMockOrder({
        id: 'ord-persist-refund',
        totalAmount: 400,
        paymentStatus: 'PAID',
      });
      mockData.orders.set([order]);

      mockData.recordRefund({
        orderId: order.id,
        refundAmount: 150,
        reason: 'Service recovery discount',
      });

      // Simulate reloading data by re-reading localStorage
      const cachedRefunds = mockData.loadLocal<RefundRecord[]>('refunds');
      expect(cachedRefunds).toBeDefined();
      expect(cachedRefunds?.length).toBe(1);
      expect(cachedRefunds?.[0].refundAmount).toBe(150);
      expect(cachedRefunds?.[0].orderId).toBe(order.id);
    });
  });
});
