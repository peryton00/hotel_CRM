import { Injectable, inject, InjectionToken } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { MockDataService } from '../mock/mock-data.service';
import {
  IRestaurantRepository,
  ICustomerRepository,
  ITableRepository,
  IMenuRepository,
  IOrderRepository,
  ICouponRepository,
  IBillingRepository,
  IReservationRepository,
  ILoyaltyRepository,
  IFeedbackRepository,
  IStaffRepository,
} from '../contracts';
import { Restaurant } from '../../core/models/restaurant.model';
import { Customer } from '../../core/models/customer.model';
import { Table, TableStatus } from '../../core/models/table.model';
import { MenuCategory, MenuItem } from '../../core/models/menu.model';
import { Order, OrderStatus, PaymentStatus } from '../../core/models/order.model';
import { Coupon, CouponValidationResult } from '../../core/models/coupon.model';
import { Invoice } from '../../core/models/billing.model';
import { Reservation, ReservationStatus } from '../../core/models/reservation.model';
import { LoyaltyTierConfig, LoyaltyTransaction } from '../../core/models/loyalty.model';
import { Feedback } from '../../core/models/feedback.model';
import { StaffMember } from '../../core/models/staff.model';

// Injection Tokens for Clean Swappability (e.g. Future Supabase)
export const RESTAURANT_REPO = new InjectionToken<IRestaurantRepository>('RESTAURANT_REPO');
export const CUSTOMER_REPO = new InjectionToken<ICustomerRepository>('CUSTOMER_REPO');
export const TABLE_REPO = new InjectionToken<ITableRepository>('TABLE_REPO');
export const MENU_REPO = new InjectionToken<IMenuRepository>('MENU_REPO');
export const ORDER_REPO = new InjectionToken<IOrderRepository>('ORDER_REPO');
export const COUPON_REPO = new InjectionToken<ICouponRepository>('COUPON_REPO');
export const BILLING_REPO = new InjectionToken<IBillingRepository>('BILLING_REPO');
export const RESERVATION_REPO = new InjectionToken<IReservationRepository>('RESERVATION_REPO');
export const LOYALTY_REPO = new InjectionToken<ILoyaltyRepository>('LOYALTY_REPO');
export const FEEDBACK_REPO = new InjectionToken<IFeedbackRepository>('FEEDBACK_REPO');
export const STAFF_REPO = new InjectionToken<IStaffRepository>('STAFF_REPO');

@Injectable({ providedIn: 'root' })
export class MockRestaurantRepository implements IRestaurantRepository {
  private mock = inject(MockDataService);

  getRestaurant(): Observable<Restaurant> {
    const current = this.mock.restaurant();
    if (current) return of(current);
    return of({} as Restaurant);
  }

  updateSettings(settings: Partial<Restaurant>): Observable<Restaurant> {
    const cur = this.mock.restaurant() || ({} as Restaurant);
    const updated = { ...cur, ...settings };
    this.mock.restaurant.set(updated);
    this.mock.saveLocal('restaurant', updated);
    return of(updated);
  }
}

@Injectable({ providedIn: 'root' })
export class MockCustomerRepository implements ICustomerRepository {
  private mock = inject(MockDataService);

  getCustomers(): Observable<Customer[]> {
    return of(this.mock.customers());
  }

  getCustomerById(id: string): Observable<Customer | null> {
    const found = this.mock.customers().find((c) => c.id === id) || null;
    return of(found);
  }

  getCustomerByPhone(phone: string): Observable<Customer | null> {
    const clean = phone.replace(/[^0-9]/g, '');
    const found =
      this.mock.customers().find((c) => c.phone.replace(/[^0-9]/g, '').includes(clean)) || null;
    return of(found);
  }

  createCustomer(
    dto: Omit<
      Customer,
      'id' | 'customerSince' | 'visitCount' | 'totalSpend' | 'avgOrderValue' | 'loyaltyPoints'
    >,
  ): Observable<Customer> {
    const newCustomer: Customer = {
      ...dto,
      id: `cust-${Date.now().toString().slice(-4)}`,
      customerSince: new Date().toISOString(),
      visitCount: 1,
      totalSpend: 0,
      avgOrderValue: 0,
      loyaltyPoints: 50,
      status: dto.status || 'ACTIVE',
      loyaltyTier: dto.loyaltyTier || 'BRONZE',
      assignedCouponIds: dto.assignedCouponIds || ['coup-002'],
    };
    const list = [newCustomer, ...this.mock.customers()];
    this.mock.customers.set(list);
    this.mock.saveLocal('customers', list);
    return of(newCustomer);
  }

  updateCustomer(id: string, updates: Partial<Customer>): Observable<Customer> {
    const list = this.mock.customers().map((c) => (c.id === id ? { ...c, ...updates } : c));
    this.mock.customers.set(list);
    this.mock.saveLocal('customers', list);
    const updated = list.find((c) => c.id === id)!;
    return of(updated);
  }
}

@Injectable({ providedIn: 'root' })
export class MockTableRepository implements ITableRepository {
  private mock = inject(MockDataService);

  getTables(): Observable<Table[]> {
    return of(this.mock.tables());
  }

  getTableById(id: string): Observable<Table | null> {
    return of(this.mock.tables().find((t) => t.id === id) || null);
  }

  getTableByToken(token: string): Observable<Table | null> {
    const list = this.mock.tables();
    const found =
      list.find(
        (t) =>
          t.qrToken === token || t.id === token || t.number.toLowerCase() === token.toLowerCase(),
      ) || null;
    return of(found);
  }

  createTable(dto: Omit<Table, 'id' | 'qrToken' | 'qrUrl'>): Observable<Table> {
    const token = `tbl-${dto.number.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newTable: Table = {
      ...dto,
      id: `tbl-${Date.now().toString().slice(-4)}`,
      qrToken: token,
      qrUrl: `/menu/gurukripa-dhaba/table/${token}`,
      orderingEnabled: dto.orderingEnabled !== false,
    };
    const list = [...this.mock.tables(), newTable];
    this.mock.tables.set(list);
    this.mock.saveLocal('tables', list);
    return of(newTable);
  }

  updateTable(id: string, updates: Partial<Table>): Observable<Table> {
    const list = this.mock.tables().map((t) => (t.id === id ? { ...t, ...updates } : t));
    this.mock.tables.set(list);
    this.mock.saveLocal('tables', list);
    return of(list.find((t) => t.id === id)!);
  }

  deleteTable(id: string): Observable<boolean> {
    const list = this.mock.tables().filter((t) => t.id !== id);
    this.mock.tables.set(list);
    this.mock.saveLocal('tables', list);
    return of(true);
  }

  updateTableStatus(id: string, status: TableStatus): Observable<Table> {
    return this.updateTable(id, { status });
  }
}

@Injectable({ providedIn: 'root' })
export class MockMenuRepository implements IMenuRepository {
  private mock = inject(MockDataService);

  getCategories(): Observable<MenuCategory[]> {
    return of(this.mock.categories());
  }

  getMenuItems(): Observable<MenuItem[]> {
    return of(this.mock.menuItems());
  }

  getMenuItemById(id: string): Observable<MenuItem | null> {
    return of(this.mock.menuItems().find((m) => m.id === id) || null);
  }

  createCategory(dto: Omit<MenuCategory, 'id'>): Observable<MenuCategory> {
    const newCat: MenuCategory = {
      ...dto,
      id: `cat-${Date.now().toString().slice(-4)}`,
    };
    const list = [...this.mock.categories(), newCat];
    this.mock.categories.set(list);
    this.mock.saveLocal('categories', list);
    return of(newCat);
  }

  updateCategory(id: string, updates: Partial<MenuCategory>): Observable<MenuCategory> {
    const list = this.mock.categories().map((c) => (c.id === id ? { ...c, ...updates } : c));
    this.mock.categories.set(list);
    this.mock.saveLocal('categories', list);
    return of(list.find((c) => c.id === id)!);
  }

  deleteCategory(id: string): Observable<boolean> {
    const list = this.mock.categories().filter((c) => c.id !== id);
    this.mock.categories.set(list);
    this.mock.saveLocal('categories', list);
    return of(true);
  }

  createMenuItem(dto: Omit<MenuItem, 'id'>): Observable<MenuItem> {
    const newItem: MenuItem = {
      ...dto,
      id: `item-${Date.now().toString().slice(-4)}`,
    };
    const list = [...this.mock.menuItems(), newItem];
    this.mock.menuItems.set(list);
    this.mock.saveLocal('menuItems', list);
    return of(newItem);
  }

  updateMenuItem(id: string, updates: Partial<MenuItem>): Observable<MenuItem> {
    const list = this.mock.menuItems().map((m) => (m.id === id ? { ...m, ...updates } : m));
    this.mock.menuItems.set(list);
    this.mock.saveLocal('menuItems', list);
    return of(list.find((m) => m.id === id)!);
  }

  deleteMenuItem(id: string): Observable<boolean> {
    const list = this.mock.menuItems().filter((m) => m.id !== id);
    this.mock.menuItems.set(list);
    this.mock.saveLocal('menuItems', list);
    return of(true);
  }

  toggleItemAvailability(id: string): Observable<MenuItem> {
    const item = this.mock.menuItems().find((m) => m.id === id);
    if (!item) throw new Error('Item not found');
    return this.updateMenuItem(id, { isAvailable: !item.isAvailable });
  }
}

@Injectable({ providedIn: 'root' })
export class MockOrderRepository implements IOrderRepository {
  private mock = inject(MockDataService);

  getOrders(): Observable<Order[]> {
    return of(this.mock.orders());
  }

  getOrderById(id: string): Observable<Order | null> {
    return of(this.mock.orders().find((o) => o.id === id || o.orderNumber === id) || null);
  }

  getOrdersByTable(tableId: string): Observable<Order[]> {
    return of(this.mock.orders().filter((o) => o.tableId === tableId));
  }

  createOrder(
    dto: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'timeline'>,
  ): Observable<Order> {
    const isTakeaway = dto.orderType === 'TAKEAWAY';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const newOrder: Order = {
      ...dto,
      id: `ord-${Date.now().toString().slice(-4)}`,
      orderNumber: `#ORD-${randomNum}`,
      orderType: dto.orderType || (dto.tableId ? 'DINE_IN' : undefined),
      pickupReference: isTakeaway ? dto.pickupReference || `TK-${randomNum}` : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          status: 'RECEIVED',
          timestamp: new Date().toISOString(),
          note: isTakeaway
            ? `Takeaway counter order created (Ref: ${dto.pickupReference || 'TK-' + randomNum})`
            : `Order placed for Table ${dto.tableNumber}`,
        },
      ],
    };
    const list = [newOrder, ...this.mock.orders()];
    this.mock.orders.set(list);
    this.mock.saveLocal('orders', list);

    // Auto mark table as OCCUPIED only for dine-in orders with a table
    if (!isTakeaway && (dto.tableId || dto.tableNumber)) {
      const tables = this.mock
        .tables()
        .map((t) =>
          t.id === dto.tableId || t.number === dto.tableNumber
            ? { ...t, status: 'OCCUPIED' as TableStatus }
            : t,
        );
      this.mock.tables.set(tables);
      this.mock.saveLocal('tables', tables);
    }

    return of(newOrder);
  }

  updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Observable<Order> {
    const res = this.mock.updateOrderStatusAtomic(orderId, status, { note });
    if (!res.success) {
      return throwError(() => new Error(res.error || `Failed to update order status to ${status}`));
    }
    return of(res.order!);
  }

  updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    method?: any,
  ): Observable<Order> {
    const list = this.mock.orders().map((o) => {
      if (o.id === orderId || o.orderNumber === orderId) {
        return {
          ...o,
          paymentStatus,
          paymentMethod: method || o.paymentMethod || 'UPI',
          updatedAt: new Date().toISOString(),
        };
      }
      return o;
    });
    this.mock.orders.set(list);
    this.mock.saveLocal('orders', list);
    const updated = list.find((o) => o.id === orderId || o.orderNumber === orderId)!;
    return of(updated);
  }
}

@Injectable({ providedIn: 'root' })
export class MockCouponRepository implements ICouponRepository {
  private mock = inject(MockDataService);

  getCoupons(): Observable<Coupon[]> {
    return of(this.mock.coupons());
  }

  getCouponByCode(code: string): Observable<Coupon | null> {
    const clean = code.trim().toUpperCase();
    return of(this.mock.coupons().find((c) => c.code.toUpperCase() === clean) || null);
  }

  getEligibleCouponsForCustomer(
    customerIdOrPhone: string,
    orderSubtotal: number,
  ): Observable<Coupon[]> {
    const list = this.mock.coupons().filter((c) => {
      if (!c.isActive) return false;
      if (c.assignedCustomerIds && c.assignedCustomerIds.length > 0) {
        const hasAssignment = c.assignedCustomerIds.includes(customerIdOrPhone);
        if (!hasAssignment) return false;
      }
      return true;
    });
    return of(list);
  }

  validateCoupon(
    code: string,
    subtotal: number,
    customerIdOrPhone?: string,
  ): Observable<CouponValidationResult> {
    const res = this.mock.simulateServerCouponValidation({
      couponCode: code,
      cartSubtotal: subtotal,
      customerId: customerIdOrPhone,
      customerPhoneE164: customerIdOrPhone,
    });

    return of({
      isValid: res.isValid,
      discountAmount: res.authorizedDiscountAmount,
      reason: res.rejectionReason,
    });
  }

  createCoupon(dto: Omit<Coupon, 'id' | 'redemptionCount'>): Observable<Coupon> {
    const newCoupon: Coupon = {
      ...dto,
      id: `coup-${Date.now().toString().slice(-4)}`,
      redemptionCount: 0,
    };
    const list = [...this.mock.coupons(), newCoupon];
    this.mock.coupons.set(list);
    this.mock.saveLocal('coupons', list);
    return of(newCoupon);
  }

  updateCoupon(id: string, updates: Partial<Coupon>): Observable<Coupon> {
    const list = this.mock.coupons().map((c) => (c.id === id ? { ...c, ...updates } : c));
    this.mock.coupons.set(list);
    this.mock.saveLocal('coupons', list);
    return of(list.find((c) => c.id === id)!);
  }

  assignCouponToCustomer(couponId: string, customerId: string): Observable<Coupon> {
    const list = this.mock.coupons().map((c) => {
      if (c.id === couponId) {
        const assigned = c.assignedCustomerIds || [];
        if (!assigned.includes(customerId)) {
          return { ...c, assignedCustomerIds: [...assigned, customerId] };
        }
      }
      return c;
    });
    this.mock.coupons.set(list);
    this.mock.saveLocal('coupons', list);

    // Also update customer model
    const custs = this.mock.customers().map((cust) => {
      if (cust.id === customerId) {
        const ids = cust.assignedCouponIds || [];
        if (!ids.includes(couponId)) {
          return { ...cust, assignedCouponIds: [...ids, couponId] };
        }
      }
      return cust;
    });
    this.mock.customers.set(custs);
    this.mock.saveLocal('customers', custs);

    return of(list.find((c) => c.id === couponId)!);
  }
}

@Injectable({ providedIn: 'root' })
export class MockBillingRepository implements IBillingRepository {
  private mock = inject(MockDataService);

  getInvoices(): Observable<Invoice[]> {
    return of(this.mock.invoices());
  }

  getInvoiceByOrderId(orderId: string): Observable<Invoice | null> {
    return of(this.mock.invoices().find((i) => i.orderId === orderId) || null);
  }

  generateInvoice(orderId: string): Observable<Invoice> {
    const existing = this.mock.invoices().find((i) => i.orderId === orderId);
    if (existing) return of(existing);

    const order = this.mock.orders().find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const newInv: Invoice = {
      id: `inv-${Date.now().toString().slice(-4)}`,
      invoiceNumber: `INV-2026-${order.orderNumber.replace(/[^0-9]/g, '') || '001'}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      issuedAt: new Date().toISOString(),
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discountAmount,
      appliedCouponCode: order.appliedCouponCode,
      taxBreakdown: [
        { name: 'CGST (2.5%)', rate: 2.5, amount: order.cgstAmount },
        { name: 'SGST (2.5%)', rate: 2.5, amount: order.sgstAmount },
      ],
      totalTax: order.taxAmount,
      finalTotal: order.totalAmount,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
    };

    const list = [newInv, ...this.mock.invoices()];
    this.mock.invoices.set(list);
    this.mock.saveLocal('invoices', list);
    return of(newInv);
  }

  markInvoicePrinted(invoiceId: string): Observable<Invoice> {
    const list = this.mock
      .invoices()
      .map((inv) => (inv.id === invoiceId ? { ...inv, printedAt: new Date().toISOString() } : inv));
    this.mock.invoices.set(list);
    this.mock.saveLocal('invoices', list);
    return of(list.find((i) => i.id === invoiceId)!);
  }
}

@Injectable({ providedIn: 'root' })
export class MockReservationRepository implements IReservationRepository {
  private mock = inject(MockDataService);

  getReservations(): Observable<Reservation[]> {
    return of(this.mock.reservations());
  }

  createReservation(
    dto: Omit<Reservation, 'id' | 'createdAt' | 'status'>,
  ): Observable<Reservation> {
    const newRes: Reservation = {
      ...dto,
      id: `res-${Date.now().toString().slice(-4)}`,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };
    const list = [newRes, ...this.mock.reservations()];
    this.mock.reservations.set(list);
    this.mock.saveLocal('reservations', list);
    return of(newRes);
  }

  updateReservationStatus(id: string, status: ReservationStatus): Observable<Reservation> {
    const list = this.mock.reservations().map((r) => (r.id === id ? { ...r, status } : r));
    this.mock.reservations.set(list);
    this.mock.saveLocal('reservations', list);
    return of(list.find((r) => r.id === id)!);
  }
}

@Injectable({ providedIn: 'root' })
export class MockLoyaltyRepository implements ILoyaltyRepository {
  private mock = inject(MockDataService);

  getTiers(): Observable<LoyaltyTierConfig[]> {
    return of(this.mock.loyaltyTiers());
  }

  getTransactions(): Observable<LoyaltyTransaction[]> {
    return of(this.mock.loyaltyTransactions());
  }

  adjustPoints(
    customerId: string,
    pointsDelta: number,
    description: string,
  ): Observable<LoyaltyTransaction> {
    const cust = this.mock.customers().find((c) => c.id === customerId);
    const newTx: LoyaltyTransaction = {
      id: `lt-${Date.now().toString().slice(-4)}`,
      customerId,
      customerName: cust?.name || 'Valued Guest',
      type: pointsDelta >= 0 ? 'EARNED' : 'REDEEMED',
      points: pointsDelta,
      description,
      date: new Date().toISOString(),
    };
    const list = [newTx, ...this.mock.loyaltyTransactions()];
    this.mock.loyaltyTransactions.set(list);
    this.mock.saveLocal('loyaltyTransactions', list);

    if (cust) {
      const updatedPts = Math.max(0, cust.loyaltyPoints + pointsDelta);
      const custs = this.mock
        .customers()
        .map((c) => (c.id === customerId ? { ...c, loyaltyPoints: updatedPts } : c));
      this.mock.customers.set(custs);
      this.mock.saveLocal('customers', custs);
    }

    return of(newTx);
  }
}

@Injectable({ providedIn: 'root' })
export class MockFeedbackRepository implements IFeedbackRepository {
  private mock = inject(MockDataService);

  getFeedbacks(): Observable<Feedback[]> {
    return of(this.mock.feedbacks());
  }

  submitFeedback(dto: Omit<Feedback, 'id' | 'createdAt' | 'status'>): Observable<Feedback> {
    const newFb: Feedback = {
      ...dto,
      id: `fdbk-${Date.now().toString().slice(-4)}`,
      status: 'PUBLISHED',
      createdAt: new Date().toISOString(),
    };
    const list = [newFb, ...this.mock.feedbacks()];
    this.mock.feedbacks.set(list);
    this.mock.saveLocal('feedbacks', list);
    return of(newFb);
  }

  respondToFeedback(id: string, response: string): Observable<Feedback> {
    const list = this.mock
      .feedbacks()
      .map((f) => (f.id === id ? { ...f, adminResponse: response } : f));
    this.mock.feedbacks.set(list);
    this.mock.saveLocal('feedbacks', list);
    return of(list.find((f) => f.id === id)!);
  }
}

@Injectable({ providedIn: 'root' })
export class MockStaffRepository implements IStaffRepository {
  private mock = inject(MockDataService);

  getStaffMembers(): Observable<StaffMember[]> {
    return of(this.mock.staffMembers());
  }

  createStaff(dto: Omit<StaffMember, 'id'>): Observable<StaffMember> {
    const newStaff: StaffMember = {
      ...dto,
      id: `stf-${Date.now().toString().slice(-4)}`,
    };
    const list = [...this.mock.staffMembers(), newStaff];
    this.mock.staffMembers.set(list);
    this.mock.saveLocal('staff', list);
    return of(newStaff);
  }

  updateStaff(id: string, updates: Partial<StaffMember>): Observable<StaffMember> {
    const list = this.mock.staffMembers().map((s) => (s.id === id ? { ...s, ...updates } : s));
    this.mock.staffMembers.set(list);
    this.mock.saveLocal('staff', list);
    return of(list.find((s) => s.id === id)!);
  }
}
