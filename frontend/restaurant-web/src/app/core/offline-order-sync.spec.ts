import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  RestaurantDataService,
  OfflineSyncAction,
} from '../data-access/services/restaurant-data.service';
import { NetworkStatusService } from './services/network-status.service';
import { Order } from './models/order.model';

describe('Offline Order System & Auto-Sync Resilience', () => {
  let service: RestaurantDataService;
  let httpMock: HttpTestingController;
  let networkService: NetworkStatusService;

  const testOrder: Order = {
    id: '11111111-2222-3333-4444-555555555555',
    orderNumber: 'ORD-TEST01',
    orderType: 'DINE_IN',
    restaurantSlug: 'gurukripa-dhaba',
    customerName: 'Sardar Ji',
    customerPhone: '9876543210',
    tableNumber: 'T-01',
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        name: 'Dal Makhani',
        unitPrice: 200,
        quantity: 1,
        itemTotal: 200,
        selectedVariants: [],
        selectedAddons: [],
      },
    ],
    subtotal: 200,
    discountAmount: 0,
    taxAmount: 10,
    cgstAmount: 5,
    sgstAmount: 5,
    totalAmount: 210,
    status: 'ACCEPTED',
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RestaurantDataService, NetworkStatusService],
    });
    service = TestBed.inject(RestaurantDataService);
    httpMock = TestBed.inject(HttpTestingController);
    networkService = TestBed.inject(NetworkStatusService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('queues order creation in outbox and updates local state when offline', () => {
    networkService.isOnline.set(false);

    service.addOrder(testOrder);

    expect(service.orders().some((o) => o.id === testOrder.id)).toBe(true);
    expect(service.offlineOutbox().length).toBe(1);
    expect(service.offlineOutbox()[0].type).toBe('CREATE_ORDER');
    expect(service.offlineOutbox()[0].orderId).toBe(testOrder.id);
  });

  it('queues status updates without rolling back when offline', () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);

    const res = service.updateOrderStatusAtomic(testOrder.id, 'SERVED');

    expect(res.success).toBe(true);
    expect(service.orders().find((o) => o.id === testOrder.id)?.status).toBe('SERVED');
    expect(service.offlineOutbox().some((a) => a.type === 'UPDATE_ORDER_STATUS')).toBe(true);
  });

  it('queues payment settlement and marks order PAID in memory & localStorage when offline', () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);

    const res = service.settleOrder({
      orderId: testOrder.id,
      paymentMethod: 'UPI',
    });

    expect(res.success).toBe(true);
    const settled = service.orders().find((o) => o.id === testOrder.id);
    expect(settled?.paymentStatus).toBe('PAID');
    expect(settled?.paymentMethod).toBe('UPI');
    expect(service.offlineOutbox().some((a) => a.type === 'SETTLE_ORDER')).toBe(true);
  });

  it('flushes offline outbox queue to backend when connection is restored', () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);

    service.queueOfflineAction({
      type: 'SETTLE_ORDER',
      orderId: testOrder.id,
      payload: { payment_method: 'cash', amount_paise: 21000 },
    });
    expect(service.offlineOutbox().length).toBe(1);

    // Bring online and flush
    networkService.isOnline.set(true);
    service.flushOfflineQueue();

    const req = httpMock.expectOne((r) => r.url.includes(`/orders/${testOrder.id}/settle`));
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });

    expect(service.offlineOutbox().length).toBe(0);
  });

  it('keeps action in outbox when backend returns database connection failure (os error 11001)', () => {
    service.queueOfflineAction({
      type: 'CREATE_ORDER',
      orderId: testOrder.id,
      payload: { items: [] },
    });
    expect(service.offlineOutbox().length).toBe(1);

    networkService.isOnline.set(true);
    service.flushOfflineQueue();

    const req = httpMock.expectOne((r) => r.url.includes('/orders') && r.method === 'POST');
    req.flush(
      'Database error: error communicating with database: No such host is known. (os error 11001)',
      { status: 500, statusText: 'Internal Server Error' },
    );

    // The order must NOT be dropped! It stays in outbox until DB is back
    expect(service.offlineOutbox().length).toBe(1);
    expect(networkService.isOnline()).toBe(false);
  });
});
