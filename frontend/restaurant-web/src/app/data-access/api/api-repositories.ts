import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { ApiClientService } from './api-client.service';
import {
  IRestaurantRepository,
  ICustomerRepository,
  ITableRepository,
  IMenuRepository,
  IOrderRepository,
  ICouponRepository,
  IBillingRepository,
  IReservationRepository,
  IStaffRepository,
  ILoyaltyRepository,
  IFeedbackRepository,
} from '../contracts';
import { Restaurant } from '../../core/models/restaurant.model';
import { Customer } from '../../core/models/customer.model';
import { Table, TableStatus } from '../../core/models/table.model';
import { MenuCategory, MenuItem } from '../../core/models/menu.model';
import { Order, OrderStatus, PaymentStatus } from '../../core/models/order.model';
import { Coupon, CouponValidationResult } from '../../core/models/coupon.model';
import { Invoice } from '../../core/models/billing.model';
import { Reservation, ReservationStatus } from '../../core/models/reservation.model';
import { StaffMember } from '../../core/models/staff.model';
import { LoyaltyTierConfig, LoyaltyTransaction } from '../../core/models/loyalty.model';
import { Feedback } from '../../core/models/feedback.model';

@Injectable({ providedIn: 'root' })
export class ApiRestaurantRepository implements IRestaurantRepository {
  private api = inject(ApiClientService);

  getRestaurant(): Observable<Restaurant> {
    return this.api.get<any>('/restaurants').pipe(
      map((res) => ({
        id: res.id,
        slug: res.slug || 'gurukripa-dhaba',
        name: res.name || 'Gurukripa Dhaba',
        tagline: res.tagline || 'Authentic Punjabi & North Indian Cuisine',
        description: res.description || 'Serving authentic rich Punjabi delicacies since 1998.',
        coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200',
        logoUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
        cuisine: ['North Indian', 'Punjabi', 'Tandoor'],
        rating: 4.8,
        reviewCount: 342,
        address: {
          street: res.address || 'G.T. Road, Near Highway Plaza',
          area: res.city || 'Ludhiana',
          city: res.city || 'Ludhiana',
          state: res.state || 'Punjab',
          zip: res.postal_code || '141001',
        },
        contact: {
          phone: res.phone || '+91 98765 43210',
          email: res.email || 'info@hotelcrm.local',
          website: 'https://gurukripadhaba.in',
        },
        openingHours: [{ days: 'Mon - Sun', hours: '11:00 AM - 11:30 PM' }],
        currency: 'INR',
        currencySymbol: '₹',
        taxSettings: {
          enableGst: true,
          cgstRate: 2.5,
          sgstRate: 2.5,
          serviceChargeRate: 0,
          gstNumber: res.gstin || '03AABCG1234F1Z5',
        },
        orderingSettings: {
          dineInEnabled: true,
          takeawayEnabled: true,
          minOrderAmount: 100,
          estimatedPrepMinutes: 20,
        },
      })),
    );
  }

  updateSettings(settings: Partial<Restaurant>): Observable<Restaurant> {
    return this.api.put<Restaurant>('/restaurants/settings', settings);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiCustomerRepository implements ICustomerRepository {
  private api = inject(ApiClientService);

  getCustomers(): Observable<Customer[]> {
    return this.api.get<any[]>('/customers').pipe(
      map((items) =>
        items.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email || '',
          customerSince: c.created_at,
          visitCount: c.visit_count || 1,
          lastVisit: c.updated_at || c.created_at || new Date().toISOString(),
          totalSpend: (c.total_spend_paise || 0) / 100,
          avgOrderValue: c.visit_count ? (c.total_spend_paise || 0) / (c.visit_count * 100) : 0,
          loyaltyPoints: 50,
          loyaltyTier: 'BRONZE',
          status: 'ACTIVE',
          assignedCouponIds: ['coup-001'],
        })),
      ),
    );
  }

  getCustomerById(id: string): Observable<Customer | null> {
    return this.api.get<Customer>(`/customers/${id}`);
  }

  getCustomerByPhone(phone: string): Observable<Customer | null> {
    return this.api
      .get<Customer[]>('/customers', { search: phone })
      .pipe(map((list) => list[0] || null));
  }

  createCustomer(dto: any): Observable<Customer> {
    return this.api.post<Customer>('/customers', dto);
  }

  updateCustomer(id: string, updates: Partial<Customer>): Observable<Customer> {
    return this.api.put<Customer>(`/customers/${id}`, updates);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiTableRepository implements ITableRepository {
  private api = inject(ApiClientService);

  getTables(): Observable<Table[]> {
    return this.api.get<any[]>('/tables').pipe(
      map((tables) =>
        tables.map((t) => ({
          id: t.id,
          number: t.table_number,
          capacity: t.capacity,
          section: t.section,
          status: (t.status || 'available').toUpperCase() as TableStatus,
          qrToken: t.qr_code_identifier || t.id,
          qrUrl: `/menu/table/${t.table_number}`,
          orderingEnabled: true,
          activeOrderId: t.active_order_id,
        })),
      ),
    );
  }

  getTableById(id: string): Observable<Table | null> {
    return this.getTables().pipe(map((list) => list.find((t) => t.id === id) || null));
  }

  getTableByToken(token: string): Observable<Table | null> {
    return this.getTables().pipe(
      map((list) => list.find((t) => t.qrToken === token || t.number === token) || null),
    );
  }

  createTable(table: any): Observable<Table> {
    return this.api.post<Table>('/tables', table);
  }

  updateTable(id: string, updates: Partial<Table>): Observable<Table> {
    return this.api.put<Table>(`/tables/${id}`, updates);
  }

  deleteTable(id: string): Observable<boolean> {
    return this.api.delete<boolean>(`/tables/${id}`);
  }

  updateTableStatus(id: string, status: TableStatus): Observable<Table> {
    return this.api
      .put<any>(`/tables/${id}/status`, {
        status: status.toLowerCase(),
      })
      .pipe(
        map((t) => ({
          id: t.id,
          number: t.table_number,
          capacity: t.capacity,
          section: t.section,
          status: (t.status || 'available').toUpperCase() as TableStatus,
          qrToken: t.qr_code_identifier,
          qrUrl: `/menu/table/${t.table_number}`,
          orderingEnabled: true,
        })),
      );
  }
}

@Injectable({ providedIn: 'root' })
export class ApiMenuRepository implements IMenuRepository {
  private api = inject(ApiClientService);

  getCategories(): Observable<MenuCategory[]> {
    return this.api.get<any[]>('/menu/categories').pipe(
      map((cats) =>
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-'),
          sortOrder: c.display_order || 0,
          isActive: c.is_active !== false,
        })),
      ),
    );
  }

  getMenuItems(): Observable<MenuItem[]> {
    return this.api.get<any[]>('/menu/items').pipe(
      map((items) =>
        items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description || '',
          price: (i.base_price_paise || 0) / 100,
          categoryId: i.category_id || '',
          isVeg: i.is_veg !== false,
          isAvailable: i.is_available !== false,
          dietary: (i.is_veg ? 'VEG' : 'NON_VEG') as any,
          imageUrl:
            i.image_url || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400',
          prepTimeMinutes: i.preparation_time_minutes || 15,
        })),
      ),
    );
  }

  getMenuItemById(id: string): Observable<MenuItem | null> {
    return this.getMenuItems().pipe(map((list) => list.find((m) => m.id === id) || null));
  }

  createCategory(category: any): Observable<MenuCategory> {
    return this.api.post<MenuCategory>('/menu/categories', category);
  }

  updateCategory(id: string, updates: Partial<MenuCategory>): Observable<MenuCategory> {
    return this.api.put<MenuCategory>(`/menu/categories/${id}`, updates);
  }

  deleteCategory(id: string): Observable<boolean> {
    return this.api.delete<boolean>(`/menu/categories/${id}`);
  }

  createMenuItem(item: any): Observable<MenuItem> {
    return this.api.post<MenuItem>('/menu/items', {
      ...item,
      base_price_paise: Math.round(item.price * 100),
    });
  }

  updateMenuItem(id: string, updates: Partial<MenuItem>): Observable<MenuItem> {
    return this.api.put<MenuItem>(`/menu/items/${id}`, updates);
  }

  deleteMenuItem(id: string): Observable<boolean> {
    return this.api.delete<boolean>(`/menu/items/${id}`);
  }

  toggleItemAvailability(id: string): Observable<MenuItem> {
    return this.getMenuItemById(id).pipe(
      map((item) => {
        const nextState = !item?.isAvailable;
        this.api
          .put<any>(`/menu/items/${id}/availability`, { is_available: nextState })
          .subscribe();
        return { ...item!, isAvailable: nextState };
      }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class ApiOrderRepository implements IOrderRepository {
  private api = inject(ApiClientService);

  getOrders(): Observable<Order[]> {
    return this.api
      .get<any>('/orders')
      .pipe(map((res) => (res.items || []).map((o: any) => this.mapOrder(o))));
  }

  getOrderById(id: string): Observable<Order | null> {
    return this.api.get<any>(`/orders/${id}`).pipe(map((o) => (o ? this.mapOrder(o) : null)));
  }

  getOrdersByTable(tableId: string): Observable<Order[]> {
    return this.getOrders().pipe(map((list) => list.filter((o) => o.tableId === tableId)));
  }

  createOrder(dto: any): Observable<Order> {
    return this.api
      .post<any>('/orders', {
        order_type: (dto.orderType || 'dine_in').toLowerCase(),
        table_id: dto.tableId,
        customer_id: dto.customerId,
        items: (dto.items || []).map((it: any) => ({
          menu_item_id: it.menuItemId,
          item_name: it.name,
          quantity: it.quantity,
          unit_price_paise: Math.round(it.price * 100),
          notes: it.notes,
        })),
        notes: dto.specialInstructions,
      })
      .pipe(map((res) => this.mapOrder(res.order || res)));
  }

  updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Observable<Order> {
    return this.api
      .put<any>(`/orders/${orderId}/status`, {
        status: status.toLowerCase(),
        notes: note,
      })
      .pipe(map((o) => this.mapOrder(o)));
  }

  updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    method?: any,
  ): Observable<Order> {
    return this.api
      .post<any>(`/orders/${orderId}/settle`, {
        payment_method: (method || 'upi').toLowerCase(),
        amount_paise: 0,
      })
      .pipe(map((res) => this.mapOrder(res)));
  }

  private mapOrder(o: any): Order {
    return {
      id: o.id,
      orderNumber: o.order_number,
      orderType: (o.order_type || 'DINE_IN').toUpperCase() as any,
      tableId: o.table_id,
      restaurantSlug: 'gurukripa-dhaba',
      customerName: o.customer_name || 'Walk-in Guest',
      customerPhone: o.customer_phone || '',
      status: (o.status || 'CONFIRMED').toUpperCase() as OrderStatus,
      paymentStatus: (o.payment_status === 'paid' ? 'PAID' : 'UNPAID') as PaymentStatus,
      paymentMethod: 'UPI',
      items: (o.items || []).map((it: any) => ({
        id: it.id,
        menuItemId: it.menu_item_id || it.id,
        name: it.item_name || it.name,
        selectedVariants: [],
        selectedAddons: [],
        unitPrice: (it.unit_price_paise || 0) / 100,
        quantity: it.quantity,
        itemTotal: (it.total_paise || 0) / 100,
      })),
      subtotal: (o.subtotal_paise || 0) / 100,
      taxAmount: (o.tax_paise || 0) / 100,
      cgstAmount: (o.tax_paise || 0) / 2 / 100,
      sgstAmount: (o.tax_paise || 0) / 2 / 100,
      discountAmount: (o.discount_paise || 0) / 100,
      totalAmount: (o.total_amount_paise || 0) / 100,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      settledAt: o.settled_at,
      timeline: [],
    };
  }
}

@Injectable({ providedIn: 'root' })
export class ApiCouponRepository implements ICouponRepository {
  private api = inject(ApiClientService);

  getCoupons(): Observable<Coupon[]> {
    return this.api.get<any[]>('/coupons').pipe(
      map((items) =>
        items.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.description || c.code,
          description: c.description || '',
          discountType: c.discount_type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
          discountValue: c.discount_value,
          minOrderValue: (c.min_order_amount_paise || 0) / 100,
          maxDiscountAmount: c.max_discount_amount_paise
            ? c.max_discount_amount_paise / 100
            : undefined,
          validFrom: c.start_date || '2026-01-01T00:00:00Z',
          validUntil: c.end_date || '2026-12-31T23:59:59Z',
          usageLimit: 1000,
          perCustomerLimit: c.one_time_per_customer ? 1 : 10,
          redemptionCount: 0,
          isActive: c.is_active,
        })),
      ),
    );
  }

  getCouponByCode(code: string): Observable<Coupon | null> {
    return this.getCoupons().pipe(map((list) => list.find((c) => c.code === code) || null));
  }

  getEligibleCouponsForCustomer(
    customerIdOrPhone: string,
    orderSubtotal: number,
  ): Observable<Coupon[]> {
    return this.getCoupons().pipe(
      map((list) => list.filter((c) => c.isActive && orderSubtotal >= c.minOrderValue)),
    );
  }

  validateCoupon(
    code: string,
    subtotal: number,
    customerIdOrPhone?: string,
  ): Observable<CouponValidationResult> {
    return this.api
      .post<any>('/coupons/validate', {
        code,
        order_amount_paise: Math.round(subtotal * 100),
        customer_phone: customerIdOrPhone,
      })
      .pipe(
        map((res) => ({
          isValid: res.is_valid,
          discountAmount: (res.discount_paise || 0) / 100,
          reason: res.message,
        })),
      );
  }

  createCoupon(coupon: any): Observable<Coupon> {
    return this.api.post<Coupon>('/coupons', coupon);
  }

  updateCoupon(id: string, updates: Partial<Coupon>): Observable<Coupon> {
    return this.api.put<Coupon>(`/coupons/${id}`, updates);
  }

  assignCouponToCustomer(couponId: string, customerId: string): Observable<Coupon> {
    return this.api.post<Coupon>(`/coupons/${couponId}/assign`, { customer_id: customerId });
  }
}

@Injectable({ providedIn: 'root' })
export class ApiBillingRepository implements IBillingRepository {
  private api = inject(ApiClientService);

  getInvoices(): Observable<Invoice[]> {
    return this.api.get<Invoice[]>('/invoices');
  }

  getInvoiceByOrderId(orderId: string): Observable<Invoice | null> {
    return this.api.get<Invoice>(`/orders/${orderId}/invoice`);
  }

  generateInvoice(orderId: string): Observable<Invoice> {
    return this.api.get<Invoice>(`/orders/${orderId}/receipt`);
  }

  markInvoicePrinted(invoiceId: string): Observable<Invoice> {
    return this.api.put<Invoice>(`/invoices/${invoiceId}/print`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class ApiReservationRepository implements IReservationRepository {
  private api = inject(ApiClientService);

  getReservations(): Observable<Reservation[]> {
    return this.api.get<any[]>('/reservations').pipe(
      map((items) =>
        items.map((r) => ({
          id: r.id,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          partySize: r.guest_count,
          reservationTime: r.reservation_time,
          reservationDate: r.reservation_time ? r.reservation_time.split('T')[0] : '2026-10-27',
          status: (r.status || 'CONFIRMED').toUpperCase() as ReservationStatus,
          tableId: r.table_id,
          specialRequests: r.special_requests,
          createdAt: r.created_at,
        })),
      ),
    );
  }

  createReservation(dto: any): Observable<Reservation> {
    return this.api.post<Reservation>('/reservations', {
      table_id: dto.tableId,
      customer_name: dto.customerName,
      customer_phone: dto.customerPhone,
      guest_count: dto.partySize,
      reservation_time: dto.reservationTime,
      special_requests: dto.specialRequests,
    });
  }

  updateReservationStatus(id: string, status: ReservationStatus): Observable<Reservation> {
    return this.api.put<Reservation>(`/reservations/${id}/status`, {
      status: status.toLowerCase(),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class ApiStaffRepository implements IStaffRepository {
  private api = inject(ApiClientService);

  getStaffMembers(): Observable<StaffMember[]> {
    return this.api.get<any[]>('/restaurants/staff').pipe(
      map((items) =>
        items.map((s) => ({
          id: s.id,
          name: s.name,
          role: 'MANAGER' as any,
          email: s.email || 'staff@hotelcrm.local',
          phone: s.phone || '+91 98765 00000',
          shift: 'GENERAL',
          status: s.is_active ? 'ACTIVE' : 'INACTIVE',
          joinedAt: s.created_at,
        })),
      ),
    );
  }

  createStaff(staff: any): Observable<StaffMember> {
    return this.api.post<StaffMember>('/restaurants/staff', staff);
  }

  updateStaff(id: string, updates: Partial<StaffMember>): Observable<StaffMember> {
    return this.api.put<StaffMember>(`/restaurants/staff/${id}`, updates);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiLoyaltyRepository implements ILoyaltyRepository {
  private api = inject(ApiClientService);

  getTiers(): Observable<LoyaltyTierConfig[]> {
    return of([]);
  }

  getTransactions(): Observable<LoyaltyTransaction[]> {
    return of([]);
  }

  adjustPoints(
    customerId: string,
    pointsDelta: number,
    description: string,
  ): Observable<LoyaltyTransaction> {
    const tx: LoyaltyTransaction = {
      id: `tx-${Date.now()}`,
      customerId,
      pointsDelta,
      balanceAfter: pointsDelta,
      type: pointsDelta >= 0 ? 'EARNED' : 'REDEEMED',
      description,
      createdAt: new Date().toISOString(),
    };
    return of(tx);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiFeedbackRepository implements IFeedbackRepository {
  private api = inject(ApiClientService);

  getFeedbacks(): Observable<Feedback[]> {
    return of([]);
  }

  submitFeedback(feedback: Omit<Feedback, 'id' | 'createdAt' | 'status'>): Observable<Feedback> {
    const created: Feedback = {
      ...feedback,
      id: `fb-${Date.now()}`,
      status: 'NEW',
      createdAt: new Date().toISOString(),
    };
    return of(created);
  }

  respondToFeedback(id: string, response: string): Observable<Feedback> {
    return of({} as Feedback);
  }
}

