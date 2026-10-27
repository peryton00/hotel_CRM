import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import {
  computeDateRange,
  isTimestampInRange,
  formatLocalDate,
  parseLocalYmd,
  startOfDay,
  endOfDay,
} from './utils/date-range.utils';
import {
  calculateFinancialSummary,
  calculateOrderTypeBreakdown,
  calculateCogsSummary,
  calculateWastageSummary,
  getOrderFulfillmentTimestamp,
  getOrderSettlementTimestamp,
  getSplitSettlementTimestamp,
  getRefundCompletionTimestamp,
} from './utils/financial.utils';
import { provideRouter } from '@angular/router';
import { AdminDashboardComponent } from '../features/admin/dashboard/dashboard.component';
import { ReportsComponent } from '../features/admin/reports/reports.component';
import { Order, OrderItem } from './models/order.model';
import { Ingredient, StockMovement, Recipe } from './models/inventory.model';
import { SplitBill, Invoice } from './models/billing.model';
import { RefundRecord } from './models/billing.model';

describe('Phase 7: Reporting, COGS, Wastage Analysis & Split-Bill Receipts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([]), MockDataService],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Task 2: Date-Range Filtering & Boundaries', () => {
    const fixedNow = new Date(2026, 9, 27, 14, 30, 0); // Oct 27, 2026, 14:30:00 local

    it('should compute "today" range with inclusive local midnight boundaries', () => {
      const range = computeDateRange('today', '', '', fixedNow);
      expect(range.isValid).toBe(true);
      expect(range.preset).toBe('today');

      const expectedStart = new Date(2026, 9, 27, 0, 0, 0, 0).getTime();
      const expectedEnd = new Date(2026, 9, 27, 23, 59, 59, 999).getTime();

      expect(range.startMs).toBe(expectedStart);
      expect(range.endMs).toBe(expectedEnd);
      expect(range.startDate).toBe('2026-10-27');
      expect(range.endDate).toBe('2026-10-27');
    });

    it('should compute "yesterday" range correctly across local boundaries', () => {
      const range = computeDateRange('yesterday', '', '', fixedNow);
      expect(range.isValid).toBe(true);

      const expectedStart = new Date(2026, 9, 26, 0, 0, 0, 0).getTime();
      const expectedEnd = new Date(2026, 9, 26, 23, 59, 59, 999).getTime();

      expect(range.startMs).toBe(expectedStart);
      expect(range.endMs).toBe(expectedEnd);
      expect(range.startDate).toBe('2026-10-26');
      expect(range.endDate).toBe('2026-10-26');
    });

    it('should compute "last_7_days" with 7 full calendar days inclusive', () => {
      const range = computeDateRange('last_7_days', '', '', fixedNow);
      expect(range.isValid).toBe(true);

      const expectedStart = new Date(2026, 9, 21, 0, 0, 0, 0).getTime();
      const expectedEnd = new Date(2026, 9, 27, 23, 59, 59, 999).getTime();

      expect(range.startMs).toBe(expectedStart);
      expect(range.endMs).toBe(expectedEnd);
      expect(range.startDate).toBe('2026-10-21');
      expect(range.endDate).toBe('2026-10-27');
    });

    it('should compute "this_month" and "previous_month" respecting month and year transitions', () => {
      const thisMonth = computeDateRange('this_month', '', '', fixedNow);
      expect(thisMonth.startDate).toBe('2026-10-01');
      expect(thisMonth.endDate).toBe('2026-10-31');

      const prevMonth = computeDateRange('previous_month', '', '', fixedNow);
      expect(prevMonth.startDate).toBe('2026-09-01');
      expect(prevMonth.endDate).toBe('2026-09-30');

      // Test Jan 1 transition to previous month (December of prior year)
      const newYearRef = new Date(2027, 0, 5, 10, 0, 0);
      const decPriorYear = computeDateRange('previous_month', '', '', newYearRef);
      expect(decPriorYear.startDate).toBe('2026-12-01');
      expect(decPriorYear.endDate).toBe('2026-12-31');
    });

    it('should validate custom ranges and reject end date before start date', () => {
      const validCustom = computeDateRange('custom', '2026-10-10', '2026-10-20');
      expect(validCustom.isValid).toBe(true);
      expect(validCustom.startDate).toBe('2026-10-10');
      expect(validCustom.endDate).toBe('2026-10-20');

      const sameDayCustom = computeDateRange('custom', '2026-10-15', '2026-10-15');
      expect(sameDayCustom.isValid).toBe(true);
      expect(sameDayCustom.startMs).toBe(new Date(2026, 9, 15, 0, 0, 0, 0).getTime());
      expect(sameDayCustom.endMs).toBe(new Date(2026, 9, 15, 23, 59, 59, 999).getTime());

      const invalidCustom = computeDateRange('custom', '2026-10-25', '2026-10-10');
      expect(invalidCustom.isValid).toBe(false);
      expect(invalidCustom.errorMessage).toContain('earlier than start date');
    });

    it('should correctly filter timestamps within and outside range boundaries', () => {
      const range = computeDateRange('today', '', '', fixedNow);

      const morningTs = new Date(2026, 9, 27, 8, 0, 0).toISOString();
      const endOfDayTs = new Date(2026, 9, 27, 23, 59, 59).toISOString();
      const yesterdayTs = new Date(2026, 9, 26, 23, 59, 59).toISOString();
      const tomorrowTs = new Date(2026, 9, 28, 0, 0, 1).toISOString();

      expect(isTimestampInRange(morningTs, range)).toBe(true);
      expect(isTimestampInRange(endOfDayTs, range)).toBe(true);
      expect(isTimestampInRange(yesterdayTs, range)).toBe(false);
      expect(isTimestampInRange(tomorrowTs, range)).toBe(false);
      expect(isTimestampInRange('', range)).toBe(false);
    });
  });

  describe('Task 3: COGS and Gross Profit Calculation', () => {
    const sampleIngredients: Ingredient[] = [
      {
        id: 'ing-paneer',
        name: 'Paneer',
        category: 'DAIRY',
        currentStock: 10,
        unit: 'kg',
        minThreshold: 2,
        costPerUnit: 400, // Rs 400 per kg
        costUnit: 'kg',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-butter',
        name: 'Butter',
        category: 'DAIRY',
        currentStock: 5,
        unit: 'kg',
        minThreshold: 1,
        costPerUnit: 500, // Rs 500 per kg
        costUnit: 'kg',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const sampleRecipes: Recipe[] = [
      {
        id: 'rec-paneer-butter',
        menuItemId: 'item-paneer-tikka',
        menuItemName: 'Paneer Butter Masala',
        version: 1,
        isActive: true,
        indicativeCost: 105,
        items: [
          { ingredientId: 'ing-paneer', quantity: 200, unit: 'g' }, // 200g = 0.2kg * 400 = Rs 80
          { ingredientId: 'ing-butter', quantity: 50, unit: 'g' }, // 50g = 0.05kg * 500 = Rs 25
        ],
        instructions: 'Classic recipe',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('should compute COGS for fulfilled orders (SERVED & COMPLETED) and ignore pending/preparing/cancelled', () => {
      const orders: Order[] = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-101',
          restaurantSlug: 'gurukripa-dhaba',
          tableNumber: 'T-01',
          customerName: 'Guest 1',
          customerPhone: '9876500001',
          orderType: 'DINE_IN',
          status: 'SERVED',
          paymentStatus: 'PAID',
          totalAmount: 350,
          subtotal: 333.33,
          taxAmount: 16.67,
          cgstAmount: 8.33,
          sgstAmount: 8.34,
          discountAmount: 0,
          timeline: [],
          items: [
            {
              id: 'oi-1',
              menuItemId: 'item-paneer-tikka',
              name: 'Paneer Butter Masala',
              quantity: 1,
              unitPrice: 350,
              itemTotal: 350,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
          createdAt: '2026-10-27T10:00:00Z',
          updatedAt: '2026-10-27T10:30:00Z',
        },
        {
          id: 'ord-2',
          orderNumber: 'ORD-102',
          restaurantSlug: 'gurukripa-dhaba',
          tableNumber: 'T-02',
          customerName: 'Guest 2',
          customerPhone: '9876500002',
          orderType: 'DINE_IN',
          status: 'PREPARING', // Not fulfilled yet
          paymentStatus: 'UNPAID',
          totalAmount: 350,
          subtotal: 333.33,
          taxAmount: 16.67,
          cgstAmount: 8.33,
          sgstAmount: 8.34,
          discountAmount: 0,
          timeline: [],
          items: [
            {
              id: 'oi-2',
              menuItemId: 'item-paneer-tikka',
              name: 'Paneer Butter Masala',
              quantity: 1,
              unitPrice: 350,
              itemTotal: 350,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
          createdAt: '2026-10-27T11:00:00Z',
          updatedAt: '2026-10-27T11:10:00Z',
        },
        {
          id: 'ord-3',
          orderNumber: 'ORD-103',
          restaurantSlug: 'gurukripa-dhaba',
          tableNumber: 'T-03',
          customerName: 'Guest 3',
          customerPhone: '9876500003',
          orderType: 'DINE_IN',
          status: 'CANCELLED',
          paymentStatus: 'UNPAID',
          totalAmount: 350,
          subtotal: 333.33,
          taxAmount: 16.67,
          cgstAmount: 8.33,
          sgstAmount: 8.34,
          discountAmount: 0,
          timeline: [],
          items: [
            {
              id: 'oi-3',
              menuItemId: 'item-paneer-tikka',
              name: 'Paneer Butter Masala',
              quantity: 1,
              unitPrice: 350,
              itemTotal: 350,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
          createdAt: '2026-10-27T12:00:00Z',
          updatedAt: '2026-10-27T12:05:00Z',
        },
      ];

      const cogs = calculateCogsSummary(orders, sampleRecipes, sampleIngredients);

      // Only ord-1 was fulfilled: recipe unit cost = 80 + 25 = 105.
      expect(cogs.fulfilledPortionsCount).toBe(1);
      expect(cogs.totalCogs).toBe(105);
      expect(cogs.netRevenue).toBe(350);
      expect(cogs.grossProfit).toBe(245); // 350 - 105 = 245
      expect(cogs.grossMarginPercentage).toBe(70); // (245 / 350) * 100 = 70%
    });

    it('should guard against division-by-zero when net sales revenue is zero', () => {
      const emptyCogs = calculateCogsSummary([], sampleRecipes, sampleIngredients);
      expect(emptyCogs.netRevenue).toBe(0);
      expect(emptyCogs.totalCogs).toBe(0);
      expect(emptyCogs.grossProfit).toBe(0);
      expect(emptyCogs.grossMarginPercentage).toBe(0);
      expect(isNaN(emptyCogs.grossMarginPercentage)).toBe(false);
    });

    it('should label items without recipes as ESTIMATED_NO_RECIPE', () => {
      const orders: Order[] = [
        {
          id: 'ord-untracked',
          orderNumber: 'ORD-999',
          restaurantSlug: 'gurukripa-dhaba',
          tableNumber: 'T-01',
          customerName: 'Guest',
          customerPhone: '9876500000',
          orderType: 'DINE_IN',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          totalAmount: 200,
          subtotal: 200,
          taxAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          discountAmount: 0,
          timeline: [],
          items: [
            {
              id: 'oi-u',
              menuItemId: 'item-unknown-beverage',
              name: 'Special Mojito',
              quantity: 2,
              unitPrice: 100,
              itemTotal: 200,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
          createdAt: '2026-10-27T10:00:00Z',
          updatedAt: '2026-10-27T10:30:00Z',
        },
      ];

      const cogs = calculateCogsSummary(orders, sampleRecipes, sampleIngredients);
      expect(cogs.untrackedOrEstimatedDishesCount).toBe(1);
      expect(cogs.itemBreakdown.length).toBe(1);
      expect(cogs.itemBreakdown[0].status).toBe('ESTIMATED_NO_RECIPE');
      expect(cogs.itemBreakdown[0].unitCogs).toBe(0);
      expect(cogs.itemBreakdown[0].totalCogs).toBe(0);
    });
  });

  describe('Task 4: Inventory Wastage Analysis', () => {
    it('should record an auditable wastage movement through MockDataService with positive quantities', () => {
      const service = TestBed.inject(MockDataService);
      const ingredients = service.ingredients();
      expect(ingredients.length).toBeGreaterThan(0);

      const target = ingredients[0];
      const initialStock = target.currentStock;

      const res = service.recordWastage({
        ingredientId: target.id,
        quantity: 1.5,
        unit: target.unit,
        reason: 'SPOILAGE - Excess heat damage in pantry',
        staffName: 'Chef Rahul',
        idempotencyKey: 'idemp-waste-1',
      });

      expect(res.success).toBe(true);
      expect(res.movement).toBeDefined();
      expect(res.movement?.type).toBe('WASTAGE');
      expect(res.movement?.quantityDelta).toBe(-1.5);
      expect(res.movement?.reason).toContain('SPOILAGE');

      // Check stock deducted accurately
      const updatedIng = service.ingredients().find((i) => i.id === target.id);
      expect(updatedIng?.currentStock).toBe(Math.round((initialStock - 1.5) * 1000) / 1000);
    });

    it('should reject invalid or negative wastage quantities', () => {
      const service = TestBed.inject(MockDataService);
      const target = service.ingredients()[0];

      const zeroRes = service.recordWastage({
        ingredientId: target.id,
        quantity: 0,
        unit: target.unit,
        reason: 'EXPIRY',
      });
      expect(zeroRes.success).toBe(false);
      expect(zeroRes.error).toContain('positive');

      const negRes = service.recordWastage({
        ingredientId: target.id,
        quantity: -2,
        unit: target.unit,
        reason: 'SPILLAGE',
      });
      expect(negRes.success).toBe(false);
    });

    it('should protect available-to-promise (ATP) stock and reject wastage exceeding unreserved stock', () => {
      const service = TestBed.inject(MockDataService);
      const target = service.ingredients()[0];

      // Request wastage far larger than current physical stock
      const hugeRes = service.recordWastage({
        ingredientId: target.id,
        quantity: target.currentStock + 100,
        unit: target.unit,
        reason: 'QUALITY_REJECTION',
      });

      expect(hugeRes.success).toBe(false);
      expect(hugeRes.error).toContain('Cannot record wastage');
    });

    it('should prevent duplicate deductions with idempotent submission', () => {
      const service = TestBed.inject(MockDataService);
      const target = service.ingredients()[0];
      const key = 'duplicate-idempotency-key-123';

      const res1 = service.recordWastage({
        ingredientId: target.id,
        quantity: 1.0,
        unit: target.unit,
        reason: 'SPILLAGE',
        idempotencyKey: key,
      });
      expect(res1.success).toBe(true);

      const stockAfterFirst = service.ingredients().find((i) => i.id === target.id)?.currentStock;

      // Second identical call with same key
      const res2 = service.recordWastage({
        ingredientId: target.id,
        quantity: 1.0,
        unit: target.unit,
        reason: 'SPILLAGE',
        idempotencyKey: key,
      });
      expect(res2.success).toBe(true);
      expect(res2.isDuplicate).toBe(true);

      // Stock must NOT be deducted twice
      const stockAfterSecond = service.ingredients().find((i) => i.id === target.id)?.currentStock;
      expect(stockAfterSecond).toBe(stockAfterFirst);
    });

    it('should aggregate wastage by ingredient and by reason using calculateWastageSummary', () => {
      const sampleIngredients: Ingredient[] = [
        {
          id: 'ing-milk',
          name: 'Fresh Cow Milk',
          category: 'DAIRY',
          currentStock: 20,
          unit: 'l',
          minThreshold: 5,
          costPerUnit: 60, // Rs 60 / l
          costUnit: 'l',
          isActive: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      const movements: StockMovement[] = [
        {
          id: 'sm-1',
          ingredientId: 'ing-milk',
          ingredientName: 'Fresh Cow Milk',
          type: 'WASTAGE',
          quantityDelta: -2, // 2 liters
          quantityBefore: 20,
          quantityAfter: 18,
          unit: 'l',
          reason: 'EXPIRY - Soured milk',
          timestamp: '2026-10-27T08:00:00Z',
          staffName: 'Kitchen Staff',
        },
        {
          id: 'sm-2',
          ingredientId: 'ing-milk',
          ingredientName: 'Fresh Cow Milk',
          type: 'WASTAGE',
          quantityDelta: -1, // 1 liter
          quantityBefore: 18,
          quantityAfter: 17,
          unit: 'l',
          reason: 'SPILLAGE - Dropped during prep',
          timestamp: '2026-10-27T12:00:00Z',
          staffName: 'Prep Cook',
        },
        {
          id: 'sm-3',
          ingredientId: 'ing-milk',
          ingredientName: 'Fresh Cow Milk',
          type: 'RECIPE_CONSUMPTION', // Not wastage!
          quantityDelta: -5,
          quantityBefore: 17,
          quantityAfter: 12,
          unit: 'l',
          reason: 'Order fulfillment',
          timestamp: '2026-10-27T14:00:00Z',
          staffName: 'System',
        },
      ];

      const summary = calculateWastageSummary(movements, sampleIngredients);

      expect(summary.totalMovementsCount).toBe(2); // Only sm-1 and sm-2
      expect(summary.totalWastageValue).toBe(180); // 2*60 + 1*60 = 180
      expect(summary.byIngredient.length).toBe(1);
      expect(summary.byIngredient[0].quantity).toBe(3); // 2 + 1
      expect(summary.byIngredient[0].totalValue).toBe(180);

      expect(summary.byReason.length).toBe(2);
    });
  });

  function createTestOrder(overrides: Partial<Order> = {}): Order {
    const items: OrderItem[] = overrides.items || [
      {
        id: 'oi-test-1',
        menuItemId: 'item-paneer-tikka',
        name: 'Paneer Butter Masala',
        quantity: 2,
        unitPrice: 200,
        itemTotal: 400,
        selectedVariants: [],
        selectedAddons: [],
      },
    ];
    const subtotal = overrides.subtotal ?? 400;
    const taxAmount = overrides.taxAmount ?? 20;
    const totalAmount = overrides.totalAmount ?? 420;

    return {
      id: overrides.id || `ord-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: overrides.orderNumber || '#ORD-701',
      restaurantSlug: 'royal-spice',
      tableNumber: overrides.tableNumber || 'T-01',
      orderType: overrides.orderType || 'DINE_IN',
      pickupReference: overrides.pickupReference,
      customerName: overrides.customerName || 'Test Diner',
      customerPhone: '+91 98765 00000',
      items,
      subtotal,
      discountAmount: overrides.discountAmount ?? 0,
      taxAmount,
      cgstAmount: taxAmount / 2,
      sgstAmount: taxAmount / 2,
      totalAmount,
      status: overrides.status || 'SERVED',
      paymentStatus: overrides.paymentStatus || 'UNPAID',
      createdAt: overrides.createdAt || new Date().toISOString(),
      updatedAt: overrides.updatedAt || new Date().toISOString(),
      timeline: [],
      ...overrides,
    };
  }

  describe('Task 5: Split-Bill Receipt Slips', () => {
    it('should record print copies for individual split bills and track reprint count', () => {
      const service = TestBed.inject(MockDataService);
      const ord = createTestOrder();
      service.orders.set([ord]);

      const splitRes = service.splitOrderEqual({ orderId: ord.id, splitCount: 2 });
      expect(splitRes.success).toBe(true);

      const splits = service.splitBills().filter((s) => s.orderId === ord.id);
      expect(splits.length).toBe(2);

      const split1 = splits[0];
      expect(split1.printCount || 0).toBe(0);

      // First print
      const print1 = service.recordSplitBillPrint(split1.id, false, 'Billing Staff');
      expect(print1.success).toBe(true);
      expect(print1.printCount).toBe(1);

      // Verify state updated
      const updatedSplit = service.splitBills().find((s) => s.id === split1.id);
      expect(updatedSplit?.printCount).toBe(1);

      // Reprint with admin override
      const print2 = service.recordSplitBillPrint(split1.id, true, 'Admin Override');
      expect(print2.success).toBe(true);
      expect(print2.printCount).toBe(2);

      const reprintSplit = service.splitBills().find((s) => s.id === split1.id);
      expect(reprintSplit?.printCount).toBe(2);
    });

    it('should propagate orderType, pickupReference, and customerName to split bills', () => {
      const service = TestBed.inject(MockDataService);
      const takeawayOrder = createTestOrder({
        orderType: 'TAKEAWAY',
        pickupReference: 'TK-999',
        customerName: 'Aarav Patel',
      });
      service.orders.set([takeawayOrder]);

      const splitRes = service.splitOrderEqual({ orderId: takeawayOrder.id, splitCount: 2 });
      expect(splitRes.success).toBe(true);

      const splits = service.splitBills().filter((s) => s.orderId === takeawayOrder.id);
      expect(splits.length).toBe(2);

      for (const split of splits) {
        expect(split.orderType).toBe('TAKEAWAY');
        expect(split.pickupReference).toBe('TK-999');
        expect(split.customerName).toBe('Aarav Patel');
      }
    });

    it('should calculate accurate proportionate split amounts without parent order double counting', () => {
      const service = TestBed.inject(MockDataService);
      const targetOrd = createTestOrder({ totalAmount: 420 });
      service.orders.set([targetOrd]);

      const splitRes = service.splitOrderEqual({ orderId: targetOrd.id, splitCount: 2 });
      expect(splitRes.success).toBe(true);

      const splits = service.splitBills().filter((s) => s.orderId === targetOrd.id);
      const splitSum = Math.round((splits[0].totalAmount + splits[1].totalAmount) * 100) / 100;

      // Sum of splits must equal parent totalAmount within 1 paisa rounding
      expect(Math.abs(splitSum - targetOrd.totalAmount)).toBeLessThanOrEqual(0.02);

      // Financial summary check: when neither split is paid, collected revenue should not include the parent order
      const fin = calculateFinancialSummary([targetOrd], service.splitBills(), service.refunds());
      expect(fin.grossSales).toBe(targetOrd.totalAmount);
    });
  });

  describe('Task 6: Dashboard & Reports Financial Parity', () => {
    it('should produce identical financial totals for the same dataset in both views', () => {
      const service = TestBed.inject(MockDataService);
      const ord1 = createTestOrder({
        id: 'ord-p-1',
        orderType: 'DINE_IN',
        totalAmount: 500,
        paymentStatus: 'PAID',
      });
      const ord2 = createTestOrder({
        id: 'ord-p-2',
        orderType: 'TAKEAWAY',
        totalAmount: 300,
        paymentStatus: 'PAID',
      });
      service.orders.set([ord1, ord2]);

      const allOrders = service.orders();
      const allSplits = service.splitBills();
      const allRefunds = service.refunds();

      const reportFin = calculateFinancialSummary(allOrders, allSplits, allRefunds);
      const reportTypes = calculateOrderTypeBreakdown(allOrders, allSplits, allRefunds);

      // Sum of dine-in net revenue and takeaway net revenue must equal total net revenue
      const combinedNetRevenue =
        Math.round((reportTypes.dineIn.netRevenue + reportTypes.takeaway.netRevenue) * 100) / 100;
      expect(combinedNetRevenue).toBe(reportFin.netRevenue);

      // Sum of dine-in gross sales and takeaway gross sales must equal total gross sales
      const combinedGross =
        Math.round((reportTypes.dineIn.grossSales + reportTypes.takeaway.grossSales) * 100) / 100;
      expect(combinedGross).toBe(reportFin.grossSales);
    });
  });

  describe('Phase 7A: Financial Correctness, COGS Attribution & Reporting Hardening', () => {
    describe('Task 2 — Sales vs Collections Separation', () => {
      it('counts fulfilled but unpaid orders in grossSales and netSales while excluding them from collectedRevenue', () => {
        const order = createTestOrder({
          id: 'ord-7a-unpaid',
          totalAmount: 1200,
          status: 'SERVED',
          paymentStatus: 'UNPAID',
        });
        const fin = calculateFinancialSummary([order], [], []);
        expect(fin.grossSales).toBe(1200);
        expect(fin.netSales).toBe(1200);
        expect(fin.collectedRevenue).toBe(0);
        expect(fin.netCollections).toBe(0);
        expect(fin.outstandingReceivables).toBe(1200);
        expect(fin.fulfilledOrdersCount).toBe(1);
        expect(fin.paidOrdersCount).toBe(0);
      });

      it('correctly tracks partial and full settlements and avoids double-counting split parent totals', () => {
        const parentOrder = createTestOrder({
          id: 'ord-7a-split',
          totalAmount: 1000,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 2,
          paymentStatus: 'PARTIALLY_PAID',
        });
        const split1: SplitBill = {
          id: 'split-7a-1',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
        };
        const split2: SplitBill = {
          id: 'split-7a-2',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'UNPAID',
        };

        const fin = calculateFinancialSummary([parentOrder], [split1, split2], []);
        expect(fin.grossSales).toBe(1000);
        expect(fin.netSales).toBe(1000);
        expect(fin.collectedRevenue).toBe(500); // Only paid child split, not parent
        expect(fin.outstandingReceivables).toBe(500); // Unpaid child split
        expect(fin.netCollections).toBe(500);
        expect(fin.paidOrdersCount).toBe(0); // Parent not fully paid yet
        expect(fin.fulfilledOrdersCount).toBe(1);
      });

      it('subtracts completed refunds exactly once and ignores pending or cancelled refunds', () => {
        const order = createTestOrder({
          id: 'ord-7a-ref',
          totalAmount: 800,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });
        const refCompleted: RefundRecord = {
          id: 'ref-7a-comp',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 150,
          reason: 'Item return',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };
        const refPending: RefundRecord = {
          id: 'ref-7a-pend',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 50,
          reason: 'Staff awaiting manager approval',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        };
        const refCancelled: RefundRecord = {
          id: 'ref-7a-canc',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 100,
          reason: 'Voided duplicate claim',
          status: 'CANCELLED',
          createdAt: new Date().toISOString(),
        };

        const fin = calculateFinancialSummary(
          [order],
          [],
          [refCompleted, refPending, refCancelled],
        );
        expect(fin.grossSales).toBe(800);
        expect(fin.collectedRevenue).toBe(800);
        expect(fin.totalRefunds).toBe(150); // Only COMPLETED refund
        expect(fin.netCollections).toBe(650);
        expect(fin.completedRefundsCount).toBe(1);
      });

      it('excludes cancelled orders from recognized sales and collections', () => {
        const cancelledOrder = createTestOrder({
          id: 'ord-7a-cancelled',
          totalAmount: 600,
          status: 'CANCELLED',
          paymentStatus: 'PAID',
        });
        const fin = calculateFinancialSummary([cancelledOrder], [], []);
        expect(fin.grossSales).toBe(0);
        expect(fin.netSales).toBe(0);
        expect(fin.collectedRevenue).toBe(0);
        expect(fin.netCollections).toBe(0);
        expect(fin.cancelledOrdersCount).toBe(1);
      });
    });

    describe('Task 3 — COGS Fulfillment Date Attribution & Historical Reliability', () => {
      it('attributes COGS of order created before midnight and fulfilled after midnight to the fulfillment date', () => {
        const sampleRecipes: Recipe[] = [
          {
            id: 'rec-7a-1',
            menuItemId: 'dish-mid-1',
            menuItemName: 'Paneer Makhani',
            version: 1,
            isActive: true,
            indicativeCost: 100,
            createdAt: '2026-10-25T10:00:00Z',
            updatedAt: '2026-10-25T10:00:00Z',
            items: [
              {
                ingredientId: 'ing-paneer',
                quantity: 200,
                unit: 'g',
              },
            ],
          },
        ];
        const sampleIngredients: Ingredient[] = [
          {
            id: 'ing-paneer',
            name: 'Fresh Malai Paneer',
            currentStock: 10000,
            unit: 'g',
            costPerUnit: 0.5, // Rs. 0.5/g = Rs. 100 per 200g
            costUnit: 'g',
            minThreshold: 2000,
            isActive: true,
            category: 'DAIRY',
            createdAt: '2026-10-25T10:00:00Z',
            updatedAt: '2026-10-25T10:00:00Z',
          },
        ];

        // Order created at 23:50 on 2026-10-25 and fulfilled at 00:15 on 2026-10-26
        const midnightOrder: Order = {
          ...createTestOrder({
            id: 'ord-midnight',
            totalAmount: 400,
            status: 'SERVED',
            paymentStatus: 'PAID',
          }),
          createdAt: '2026-10-25T23:50:00Z',
          updatedAt: '2026-10-26T00:15:00Z',
          items: [
            {
              id: 'it-mid-1',
              menuItemId: 'dish-mid-1',
              name: 'Paneer Makhani',
              unitPrice: 400,
              quantity: 1,
              itemTotal: 400,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
          timeline: [
            { status: 'PENDING', timestamp: '2026-10-25T23:50:00Z' },
            { status: 'ACCEPTED', timestamp: '2026-10-25T23:55:00Z' },
            {
              status: 'SERVED',
              timestamp: '2026-10-26T00:15:00Z',
              note: 'Kitchen served order past midnight',
            },
          ],
        };

        const movement: StockMovement = {
          id: 'mov-mid-1',
          ingredientId: 'ing-paneer',
          ingredientName: 'Fresh Malai Paneer',
          type: 'RECIPE_CONSUMPTION',
          quantityDelta: -200,
          quantityBefore: 10000,
          quantityAfter: 9800,
          unit: 'g',
          reason: 'Recipe consumption for ord-midnight',
          referenceId: midnightOrder.id,
          timestamp: '2026-10-26T00:15:00Z',
        };

        // Date range for Day 1: 2026-10-25
        const day1Range = computeDateRange('custom', '2026-10-25', '2026-10-25');
        const day1Cogs = calculateCogsSummary(
          [midnightOrder],
          sampleRecipes,
          sampleIngredients,
          [],
          [],
          [movement],
          day1Range,
        );
        // Fulfilled after midnight, so Day 1 has 0 COGS for this dish
        expect(day1Cogs.totalCogs).toBe(0);
        expect(day1Cogs.fulfilledPortionsCount).toBe(0);

        // Date range for Day 2: 2026-10-26
        const day2Range = computeDateRange('custom', '2026-10-26', '2026-10-26');
        const day2Cogs = calculateCogsSummary(
          [midnightOrder],
          sampleRecipes,
          sampleIngredients,
          [],
          [],
          [movement],
          day2Range,
        );
        // Fulfilled on Day 2, so Day 2 captures the 100 COGS
        expect(day2Cogs.totalCogs).toBe(100);
        expect(day2Cogs.fulfilledPortionsCount).toBe(1);
        expect(day2Cogs.costBasis).toBe('CURRENT_BENCHMARK_COSTS');
        expect(day2Cogs.costBasisNotice).toContain('active recipe benchmarks');
      });

      it('prevents double-counting dishes even if multiple stock movements exist for the order', () => {
        const sampleRecipes: Recipe[] = [
          {
            id: 'rec-7a-multi',
            menuItemId: 'dish-multi',
            menuItemName: 'Dish Multi',
            version: 1,
            isActive: true,
            indicativeCost: 150,
            createdAt: '2026-10-26T10:00:00Z',
            updatedAt: '2026-10-26T10:00:00Z',
            items: [
              { ingredientId: 'ing-1', quantity: 100, unit: 'g' },
              { ingredientId: 'ing-2', quantity: 50, unit: 'g' },
            ],
          },
        ];
        const sampleIngredients: Ingredient[] = [
          {
            id: 'ing-1',
            name: 'Ing 1',
            currentStock: 1000,
            unit: 'g',
            costPerUnit: 1,
            costUnit: 'g',
            minThreshold: 100,
            isActive: true,
            category: 'OTHER',
            createdAt: '2026-10-26T10:00:00Z',
            updatedAt: '2026-10-26T10:00:00Z',
          },
          {
            id: 'ing-2',
            name: 'Ing 2',
            currentStock: 1000,
            unit: 'g',
            costPerUnit: 1,
            costUnit: 'g',
            minThreshold: 100,
            isActive: true,
            category: 'OTHER',
            createdAt: '2026-10-26T10:00:00Z',
            updatedAt: '2026-10-26T10:00:00Z',
          },
        ];

        const order: Order = {
          ...createTestOrder({
            id: 'ord-multi-mov',
            totalAmount: 500,
            status: 'COMPLETED',
            paymentStatus: 'PAID',
          }),
          items: [
            {
              id: 'it-1',
              menuItemId: 'dish-multi',
              name: 'Dish Multi',
              unitPrice: 500,
              quantity: 1,
              itemTotal: 500,
              selectedVariants: [],
              selectedAddons: [],
            },
          ],
        };

        const mov1: StockMovement = {
          id: 'mov-1',
          ingredientId: 'ing-1',
          ingredientName: 'Ing 1',
          type: 'RECIPE_CONSUMPTION',
          quantityDelta: -100,
          quantityBefore: 1000,
          quantityAfter: 900,
          unit: 'g',
          reason: 'Cons',
          referenceId: order.id,
          timestamp: new Date().toISOString(),
        };
        const mov2: StockMovement = {
          id: 'mov-2',
          ingredientId: 'ing-2',
          ingredientName: 'Ing 2',
          type: 'RECIPE_CONSUMPTION',
          quantityDelta: -50,
          quantityBefore: 1000,
          quantityAfter: 950,
          unit: 'g',
          reason: 'Cons',
          referenceId: order.id,
          timestamp: new Date().toISOString(),
        };

        // Pass order in list twice or multiple movements
        const cogs = calculateCogsSummary(
          [order, order],
          sampleRecipes,
          sampleIngredients,
          [],
          [],
          [mov1, mov2],
        );
        expect(cogs.fulfilledPortionsCount).toBe(1);
        expect(cogs.totalCogs).toBe(150);
      });
    });

    describe('Task 4 — Wastage and Inventory Reconciliation', () => {
      it('enforces positive quantities, unit compatibility, and ATP unreserved stock validation', () => {
        const service = TestBed.inject(MockDataService);
        const ing = service.ingredients().find((i) => i.isActive && i.currentStock > 0)!;

        // Negative quantity rejected
        const negRes = service.recordWastage({
          ingredientId: ing.id,
          quantity: -5,
          reason: 'Test negative',
        });
        expect(negRes.success).toBe(false);
        expect(negRes.error).toContain('positive');

        // Zero quantity rejected
        const zeroRes = service.recordWastage({
          ingredientId: ing.id,
          quantity: 0,
          reason: 'Test zero',
        });
        expect(zeroRes.success).toBe(false);

        // Exceeding available stock rejected
        const excessRes = service.recordWastage({
          ingredientId: ing.id,
          quantity: ing.currentStock + 50000,
          reason: 'Excessive wastage',
        });
        expect(excessRes.success).toBe(false);
        expect(excessRes.error).toContain('Available unreserved stock');
      });

      it('safely decrements stock with negative quantityDelta and prevents duplicate deduction via idempotencyKey', () => {
        const service = TestBed.inject(MockDataService);
        const ing = service.ingredients().find((i) => i.isActive && i.currentStock >= 5)!;
        const initialStock = ing.currentStock;
        const testKey = 'idem-waste-7a-' + Date.now();

        const res1 = service.recordWastage({
          ingredientId: ing.id,
          quantity: 2,
          unit: ing.unit,
          reason: 'Spilled during prep',
          idempotencyKey: testKey,
        });

        expect(res1.success).toBe(true);
        expect(res1.movement?.quantityDelta).toBe(-2);
        expect(res1.movement?.quantityAfter).toBe(initialStock - 2);

        // Duplicate submission with same idempotency key
        const res2 = service.recordWastage({
          ingredientId: ing.id,
          quantity: 2,
          unit: ing.unit,
          reason: 'Spilled during prep (retry)',
          idempotencyKey: testKey,
        });

        expect(res2.success).toBe(true);
        expect(res2.isDuplicate).toBe(true);
        expect(res2.movement?.id).toBe(res1.movement?.id);

        // Stock was deducted only once
        const updatedIng = service.ingredients().find((i) => i.id === ing.id)!;
        expect(updatedIng.currentStock).toBe(initialStock - 2);
      });
    });

    describe('Task 5 — Split-Bill Receipt Integrity & Read-Only Printing', () => {
      it('ensures recording print increments printCount without mutating paymentStatus, settlement amounts, or inventory', () => {
        const service = TestBed.inject(MockDataService);
        const targetOrd = createTestOrder({
          id: 'ord-split-print-7a',
          totalAmount: 1000,
          status: 'SERVED',
          paymentStatus: 'UNPAID',
        });
        service.orders.set([targetOrd]);

        const splitResult = service.splitOrderEqual({ orderId: targetOrd.id, splitCount: 2 });
        expect(splitResult.success).toBe(true);

        const splits = service.splitBills().filter((s) => s.orderId === targetOrd.id);
        expect(splits.length).toBe(2);

        const split1 = splits[0];
        expect(split1.paymentStatus).toBe('UNPAID');
        expect(split1.printCount || 0).toBe(0);

        // Record first print (read-only slip tracking)
        const print1 = service.recordSplitBillPrint(split1.id, false, 'Billing Staff');
        expect(print1.success).toBe(true);
        expect(print1.printCount).toBe(1);

        // Verify split bill state has not been settled
        const refreshedSplit = service.splitBills().find((b) => b.id === split1.id)!;
        expect(refreshedSplit.paymentStatus).toBe('UNPAID');
        expect(refreshedSplit.totalAmount).toBe(split1.totalAmount);
        expect(refreshedSplit.printCount).toBe(1);

        // Record reprint
        const print2 = service.recordSplitBillPrint(split1.id, true, 'Admin Override');
        expect(print2.success).toBe(true);
        expect(print2.printCount).toBe(2);

        const refreshedAgain = service.splitBills().find((b) => b.id === split1.id)!;
        expect(refreshedAgain.printCount).toBe(2);
        expect(refreshedAgain.paymentStatus).toBe('UNPAID');
      });
    });
  });

  describe('Phase 7B: Financial Reconciliation Corrections', () => {
    describe('Task 2 — Outstanding Receivables Derivation', () => {
      it('derives receivables solely from unpaid child splits for an entirely unpaid split order', () => {
        const parentOrder = createTestOrder({
          id: 'ord-7b-split-unpaid',
          totalAmount: 1000,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 2,
          paymentStatus: 'UNPAID',
        });
        const split1: SplitBill = {
          id: 'sp-7b-1',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'UNPAID',
        };
        const split2: SplitBill = {
          id: 'sp-7b-2',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'UNPAID',
        };

        const fin = calculateFinancialSummary([parentOrder], [split1, split2], []);
        expect(fin.grossSales).toBe(1000);
        expect(fin.collectedRevenue).toBe(0);
        // Parent total 1000 is NOT added alongside split bills; exactly 500 + 500 = 1000
        expect(fin.outstandingReceivables).toBe(1000);
        expect(fin.paidOrdersCount).toBe(0);
      });

      it('correctly calculates receivables for a partially settled split order', () => {
        const parentOrder = createTestOrder({
          id: 'ord-7b-split-part',
          totalAmount: 1200,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 3,
          paymentStatus: 'PARTIALLY_PAID',
        });
        const split1: SplitBill = {
          id: 'sp-part-1',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 1,
          splitTotalCount: 3,
          splitType: 'EQUAL',
          subtotal: 380.95,
          discountAmount: 0,
          taxAmount: 19.05,
          totalAmount: 400,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          settledAt: '2026-10-27T12:00:00Z',
        };
        const split2: SplitBill = {
          id: 'sp-part-2',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 2,
          splitTotalCount: 3,
          splitType: 'EQUAL',
          subtotal: 380.95,
          discountAmount: 0,
          taxAmount: 19.05,
          totalAmount: 400,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          settledAt: '2026-10-27T12:05:00Z',
        };
        const split3: SplitBill = {
          id: 'sp-part-3',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 3,
          splitTotalCount: 3,
          splitType: 'EQUAL',
          subtotal: 380.95,
          discountAmount: 0,
          taxAmount: 19.05,
          totalAmount: 400,
          paymentStatus: 'UNPAID',
        };

        const fin = calculateFinancialSummary([parentOrder], [split1, split2, split3], []);
        expect(fin.grossSales).toBe(1200);
        expect(fin.collectedRevenue).toBe(800);
        expect(fin.outstandingReceivables).toBe(400); // Only unpaid split 3
        expect(fin.paidOrdersCount).toBe(0);
      });

      it('evaluates zero receivables for a fully settled split order', () => {
        const parentOrder = createTestOrder({
          id: 'ord-7b-split-full',
          totalAmount: 800,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 2,
          paymentStatus: 'PAID',
          settledAt: '2026-10-27T14:00:00Z',
        });
        const split1: SplitBill = {
          id: 'sp-full-1',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 380.95,
          discountAmount: 0,
          taxAmount: 19.05,
          totalAmount: 400,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          settledAt: '2026-10-27T13:50:00Z',
        };
        const split2: SplitBill = {
          id: 'sp-full-2',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 380.95,
          discountAmount: 0,
          taxAmount: 19.05,
          totalAmount: 400,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          settledAt: '2026-10-27T14:00:00Z',
        };

        const fin = calculateFinancialSummary([parentOrder], [split1, split2], []);
        expect(fin.grossSales).toBe(800);
        expect(fin.collectedRevenue).toBe(800);
        expect(fin.outstandingReceivables).toBe(0);
        expect(fin.paidOrdersCount).toBe(1);
      });

      it('accurately captures receivables for a non-split unpaid order', () => {
        const order = createTestOrder({
          id: 'ord-7b-nonsplit-unpaid',
          totalAmount: 650,
          status: 'SERVED',
          paymentStatus: 'UNPAID',
        });
        const fin = calculateFinancialSummary([order], [], []);
        expect(fin.grossSales).toBe(650);
        expect(fin.collectedRevenue).toBe(0);
        expect(fin.outstandingReceivables).toBe(650);
        expect(fin.paidOrdersCount).toBe(0);
      });

      it('ensures cancelled orders never create false receivables', () => {
        const cancelledOrder = createTestOrder({
          id: 'ord-7b-cancelled',
          totalAmount: 900,
          status: 'CANCELLED',
          paymentStatus: 'UNPAID',
        });
        const fin = calculateFinancialSummary([cancelledOrder], [], []);
        expect(fin.grossSales).toBe(0);
        expect(fin.collectedRevenue).toBe(0);
        expect(fin.outstandingReceivables).toBe(0);
        expect(fin.cancelledOrdersCount).toBe(1);
      });

      it('correctly aggregates mixed split, non-split, and cancelled orders', () => {
        const nonSplitUnpaid = createTestOrder({
          id: 'ord-7b-mix-1',
          totalAmount: 500,
          status: 'SERVED',
          paymentStatus: 'UNPAID',
        });
        const splitPartiallyPaid = createTestOrder({
          id: 'ord-7b-mix-2',
          totalAmount: 600,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 2,
          paymentStatus: 'PARTIALLY_PAID',
        });
        const sp1: SplitBill = {
          id: 'sp-mix-1',
          orderId: splitPartiallyPaid.id,
          orderNumber: splitPartiallyPaid.orderNumber,
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 285.71,
          discountAmount: 0,
          taxAmount: 14.29,
          totalAmount: 300,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
        };
        const sp2: SplitBill = {
          id: 'sp-mix-2',
          orderId: splitPartiallyPaid.id,
          orderNumber: splitPartiallyPaid.orderNumber,
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 285.71,
          discountAmount: 0,
          taxAmount: 14.29,
          totalAmount: 300,
          paymentStatus: 'UNPAID',
        };
        const fullyPaid = createTestOrder({
          id: 'ord-7b-mix-3',
          totalAmount: 400,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });
        const cancelled = createTestOrder({
          id: 'ord-7b-mix-4',
          totalAmount: 700,
          status: 'CANCELLED',
          paymentStatus: 'UNPAID',
        });

        const fin = calculateFinancialSummary(
          [nonSplitUnpaid, splitPartiallyPaid, fullyPaid, cancelled],
          [sp1, sp2],
          [],
        );

        // Gross sales across valid orders: 500 + 600 + 400 = 1500 (cancelled excluded)
        expect(fin.grossSales).toBe(1500);
        // Collected: 300 (split 1) + 400 (ord 3) = 700
        expect(fin.collectedRevenue).toBe(700);
        // Receivables: 500 (ord 1) + 300 (split 2) = 800 (ord 2 parent total not double-counted; cancelled excluded)
        expect(fin.outstandingReceivables).toBe(800);
        expect(fin.cancelledOrdersCount).toBe(1);
      });
    });

    describe('Task 3 — Net Collections Signed Calculations', () => {
      it('does not clamp legitimate negative period net collections to zero when refunds exceed collections', () => {
        const order = createTestOrder({
          id: 'ord-7b-neg-net',
          totalAmount: 500,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });
        const refund: RefundRecord = {
          id: 'ref-7b-large',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 750, // Partial + Goodwill refund exceeding current collection
          reason: 'Severe food quality complaint voucher refund',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };

        const fin = calculateFinancialSummary([order], [], [refund]);
        expect(fin.collectedRevenue).toBe(500);
        expect(fin.totalRefunds).toBe(750);
        // Signed difference: 500 - 750 = -250 (NOT clamped to 0)
        expect(fin.netCollections).toBe(-250);
        expect(fin.netRevenue).toBe(-250);
      });

      it('produces zero net collections when collections exactly equal completed refunds', () => {
        const order = createTestOrder({
          id: 'ord-7b-zero-net',
          totalAmount: 400,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });
        const refund: RefundRecord = {
          id: 'ref-7b-exact',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 400,
          reason: 'Full order refund',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };

        const fin = calculateFinancialSummary([order], [], [refund]);
        expect(fin.collectedRevenue).toBe(400);
        expect(fin.totalRefunds).toBe(400);
        expect(fin.netCollections).toBe(0);
        expect(fin.netRevenue).toBe(0);
      });

      it('computes positive net collections when collections exceed refunds', () => {
        const order = createTestOrder({
          id: 'ord-7b-pos-net',
          totalAmount: 1000,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });
        const refund: RefundRecord = {
          id: 'ref-7b-partial',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 150,
          reason: 'Returned dessert',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };

        const fin = calculateFinancialSummary([order], [], [refund]);
        expect(fin.collectedRevenue).toBe(1000);
        expect(fin.totalRefunds).toBe(150);
        expect(fin.netCollections).toBe(850);
      });
    });

    describe('Task 4 — Collection Period Attribution & Midnight Boundaries', () => {
      const day1 = computeDateRange('custom', '2026-10-25', '2026-10-25');
      const day2 = computeDateRange('custom', '2026-10-26', '2026-10-26');

      it('attributes order payment to Day 2 settlement timestamp when created before midnight on Day 1', () => {
        const orderAcrossMidnight = createTestOrder({
          id: 'ord-7b-midnight',
          totalAmount: 900,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: new Date(2026, 9, 25, 23, 55, 0).toISOString(), // 5 mins before local midnight
          settledAt: new Date(2026, 9, 26, 0, 5, 0).toISOString(), // 5 mins after local midnight
        });

        // Evaluation for Day 1: Order was placed on Day 1, but payment was not yet collected
        const day1Fin = calculateFinancialSummary([orderAcrossMidnight], [], [], day1);
        expect(day1Fin.grossSales).toBe(900);
        expect(day1Fin.netSales).toBe(900);
        expect(day1Fin.collectedRevenue).toBe(0);
        expect(day1Fin.outstandingReceivables).toBe(900);
        expect(day1Fin.netCollections).toBe(0);

        // Evaluation for Day 2: Payment was collected on Day 2; sales were recognized on Day 1
        const day2Fin = calculateFinancialSummary([orderAcrossMidnight], [], [], day2);
        expect(day2Fin.grossSales).toBe(0); // Not created on Day 2
        expect(day2Fin.netSales).toBe(0);
        expect(day2Fin.collectedRevenue).toBe(900); // Settled on Day 2
        expect(day2Fin.netCollections).toBe(900);
        expect(day2Fin.outstandingReceivables).toBe(0);
      });

      it('attributes split payments to their respective calendar days when splits are settled across midnight', () => {
        const parentOrder = createTestOrder({
          id: 'ord-7b-split-midnight',
          totalAmount: 1000,
          status: 'COMPLETED',
          isSplit: true,
          splitCount: 2,
          paymentStatus: 'PAID',
          createdAt: new Date(2026, 9, 25, 23, 40, 0).toISOString(),
        });
        const split1: SplitBill = {
          id: 'sp-mid-1',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          settledAt: new Date(2026, 9, 25, 23, 50, 0).toISOString(), // Settled on Day 1
        };
        const split2: SplitBill = {
          id: 'sp-mid-2',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 476.19,
          discountAmount: 0,
          taxAmount: 23.81,
          totalAmount: 500,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          settledAt: new Date(2026, 9, 26, 0, 15, 0).toISOString(), // Settled on Day 2
        };

        // Day 1 evaluation
        const day1Fin = calculateFinancialSummary([parentOrder], [split1, split2], [], day1);
        expect(day1Fin.grossSales).toBe(1000);
        expect(day1Fin.collectedRevenue).toBe(500); // Only split 1
        expect(day1Fin.netCollections).toBe(500);

        // Day 2 evaluation
        const day2Fin = calculateFinancialSummary([parentOrder], [split1, split2], [], day2);
        expect(day2Fin.grossSales).toBe(0);
        expect(day2Fin.collectedRevenue).toBe(500); // Split 2 settled on Day 2
        expect(day2Fin.netCollections).toBe(500);
      });

      it('flags legacy records utilizing fallback timestamps with transparency flag', () => {
        const legacyOrder = createTestOrder({
          id: 'ord-7b-legacy',
          totalAmount: 600,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: '2026-10-26T10:00:00Z',
          updatedAt: '2026-10-26T10:30:00Z',
          // No settledAt and no timeline PAID event
          timeline: [],
        });

        const res = getOrderSettlementTimestamp(legacyOrder);
        expect(res.isEstimated).toBe(true);
        expect(res.source).toBe('LEGACY_FALLBACK');
        expect(res.timestamp).toBe(legacyOrder.updatedAt);

        const fin = calculateFinancialSummary([legacyOrder], [], [], day2);
        expect(fin.collectedRevenue).toBe(600);
        expect(fin.hasEstimatedSettlements).toBe(true);
      });
    });

    describe('Task 5 — Gross Sales, Discounts & Net Sales Parity', () => {
      it('calculates gross sales, discounts, and net sales without double-deducting discounts', () => {
        const discountedOrder = createTestOrder({
          id: 'ord-7b-disc',
          subtotal: 1000,
          discountAmount: 200,
          taxAmount: 40,
          totalAmount: 840, // (1000 - 200) + 40 = 840
          status: 'COMPLETED',
          paymentStatus: 'PAID',
        });

        const fin = calculateFinancialSummary([discountedOrder], [], []);
        expect(fin.grossSales).toBe(840); // Billed amount
        expect(fin.grossSalesBeforeDiscounts).toBe(1040); // 840 + 200 = 1040
        expect(fin.totalDiscounts).toBe(200);
        expect(fin.netSales).toBe(840); // Recognized net sales, not 840 - 200
        expect(fin.collectedRevenue).toBe(840);
        expect(fin.netCollections).toBe(840);
      });

      it('maintains parity across order type breakdown for signed collections and receivables', () => {
        const dineIn = createTestOrder({
          id: 'ord-7b-di',
          orderType: 'DINE_IN',
          totalAmount: 500,
          paymentStatus: 'PAID',
        });
        const takeaway = createTestOrder({
          id: 'ord-7b-ta',
          orderType: 'TAKEAWAY',
          totalAmount: 300,
          paymentStatus: 'UNPAID',
        });

        const breakdown = calculateOrderTypeBreakdown([dineIn, takeaway], [], []);
        expect(breakdown.dineIn.collectedRevenue).toBe(500);
        expect(breakdown.dineIn.outstandingReceivables).toBe(0);
        expect(breakdown.takeaway.collectedRevenue).toBe(0);
        expect(breakdown.takeaway.outstandingReceivables).toBe(300);
      });
    });
  });

  describe('Phase 7C — Period Attribution and Refund Reconciliation', () => {
    const day1Date = '2026-10-25';
    const day2Date = '2026-10-26';
    const day1Filter = computeDateRange('custom', day1Date, day1Date);
    const day2Filter = computeDateRange('custom', day2Date, day2Date);

    describe('Task 1 — Separate Period Filters & Dashboard/Reports Parity', () => {
      it('attributes order intake to sales on Day 1 and settlement to collections on Day 2 without duplication', () => {
        const order = createTestOrder({
          id: 'ord-7c-split-period',
          totalAmount: 500,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T11:00:00Z`,
          settledAt: `${day2Date}T14:30:00Z`,
        });

        // Day 1 Daily Report
        const day1Summary = calculateFinancialSummary([order], [], [], day1Filter);
        expect(day1Summary.grossSales).toBe(500);
        expect(day1Summary.netSales).toBe(500);
        expect(day1Summary.collectedRevenue).toBe(0);
        expect(day1Summary.netCollections).toBe(0);
        expect(day1Summary.outstandingReceivables).toBe(500); // Unsettled as of Day 1

        // Day 2 Daily Report
        const day2Summary = calculateFinancialSummary([order], [], [], day2Filter);
        expect(day2Summary.grossSales).toBe(0); // Not created on Day 2
        expect(day2Summary.netSales).toBe(0);
        expect(day2Summary.collectedRevenue).toBe(500); // Settled on Day 2
        expect(day2Summary.netCollections).toBe(500);
        expect(day2Summary.outstandingReceivables).toBe(0);

        // Cross-period non-duplication verification
        const totalSalesAcrossDailyReports = day1Summary.netSales + day2Summary.netSales;
        const totalCollectionsAcrossDailyReports =
          day1Summary.collectedRevenue + day2Summary.collectedRevenue;
        expect(totalSalesAcrossDailyReports).toBe(500);
        expect(totalCollectionsAcrossDailyReports).toBe(500);
      });

      it('preserves exact Dashboard and Reports parity across all metrics for identical selected date ranges', () => {
        const mockService = TestBed.inject(MockDataService);
        const order1 = createTestOrder({
          id: 'ord-7c-parity-1',
          totalAmount: 700,
          discountAmount: 50,
          taxAmount: 35,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
        });
        const order2 = createTestOrder({
          id: 'ord-7c-parity-2',
          totalAmount: 400,
          status: 'SERVED',
          paymentStatus: 'UNPAID',
          createdAt: new Date().toISOString(),
        });
        const refund1: RefundRecord = {
          id: 'ref-7c-parity',
          orderId: order1.id,
          orderNumber: order1.orderNumber,
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 150,
          reason: 'CUSTOMER_DISSATISFACTION',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };

        mockService.orders.set([order1, order2]);
        mockService.refunds.set([refund1]);
        mockService.splitBills.set([]);

        const dashboardFixture = TestBed.createComponent(AdminDashboardComponent);
        const dashboard = dashboardFixture.componentInstance;
        dashboard.selectedTimeframe.set('today');

        const reportsFixture = TestBed.createComponent(ReportsComponent);
        const reports = reportsFixture.componentInstance;
        reports.setPreset('today');

        // Verify 1:1 metric parity between Dashboard and Reports
        expect(dashboard.grossSales()).toBe(reports.grossSales());
        expect(dashboard.netSales()).toBe(reports.netSales());
        expect(dashboard.collectedRevenue()).toBe(reports.collectedRevenue());
        expect(dashboard.totalRefunds()).toBe(reports.totalRefunds());
        expect(dashboard.netRevenue()).toBe(reports.netRevenue());
        expect(dashboard.netCollections()).toBe(reports.netCollections());
        expect(dashboard.outstandingReceivables()).toBe(reports.outstandingReceivables());
        expect(dashboard.fulfilledOrdersCount()).toBe(reports.fulfilledOrdersCount());
        expect(dashboard.avgOrderValue()).toBe(reports.averageOrderValue());
      });
    });

    describe('Task 2 — Split Settlement Timestamp Reliability', () => {
      it('correctly resolves split created on Day 1 and settled on Day 2', () => {
        const split: SplitBill = {
          id: 'sp-7c-1',
          orderId: 'ord-7c-split',
          orderNumber: 'ORD-7C-SPLIT',
          customerName: 'Guest 1',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 300,
          discountAmount: 0,
          taxAmount: 15,
          totalAmount: 315,
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day2Date}T15:00:00Z`,
        };

        const res = getSplitSettlementTimestamp(split);
        expect(res.source).toBe('EXPLICIT_SETTLED_AT');
        expect(res.isEstimated).toBe(false);
        expect(res.timestamp).toBe(split.settledAt);

        // Day 1 Daily Report does not include split settled on Day 2
        const parentOrder = createTestOrder({
          id: 'ord-7c-split',
          isSplit: true,
          totalAmount: 315,
          createdAt: `${day1Date}T10:00:00Z`,
          paymentStatus: 'PAID',
        });
        const day1Fin = calculateFinancialSummary([parentOrder], [split], [], day1Filter);
        expect(day1Fin.collectedRevenue).toBe(0);

        // Day 2 Daily Report includes split settled on Day 2
        const day2Fin = calculateFinancialSummary([parentOrder], [split], [], day2Filter);
        expect(day2Fin.collectedRevenue).toBe(315);
      });

      it('labels legacy paid split without settlement timestamps as estimated and prevents it from silently appearing in daily reports', () => {
        const legacySplit: SplitBill = {
          id: 'sp-7c-legacy',
          orderId: 'ord-7c-leg',
          orderNumber: 'ORD-7C-LEG',
          customerName: 'Guest 1',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 200,
          discountAmount: 0,
          taxAmount: 10,
          totalAmount: 210,
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          // Lacks settledAt
        };

        const res = getSplitSettlementTimestamp(legacySplit);
        expect(res.source).toBe('LEGACY_UNVERIFIED');
        expect(res.isEstimated).toBe(true);
        expect(res.timestamp).toBeNull(); // Do not fabricate settlement dates using createdAt

        const parentOrder = createTestOrder({
          id: 'ord-7c-leg',
          isSplit: true,
          totalAmount: 210,
          createdAt: `${day1Date}T10:00:00Z`,
          paymentStatus: 'PAID',
        });

        // Must NOT silently appear as verified cash flow in Day 1 daily report
        const day1Fin = calculateFinancialSummary([parentOrder], [legacySplit], [], day1Filter);
        expect(day1Fin.collectedRevenue).toBe(0);
        expect(day1Fin.hasEstimatedSettlements).toBe(true);

        // But IS included in all-time total with disclosure flag
        const allTimeFin = calculateFinancialSummary([parentOrder], [legacySplit], []);
        expect(allTimeFin.collectedRevenue).toBe(210);
        expect(allTimeFin.hasEstimatedSettlements).toBe(true);
      });

      it('identifies unpaid split as unsettled with null timestamp and isEstimated false', () => {
        const unpaidSplit: SplitBill = {
          id: 'sp-7c-unpaid',
          orderId: 'ord-7c-unp',
          orderNumber: 'ORD-7C-UNP',
          customerName: 'Guest 1',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 250,
          discountAmount: 0,
          taxAmount: 12.5,
          totalAmount: 262.5,
          paymentStatus: 'UNPAID',
          createdAt: `${day1Date}T10:00:00Z`,
        };

        const res = getSplitSettlementTimestamp(unpaidSplit);
        expect(res.source).toBe('UNSETTLED');
        expect(res.isEstimated).toBe(false);
        expect(res.timestamp).toBeNull();
      });
    });

    describe('Task 3 — Refunds on Cancelled Orders', () => {
      it('handles a paid order that is cancelled and refunded: recognized sales is 0, collections and refunds are preserved', () => {
        const cancelledPaidOrder = createTestOrder({
          id: 'ord-7c-can-ref',
          totalAmount: 500,
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T11:00:00Z`,
        });
        const completedRefund: RefundRecord = {
          id: 'ref-7c-comp',
          orderId: cancelledPaidOrder.id,
          orderNumber: cancelledPaidOrder.orderNumber,
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 500,
          reason: 'ORDER_CANCELLED_POST_PAYMENT',
          status: 'COMPLETED',
          createdAt: `${day1Date}T12:00:00Z`,
        };

        const fin = calculateFinancialSummary(
          [cancelledPaidOrder],
          [],
          [completedRefund],
          day1Filter,
        );
        expect(fin.grossSales).toBe(0); // Cancelled orders excluded from recognized sales
        expect(fin.netSales).toBe(0);
        expect(fin.collectedRevenue).toBe(500); // Money was actually collected
        expect(fin.totalRefunds).toBe(500); // Completed refund outflow
        expect(fin.netCollections).toBe(0); // 500 - 500 = 0
        expect(fin.netRevenue).toBe(0);
        expect(fin.outstandingReceivables).toBe(0);
        expect(fin.completedRefundsCount).toBe(1);
      });

      it('handles a cancelled order without a refund: zero sales, zero collections, zero refunds', () => {
        const cancelledUnpaidOrder = createTestOrder({
          id: 'ord-7c-can-noref',
          totalAmount: 500,
          status: 'CANCELLED',
          paymentStatus: 'UNPAID',
          createdAt: `${day1Date}T10:00:00Z`,
        });

        const fin = calculateFinancialSummary([cancelledUnpaidOrder], [], [], day1Filter);
        expect(fin.grossSales).toBe(0);
        expect(fin.netSales).toBe(0);
        expect(fin.collectedRevenue).toBe(0);
        expect(fin.totalRefunds).toBe(0);
        expect(fin.netCollections).toBe(0);
        expect(fin.outstandingReceivables).toBe(0);
      });

      it('excludes pending refunds from completed outflows', () => {
        const activeOrder = createTestOrder({
          id: 'ord-7c-pend',
          totalAmount: 600,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:30:00Z`,
        });
        const pendingRefund: RefundRecord = {
          id: 'ref-7c-pending',
          orderId: activeOrder.id,
          orderNumber: activeOrder.orderNumber,
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 600,
          reason: 'CUSTOMER_DISSATISFACTION',
          status: 'PENDING',
          createdAt: `${day1Date}T11:00:00Z`,
        };

        const fin = calculateFinancialSummary([activeOrder], [], [pendingRefund], day1Filter);
        expect(fin.grossSales).toBe(600);
        expect(fin.netSales).toBe(600);
        expect(fin.collectedRevenue).toBe(600);
        expect(fin.totalRefunds).toBe(0); // Pending refund request must NOT count as completed outflow
        expect(fin.completedRefundsCount).toBe(0);
        expect(fin.netCollections).toBe(600);
      });

      it('includes a completed refund associated with a non-cancelled order and calculates signed net collections', () => {
        const completedOrder = createTestOrder({
          id: 'ord-7c-noncan',
          totalAmount: 800,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:30:00Z`,
        });
        const partialRefund: RefundRecord = {
          id: 'ref-7c-partial',
          orderId: completedOrder.id,
          orderNumber: completedOrder.orderNumber,
          tableNumber: 'T-01',
          customerName: 'Test Diner',
          refundAmount: 250,
          reason: 'OVERCHARGED_ITEM',
          status: 'COMPLETED',
          createdAt: `${day1Date}T12:00:00Z`,
        };

        const fin = calculateFinancialSummary([completedOrder], [], [partialRefund], day1Filter);
        expect(fin.grossSales).toBe(800);
        expect(fin.netSales).toBe(800);
        expect(fin.collectedRevenue).toBe(800);
        expect(fin.totalRefunds).toBe(250);
        expect(fin.completedRefundsCount).toBe(1);
        expect(fin.netCollections).toBe(550); // 800 - 250 = 550
        expect(fin.netRevenue).toBe(550);
        expect(fin.outstandingReceivables).toBe(0);
      });
    });
  });

  describe('Phase 7D — Financial Data Integrity and Auditability', () => {
    const day1Date = '2026-10-25';
    const day2Date = '2026-10-26';
    const day1Filter = computeDateRange('custom', day1Date, day1Date);
    const day2Filter = computeDateRange('custom', day2Date, day2Date);

    function create7DOrder(overrides: Partial<Order> = {}): Order {
      return createTestOrder({
        createdAt: `${day1Date}T12:00:00Z`,
        settledAt: `${day1Date}T12:30:00Z`,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        timeline: [
          { status: 'CREATED', timestamp: `${day1Date}T12:00:00Z` },
          { status: 'PAID', timestamp: `${day1Date}T12:30:00Z` },
        ],
        ...overrides,
      });
    }

    describe('Task A — Refund Timestamp Semantics and Completion Lifecycle', () => {
      it('correctly attributes refund created on Day 1 and completed on Day 2 to Day 2 outflow', () => {
        const order = create7DOrder({
          id: 'ord-7d-ref-timing',
          totalAmount: 600,
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:30:00Z`,
        });

        const refundRecord: RefundRecord = {
          id: 'ref-7d-cross-day',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: 'Audit Diner',
          refundAmount: 200,
          reason: 'BILLING_ADJUSTMENT',
          status: 'COMPLETED',
          createdAt: `${day1Date}T20:00:00Z`, // Requested on Day 1
          completedAt: `${day2Date}T09:00:00Z`, // Completed on Day 2
        };

        // Day 1 reporting: Outflow must be 0 (refund not completed on Day 1)
        const day1Fin = calculateFinancialSummary([order], [], [refundRecord], day1Filter);
        expect(day1Fin.collectedRevenue).toBe(600);
        expect(day1Fin.totalRefunds).toBe(0);
        expect(day1Fin.completedRefundsCount).toBe(0);
        expect(day1Fin.netCollections).toBe(600);

        // Day 2 reporting: Outflow must be 200 (completed on Day 2)
        const day2Fin = calculateFinancialSummary([order], [], [refundRecord], day2Filter);
        expect(day2Fin.collectedRevenue).toBe(0); // Not collected on Day 2
        expect(day2Fin.totalRefunds).toBe(200);
        expect(day2Fin.completedRefundsCount).toBe(1);
        expect(day2Fin.netCollections).toBe(-200); // 0 - 200 = -200 (signed outflow)
      });

      it('transitions pending refund to completed in MockDataService and assigns completedAt', () => {
        const mockData = TestBed.inject(MockDataService);
        const order = create7DOrder({
          id: 'ord-7d-trans',
          totalAmount: 750,
          paymentStatus: 'PAID',
        });
        mockData.orders.set([order]);

        // 1. Create PENDING refund
        const createRes = mockData.recordRefund({
          orderId: order.id,
          refundAmount: 300,
          reason: 'MANAGER_DISPUTE',
          status: 'PENDING',
        });
        expect(createRes.success).toBe(true);
        const pendingRef = createRes.refund!;
        expect(pendingRef.status).toBe('PENDING');
        expect(pendingRef.completedAt).toBeUndefined();

        // Pending refund must NOT appear in financial outflow
        const pendingFin = calculateFinancialSummary([order], [], mockData.refunds());
        expect(pendingFin.totalRefunds).toBe(0);
        expect(pendingFin.completedRefundsCount).toBe(0);

        // 2. Transition to COMPLETED
        const updateRes = mockData.updateRefundStatus(pendingRef.id, 'COMPLETED');
        expect(updateRes.success).toBe(true);
        const completedRef = updateRes.refund!;
        expect(completedRef.status).toBe('COMPLETED');
        expect(completedRef.completedAt).toBeDefined();

        // Authoritative completion timestamp helper
        expect(getRefundCompletionTimestamp(completedRef)).toBe(completedRef.completedAt);

        // Financial summary now reflects completed outflow
        const completedFin = calculateFinancialSummary([order], [], mockData.refunds());
        expect(completedFin.totalRefunds).toBe(300);
        expect(completedFin.completedRefundsCount).toBe(1);
        expect(completedFin.netCollections).toBe(450); // 750 - 300
      });

      it('cancels a refund request without producing any cash outflow', () => {
        const mockData = TestBed.inject(MockDataService);
        const order = create7DOrder({
          id: 'ord-7d-canc-ref',
          totalAmount: 400,
        });
        mockData.orders.set([order]);

        const createRes = mockData.recordRefund({
          orderId: order.id,
          refundAmount: 150,
          reason: 'ACCIDENTAL_REQUEST',
          status: 'PENDING',
        });
        const refId = createRes.refund!.id;

        const cancelRes = mockData.updateRefundStatus(refId, 'CANCELLED');
        expect(cancelRes.success).toBe(true);
        expect(cancelRes.refund!.status).toBe('CANCELLED');
        expect(cancelRes.refund!.completedAt).toBeUndefined();
        expect(getRefundCompletionTimestamp(cancelRes.refund!)).toBeNull();

        const fin = calculateFinancialSummary([order], [], mockData.refunds());
        expect(fin.totalRefunds).toBe(0);
        expect(fin.completedRefundsCount).toBe(0);
        expect(fin.netCollections).toBe(400);
      });

      it('preserves refund outflow against a cancelled order while keeping recognized sales at 0', () => {
        const cancelledPaidOrder = create7DOrder({
          id: 'ord-7d-canc-order',
          totalAmount: 1000,
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          createdAt: `${day1Date}T11:00:00Z`,
          settledAt: `${day1Date}T11:30:00Z`,
        });

        const fullRefund: RefundRecord = {
          id: 'ref-7d-full',
          orderId: cancelledPaidOrder.id,
          orderNumber: cancelledPaidOrder.orderNumber,
          customerName: 'Audit Diner',
          refundAmount: 1000,
          reason: 'ORDER_CANCELLED_POST_PAYMENT',
          status: 'COMPLETED',
          createdAt: `${day1Date}T12:00:00Z`,
          completedAt: `${day1Date}T12:00:00Z`,
        };

        const fin = calculateFinancialSummary([cancelledPaidOrder], [], [fullRefund], day1Filter);
        expect(fin.grossSales).toBe(0); // Cancelled order recognizes 0 sales
        expect(fin.netSales).toBe(0);
        expect(fin.collectedRevenue).toBe(1000); // Money collected historically
        expect(fin.totalRefunds).toBe(1000); // Outflow accurately tracked
        expect(fin.netCollections).toBe(0); // 1000 - 1000 = 0
        expect(fin.cancelledOrdersCount).toBe(1);
        expect(fin.completedRefundsCount).toBe(1);
      });
    });

    describe('Task B — Transparent Disclosure of Legacy Settlements', () => {
      it('never substitutes parent order timestamp for an individual split payment lacking settledAt', () => {
        const parentOrder = create7DOrder({
          id: 'ord-7d-split-parent',
          isSplit: true,
          totalAmount: 500,
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:30:00Z`,
        });

        const legacySplit: SplitBill = {
          id: 'sp-7d-legacy',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          customerName: 'Split Guest 1',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 250,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 250,
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          // Intentionally lacks settledAt
        };

        // Resolution must NOT silently substitute parentOrder.settledAt
        const res = getSplitSettlementTimestamp(legacySplit, parentOrder);
        expect(res.source).toBe('LEGACY_UNVERIFIED');
        expect(res.isEstimated).toBe(true);
        expect(res.timestamp).toBeNull();

        // Must be excluded from date-specific collections
        const day1Fin = calculateFinancialSummary([parentOrder], [legacySplit], [], day1Filter);
        expect(day1Fin.collectedRevenue).toBe(0);
        expect(day1Fin.hasEstimatedSettlements).toBe(true);

        // But included in all-time total with transparency flag
        const allTimeFin = calculateFinancialSummary([parentOrder], [legacySplit], []);
        expect(allTimeFin.collectedRevenue).toBe(250);
        expect(allTimeFin.hasEstimatedSettlements).toBe(true);
      });

      it('surfaces hasEstimatedSettlements disclosure on Dashboard and Reports components', () => {
        const parentOrder = create7DOrder({
          id: 'ord-7d-disc-parent',
          isSplit: true,
          totalAmount: 300,
        });

        const legacySplit: SplitBill = {
          id: 'sp-7d-disc-split',
          orderId: parentOrder.id,
          orderNumber: parentOrder.orderNumber,
          customerName: 'Guest Legacy',
          splitIndex: 1,
          splitTotalCount: 1,
          splitType: 'EQUAL',
          subtotal: 300,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 300,
          paymentStatus: 'PAID',
          createdAt: `${day1Date}T10:00:00Z`,
          // Lacks settledAt
        };

        const mockData = TestBed.inject(MockDataService);
        mockData.orders.set([parentOrder]);
        mockData.splitBills.set([legacySplit]);
        mockData.refunds.set([]);

        const dashboardFixture = TestBed.createComponent(AdminDashboardComponent);
        const dashboard = dashboardFixture.componentInstance;
        dashboard.selectedTimeframe.set('all');
        expect(dashboard.hasEstimatedSettlements()).toBe(true);

        const reportsFixture = TestBed.createComponent(ReportsComponent);
        const reports = reportsFixture.componentInstance;
        reports.setPreset('all');
        expect(reports.hasEstimatedSettlements()).toBe(true);
      });
    });

    describe('Task C — Reconcile Financial Metrics Across Periods (Invariants 1-8)', () => {
      it('Invariant 1: Order created in period 1 and paid in period 2 contributes sales to P1 and collections to P2', () => {
        const crossPeriodOrder = create7DOrder({
          id: 'ord-7d-inv1',
          totalAmount: 700,
          createdAt: `${day1Date}T15:00:00Z`,
          settledAt: `${day2Date}T10:00:00Z`,
          timeline: [
            { status: 'CREATED', timestamp: `${day1Date}T15:00:00Z` },
            { status: 'PAID', timestamp: `${day2Date}T10:00:00Z` },
          ],
        });

        // Day 1: Sales recognized, 0 collections, 700 receivables
        const day1 = calculateFinancialSummary([crossPeriodOrder], [], [], day1Filter);
        expect(day1.grossSales).toBe(700);
        expect(day1.netSales).toBe(700);
        expect(day1.collectedRevenue).toBe(0);
        expect(day1.outstandingReceivables).toBe(700);

        // Day 2: 0 sales, 700 collections, 0 receivables
        const day2 = calculateFinancialSummary([crossPeriodOrder], [], [], day2Filter);
        expect(day2.grossSales).toBe(0);
        expect(day2.netSales).toBe(0);
        expect(day2.collectedRevenue).toBe(700);
        expect(day2.outstandingReceivables).toBe(0);
      });

      it('Invariant 2: Refund completed in later period reduces collections in refund period, not retroactively', () => {
        const order = create7DOrder({
          id: 'ord-7d-inv2',
          totalAmount: 1200,
          createdAt: `${day1Date}T12:00:00Z`,
          settledAt: `${day1Date}T12:30:00Z`,
        });

        const refund: RefundRecord = {
          id: 'ref-7d-inv2',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 400,
          reason: 'LATE_COMPLAINT',
          status: 'COMPLETED',
          createdAt: `${day2Date}T14:00:00Z`,
          completedAt: `${day2Date}T14:00:00Z`,
        };

        // Day 1: Original collection of 1200 intact
        const day1 = calculateFinancialSummary([order], [], [refund], day1Filter);
        expect(day1.collectedRevenue).toBe(1200);
        expect(day1.totalRefunds).toBe(0);
        expect(day1.netCollections).toBe(1200);

        // Day 2: Outflow applied in refund period
        const day2 = calculateFinancialSummary([order], [], [refund], day2Filter);
        expect(day2.collectedRevenue).toBe(0);
        expect(day2.totalRefunds).toBe(400);
        expect(day2.netCollections).toBe(-400);
      });

      it('Invariant 3: Cancelling an order does not erase historical money collected or refunded', () => {
        const cancelledOrder = create7DOrder({
          id: 'ord-7d-inv3',
          totalAmount: 900,
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:15:00Z`,
        });
        const refund: RefundRecord = {
          id: 'ref-7d-inv3',
          orderId: cancelledOrder.id,
          orderNumber: cancelledOrder.orderNumber,
          customerName: cancelledOrder.customerName,
          refundAmount: 900,
          reason: 'GUEST_LEFT',
          status: 'COMPLETED',
          createdAt: `${day1Date}T10:30:00Z`,
          completedAt: `${day1Date}T10:30:00Z`,
        };

        const fin = calculateFinancialSummary([cancelledOrder], [], [refund], day1Filter);
        expect(fin.grossSales).toBe(0);
        expect(fin.collectedRevenue).toBe(900);
        expect(fin.totalRefunds).toBe(900);
        expect(fin.netCollections).toBe(0);
      });

      it('Invariant 4: Split-bill parent and child records do not double-count sales, collections, or receivables', () => {
        const parent = create7DOrder({
          id: 'ord-7d-inv4',
          isSplit: true,
          totalAmount: 1000,
          createdAt: `${day1Date}T12:00:00Z`,
          paymentStatus: 'PARTIALLY_PAID',
        });
        const split1: SplitBill = {
          id: 'sp-7d-inv4-1',
          orderId: parent.id,
          orderNumber: parent.orderNumber,
          customerName: 'Guest A',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 500,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 500,
          paymentStatus: 'PAID',
          settledAt: `${day1Date}T12:15:00Z`,
          createdAt: `${day1Date}T12:00:00Z`,
        };
        const split2: SplitBill = {
          id: 'sp-7d-inv4-2',
          orderId: parent.id,
          orderNumber: parent.orderNumber,
          customerName: 'Guest B',
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 500,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 500,
          paymentStatus: 'UNPAID',
          createdAt: `${day1Date}T12:00:00Z`,
        };

        const fin = calculateFinancialSummary([parent], [split1, split2], [], day1Filter);
        expect(fin.grossSales).toBe(1000); // Counted once from parent
        expect(fin.collectedRevenue).toBe(500); // Only settled split 1 counted
        expect(fin.outstandingReceivables).toBe(500); // Only unpaid split 2 counted (not parent + split)
        expect(fin.netCollections).toBe(500);
      });

      it('Invariant 6: Dashboard and Reports produce identical figures for equivalent filters and data', () => {
        const order1 = create7DOrder({
          id: 'ord-7d-p1',
          totalAmount: 600,
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:30:00Z`,
        });
        const order2 = create7DOrder({
          id: 'ord-7d-p2',
          totalAmount: 400,
          createdAt: `${day1Date}T14:00:00Z`,
          settledAt: `${day1Date}T14:30:00Z`,
        });

        const mockData = TestBed.inject(MockDataService);
        mockData.orders.set([order1, order2]);
        mockData.splitBills.set([]);
        mockData.refunds.set([]);

        const dashboardFixture = TestBed.createComponent(AdminDashboardComponent);
        const dashboard = dashboardFixture.componentInstance;
        dashboard.selectedTimeframe.set('all');

        const reportsFixture = TestBed.createComponent(ReportsComponent);
        const reports = reportsFixture.componentInstance;
        reports.setPreset('all');

        expect(dashboard.financialSummary().grossSales).toBe(reports.financialSummary().grossSales);
        expect(dashboard.financialSummary().collectedRevenue).toBe(
          reports.financialSummary().collectedRevenue,
        );
        expect(dashboard.financialSummary().netCollections).toBe(
          reports.financialSummary().netCollections,
        );
        expect(dashboard.financialSummary().outstandingReceivables).toBe(
          reports.financialSummary().outstandingReceivables,
        );
      });

      it('Invariant 7 & 8: Paise arithmetic precision preserves rounding and signed negative collections', () => {
        const order = create7DOrder({
          id: 'ord-7d-paise',
          totalAmount: 100.33,
          createdAt: `${day1Date}T10:00:00Z`,
          settledAt: `${day1Date}T10:10:00Z`,
        });
        const largeRefund: RefundRecord = {
          id: 'ref-7d-paise',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 250.66,
          reason: 'GOODWILL_COMPENSATION',
          status: 'COMPLETED',
          createdAt: `${day1Date}T11:00:00Z`,
          completedAt: `${day1Date}T11:00:00Z`,
        };

        const fin = calculateFinancialSummary([order], [], [largeRefund], day1Filter);
        expect(fin.collectedRevenue).toBe(100.33);
        expect(fin.totalRefunds).toBe(250.66);
        // Signed difference: 100.33 - 250.66 = -150.33 (not clamped to 0)
        expect(fin.netCollections).toBe(-150.33);
        expect(fin.netRevenue).toBe(-150.33);
      });
    });

    describe('Task D — Audit Data Integrity and Idempotency', () => {
      it('guarantees idempotency when duplicate orders, splits, or refunds are passed to financial summary', () => {
        const order = create7DOrder({ id: 'ord-7d-dup', totalAmount: 500 });
        const split: SplitBill = {
          id: 'sp-7d-dup',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: 'Guest',
          splitIndex: 1,
          splitTotalCount: 1,
          splitType: 'EQUAL',
          subtotal: 500,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 500,
          paymentStatus: 'PAID',
          settledAt: `${day1Date}T12:00:00Z`,
          createdAt: `${day1Date}T12:00:00Z`,
        };
        const refund: RefundRecord = {
          id: 'ref-7d-dup',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmount: 100,
          reason: 'DISCOUNT_REVERSAL',
          status: 'COMPLETED',
          createdAt: `${day1Date}T13:00:00Z`,
          completedAt: `${day1Date}T13:00:00Z`,
        };

        const singleFin = calculateFinancialSummary([order], [split], [refund]);
        // Duplicate every record 3 times
        const dupFin = calculateFinancialSummary(
          [order, order, order],
          [split, split, split],
          [refund, refund, refund],
        );

        expect(dupFin.grossSales).toBe(singleFin.grossSales);
        expect(dupFin.collectedRevenue).toBe(singleFin.collectedRevenue);
        expect(dupFin.totalRefunds).toBe(singleFin.totalRefunds);
        expect(dupFin.netCollections).toBe(singleFin.netCollections);
        expect(dupFin.completedRefundsCount).toBe(1);
      });

      it('prevents settling an already settled or refunded split bill', () => {
        const mockData = TestBed.inject(MockDataService);
        const order = create7DOrder({ id: 'ord-7d-split-sec', isSplit: true });
        const splitPaid: SplitBill = {
          id: 'sp-7d-sec-paid',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: 'Guest 1',
          splitIndex: 1,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 250,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 250,
          paymentStatus: 'PAID',
          settledAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const splitRefunded: SplitBill = {
          id: 'sp-7d-sec-ref',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: 'Guest 2',
          splitIndex: 2,
          splitTotalCount: 2,
          splitType: 'EQUAL',
          subtotal: 250,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 250,
          paymentStatus: 'REFUNDED',
          settledAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };

        mockData.orders.set([order]);
        mockData.splitBills.set([splitPaid, splitRefunded]);

        // Attempting to re-settle paid split bill
        const resPaid = mockData.settleSplitBill({
          orderId: order.id,
          splitBillId: splitPaid.id,
          paymentMethod: 'CASH',
        });
        expect(resPaid.success).toBe(false);
        expect(resPaid.error).toBe('This split bill is already settled');

        // Attempting to settle refunded split bill
        const resRefunded = mockData.settleSplitBill({
          orderId: order.id,
          splitBillId: splitRefunded.id,
          paymentMethod: 'CASH',
        });
        expect(resRefunded.success).toBe(false);
        expect(resRefunded.error).toBe('Cannot settle a refunded split bill');
      });

      it('safely rejects invalid or missing timestamps in isTimestampInRange even when preset is all', () => {
        const allRange = computeDateRange('all');
        expect(isTimestampInRange(null, allRange)).toBe(false);
        expect(isTimestampInRange(undefined, allRange)).toBe(false);
        expect(isTimestampInRange('', allRange)).toBe(false);
        expect(isTimestampInRange('not-a-valid-date', allRange)).toBe(false);
      });

      it('safely handles non-numeric or NaN values in financial calculations without throwing', () => {
        const malformedOrder = create7DOrder({
          id: 'ord-7d-malformed',
          totalAmount: NaN as unknown as number,
          discountAmount: 'invalid' as unknown as number,
          taxAmount: null as unknown as number,
        });
        const malformedRefund: RefundRecord = {
          id: 'ref-7d-malformed',
          orderId: malformedOrder.id,
          orderNumber: malformedOrder.orderNumber,
          customerName: malformedOrder.customerName,
          refundAmount: undefined as unknown as number,
          reason: 'MALFORMED',
          status: 'COMPLETED',
          createdAt: `${day1Date}T12:00:00Z`,
          completedAt: `${day1Date}T12:00:00Z`,
        };

        const fin = calculateFinancialSummary([malformedOrder], [], [malformedRefund]);
        expect(isNaN(fin.grossSales)).toBe(false);
        expect(isNaN(fin.netSales)).toBe(false);
        expect(isNaN(fin.collectedRevenue)).toBe(false);
        expect(isNaN(fin.totalRefunds)).toBe(false);
        expect(isNaN(fin.netCollections)).toBe(false);
        expect(fin.grossSales).toBe(0);
        expect(fin.totalRefunds).toBe(0);
      });
    });
  });
});
