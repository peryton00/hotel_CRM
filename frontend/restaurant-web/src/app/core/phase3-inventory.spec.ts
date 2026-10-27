import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MockDataService } from '../data-access/mock/mock-data.service';
import { Order, OrderItem } from './models/order.model';
import {
  Ingredient,
  Recipe,
  RecipeItem,
  StockMovement,
  roundStock,
  convertUnit,
  areUnitsCompatible,
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

function createMockOrder(orderId: string, orderNumber: string, items: OrderItem[]): Order {
  const subtotal = items.reduce((sum, it) => sum + it.itemTotal, 0);
  const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
  return {
    id: orderId,
    orderNumber,
    restaurantSlug: 'gurukripa-dhaba',
    tableId: 'tbl-01',
    tableNumber: 'T-01',
    customerName: 'Aarav Mehta',
    customerPhone: '+91 98765 11111',
    items,
    subtotal,
    discountAmount: 0,
    taxAmount,
    cgstAmount: taxAmount / 2,
    sgstAmount: taxAmount / 2,
    totalAmount: subtotal + taxAmount,
    status: 'ACCEPTED',
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [{ status: 'ACCEPTED', timestamp: new Date().toISOString(), note: 'Order accepted' }],
  };
}

describe('Phase 3 — Inventory, Recipe Management, and Stock Control', () => {
  let mock: MockDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [MockDataService, provideHttpClient()],
    });
    mock = TestBed.inject(MockDataService);
  });

  describe('1. Unit Conversion and Arithmetic Integrity', () => {
    it('correctly verifies unit compatibility within physical domains', () => {
      // Mass domain
      expect(areUnitsCompatible('g', 'kg')).toBe(true);
      expect(areUnitsCompatible('kg', 'g')).toBe(true);
      expect(areUnitsCompatible('kg', 'kg')).toBe(true);

      // Volume domain
      expect(areUnitsCompatible('ml', 'l')).toBe(true);
      expect(areUnitsCompatible('l', 'ml')).toBe(true);

      // Discrete domain
      expect(areUnitsCompatible('pcs', 'pcs')).toBe(true);

      // Incompatible cross-domain units
      expect(areUnitsCompatible('kg', 'ml')).toBe(false);
      expect(areUnitsCompatible('g', 'l')).toBe(false);
      expect(areUnitsCompatible('pcs', 'kg')).toBe(false);
      expect(areUnitsCompatible('pcs', 'l')).toBe(false);
    });

    it('converts compatible mass and volume units accurately without float drift', () => {
      expect(convertUnit(1.5, 'kg', 'g')).toBe(1500);
      expect(convertUnit(250, 'g', 'kg')).toBe(0.25);
      expect(convertUnit(2.75, 'l', 'ml')).toBe(2750);
      expect(convertUnit(500, 'ml', 'l')).toBe(0.5);
      expect(convertUnit(12, 'pcs', 'pcs')).toBe(12);
    });

    it('rejects incompatible unit conversions with explicit descriptive errors', () => {
      expect(() => convertUnit(5, 'kg', 'ml')).toThrowError(
        /Incompatible measurement units: cannot convert from 'kg' to 'ml'/,
      );
      expect(() => convertUnit(2, 'l', 'g')).toThrowError(
        /Incompatible measurement units: cannot convert from 'l' to 'g'/,
      );
      expect(() => convertUnit(10, 'pcs', 'kg')).toThrowError(
        /Incompatible measurement units: cannot convert from 'pcs' to 'kg'/,
      );
    });

    it('prevents floating point drift using decimal-safe roundStock', () => {
      const sum = 0.1 + 0.2; // Native JS is 0.30000000000000004
      expect(roundStock(sum, 3)).toBe(0.3);
      expect(roundStock(10.123456, 2)).toBe(10.12);
      expect(roundStock(10.123456, 3)).toBe(10.123);
    });
  });

  describe('2. Ingredient Lifecycle and Auditable Ledger', () => {
    it('creates an ingredient and records an OPENING_STOCK movement', () => {
      const ing = mock.createIngredient({
        name: 'Organic Cashew Nuts',
        description: 'W320 Grade Cashews',
        category: 'GRAINS',
        currentStock: 10.0,
        unit: 'kg',
        minThreshold: 2.5,
        targetStock: 20.0,
        costPerUnit: 850,
        costUnit: 'kg',
        supplierName: 'Goa Cashew Traders',
        isActive: true,
      });

      expect(ing.id).toBeDefined();
      expect(ing.name).toBe('Organic Cashew Nuts');
      expect(ing.currentStock).toBe(10.0);

      const movements = mock.stockMovements().filter((m) => m.ingredientId === ing.id);
      expect(movements.length).toBe(1);
      expect(movements[0].type).toBe('OPENING_STOCK');
      expect(movements[0].quantityBefore).toBe(0);
      expect(movements[0].quantityAfter).toBe(10.0);
      expect(movements[0].quantityDelta).toBe(10.0);
    });

    it('updates an ingredient and persists modifications', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(ing).toBeDefined();

      const updated = mock.updateIngredient(ing.id, {
        minThreshold: 4.5,
        supplierName: 'Verka Premium Coop',
      });

      expect(updated.minThreshold).toBe(4.5);
      expect(updated.supplierName).toBe('Verka Premium Coop');
      const inStore = mock.ingredients().find((i) => i.id === ing.id)!;
      expect(inStore.minThreshold).toBe(4.5);
    });

    it('records a restock operation with before/after quantity tracking', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-01')!; // Basmati Rice 25kg
      const beforeStock = ing.currentStock;

      const res = mock.adjustStock({
        ingredientId: ing.id,
        delta: 15.0,
        type: 'RESTOCK',
        reason: 'Shipment PO-4412 from Mandi',
        staffName: 'Ramesh (Storekeeper)',
      });

      expect(res.success).toBe(true);
      expect(res.movement).toBeDefined();
      expect(res.movement?.quantityBefore).toBe(beforeStock);
      expect(res.movement?.quantityAfter).toBe(beforeStock + 15.0);
      expect(res.movement?.quantityDelta).toBe(15.0);
      expect(res.movement?.type).toBe('RESTOCK');

      const updatedIng = mock.ingredients().find((i) => i.id === ing.id)!;
      expect(updatedIng.currentStock).toBe(beforeStock + 15.0);
    });

    it('records kitchen wastage and maintains ledger audit trail', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-06')!; // Heavy Cream 10L
      const beforeStock = ing.currentStock;

      const res = mock.adjustStock({
        ingredientId: ing.id,
        delta: -1.5,
        type: 'WASTAGE',
        reason: 'Expired cream batch discarded',
        staffName: 'Chef De Cuisine',
      });

      expect(res.success).toBe(true);
      expect(res.movement?.type).toBe('WASTAGE');
      expect(res.movement?.quantityDelta).toBe(-1.5);
      expect(res.movement?.quantityBefore).toBe(beforeStock);
      expect(res.movement?.quantityAfter).toBe(roundStock(beforeStock - 1.5));
    });

    it('prohibits negative stock for ordinary manual adjustments', () => {
      const ing = mock.ingredients().find((i) => i.id === 'ing-05')!; // Butter 5kg
      const res = mock.adjustStock({
        ingredientId: ing.id,
        delta: -10.0, // Exceeds available stock (5kg)
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Manual adjustment error',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/negative stock/i);
      // Stock should remain unchanged
      const current = mock.ingredients().find((i) => i.id === ing.id)!;
      expect(current.currentStock).toBe(ing.currentStock);
    });
  });

  describe('3. Recipe Formulation and Costing', () => {
    it('creates a recipe and calculates indicative portion cost accurately', () => {
      // Dish: item-001 (Dahi Ke Kebab)
      const res = mock.createRecipe({
        menuItemId: 'item-001',
        menuItemName: 'Dahi Ke Kebab',
        items: [
          { ingredientId: 'ing-02', quantity: 0.2, unit: 'kg' }, // 200g Paneer @ 340/kg = 68 INR
          { ingredientId: 'ing-10', quantity: 0.01, unit: 'kg' }, // 10g Garam Masala @ 950/kg = 9.5 INR
          { ingredientId: 'ing-12', quantity: 0.015, unit: 'l' }, // 15ml Mustard Oil @ 175/l = 2.625 INR
        ],
        instructions: 'Hang curd, blend spices and pan-sear with mustard oil.',
        isActive: true,
      });

      expect(res.success).toBe(true);
      expect(res.recipe).toBeDefined();
      expect(res.recipe?.version).toBe(1);
      // 68 + 9.5 + 2.625 = 80.125 -> 80.13 INR
      expect(res.recipe?.indicativeCost).toBeCloseTo(80.13, 1);
    });

    it('rejects recipes with duplicate ingredients', () => {
      const res = mock.createRecipe({
        menuItemId: 'item-002',
        menuItemName: 'Kurkuri Nadru',
        items: [
          { ingredientId: 'ing-08', quantity: 0.1, unit: 'kg' },
          { ingredientId: 'ing-08', quantity: 0.05, unit: 'kg' }, // Duplicate
        ],
        isActive: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/duplicate ingredients/i);
    });

    it('rejects recipes with zero or negative quantities', () => {
      const res = mock.createRecipe({
        menuItemId: 'item-002',
        menuItemName: 'Kurkuri Nadru',
        items: [{ ingredientId: 'ing-08', quantity: 0, unit: 'kg' }],
        isActive: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/greater than 0/i);
    });

    it('rejects recipe items with incompatible measurement units', () => {
      const res = mock.createRecipe({
        menuItemId: 'item-002',
        menuItemName: 'Kurkuri Nadru',
        items: [
          { ingredientId: 'ing-08', quantity: 2, unit: 'l' }, // Onions are in kg, not l
        ],
        isActive: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/incompatible/i);
    });

    it('updates recipe versioning and recalculates indicative cost', () => {
      const rec = mock.recipes().find((r) => r.id === 'rec-005')!; // Paneer Tikka
      const oldVer = rec.version;

      const updateRes = mock.updateRecipe(rec.id, {
        items: [
          { ingredientId: 'ing-02', quantity: 0.3, unit: 'kg' }, // Increased paneer to 300g
        ],
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.recipe?.version).toBe(oldVer + 1);
      // 0.3 * 340 = 102 INR
      expect(updateRes.recipe?.indicativeCost).toBe(102);
    });
  });

  describe('4. Order Lifecycle Integration and Stock Consumption', () => {
    it('consumes stock exactly once when order reaches SERVED or COMPLETED', () => {
      // Dish item-005 has recipe rec-005: 0.25kg paneer (ing-02), 0.05l cream (ing-06), etc.
      const paneer = mock.ingredients().find((i) => i.id === 'ing-02')!;
      const beforePaneerStock = paneer.currentStock;

      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2); // 2 servings
      const order = createMockOrder('ord-test-consume-1', '#ORD-801', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      // Call stock consumption
      const res = mock.consumeStockForOrder(order.id);
      expect(res.success).toBe(true);
      expect(res.movements?.length).toBeGreaterThan(0);

      // 2 portions * 0.25kg = 0.5kg paneer deducted
      const updatedPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(updatedPaneer.currentStock).toBe(roundStock(beforePaneerStock - 0.5));

      const consumptionMov = res.movements?.find((m) => m.ingredientId === 'ing-02');
      expect(consumptionMov).toBeDefined();
      expect(consumptionMov?.quantityDelta).toBe(-0.5);
      expect(consumptionMov?.type).toBe('RECIPE_CONSUMPTION');
      expect(consumptionMov?.referenceId).toBe(order.id);
    });

    it('enforces idempotency: repeated consumption calls do NOT duplicate deductions', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1);
      const order = createMockOrder('ord-test-idem-1', '#ORD-802', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      // First run
      const firstRun = mock.consumeStockForOrder(order.id);
      expect(firstRun.success).toBe(true);
      expect(firstRun.alreadyConsumed).toBeFalsy();

      const paneerAfterFirst = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      // Second run (simulating duplicate webhook / repeated order status update)
      const secondRun = mock.consumeStockForOrder(order.id);
      expect(secondRun.success).toBe(true);
      expect(secondRun.alreadyConsumed).toBe(true);

      const paneerAfterSecond = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(paneerAfterSecond).toBe(paneerAfterFirst); // No second deduction
    });

    it('handles orders with untracked menu items gracefully without deducting stock', () => {
      // Dish item-004 has no seeded recipe in default dataset
      const orderItem = createMockOrderItem('item-004', 'Bhatti Ka Galouti Kebab', 3);
      const order = createMockOrder('ord-test-untracked', '#ORD-803', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      const initialMovementsCount = mock.stockMovements().length;
      const res = mock.consumeStockForOrder(order.id);

      expect(res.success).toBe(true);
      expect(res.movements?.length).toBe(0);
      expect(mock.stockMovements().length).toBe(initialMovementsCount);
    });

    it('rejects consumption and leaves stock untouched if required ingredients are insufficient', () => {
      // Artificially lower paneer stock to 0.1 kg
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -(mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock - 0.1),
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Prepare test shortage',
      });

      const paneer = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(paneer.currentStock).toBe(0.1);

      // Order demands 2 servings = 0.5 kg (exceeds 0.1 kg)
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 2);
      const order = createMockOrder('ord-test-shortage', '#ORD-804', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      const res = mock.consumeStockForOrder(order.id);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/insufficient stock/i);

      // Verify paneer stock was NOT deducted
      const paneerAfter = mock.ingredients().find((i) => i.id === 'ing-02')!;
      expect(paneerAfter.currentStock).toBe(0.1);
    });

    it('does not automatically restore stock when an order is cancelled after consumption', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1);
      const order = createMockOrder('ord-test-cancel-after', '#ORD-805', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      // Order is served -> stock consumed
      mock.consumeStockForOrder(order.id);
      const stockAfterConsumption = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;

      // Update status to CANCELLED
      const updatedOrders = mock
        .orders()
        .map((o) => (o.id === order.id ? { ...o, status: 'CANCELLED' as const } : o));
      mock.orders.set(updatedOrders);

      // Verify stock was NOT silently restored (policy requires explicit reversal or wastage decision)
      const stockAfterCancel = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterCancel).toBe(stockAfterConsumption);
    });

    it('reverses stock consumption when an auditable reversal action is explicitly triggered', () => {
      const orderItem = createMockOrderItem('item-005', 'Paneer Tikka Angara', 1);
      const order = createMockOrder('ord-test-reversal', '#ORD-806', [orderItem]);
      mock.orders.set([order, ...mock.orders()]);

      const stockBefore = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.consumeStockForOrder(order.id);
      const stockAfterConsumption = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterConsumption).toBeLessThan(stockBefore);

      // Perform explicit reversal
      const revRes = mock.reverseOrderStockConsumption(
        order.id,
        'Customer rejected dish; returned to kitchen',
      );
      expect(revRes.success).toBe(true);

      const stockAfterReversal = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      expect(stockAfterReversal).toBe(stockBefore);

      const reversalMov = mock
        .stockMovements()
        .find((m) => m.referenceId === order.id && m.type === 'REVERSAL');
      expect(reversalMov).toBeDefined();
      expect(reversalMov?.quantityDelta).toBeGreaterThan(0);
    });
  });

  describe('5. Menu Availability and Producibility Integration', () => {
    it('marks a dish as AVAILABLE when all required recipe ingredients are abundant', () => {
      const check = mock.checkMenuItemAvailability('item-005'); // Paneer Tikka
      expect(check.status).toBe('AVAILABLE');
      expect(check.produciblePortions).toBeGreaterThan(5);
      expect(check.missingIngredients.length).toBe(0);
    });

    it('marks a dish as LOW_STOCK when producible portions drop below the safety threshold', () => {
      // Lower paneer stock so that only 3 portions can be produced (0.75 kg)
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -(currentPaneer - 0.75),
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Simulate low stock',
      });

      const check = mock.checkMenuItemAvailability('item-005');
      expect(check.status).toBe('LOW_STOCK');
      expect(check.produciblePortions).toBe(3);
    });

    it('marks a dish as OUT_OF_STOCK when any required ingredient is depleted to 0', () => {
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -currentPaneer,
        type: 'WASTAGE',
        reason: 'Entire paneer batch spoiled',
      });

      const check = mock.checkMenuItemAvailability('item-005');
      expect(check.status).toBe('OUT_OF_STOCK');
      expect(check.produciblePortions).toBe(0);
      expect(check.missingIngredients).toContain('Fresh Malai Paneer');
    });

    it('correctly distinguishes UNTRACKED dishes from OUT_OF_STOCK dishes', () => {
      // item-004 has no recipe
      const check = mock.checkMenuItemAvailability('item-004');
      expect(check.status).toBe('UNTRACKED');
      expect(check.produciblePortions).toBe(999);
      expect(mock.getMenuItemAvailability('item-004')).toBe('UNTRACKED');
    });

    it('restocking an out-of-stock ingredient immediately restores dish availability', () => {
      // Zero out paneer
      const currentPaneer = mock.ingredients().find((i) => i.id === 'ing-02')!.currentStock;
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: -currentPaneer,
        type: 'MANUAL_ADJUSTMENT',
        reason: 'Zero out for test',
      });
      expect(mock.getMenuItemAvailability('item-005')).toBe('OUT_OF_STOCK');

      // Restock 10kg
      mock.adjustStock({
        ingredientId: 'ing-02',
        delta: 10.0,
        type: 'RESTOCK',
        reason: 'Fresh shipment received',
      });

      expect(mock.getMenuItemAvailability('item-005')).toBe('AVAILABLE');
    });
  });

  describe('6. Valuation, Reporting, and Persistence Resilience', () => {
    it('computes inventory valuation summary accurately', () => {
      const summary = mock.getInventoryValuationSummary();
      expect(summary.totalTracked).toBeGreaterThan(0);
      expect(summary.estimatedValue).toBeGreaterThan(0);
      expect(summary.totalWastageCost).toBeGreaterThanOrEqual(0);
    });

    it('preserves inventory state and custom recipes across session reload', () => {
      // Create custom ingredient
      const newIng = mock.createIngredient({
        name: 'Organic Kesar',
        description: 'Grade 1 saffron threads',
        category: 'SPICES',
        currentStock: 0.5,
        unit: 'kg',
        minThreshold: 0.1,
        costPerUnit: 2500,
        costUnit: 'kg',
        isActive: true,
      });

      // Verify it was persisted to localStorage
      const cached = mock.loadLocalArray<Ingredient>('ingredients');
      expect(cached).toBeDefined();
      expect(cached?.some((i) => i.id === newIng.id)).toBe(true);
    });

    it('recovers safely from malformed cached data without crashing initialization', () => {
      localStorage.setItem('royal_spice_ingredients', '{ "corrupted": true }'); // Object instead of Array
      const recovered = mock.loadLocalArray<Ingredient>('ingredients');
      expect(recovered).toBeNull(); // Clean recovery
    });
  });
});
