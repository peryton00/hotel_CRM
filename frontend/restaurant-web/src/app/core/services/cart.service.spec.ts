import { describe, it, expect, beforeEach } from 'vitest';
import { CartService } from './cart.service';
import { MenuItem } from '../models/menu.model';
import { Coupon } from '../models/coupon.model';

describe('CartService', () => {
  let cart: CartService;

  const mockItemA: MenuItem = {
    id: 'item-001',
    categoryId: 'cat-01',
    name: 'Dahi Ke Kebab',
    description: 'Crispy hung curd patties',
    price: 385,
    imageUrl: 'test.jpg',
    isAvailable: true,
    dietary: 'VEG',
    prepTimeMinutes: 15,
  };

  const mockItemB: MenuItem = {
    id: 'item-010',
    categoryId: 'cat-04',
    name: 'Awadhi Gosht Dum Biryani',
    description: 'Aged basmati with lamb',
    price: 645,
    imageUrl: 'biryani.jpg',
    isAvailable: true,
    dietary: 'NON_VEG',
    prepTimeMinutes: 25,
  };

  beforeEach(() => {
    cart = new CartService();
  });

  it('starts with an empty tray', () => {
    expect(cart.items().length).toBe(0);
    expect(cart.itemCount()).toBe(0);
    expect(cart.subtotal()).toBe(0);
    expect(cart.finalTotal()).toBe(0);
  });

  it('adds items and correctly computes itemCount and subtotal', () => {
    cart.addItem(mockItemA, 1);
    expect(cart.items().length).toBe(1);
    expect(cart.itemCount()).toBe(1);
    expect(cart.subtotal()).toBe(385);

    cart.addItem(mockItemB, 2);
    expect(cart.items().length).toBe(2);
    expect(cart.itemCount()).toBe(3);
    expect(cart.subtotal()).toBe(385 + 645 * 2); // 385 + 1290 = 1675
  });

  it('increments quantity and line item total on multiple adds of identical customization', () => {
    cart.addItem(mockItemA, 1);
    cart.addItem(mockItemA, 2);

    expect(cart.items().length).toBe(1);
    expect(cart.items()[0].quantity).toBe(3);
    expect(cart.items()[0].itemTotal).toBe(385 * 3);
  });

  it('treats different portion sizes as distinct line items', () => {
    const regularPortion = { label: 'Standard', price: 385 };
    const platterPortion = { label: 'Platter', price: 680 };

    cart.addItem(mockItemA, 1, regularPortion);
    cart.addItem(mockItemA, 1, platterPortion);

    expect(cart.items().length).toBe(2);
    expect(cart.subtotal()).toBe(385 + 680);
  });

  it('updates item quantity and removes item when quantity reaches zero', () => {
    cart.addItem(mockItemA, 2);
    const lineId = cart.items()[0].id;

    cart.updateQuantity(lineId, -1);
    expect(cart.items()[0].quantity).toBe(1);

    cart.updateQuantity(lineId, -1);
    expect(cart.items().length).toBe(0);
  });

  it('computes 2.5% CGST, 2.5% SGST and total tax accurately', () => {
    cart.addItem(mockItemA, 1); // Subtotal 385
    // 385 * 0.025 = 9.625 => rounded to 9.63
    expect(cart.cgst()).toBe(9.63);
    expect(cart.sgst()).toBe(9.63);
    expect(cart.totalTax()).toBe(19.26);
    expect(cart.finalTotal()).toBe(385 + 19.26); // 404.26
  });

  it('applies percentage coupon with maximum discount cap', () => {
    cart.addItem(mockItemB, 4); // Subtotal: 645 * 4 = 2580
    const coupon: Coupon = {
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
      usageLimit: 100,
      perCustomerLimit: 1,
      redemptionCount: 0,
      isActive: true,
    };

    // 20% of 2580 = 516. Since max cap is 400, discount must cap at 400.
    cart.applyCoupon(coupon, 400);

    expect(cart.discountAmount()).toBe(400);
    // Discounted subtotal: 2580 - 400 = 2180
    // CGST: 2180 * 0.025 = 54.5
    // SGST: 2180 * 0.025 = 54.5
    // Total Tax: 109
    // Final: 2180 + 109 = 2289
    expect(cart.cgst()).toBe(54.5);
    expect(cart.sgst()).toBe(54.5);
    expect(cart.finalTotal()).toBe(2289);
  });

  it('clears coupon when cart subtotal falls below minimum order value', () => {
    cart.addItem(mockItemB, 2); // Subtotal 1290
    const coupon: Coupon = {
      id: 'coup-001',
      code: 'ROYAL20',
      name: 'Royal 20',
      description: '20% off',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      minOrderValue: 1000,
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      usageLimit: 100,
      perCustomerLimit: 1,
      redemptionCount: 0,
      isActive: true,
    };
    cart.applyCoupon(coupon, 258);
    expect(cart.appliedCoupon()).not.toBeNull();

    // Remove one biryani => subtotal becomes 645 (less than 1000 min order)
    const lineId = cart.items()[0].id;
    cart.updateQuantity(lineId, -1);

    expect(cart.subtotal()).toBe(645);
    expect(cart.appliedCoupon()).toBeNull();
    expect(cart.discountAmount()).toBe(0);
  });

  it('clears all items and resets totals', () => {
    cart.addItem(mockItemA, 2);
    cart.addItem(mockItemB, 1);
    cart.clearCart();

    expect(cart.items().length).toBe(0);
    expect(cart.itemCount()).toBe(0);
    expect(cart.subtotal()).toBe(0);
    expect(cart.finalTotal()).toBe(0);
  });
});
