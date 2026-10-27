import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../mock/mock-data.service';
import {
  MockTableRepository,
  MockOrderRepository,
  MockCouponRepository,
  MockCustomerRepository,
} from './index';
import { OrderStatus } from '../../core/models/order.model';

describe('Data Access Repositories', () => {
  let mockData: MockDataService;
  let tableRepo: MockTableRepository;
  let orderRepo: MockOrderRepository;
  let couponRepo: MockCouponRepository;
  let customerRepo: MockCustomerRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        MockDataService,
        MockTableRepository,
        MockOrderRepository,
        MockCouponRepository,
        MockCustomerRepository,
      ],
    });

    mockData = TestBed.inject(MockDataService);
    tableRepo = TestBed.inject(MockTableRepository);
    orderRepo = TestBed.inject(MockOrderRepository);
    couponRepo = TestBed.inject(MockCouponRepository);
    customerRepo = TestBed.inject(MockCustomerRepository);

    // Initialize mock data in-memory signals with test data
    mockData.tables.set([
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
        id: 'tbl-001',
        number: 'T-01',
        capacity: 2,
        section: 'Main Dining',
        status: 'AVAILABLE',
        qrToken: 'tbl-01',
        qrUrl: '/menu/gurukripa-dhaba/table/tbl-01',
        orderingEnabled: true,
      },
    ]);

    mockData.coupons.set([
      {
        id: 'coup-001',
        code: 'ROYAL20',
        name: 'Royal 20',
        description: '20% off up to 400',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderValue: 1000,
        maxDiscountAmount: 400,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        usageLimit: 500,
        perCustomerLimit: 2,
        redemptionCount: 10,
        isActive: true,
      },
      {
        id: 'coup-002',
        code: 'WELCOME100',
        name: 'Welcome 100',
        description: 'Flat 100 off',
        discountType: 'FIXED',
        discountValue: 100,
        minOrderValue: 500,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        usageLimit: 1000,
        perCustomerLimit: 1,
        redemptionCount: 50,
        isActive: true,
      },
      {
        id: 'coup-003',
        code: 'VIPDINER',
        name: 'VIP Diner Exclusive',
        description: '25% off for VIPs',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        minOrderValue: 1800,
        maxDiscountAmount: 800,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        assignedCustomerIds: ['cust-001'],
        usageLimit: 100,
        perCustomerLimit: 1,
        redemptionCount: 5,
        isActive: true,
      },
    ]);

    mockData.orders.set([
      {
        id: 'ord-101',
        orderNumber: '#ORD-101',
        restaurantSlug: 'gurukripa-dhaba',
        tableId: 'tbl-007',
        tableNumber: 'T-07',
        customerName: 'Aditya Sharma',
        customerPhone: '+91 98765 43210',
        items: [],
        subtotal: 1000,
        discountAmount: 200,
        taxAmount: 40,
        cgstAmount: 20,
        sgstAmount: 20,
        totalAmount: 840,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdAt: '2026-10-18T10:00:00Z',
        updatedAt: '2026-10-18T10:00:00Z',
        timeline: [],
      },
    ]);
  });

  describe('TableRepository', () => {
    it('retrieves table by qrToken', (done) => {
      tableRepo.getTableByToken('tbl-07').subscribe((table) => {
        expect(table).not.toBeNull();
        expect(table?.number).toBe('T-07');
        expect(table?.capacity).toBe(4);
      });
    });

    it('retrieves table by table number case-insensitively', (done) => {
      tableRepo.getTableByToken('t-01').subscribe((table) => {
        expect(table).not.toBeNull();
        expect(table?.id).toBe('tbl-001');
      });
    });

    it('returns null for nonexistent table token', (done) => {
      tableRepo.getTableByToken('nonexistent-token').subscribe((table) => {
        expect(table).toBeNull();
      });
    });
  });

  describe('CouponRepository', () => {
    it('validates percentage discount with cap', (done) => {
      couponRepo.validateCoupon('ROYAL20', 2500).subscribe((result) => {
        expect(result.isValid).toBe(true);
        // 20% of 2500 = 500, capped at 400
        expect(result.discountAmount).toBe(400);
      });
    });

    it('validates fixed discount correctly', (done) => {
      couponRepo.validateCoupon('WELCOME100', 800).subscribe((result) => {
        expect(result.isValid).toBe(true);
        expect(result.discountAmount).toBe(100);
      });
    });

    it('rejects coupon when subtotal is below minimum order value', (done) => {
      couponRepo.validateCoupon('ROYAL20', 800).subscribe((result) => {
        expect(result.isValid).toBe(false);
        expect(result.discountAmount).toBe(0);
        expect(result.reason).toContain('Minimum order spend');
      });
    });

    it('rejects VIP coupon for unauthorized guest', (done) => {
      couponRepo.validateCoupon('VIPDINER', 2000, 'unauthorized-cust').subscribe((result) => {
        expect(result.isValid).toBe(false);
        expect(result.discountAmount).toBe(0);
        expect(result.reason).toContain('exclusive coupon');
      });
    });

    it('allows VIP coupon for assigned customer ID', (done) => {
      couponRepo.validateCoupon('VIPDINER', 2000, 'cust-001').subscribe((result) => {
        expect(result.isValid).toBe(true);
        // 25% of 2000 = 500 (under 800 cap)
        expect(result.discountAmount).toBe(500);
      });
    });
  });

  describe('OrderRepository', () => {
    it('advances order status and records timeline event', (done) => {
      orderRepo.updateOrderStatus('ord-101', 'ACCEPTED', 'Captain verified').subscribe((ord) => {
        expect(ord.status).toBe('ACCEPTED');
        expect(ord.timeline.length).toBeGreaterThan(0);
        expect(ord.timeline[ord.timeline.length - 1].status).toBe('ACCEPTED');
      });
    });

    it('updates payment status to PAID', (done) => {
      orderRepo.updatePaymentStatus('ord-101', 'PAID', 'UPI').subscribe((ord) => {
        expect(ord.paymentStatus).toBe('PAID');
        expect(ord.paymentMethod).toBe('UPI');
      });
    });
  });
});
