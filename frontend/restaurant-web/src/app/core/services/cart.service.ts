import { Injectable, signal, computed } from '@angular/core';
import { MenuItem, PortionSize } from '../models/menu.model';
import { OrderItem, SelectedVariant, SelectedAddon } from '../models/order.model';
import { Coupon } from '../models/coupon.model';

export interface CartLineItem extends OrderItem {}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  readonly items = signal<CartLineItem[]>([]);
  readonly appliedCoupon = signal<Coupon | null>(null);
  readonly discountAmount = signal<number>(0);
  readonly tableContext = signal<{ tableId: string; tableNumber: string; token: string } | null>(
    null,
  );
  readonly guestInfo = signal<{ name: string; phone: string; email?: string } | null>(null);

  // Computed Totals
  readonly itemCount = computed(() => {
    return this.items().reduce((acc, curr) => acc + curr.quantity, 0);
  });

  readonly subtotal = computed(() => {
    return this.items().reduce((acc, curr) => acc + curr.itemTotal, 0);
  });

  readonly cgst = computed(() => {
    const discounted = Math.max(0, this.subtotal() - this.discountAmount());
    return Math.round(discounted * 0.025 * 100) / 100;
  });

  readonly sgst = computed(() => {
    const discounted = Math.max(0, this.subtotal() - this.discountAmount());
    return Math.round(discounted * 0.025 * 100) / 100;
  });

  readonly totalTax = computed(() => {
    return Math.round((this.cgst() + this.sgst()) * 100) / 100;
  });

  readonly finalTotal = computed(() => {
    const discounted = Math.max(0, this.subtotal() - this.discountAmount());
    return Math.round((discounted + this.totalTax()) * 100) / 100;
  });

  setTableContext(tableId: string, tableNumber: string, token: string): void {
    this.tableContext.set({ tableId, tableNumber, token });
  }

  clearTableContext(): void {
    this.tableContext.set(null);
  }

  setGuestInfo(name: string, phone: string, email?: string): void {
    this.guestInfo.set({ name, phone, email });
  }

  addItem(
    item: MenuItem,
    quantity = 1,
    portion?: PortionSize,
    variants: SelectedVariant[] = [],
    addons: SelectedAddon[] = [],
    specialInstructions?: string,
  ): void {
    const basePrice = portion ? portion.price : item.price;
    const variantsPriceDelta = variants.reduce((acc, v) => acc + v.priceDelta, 0);
    const addonsPriceDelta = addons.reduce((acc, a) => acc + a.priceDelta, 0);
    const unitPrice = basePrice + variantsPriceDelta + addonsPriceDelta;

    // Create unique key based on item + customization
    const customKey = `${item.id}_${portion?.label || 'std'}_${variants
      .map((v) => v.optionName)
      .sort()
      .join('-')}_${addons
      .map((a) => a.name)
      .sort()
      .join('-')}`;

    const current = this.items();
    const existingIndex = current.findIndex((c) => (c as any)._customKey === customKey);

    if (existingIndex > -1) {
      const updated = [...current];
      const ex = updated[existingIndex];
      const newQty = ex.quantity + quantity;
      updated[existingIndex] = {
        ...ex,
        quantity: newQty,
        itemTotal: unitPrice * newQty,
      };
      this.items.set(updated);
    } else {
      const newLine: CartLineItem = {
        id: `cart-line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        menuItemId: item.id,
        name: item.name,
        selectedPortion: portion,
        selectedVariants: variants,
        selectedAddons: addons,
        unitPrice,
        quantity,
        itemTotal: unitPrice * quantity,
        specialInstructions,
      };
      (newLine as any)._customKey = customKey;
      this.items.set([...current, newLine]);
    }

    this.recalculateDiscount();
  }

  updateQuantity(lineId: string, delta: number): void {
    const current = this.items();
    const target = current.find((i) => i.id === lineId);
    if (!target) return;

    const newQty = target.quantity + delta;
    if (newQty <= 0) {
      this.removeItem(lineId);
    } else {
      const updated = current.map((i) =>
        i.id === lineId ? { ...i, quantity: newQty, itemTotal: i.unitPrice * newQty } : i,
      );
      this.items.set(updated);
      this.recalculateDiscount();
    }
  }

  removeItem(lineId: string): void {
    const updated = this.items().filter((i) => i.id !== lineId);
    this.items.set(updated);
    if (updated.length === 0) {
      this.removeCoupon();
    } else {
      this.recalculateDiscount();
    }
  }

  applyCoupon(coupon: Coupon, discount: number): void {
    this.appliedCoupon.set(coupon);
    this.discountAmount.set(discount);
  }

  removeCoupon(): void {
    this.appliedCoupon.set(null);
    this.discountAmount.set(0);
  }

  private recalculateDiscount(): void {
    const coupon = this.appliedCoupon();
    if (!coupon) return;

    const currentSubtotal = this.subtotal();
    if (currentSubtotal < coupon.minOrderValue) {
      this.removeCoupon();
      return;
    }

    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = (currentSubtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
        discount = coupon.maxDiscountAmount;
      }
    } else {
      discount = coupon.discountValue;
    }

    discount = Math.min(discount, currentSubtotal);
    this.discountAmount.set(Math.round(discount * 100) / 100);
  }

  clearCart(): void {
    this.items.set([]);
    this.appliedCoupon.set(null);
    this.discountAmount.set(0);
  }
}
