import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderStatus } from './models/order.model';

describe('Live Order Stream & Active Queue Synchronization', () => {
  let mockService: MockDataService;

  const createDummyOrder = (id: string, status: OrderStatus, orderNum: string): Order => ({
    id,
    orderNumber: orderNum,
    orderType: 'DINE_IN',
    idempotencyKey: `idem-${id}`,
    restaurantId: 'rest-001',
    restaurantSlug: 'gurukripa-dhaba',
    tableId: 'tbl-1',
    tableNumber: 'T1',
    customerName: 'Aarav Sharma',
    customerPhone: '+91 98765 43210',
    items: [
      {
        id: `item-${id}-1`,
        menuItemId: 'dish-1',
        name: 'Dal Makhani',
        quantity: 2,
        unitPrice: 240,
        itemTotal: 480,
        selectedVariants: [],
        selectedAddons: [],
      },
    ],
    subtotal: 480,
    discountAmount: 0,
    taxAmount: 24,
    cgstAmount: 12,
    sgstAmount: 12,
    totalAmount: 504,
    status,
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [
      {
        status: 'RECEIVED',
        timestamp: new Date().toISOString(),
        note: 'Order placed via QR code',
      },
    ],
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), MockDataService],
    });
    mockService = TestBed.inject(MockDataService);
  });

  it('initializes orders from localStorage when saved orders exist', () => {
    const existingOrder = createDummyOrder('ord-cached-1', 'PENDING', '#ORD-101');
    mockService.saveLocal('orders', [existingOrder]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), MockDataService],
    });
    const freshService = TestBed.inject(MockDataService);
    expect(freshService.orders().length).toBe(1);
    expect(freshService.orders()[0].id).toBe('ord-cached-1');
  });

  it('receives incoming ORDER_CREATED events and prepends to orders signal without page refresh', () => {
    expect(mockService.orders().length).toBe(0);

    const liveQrOrder = createDummyOrder('ord-live-qr-1', 'PENDING', '#ORD-777');
    mockService.handleIncomingSyncEvent({
      type: 'ORDER_CREATED',
      order: liveQrOrder,
    });

    expect(mockService.orders().length).toBe(1);
    expect(mockService.orders()[0].id).toBe('ord-live-qr-1');
    expect(mockService.liveOrderEvent()?.type).toBe('ORDER_CREATED');
    expect(mockService.liveOrderEvent()?.order?.orderNumber).toBe('#ORD-777');
  });

  it('receives incoming ORDER_UPDATED events and updates existing order status in real time', () => {
    const initialOrder = createDummyOrder('ord-status-1', 'PENDING', '#ORD-555');
    mockService.orders.set([initialOrder]);

    const updatedOrder: Order = {
      ...initialOrder,
      status: 'DISPATCHED',
      updatedAt: new Date().toISOString(),
    };

    mockService.handleIncomingSyncEvent({
      type: 'ORDER_UPDATED',
      order: updatedOrder,
    });

    expect(mockService.orders().length).toBe(1);
    expect(mockService.orders()[0].status).toBe('DISPATCHED');
    expect(mockService.liveOrderEvent()?.type).toBe('ORDER_UPDATED');
  });

  it('filters active orders and keeps unpaid orders in the active queue', () => {
    const pendingOrder = createDummyOrder('ord-1', 'PENDING', '#ORD-001');
    const acceptedOrder = createDummyOrder('ord-2', 'ACCEPTED', '#ORD-002');
    const preparingOrder = createDummyOrder('ord-3', 'PREPARING', '#ORD-003');
    const readyOrder = createDummyOrder('ord-4', 'READY', '#ORD-004');
    const dispatchedOrder = createDummyOrder('ord-5', 'DISPATCHED', '#ORD-005');
    const servedUnpaidOrder = createDummyOrder('ord-6', 'SERVED', '#ORD-006');
    servedUnpaidOrder.paymentStatus = 'UNPAID';

    const completedPaidOrder = createDummyOrder('ord-7', 'COMPLETED', '#ORD-007');
    completedPaidOrder.paymentStatus = 'PAID';
    completedPaidOrder.settledAt = new Date().toISOString();

    const cancelledOrder = createDummyOrder('ord-8', 'CANCELLED', '#ORD-008');

    const allOrders = [
      pendingOrder,
      acceptedOrder,
      preparingOrder,
      readyOrder,
      dispatchedOrder,
      servedUnpaidOrder,
      completedPaidOrder,
      cancelledOrder,
    ];

    mockService.orders.set(allOrders);

    // Active status filter: in service pipeline or unpaid (and not cancelled)
    const isOrderActive = (o: Order) => {
      if (o.status === 'CANCELLED') return false;
      if (['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'SERVED'].includes(o.status)) {
        return true;
      }
      return o.paymentStatus !== 'PAID';
    };

    const activeOrders = mockService.orders().filter(isOrderActive);

    expect(activeOrders.length).toBe(6);
    expect(activeOrders.map((o) => o.id)).toEqual(['ord-1', 'ord-2', 'ord-3', 'ord-4', 'ord-5', 'ord-6']);

    // Completed paid and Cancelled must not be in active queue
    expect(activeOrders.some((o) => o.id === 'ord-7')).toBe(false);
    expect(activeOrders.some((o) => o.status === 'CANCELLED')).toBe(false);
  });

  it('marks order as COMPLETED when invoice is printed and then payment is settled', () => {
    const order = createDummyOrder('ord-finalize-1', 'SERVED', '#ORD-991');
    mockService.orders.set([order]);

    // 1. Print invoice first
    const printRes = mockService.recordOrderPrint(order.id, false, 'Floor Staff');
    expect(printRes.success).toBe(true);
    let current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.printCount).toBe(1);
    expect(current?.status).toBe('SERVED'); // not yet completed because unpaid

    // 2. Settle payment
    const settleRes = mockService.settleOrder({ orderId: order.id, paymentMethod: 'UPI' });
    expect(settleRes.success).toBe(true);
    current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.paymentStatus).toBe('PAID');
    expect(current?.status).toBe('COMPLETED'); // Both paid and printed -> completed!
  });

  it('marks order as COMPLETED when payment is settled and then invoice is printed', () => {
    const order = createDummyOrder('ord-finalize-2', 'SERVED', '#ORD-992');
    mockService.orders.set([order]);

    // 1. Settle payment first
    const settleRes = mockService.settleOrder({ orderId: order.id, paymentMethod: 'CASH' });
    expect(settleRes.success).toBe(true);
    let current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.paymentStatus).toBe('PAID');
    expect(current?.status).toBe('SERVED'); // not yet completed because printCount is 0

    // 2. Print tax invoice
    const printRes = mockService.recordOrderPrint(order.id, false, 'Cashier');
    expect(printRes.success).toBe(true);
    current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.printCount).toBe(1);
    expect(current?.status).toBe('COMPLETED'); // Both paid and printed -> completed!
  });

  it('allows changing server without password on active orders', () => {
    const order = createDummyOrder('ord-server-1', 'PREPARING', '#ORD-881');
    mockService.orders.set([order]);

    const res = mockService.assignOrderServer(order.id, 'staff-waiter-1');
    expect(res.success).toBe(true);

    const updated = mockService.orders().find((o) => o.id === order.id);
    expect(updated?.serverStaffId).toBe('staff-waiter-1');
  });

  it('prohibits changing server on completed orders without admin password', () => {
    const order = createDummyOrder('ord-server-completed-1', 'COMPLETED', '#ORD-882');
    order.serverStaffId = 'staff-waiter-original';
    mockService.orders.set([order]);

    // 1. Attempt to change server without admin password
    const failRes = mockService.assignOrderServer(order.id, 'staff-waiter-new');
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain('Admin password required');

    // Server must remain unchanged
    let current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.serverStaffId).toBe('staff-waiter-original');

    // 2. Attempt with incorrect admin password
    const wrongPwdRes = mockService.assignOrderServer(order.id, 'staff-waiter-new', 'wrong-pin');
    expect(wrongPwdRes.success).toBe(false);
    expect(wrongPwdRes.error).toContain('Admin password required');
    current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.serverStaffId).toBe('staff-waiter-original');

    // 3. Attempt with correct admin password (e.g. '1234')
    const successRes = mockService.assignOrderServer(order.id, 'staff-waiter-new', '1234');
    expect(successRes.success).toBe(true);
    current = mockService.orders().find((o) => o.id === order.id);
    expect(current?.serverStaffId).toBe('staff-waiter-new');
  });

  describe('Order Quick Details Side Panel Information & Actions', () => {
    it('provides complete guest, dish, and billing breakdown for live unpaid orders', () => {
      const order = createDummyOrder('ord-live-unpaid-1', 'PREPARING', '#ORD-991');
      order.customerName = 'Priya Patel';
      order.customerPhone = '+91 91234 56789';
      order.items = [
        {
          id: 'item-1',
          menuItemId: 'dish-1',
          name: 'Paneer Butter Masala',
          quantity: 2,
          unitPrice: 280,
          itemTotal: 560,
          selectedPortion: { label: 'Full', price: 280 },
          selectedVariants: [{ groupName: 'Spice Level', optionName: 'Medium', priceDelta: 0 }],
          selectedAddons: [{ name: 'Extra Butter', priceDelta: 30 }],
          specialInstructions: 'Less spicy please',
        },
      ];
      order.subtotal = 560;
      order.taxAmount = 28;
      order.cgstAmount = 14;
      order.sgstAmount = 14;
      order.totalAmount = 588;
      order.paymentStatus = 'UNPAID';

      mockService.orders.set([order]);

      const found = mockService.orders().find((o) => o.id === 'ord-live-unpaid-1');
      expect(found).toBeDefined();
      expect(found?.customerName).toBe('Priya Patel');
      expect(found?.customerPhone).toBe('+91 91234 56789');
      expect(found?.status).toBe('PREPARING');
      expect(found?.paymentStatus).toBe('UNPAID');
      expect(found?.items.length).toBe(1);
      expect(found?.items[0].selectedPortion?.label).toBe('Full');
      expect(found?.items[0].selectedAddons?.[0]?.name).toBe('Extra Butter');
      expect(found?.totalAmount).toBe(588);
    });

    it('identifies completed orders as settled, paid and printed', () => {
      const order = createDummyOrder('ord-completed-panel-1', 'COMPLETED', '#ORD-992');
      order.paymentStatus = 'PAID';
      order.paymentMethod = 'UPI';
      order.printCount = 1;

      mockService.orders.set([order]);

      const found = mockService.orders().find((o) => o.id === 'ord-completed-panel-1');
      expect(found).toBeDefined();
      expect(found?.status).toBe('COMPLETED');
      expect(found?.paymentStatus).toBe('PAID');
      expect(found?.printCount).toBe(1);
    });
  });
});
