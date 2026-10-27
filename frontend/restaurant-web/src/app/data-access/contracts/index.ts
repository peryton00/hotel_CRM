import { Observable } from 'rxjs';
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

export interface IRestaurantRepository {
  getRestaurant(): Observable<Restaurant>;
  updateSettings(settings: Partial<Restaurant>): Observable<Restaurant>;
}

export interface ICustomerRepository {
  getCustomers(): Observable<Customer[]>;
  getCustomerById(id: string): Observable<Customer | null>;
  getCustomerByPhone(phone: string): Observable<Customer | null>;
  createCustomer(
    customer: Omit<
      Customer,
      'id' | 'customerSince' | 'visitCount' | 'totalSpend' | 'avgOrderValue' | 'loyaltyPoints'
    >,
  ): Observable<Customer>;
  updateCustomer(id: string, updates: Partial<Customer>): Observable<Customer>;
}

export interface ITableRepository {
  getTables(): Observable<Table[]>;
  getTableById(id: string): Observable<Table | null>;
  getTableByToken(token: string): Observable<Table | null>;
  createTable(table: Omit<Table, 'id' | 'qrToken' | 'qrUrl'>): Observable<Table>;
  updateTable(id: string, updates: Partial<Table>): Observable<Table>;
  deleteTable(id: string): Observable<boolean>;
  updateTableStatus(id: string, status: TableStatus): Observable<Table>;
}

export interface IMenuRepository {
  getCategories(): Observable<MenuCategory[]>;
  getMenuItems(): Observable<MenuItem[]>;
  getMenuItemById(id: string): Observable<MenuItem | null>;
  createCategory(category: Omit<MenuCategory, 'id'>): Observable<MenuCategory>;
  updateCategory(id: string, updates: Partial<MenuCategory>): Observable<MenuCategory>;
  deleteCategory(id: string): Observable<boolean>;
  createMenuItem(item: Omit<MenuItem, 'id'>): Observable<MenuItem>;
  updateMenuItem(id: string, updates: Partial<MenuItem>): Observable<MenuItem>;
  deleteMenuItem(id: string): Observable<boolean>;
  toggleItemAvailability(id: string): Observable<MenuItem>;
}

export interface IOrderRepository {
  getOrders(): Observable<Order[]>;
  getOrderById(id: string): Observable<Order | null>;
  getOrdersByTable(tableId: string): Observable<Order[]>;
  createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'timeline'>,
  ): Observable<Order>;
  updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Observable<Order>;
  updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    method?: any,
  ): Observable<Order>;
}

export interface ICouponRepository {
  getCoupons(): Observable<Coupon[]>;
  getCouponByCode(code: string): Observable<Coupon | null>;
  getEligibleCouponsForCustomer(
    customerIdOrPhone: string,
    orderSubtotal: number,
  ): Observable<Coupon[]>;
  validateCoupon(
    code: string,
    subtotal: number,
    customerIdOrPhone?: string,
  ): Observable<CouponValidationResult>;
  createCoupon(coupon: Omit<Coupon, 'id' | 'redemptionCount'>): Observable<Coupon>;
  updateCoupon(id: string, updates: Partial<Coupon>): Observable<Coupon>;
  assignCouponToCustomer(couponId: string, customerId: string): Observable<Coupon>;
}

export interface IBillingRepository {
  getInvoices(): Observable<Invoice[]>;
  getInvoiceByOrderId(orderId: string): Observable<Invoice | null>;
  generateInvoice(orderId: string): Observable<Invoice>;
  markInvoicePrinted(invoiceId: string): Observable<Invoice>;
}

export interface IReservationRepository {
  getReservations(): Observable<Reservation[]>;
  createReservation(
    reservation: Omit<Reservation, 'id' | 'createdAt' | 'status'>,
  ): Observable<Reservation>;
  updateReservationStatus(id: string, status: ReservationStatus): Observable<Reservation>;
}

export interface ILoyaltyRepository {
  getTiers(): Observable<LoyaltyTierConfig[]>;
  getTransactions(): Observable<LoyaltyTransaction[]>;
  adjustPoints(
    customerId: string,
    pointsDelta: number,
    description: string,
  ): Observable<LoyaltyTransaction>;
}

export interface IFeedbackRepository {
  getFeedbacks(): Observable<Feedback[]>;
  submitFeedback(feedback: Omit<Feedback, 'id' | 'createdAt' | 'status'>): Observable<Feedback>;
  respondToFeedback(id: string, response: string): Observable<Feedback>;
}

export interface IStaffRepository {
  getStaffMembers(): Observable<StaffMember[]>;
  createStaff(staff: Omit<StaffMember, 'id'>): Observable<StaffMember>;
  updateStaff(id: string, updates: Partial<StaffMember>): Observable<StaffMember>;
}
