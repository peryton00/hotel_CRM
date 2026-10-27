export type MeasurementUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

export type IngredientCategory =
  'PRODUCE' | 'DAIRY' | 'MEAT' | 'SPICES' | 'GRAINS' | 'BEVERAGES' | 'PACKAGING' | 'OTHER';

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'RESTOCK'
  | 'MANUAL_ADJUSTMENT'
  | 'WASTAGE'
  | 'STOCK_CORRECTION'
  | 'RECIPE_CONSUMPTION'
  | 'REVERSAL';

export type MenuStockStatus = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNTRACKED';

export interface Ingredient {
  id: string;
  name: string;
  description?: string;
  category: IngredientCategory;
  currentStock: number;
  unit: MeasurementUnit;
  minThreshold: number;
  targetStock?: number;
  costPerUnit: number;
  costUnit: MeasurementUnit;
  supplierName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: StockMovementType;
  quantityDelta: number; // Signed delta (e.g. +5.0 or -0.25)
  quantityBefore: number;
  quantityAfter: number;
  unit: MeasurementUnit;
  reason: string;
  referenceId?: string; // Order ID or Invoice ID or Adjustment note
  staffName?: string;
  timestamp: string;
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number; // positive quantity required per single serving
  unit: MeasurementUnit;
}

export interface Recipe {
  id: string;
  menuItemId: string;
  menuItemName: string;
  version: number;
  items: RecipeItem[];
  instructions?: string;
  indicativeCost: number; // Calculated indicative portion cost in INR
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockReservation {
  id: string;
  orderId: string;
  ingredientId: string;
  quantity: number;
  unit: MeasurementUnit;
  createdAt: string;
}

export interface StockAvailabilityCheck {
  menuItemId: string;
  status: MenuStockStatus;
  produciblePortions: number;
  limitingIngredient?: string;
  missingIngredients: string[];
}

/**
 * Decimal-safe rounding utility to prevent IEEE 754 floating point drift in stock calculations.
 */
export function roundStock(value: number, decimals = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Validates and sanitizes stock quantities, ensuring non-negative finite numbers
 * and integer constraints for discrete 'pcs' units.
 */
export function sanitizeStockQuantity(value: number, unit: MeasurementUnit): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid stock quantity: ${value}. Must be a finite non-negative number.`);
  }
  if (unit === 'pcs') {
    if (!Number.isInteger(value)) {
      throw new Error(`Discrete items ('pcs') must have integer quantities, got ${value}`);
    }
    return Math.round(value);
  }
  return roundStock(value, 3);
}

/**
 * Checks whether two measurement units belong to the same physical domain:
 * Mass: 'g', 'kg'
 * Volume: 'ml', 'l'
 * Discrete Count: 'pcs'
 */
export function areUnitsCompatible(u1: MeasurementUnit, u2: MeasurementUnit): boolean {
  if (u1 === u2) return true;
  const massUnits: MeasurementUnit[] = ['g', 'kg'];
  const volumeUnits: MeasurementUnit[] = ['ml', 'l'];

  if (massUnits.includes(u1) && massUnits.includes(u2)) return true;
  if (volumeUnits.includes(u1) && volumeUnits.includes(u2)) return true;
  return false;
}

/**
 * Converts a quantity from one measurement unit to a compatible target unit.
 * Throws an explicit error if units are incompatible (e.g. mass to volume without density)
 * or if quantity is invalid.
 */
export function convertUnit(
  quantity: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(
      `Invalid quantity for conversion: ${quantity}. Must be non-negative finite number.`,
    );
  }
  if (!areUnitsCompatible(fromUnit, toUnit)) {
    throw new Error(
      `Incompatible measurement units: cannot convert from '${fromUnit}' to '${toUnit}'`,
    );
  }

  if (fromUnit === toUnit) {
    return fromUnit === 'pcs' ? Math.round(quantity) : roundStock(quantity);
  }

  // Mass domain (g <-> kg)
  if (fromUnit === 'kg' && toUnit === 'g') {
    return roundStock(quantity * 1000);
  }
  if (fromUnit === 'g' && toUnit === 'kg') {
    return roundStock(quantity / 1000);
  }

  // Volume domain (l <-> ml)
  if (fromUnit === 'l' && toUnit === 'ml') {
    return roundStock(quantity * 1000);
  }
  if (fromUnit === 'ml' && toUnit === 'l') {
    return roundStock(quantity / 1000);
  }

  return roundStock(quantity);
}
