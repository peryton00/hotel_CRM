import { OrderItem, PaymentStatus, PaymentMethod, OrderType } from './order.model';

export interface TaxComponent {
  name: string;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  orderType?: OrderType;
  pickupReference?: string;
  tableNumber?: string;
  customerName: string;
  customerPhone: string;
  issuedAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  appliedCouponCode?: string;
  taxBreakdown: TaxComponent[];
  totalTax: number;
  finalTotal: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  printedAt?: string;
}

export interface TableTransferRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  sourceTableId: string;
  sourceTableNumber: string;
  destinationTableId: string;
  destinationTableNumber: string;
  transferredAt: string;
  staffName?: string;
}

export interface SplitBillItemAllocation {
  orderItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  itemTotal: number;
}

export interface SplitBill {
  id: string;
  orderId: string;
  orderNumber: string;
  orderType?: OrderType;
  pickupReference?: string;
  tableNumber?: string;
  customerName?: string;
  splitIndex: number;
  splitTotalCount: number;
  splitType: 'EQUAL' | 'ITEM_BASED';
  allocatedItems?: SplitBillItemAllocation[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxBreakdown?: TaxComponent[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  settledAt?: string;
  createdAt?: string;
  totalRefunded?: number;
  printCount?: number;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  splitBillId?: string;
  idempotencyKey?: string;
  tableNumber?: string;
  customerName: string;
  originalPaymentMethod?: PaymentMethod;
  refundAmount: number;
  reason: string;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  staffName?: string;
}
