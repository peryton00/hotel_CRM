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

  it('keeps an unconfirmed manual ticket out of the kitchen queue', async () => {
    networkService.isOnline.set(false);
    const pending = service.addOrder(testOrder);
    httpMock.expectOne(r => r.url.endsWith('/orders') && r.method === 'POST')
      .flush({}, {status: 503, statusText: 'Unavailable'});
    expect(await pending).toBe(false);
    expect(service.orders().some(o => o.id === testOrder.id)).toBe(false);
    expect(service.offlineOutbox().length).toBe(0);
  });

  it('queues status updates without rolling back when offline', () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);

    const res = service.updateOrderStatusAtomic(testOrder.id, 'SERVED');

    expect(res.success).toBe(true);
    expect(service.orders().find((o) => o.id === testOrder.id)?.status).toBe('SERVED');
    expect(service.offlineOutbox().some((a) => a.type === 'UPDATE_ORDER_STATUS')).toBe(true);
  });

  it('keeps the bill unpaid when the local database cannot confirm payment', async () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);
    const pending = service.settleOrder({orderId:testOrder.id,paymentMethod:'UPI'});
    expect(service.orders()[0].paymentStatus).toBe('UNPAID');
    httpMock.expectOne(r => r.url.endsWith('/settle')).flush({}, { status:503,statusText:'Unavailable' });
    expect((await pending).success).toBe(false);
    expect(service.orders()[0].paymentStatus).toBe('UNPAID');
    expect(service.offlineOutbox().length).toBe(0);
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

  it('queues table status update when offline and flushes when reconnected', () => {
    const tableId = '11111111-2222-3333-4444-555555555555';
    service.tables.set([
      {
        id: tableId,
        number: 'T-01',
        capacity: 4,
        section: 'MAIN',
        status: 'AVAILABLE',
        qrToken: 'tbl-1',
        qrUrl: '/menu/table/1',
        orderingEnabled: true,
      },
    ]);

    networkService.isOnline.set(false);
    const res = service.updateTableStatus(tableId, 'OCCUPIED');

    expect(res.success).toBe(true);
    expect(service.tables().find((t) => t.id === tableId)?.status).toBe('OCCUPIED');
    expect(service.offlineOutbox().some((a) => a.type === 'UPDATE_TABLE_STATUS')).toBe(true);

    // Bring online and flush
    networkService.isOnline.set(true);
    service.flushOfflineQueue();

    const req = httpMock.expectOne((r) => r.url.includes(`/tables/${tableId}/status`));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status).toBe('OCCUPIED');
    req.flush({ success: true });

    expect(service.offlineOutbox().some((a) => a.type === 'UPDATE_TABLE_STATUS')).toBe(false);
  });

  it('queues menu item availability toggle when offline and flushes when reconnected', () => {
    const itemId = '22222222-3333-4444-5555-666666666666';
    service.menuItems.set([
      {
        id: itemId,
        name: 'Paneer Butter Masala',
        description: '',
        price: 250,
        categoryId: 'cat-1',
        isAvailable: true,
        dietary: 'VEG',
        imageUrl: '',
        prepTimeMinutes: 15,
      },
    ]);

    networkService.isOnline.set(false);
    service.toggleMenuItemAvailability(itemId, false);

    expect(service.menuItems().find((m) => m.id === itemId)?.isAvailable).toBe(false);
    expect(service.offlineOutbox().some((a) => a.type === 'TOGGLE_MENU_AVAILABILITY')).toBe(true);

    // Bring online and flush
    networkService.isOnline.set(true);
    service.flushOfflineQueue();

    const req = httpMock.expectOne((r) => r.url.includes(`/menu/items/${itemId}/availability`));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.is_available).toBe(false);
    req.flush({ success: true });

    expect(service.offlineOutbox().some((a) => a.type === 'TOGGLE_MENU_AVAILABILITY')).toBe(false);
  });

  it('uses a stable payment key and accepts the confirmed local receipt while internet is offline', async () => {
    networkService.isOnline.set(false);
    service.orders.set([testOrder]);
    const pending=service.settleOrder({orderId:testOrder.id,paymentMethod:'UPI'});
    const request=httpMock.expectOne(r=>r.url.endsWith('/settle'));
    expect(request.request.body.idempotency_key).toBe(`settle-${testOrder.id}`);
    request.flush({success:true,data:{amount_paise:21000,settled_at:new Date().toISOString()}});
    expect((await pending).success).toBe(true);
    expect(service.orders()[0].paymentStatus).toBe('PAID');
  });
});
