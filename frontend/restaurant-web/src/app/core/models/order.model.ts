import { PortionSize } from './menu.model';

export type OrderStatus =
  'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING';

export interface SelectedVariant {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface SelectedAddon {
  name: string;
  priceDelta: number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  selectedPortion?: PortionSize;
  selectedVariants: SelectedVariant[];
  selectedAddons: SelectedAddon[];
  unitPrice: number;
  quantity: number;
  itemTotal: number;
  specialInstructions?: string;
}

export interface OrderTimelineEvent {
  status: string;
  timestamp: string;
  note?: string;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY';

export interface Order {
  id: string; // UUID primary key
  orderNumber: string;
  orderType?: OrderType; // Explicit order type: 'DINE_IN' | 'TAKEAWAY'
  pickupReference?: string; // Pickup reference for takeaway/counter orders (e.g. 'TK-101')
  idempotencyKey?: string; // Client idempotency token for retry safety
  restaurantId?: string; // Tenant isolation key
  restaurantSlug: string;
  tableId?: string; // Nullable/optional for takeaway orders
  tableNumber?: string; // Nullable/optional for takeaway orders
  customerId?: string; // Stable Customer UUID
  customerName: string;
  customerPhone: string;
  customerPhoneE164?: string; // Normalized E.164 phone
  customerEmail?: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  appliedCouponId?: string; // Foreign key to coupons
  appliedCouponCode?: string;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  serviceChargeAmount?: number;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  createdAt: string;
  updatedAt: string;
  timeline: OrderTimelineEvent[];
  isSplit?: boolean;
  splitCount?: number;
  totalRefunded?: number;
  settledAt?: string;
  printCount?: number;
  lastPrintedAt?: string;
}
