import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Restaurant } from '../../core/models/restaurant.model';
import { Customer } from '../../core/models/customer.model';
import { Table, TableStatus } from '../../core/models/table.model';
import { MenuCategory, MenuItem } from '../../core/models/menu.model';
import { Order, OrderItem, OrderStatus, PaymentStatus } from '../../core/models/order.model';
import {
  Coupon,
  CouponAssignment,
  CouponRedemption,
  CouponEligibilityRequest,
  CouponEligibilityResponse,
  CouponValidationResult,
} from '../../core/models/coupon.model';
import {
  Invoice,
  TableTransferRecord,
  SplitBill,
  RefundRecord,
} from '../../core/models/billing.model';
import { Reservation, ReservationStatus } from '../../core/models/reservation.model';
import { LoyaltyTierConfig, LoyaltyTransaction } from '../../core/models/loyalty.model';
import { Feedback } from '../../core/models/feedback.model';
import { StaffMember } from '../../core/models/staff.model';
import { AuditLogEntry } from '../../core/models/audit.model';
import { normalizeToE164, maskPhone } from '../../core/utils/phone.util';
import { generateUUID, generateIdempotencyKey } from '../../core/utils/idempotency.util';
import {
  Ingredient,
  Recipe,
  RecipeItem,
  StockMovement,
  StockMovementType,
  MenuStockStatus,
  StockAvailabilityCheck,
  StockReservation,
  MeasurementUnit,
  roundStock,
  sanitizeStockQuantity,
  convertUnit,
  areUnitsCompatible,
} from '../../core/models/inventory.model';

const STORAGE_PREFIX = 'royal_spice_';

@Injectable()
export class MockDataService {
  private http = inject(HttpClient);

  // Reactive State Signals
  readonly restaurant = signal<Restaurant | null>(null);
  readonly customers = signal<Customer[]>([]);
  readonly tables = signal<Table[]>([]);
  readonly categories = signal<MenuCategory[]>([]);
  readonly menuItems = signal<MenuItem[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly coupons = signal<Coupon[]>([]);
  readonly couponAssignments = signal<CouponAssignment[]>([]);
  readonly couponRedemptions = signal<CouponRedemption[]>([]);
  readonly auditLogs = signal<AuditLogEntry[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly loyaltyTiers = signal<LoyaltyTierConfig[]>([]);
  readonly loyaltyTransactions = signal<LoyaltyTransaction[]>([]);
  readonly feedbacks = signal<Feedback[]>([]);
  readonly staffMembers = signal<StaffMember[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly splitBills = signal<SplitBill[]>([]);
  readonly refunds = signal<RefundRecord[]>([]);
  readonly tableTransfers = signal<TableTransferRecord[]>([]);
  readonly ingredients = signal<Ingredient[]>([]);
  readonly recipes = signal<Recipe[]>([]);
  readonly stockMovements = signal<StockMovement[]>([]);
  readonly stockReservations = signal<StockReservation[]>([]);
  readonly isInitialized = signal<boolean>(false);

  constructor() {
    this.initializeData();
  }

  initializeData(): void {
    this.initFallbackRestaurant();
    this.categories.set([]);
    this.menuItems.set(this.getDefaultMenuItems());
    this.orders.set([]);
    this.customers.set([]);
    this.tables.set([]);
    this.coupons.set([]);
    this.reservations.set([]);
    this.staffMembers.set([]);
    this.feedbacks.set([]);
    this.loyaltyTiers.set([]);
    this.loyaltyTransactions.set([]);
    this.invoices.set([]);
    this.splitBills.set([]);
    this.refunds.set([]);
    this.tableTransfers.set([]);
    this.ingredients.set(this.getDefaultIngredients());
    this.recipes.set(this.getDefaultRecipes());
    this.stockMovements.set([]);
    this.stockReservations.set([]);
    this.isInitialized.set(true);
  }

  /**
   * Normalizes legacy orders from localStorage or JSON seeds:
   * Orders lacking an explicit orderType are classified as 'DINE_IN' if they have a valid table association.
   * Ambiguous or malformed orders without table associations are preserved without fabricating fake tables.
   */
  normalizeLegacyOrders(rawOrders: Order[]): Order[] {
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders.map((ord) => {
      if (ord.orderType === 'TAKEAWAY' || ord.orderType === 'DINE_IN') {
        return ord;
      }
      if (ord.tableId || ord.tableNumber) {
        return {
          ...ord,
          orderType: 'DINE_IN' as const,
        };
      }
      return ord;
    });
  }

  private buildInitialInvoices(orders: Order[]): void {
    const list: Invoice[] = orders
      .filter(
        (o) => o.paymentStatus === 'PAID' || o.status === 'SERVED' || o.status === 'COMPLETED',
      )
      .map((ord) => ({
        id: `inv-${ord.id}`,
        invoiceNumber: `INV-2026-${ord.orderNumber.replace(/[^0-9]/g, '')}`,
        orderId: ord.id,
        orderNumber: ord.orderNumber,
        orderType: ord.orderType,
        pickupReference: ord.pickupReference,
        tableNumber: ord.tableNumber,
        customerName: ord.customerName,
        customerPhone: ord.customerPhone,
        issuedAt: ord.updatedAt || ord.createdAt,
        items: ord.items,
        subtotal: ord.subtotal,
        discount: ord.discountAmount,
        appliedCouponCode: ord.appliedCouponCode,
        taxBreakdown: [
          { name: 'CGST (2.5%)', rate: 2.5, amount: ord.cgstAmount },
          { name: 'SGST (2.5%)', rate: 2.5, amount: ord.sgstAmount },
        ],
        totalTax: ord.taxAmount,
        finalTotal: ord.totalAmount,
        paymentStatus: ord.paymentStatus,
        paymentMethod: ord.paymentMethod,
      }));
    this.invoices.set(list);
    this.saveLocal('invoices', list);
  }

  initFallbackRestaurant(): void {
    this.restaurant.set({
      id: 'rest-001',
      slug: 'gurukripa-dhaba',
      name: 'GuruKripa Dhaba',
      tagline: 'Artisanal Mughlai & Contemporary Indian Bistro',
      description:
        'Authentic royal recipes, charcoal tandoori marvels, and modern culinary interpretations.',
      coverImage:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80',
      logoUrl:
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=240&q=80',
      cuisine: ['North Indian', 'Mughlai', 'Biryani', 'Awadhi', 'Tandoor'],
      rating: 4.85,
      reviewCount: 1420,
      address: {
        street: '14 Heritage Promenade, MG Road',
        area: 'Civil Lines',
        city: 'Bengaluru',
        state: 'Karnataka',
        zip: '560001',
      },
      contact: {
        phone: '+91 80 4912 8800',
        email: 'concierge@royalspice.dining',
        website: 'https://royalspice.dining',
      },
      openingHours: [
        { days: 'Monday – Friday', hours: '12:00 PM – 03:30 PM, 07:00 PM – 11:30 PM' },
        { days: 'Saturday – Sunday', hours: '12:00 PM – 11:45 PM' },
      ],
      currency: 'INR',
      currencySymbol: '₹',
      taxSettings: {
        enableGst: true,
        cgstRate: 2.5,
        sgstRate: 2.5,
        serviceChargeRate: 5.0,
        gstNumber: '29AAAAA0000A1Z5',
      },
      orderingSettings: {
        dineInEnabled: true,
        takeawayEnabled: true,
        minOrderAmount: 200,
        estimatedPrepMinutes: 25,
      },
    });
  }

  // Local Storage Helpers
  saveLocal<T>(key: string, data: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not persist to localStorage', e);
    }
  }

  loadLocal<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  loadLocalArray<T>(key: string): T[] | null {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (!Array.isArray(parsed)) {
        console.warn(`[MockDataService] Corrupted localStorage array for key ${key}:`, parsed);
        return null;
      }
      return parsed as T[];
    } catch (e) {
      console.warn(`[MockDataService] Malformed JSON in localStorage for key ${key}:`, e);
      return null;
    }
  }

  loadLocalObject<T extends object>(key: string): T | null {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn(`[MockDataService] Corrupted localStorage object for key ${key}:`, parsed);
        return null;
      }
      return parsed as T;
    } catch (e) {
      console.warn(`[MockDataService] Malformed JSON in localStorage for key ${key}:`, e);
      return null;
    }
  }

  resetAllDemoData(): void {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(k);
        }
      }
      this.initializeData();
    } catch (e) {
      console.error('Reset failed', e);
    }
  }

  // ============================================================================
  // SERVER SIMULATION CONTRACT LAYER
  // [DISCLAIMER: NON-SECURE CLIENT-SIDE SIMULATION]
  // In production with Supabase / PostgreSQL, these validations and transactions
  // are executed entirely on the server using Row-Level Security (RLS) and
  // stored procedures (fn_validate_coupon_server_side / fn_create_order_atomic).
  // ============================================================================

  /**
   * Simulates authoritative server-side coupon validation.
   * NEVER trust client-computed discounts.
   */
  simulateServerCouponValidation(req: CouponEligibilityRequest): CouponEligibilityResponse {
    const now = new Date();
    const checkedAt = now.toISOString();

    const code = req.couponCode.trim().toUpperCase();
    const coupon = this.coupons().find((c) => c.code.toUpperCase() === code && c.isActive);

    if (!coupon) {
      return {
        isValid: false,
        authorizedDiscountAmount: 0,
        rejectionReason: 'Promo code not recognized or promotion is inactive',
        calculatedBy: 'SERVER_AUTHORITATIVE',
        checkedAt,
      };
    }

    // 1. Date Validity Check
    if (new Date(coupon.validFrom) > now) {
      return {
        isValid: false,
        authorizedDiscountAmount: 0,
        couponId: coupon.id,
        rejectionReason: 'Promotion has not started yet',
        calculatedBy: 'SERVER_AUTHORITATIVE',
        checkedAt,
      };
    }

    if (new Date(coupon.validUntil) < now) {
      return {
        isValid: false,
        authorizedDiscountAmount: 0,
        couponId: coupon.id,
        rejectionReason: 'Promotion has expired',
        calculatedBy: 'SERVER_AUTHORITATIVE',
        checkedAt,
      };
    }

    // 2. Minimum Order Value Check
    if (req.cartSubtotal < coupon.minOrderValue) {
      const shortfall = coupon.minOrderValue - req.cartSubtotal;
      return {
        isValid: false,
        authorizedDiscountAmount: 0,
        couponId: coupon.id,
        rejectionReason: `Minimum order spend of ₹${coupon.minOrderValue} required for this coupon (add ₹${shortfall} more).`,
        calculatedBy: 'SERVER_AUTHORITATIVE',
        checkedAt,
      };
    }

    // 3. Global Usage Cap Check
    if (coupon.redemptionCount >= coupon.usageLimit) {
      return {
        isValid: false,
        authorizedDiscountAmount: 0,
        couponId: coupon.id,
        rejectionReason: 'Global redemption quota for this campaign has been reached',
        calculatedBy: 'SERVER_AUTHORITATIVE',
        checkedAt,
      };
    }

    let matchingAssignment: CouponAssignment | undefined;

    // 4. Targeted Coupon Entitlement Check
    const isTargeted =
      coupon.isTargeted || (coupon.assignedCustomerIds && coupon.assignedCustomerIds.length > 0);
    if (isTargeted) {
      const normPhone = req.customerPhoneE164 ? normalizeToE164(req.customerPhoneE164) : '';
      const hasDirectIdMatch =
        req.customerId && coupon.assignedCustomerIds?.includes(req.customerId);
      const hasDirectPhoneMatch =
        req.customerPhoneE164 && coupon.assignedCustomerIds?.includes(req.customerPhoneE164);

      matchingAssignment = this.couponAssignments().find(
        (a) =>
          a.couponId === coupon.id &&
          a.status === 'ACTIVE' &&
          ((req.customerId && a.customerId === req.customerId) ||
            (normPhone && normalizeToE164(a.customerPhoneE164) === normPhone)),
      );

      if (!matchingAssignment && !hasDirectIdMatch && !hasDirectPhoneMatch) {
        return {
          isValid: false,
          authorizedDiscountAmount: 0,
          couponId: coupon.id,
          rejectionReason: 'This exclusive coupon is assigned to selected VIP patron accounts.',
          calculatedBy: 'SERVER_AUTHORITATIVE',
          checkedAt,
        };
      }

      if (
        matchingAssignment &&
        matchingAssignment.redemptionsUsed >= matchingAssignment.maxRedemptions
      ) {
        return {
          isValid: false,
          authorizedDiscountAmount: 0,
          couponId: coupon.id,
          assignmentId: matchingAssignment.id,
          rejectionReason: 'You have exhausted your entitlement limit for this privilege',
          calculatedBy: 'SERVER_AUTHORITATIVE',
          checkedAt,
        };
      }
    }

    // 5. Per-Customer Redemption Limit Check
    if (req.customerId) {
      const pastRedemptions = this.couponRedemptions().filter(
        (r) => r.couponId === coupon.id && r.customerId === req.customerId,
      ).length;

      if (pastRedemptions >= coupon.perCustomerLimit) {
        return {
          isValid: false,
          authorizedDiscountAmount: 0,
          couponId: coupon.id,
          rejectionReason: 'You have already reached the maximum usage limit for this coupon',
          calculatedBy: 'SERVER_AUTHORITATIVE',
          checkedAt,
        };
      }
    }

    // 6. Authoritative Discount Calculation
    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = (req.cartSubtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
        discount = coupon.maxDiscountAmount;
      }
    } else {
      discount = coupon.discountValue;
    }

    discount = Math.min(discount, req.cartSubtotal);
    discount = Math.round(discount * 100) / 100;

    return {
      isValid: true,
      authorizedDiscountAmount: discount,
      couponId: coupon.id,
      assignmentId: matchingAssignment?.id,
      calculatedBy: 'SERVER_AUTHORITATIVE',
      checkedAt,
    };
  }

  /**
   * Assigns a targeted coupon entitlement to a verified customer record.
   */
  assignCouponToCustomer(
    couponId: string,
    customerId: string,
    assignedBy = 'Ranveer B. (General Manager)',
    maxRedemptions = 1,
    notes = '',
  ): CouponAssignment {
    const coupon = this.coupons().find((c) => c.id === couponId);
    const customer = this.customers().find((c) => c.id === customerId);

    if (!coupon) throw new Error('Coupon not found');
    if (!customer) throw new Error('Customer record not found');

    const newAssignment: CouponAssignment = {
      id: `asgn-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 6)}`,
      restaurantId: coupon.restaurantId || 'rest-001',
      couponId: coupon.id,
      couponCode: coupon.code,
      customerId: customer.id,
      customerPhoneE164: customer.phoneE164 || normalizeToE164(customer.phone),
      customerName: customer.name,
      assignedBy,
      assignedAt: new Date().toISOString(),
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      maxRedemptions,
      redemptionsUsed: 0,
      status: 'ACTIVE',
      notes,
    };

    const updated = [newAssignment, ...this.couponAssignments()];
    this.couponAssignments.set(updated);
    this.saveLocal('coupon_assignments', updated);

    // Audit Log Entry
    this.recordAuditLog({
      restaurantId: 'rest-001',
      actorRole: 'STAFF',
      actorLabel: assignedBy,
      action: 'COUPON_ASSIGNED',
      entityType: 'COUPON_ASSIGNMENT',
      entityId: newAssignment.id,
      payloadAfter: newAssignment as any,
      notes: `Assigned ${coupon.code} to ${customer.name} (${newAssignment.customerPhoneE164})`,
    });

    return newAssignment;
  }

  /**
   * Revokes a targeted coupon assignment entitlement.
   */
  revokeCouponAssignment(assignmentId: string): void {
    const current = this.couponAssignments();
    const target = current.find((a) => a.id === assignmentId);
    if (!target) return;

    const updated = current.map((a) =>
      a.id === assignmentId ? { ...a, status: 'REVOKED' as const } : a,
    );
    this.couponAssignments.set(updated);
    this.saveLocal('coupon_assignments', updated);

    this.recordAuditLog({
      restaurantId: 'rest-001',
      actorRole: 'STAFF',
      actorLabel: 'Ranveer B. (General Manager)',
      action: 'COUPON_REVOKED',
      entityType: 'COUPON_ASSIGNMENT',
      entityId: assignmentId,
      payloadBefore: target as any,
      notes: `Revoked entitlement ${target.couponCode} for customer ${target.customerId}`,
    });
  }

  /**
   * Simulates atomic, idempotent order submission with concurrency locks and audit logging.
   */
  simulateIdempotentOrderSubmission(req: {
    idempotencyKey: string;
    order: Order;
    appliedCouponCode?: string;
  }): { success: boolean; isCachedReplay: boolean; order: Order; error?: string } {
    // 1. Idempotency Check (Safe Retry)
    const existingOrder = this.orders().find((o) => o.idempotencyKey === req.idempotencyKey);
    if (existingOrder) {
      return { success: true, isCachedReplay: true, order: existingOrder };
    }

    const isTakeaway = req.order.orderType === 'TAKEAWAY';

    // 2. Authoritative Table / Takeaway Eligibility Check
    let assignedTable: Table | undefined;
    if (isTakeaway) {
      const rest = this.restaurant();
      if (rest?.orderingSettings?.takeawayEnabled === false) {
        return {
          success: false,
          isCachedReplay: false,
          order: req.order,
          error: 'Takeaway ordering is currently disabled for this restaurant.',
        };
      }
    } else {
      // Dine-in order requires a valid, clean, ordering-enabled table
      assignedTable = this.tables().find(
        (t) =>
          (req.order.tableId && t.id === req.order.tableId) ||
          (req.order.tableNumber && t.number === req.order.tableNumber),
      );
      if (!assignedTable) {
        return {
          success: false,
          isCachedReplay: false,
          order: req.order,
          error: 'Table not found. Dine-in orders must be linked to a valid table.',
        };
      }
      if (assignedTable.orderingEnabled === false) {
        return {
          success: false,
          isCachedReplay: false,
          order: req.order,
          error: `Ordering is disabled for Table ${assignedTable.number}.`,
        };
      }
      if (assignedTable.status === 'DIRTY') {
        return {
          success: false,
          isCachedReplay: false,
          order: req.order,
          error: `Table ${assignedTable.number} is currently being cleaned. Ordering is unavailable.`,
        };
      }
    }

    // 3. Authoritative Stock Availability Pre-Flight Check (ATP & Active Menu Availability)
    const stockValidation = this.validateOrderStockAvailability(req.order.items);
    if (!stockValidation.isValid) {
      return {
        success: false,
        isCachedReplay: false,
        order: req.order,
        error: stockValidation.errors.join('; ') || 'Insufficient available stock for this order.',
      };
    }

    // 4. Validate Coupon Authoritatively if code was specified
    let couponDiscount = 0;
    let couponRecord: Coupon | undefined;
    let assignmentRecord: CouponAssignment | undefined;

    if (req.appliedCouponCode) {
      const valResult = this.simulateServerCouponValidation({
        couponCode: req.appliedCouponCode,
        cartSubtotal: req.order.subtotal,
        customerId: req.order.customerId,
        customerPhoneE164: req.order.customerPhoneE164 || normalizeToE164(req.order.customerPhone),
      });

      if (!valResult.isValid) {
        return {
          success: false,
          isCachedReplay: false,
          order: req.order,
          error: valResult.rejectionReason || 'Coupon validation failed on server',
        };
      }

      couponDiscount = valResult.authorizedDiscountAmount;
      couponRecord = this.coupons().find((c) => c.id === valResult.couponId);
      if (valResult.assignmentId) {
        assignmentRecord = this.couponAssignments().find((a) => a.id === valResult.assignmentId);
      }
    }

    // 5. Atomically Commit Order
    const pickupRef = isTakeaway
      ? req.order.pickupReference ||
        `TK-${(req.order.orderNumber || '').replace(/[^0-9]/g, '') || Math.floor(100 + Math.random() * 900)}`
      : undefined;

    const finalizedOrder: Order = {
      ...req.order,
      orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
      pickupReference: pickupRef,
      tableId: isTakeaway ? undefined : assignedTable?.id,
      tableNumber: isTakeaway ? undefined : assignedTable?.number,
      idempotencyKey: req.idempotencyKey,
      discountAmount: couponDiscount,
      appliedCouponCode: couponRecord?.code,
      appliedCouponId: couponRecord?.id,
    };

    const updatedOrders = [finalizedOrder, ...this.orders()];
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    // If order was created in ACCEPTED status, reserve stock immediately
    if (finalizedOrder.status === 'ACCEPTED') {
      this.reserveStockForOrder(finalizedOrder.id);
    }

    // Transition table to OCCUPIED only for dine-in orders
    if (!isTakeaway && assignedTable) {
      const updatedTables = this.tables().map((t) =>
        t.id === assignedTable!.id ? { ...t, status: 'OCCUPIED' as const } : t,
      );
      this.tables.set(updatedTables);
      this.saveLocal('tables', updatedTables);
    }

    // 4. Record Coupon Redemption & Increment Limits
    if (couponRecord) {
      const redemption: CouponRedemption = {
        id: `redemp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        restaurantId: finalizedOrder.restaurantId || 'rest-001',
        couponId: couponRecord.id,
        couponCode: couponRecord.code,
        assignmentId: assignmentRecord?.id,
        customerId: finalizedOrder.customerId || 'cust-anon',
        orderId: finalizedOrder.id,
        discountAmountApplied: couponDiscount,
        idempotencyKey: req.idempotencyKey,
        redeemedAt: new Date().toISOString(),
      };

      const updatedRedemptions = [redemption, ...this.couponRedemptions()];
      this.couponRedemptions.set(updatedRedemptions);
      this.saveLocal('coupon_redemptions', updatedRedemptions);

      // Increment campaign counter
      const updatedCoupons = this.coupons().map((c) =>
        c.id === couponRecord!.id ? { ...c, redemptionCount: c.redemptionCount + 1 } : c,
      );
      this.coupons.set(updatedCoupons);
      this.saveLocal('coupons', updatedCoupons);

      // Increment assignment quota if targeted
      if (assignmentRecord) {
        const updatedAssignments = this.couponAssignments().map((a) => {
          if (a.id === assignmentRecord!.id) {
            const newUsed = a.redemptionsUsed + 1;
            return {
              ...a,
              redemptionsUsed: newUsed,
              status: newUsed >= a.maxRedemptions ? ('EXHAUSTED' as const) : a.status,
            };
          }
          return a;
        });
        this.couponAssignments.set(updatedAssignments);
        this.saveLocal('coupon_assignments', updatedAssignments);
      }
    }

    // 5. Record Audit Log
    this.recordAuditLog({
      restaurantId: finalizedOrder.restaurantId || 'rest-001',
      actorRole: 'CUSTOMER',
      actorLabel: isTakeaway
        ? `${finalizedOrder.customerName || 'Counter Guest'} (${pickupRef})`
        : `${finalizedOrder.customerName} (${finalizedOrder.tableNumber})`,
      action: 'ORDER_CREATED',
      entityType: 'ORDER',
      entityId: finalizedOrder.id,
      payloadAfter: finalizedOrder as any,
      notes: isTakeaway
        ? `Takeaway order created with pickup reference ${pickupRef} and idempotency key ${req.idempotencyKey}`
        : `Order created via table QR with idempotency key ${req.idempotencyKey}`,
    });

    return { success: true, isCachedReplay: false, order: finalizedOrder };
  }

  /**
   * Appends an immutable audit log entry.
   */
  recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const newLog: AuditLogEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    const updated = [newLog, ...this.auditLogs()];
    this.auditLogs.set(updated);
    this.saveLocal('audit_logs', updated);
  }

  // ============================================================================
  // PHASE 2: POS TRANSACTION WORKFLOWS (TABLE TRANSFERS, SPLIT BILLS, REFUNDS)
  // ============================================================================

  /**
   * Recalculates and updates table occupancy status based on active orders and reservations.
   * Centralizes table occupancy invariants so tables cannot prematurely become AVAILABLE.
   */
  recalculateTableStatus(tableIdOrNumber: string): TableStatus {
    const table = this.tables().find(
      (t) => t.id === tableIdOrNumber || t.number === tableIdOrNumber,
    );
    if (!table) return 'AVAILABLE';

    if (table.status === 'DIRTY') {
      return 'DIRTY';
    }

    const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
      'PENDING',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'SERVED',
    ];
    const activeOrders = this.orders().filter(
      (o) =>
        o.orderType !== 'TAKEAWAY' &&
        (o.tableId === table.id || o.tableNumber === table.number) &&
        ACTIVE_ORDER_STATUSES.includes(o.status),
    );

    const seatedRes = this.reservations().filter(
      (r) => (r.tableId === table.id || r.tableNumber === table.number) && r.status === 'SEATED',
    );

    const confirmedRes = this.reservations().filter(
      (r) => (r.tableId === table.id || r.tableNumber === table.number) && r.status === 'CONFIRMED',
    );

    let nextStatus: TableStatus = 'AVAILABLE';
    if (activeOrders.length > 0 || seatedRes.length > 0) {
      nextStatus = 'OCCUPIED';
    } else if (confirmedRes.length > 0) {
      nextStatus = 'RESERVED';
    }

    if (table.status !== nextStatus) {
      const updatedTables = this.tables().map((t) =>
        t.id === table.id ? { ...t, status: nextStatus } : t,
      );
      this.tables.set(updatedTables);
      this.saveLocal('tables', updatedTables);
    }

    return nextStatus;
  }

  /**
   * Authoritatively updates table status while enforcing occupancy invariants.
   * Prevents manual transitions to AVAILABLE if active orders or seated reservations exist.
   */
  updateTableStatus(
    tableIdOrNumber: string,
    newStatus: TableStatus,
  ): { success: boolean; error?: string; status: TableStatus; table?: Table } {
    const table = this.tables().find(
      (t) => t.id === tableIdOrNumber || t.number === tableIdOrNumber,
    );
    if (!table) {
      return { success: false, error: 'Table not found', status: 'AVAILABLE' };
    }

    const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
      'PENDING',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'SERVED',
    ];
    const activeOrders = this.orders().filter(
      (o) =>
        o.orderType !== 'TAKEAWAY' &&
        (o.tableId === table.id || o.tableNumber === table.number) &&
        ACTIVE_ORDER_STATUSES.includes(o.status),
    );

    const seatedRes = this.reservations().filter(
      (r) => (r.tableId === table.id || r.tableNumber === table.number) && r.status === 'SEATED',
    );

    const confirmedRes = this.reservations().filter(
      (r) => (r.tableId === table.id || r.tableNumber === table.number) && r.status === 'CONFIRMED',
    );

    // Guard: Cannot mark table AVAILABLE when active orders or seated reservations exist
    if (newStatus === 'AVAILABLE') {
      if (activeOrders.length > 0) {
        return {
          success: false,
          error: `Table ${table.number} has active order (${activeOrders[0].orderNumber}) in progress and cannot be marked Available.`,
          status: table.status,
          table,
        };
      }
      if (seatedRes.length > 0) {
        return {
          success: false,
          error: `Table ${table.number} has seated guests (${seatedRes[0].customerName}) and cannot be marked Available.`,
          status: table.status,
          table,
        };
      }
      if (confirmedRes.length > 0) {
        return {
          success: false,
          error: `Table ${table.number} is reserved for ${confirmedRes[0].customerName} and cannot be marked Available.`,
          status: table.status,
          table,
        };
      }
    }

    // Guard: Cannot mark table RESERVED if active orders are currently dining
    if (newStatus === 'RESERVED' && activeOrders.length > 0) {
      return {
        success: false,
        error: `Table ${table.number} is currently occupied by active order ${activeOrders[0].orderNumber}.`,
        status: table.status,
        table,
      };
    }

    // Allowed status transition (e.g. marking unoccupied table DIRTY for cleaning, or DIRTY -> AVAILABLE)
    const updatedTables = this.tables().map((t) =>
      t.id === table.id ? { ...t, status: newStatus } : t,
    );
    this.tables.set(updatedTables);
    this.saveLocal('tables', updatedTables);

    return {
      success: true,
      status: newStatus,
      table: { ...table, status: newStatus },
    };
  }

  /**
   * Transfers an eligible active order from source table to an eligible destination table.
   * Atomically updates order, destination table, source table, and billing invoice.
   */
  transferTable(req: { orderId: string; destinationTableId: string; staffName?: string }): {
    success: boolean;
    error?: string;
    transfer?: TableTransferRecord;
  } {
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return { success: false, error: 'Only eligible active orders can be transferred' };
    }

    if (order.orderType === 'TAKEAWAY' || !order.tableId) {
      return {
        success: false,
        error: 'Table transfers are available only for valid dine-in orders',
      };
    }

    const destTable = this.tables().find(
      (t) => t.id === req.destinationTableId || t.number === req.destinationTableId,
    );
    if (!destTable) {
      return { success: false, error: 'Destination table not found' };
    }

    const sourceTable = this.tables().find(
      (t) => t.id === order.tableId || t.number === order.tableNumber,
    );
    if (!sourceTable) {
      return { success: false, error: 'Source table not found' };
    }

    if (sourceTable.id === destTable.id || sourceTable.number === destTable.number) {
      return { success: false, error: 'Source and destination tables must be different' };
    }

    if (destTable.orderingEnabled === false) {
      return { success: false, error: `Table ${destTable.number} is disabled for ordering` };
    }

    if (destTable.status === 'DIRTY') {
      return {
        success: false,
        error: `Table ${destTable.number} is dirty and cannot accept guests`,
      };
    }

    if (destTable.status === 'OCCUPIED' || destTable.status === 'RESERVED') {
      return {
        success: false,
        error: `Table ${destTable.number} is currently ${destTable.status.toLowerCase()}`,
      };
    }

    // Check if destination table is occupied by another active order
    const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
      'PENDING',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'SERVED',
    ];
    const conflictingOrder = this.orders().find(
      (o) =>
        o.id !== order.id &&
        (o.tableId === destTable.id || o.tableNumber === destTable.number) &&
        ACTIVE_ORDER_STATUSES.includes(o.status),
    );
    if (conflictingOrder) {
      return {
        success: false,
        error: `Table ${destTable.number} is occupied by active order ${conflictingOrder.orderNumber}`,
      };
    }

    // Check if destination table has an active seated or confirmed reservation
    const conflictingDestRes = this.reservations().find(
      (r) =>
        (r.tableId === destTable.id || r.tableNumber === destTable.number) &&
        (r.status === 'CONFIRMED' || r.status === 'SEATED'),
    );
    if (conflictingDestRes) {
      return {
        success: false,
        error: `Table ${destTable.number} is reserved for customer ${conflictingDestRes.customerName}`,
      };
    }

    const now = new Date().toISOString();

    // 1. Create Transfer Record
    const transferRecord: TableTransferRecord = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sourceTableId: sourceTable.id,
      sourceTableNumber: sourceTable.number,
      destinationTableId: destTable.id,
      destinationTableNumber: destTable.number,
      transferredAt: now,
      staffName: req.staffName || 'Staff',
    };

    // 2. Update Order atomically
    const updatedOrder: Order = {
      ...order,
      tableId: destTable.id,
      tableNumber: destTable.number,
      updatedAt: now,
      timeline: [
        ...order.timeline,
        {
          status: 'TABLE_TRANSFERRED',
          timestamp: now,
          note: `Transferred from Table ${sourceTable.number} to Table ${destTable.number} by ${transferRecord.staffName}`,
        },
      ],
    };
    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    // 3. Update Table Statuses
    // Destination table becomes OCCUPIED
    // Source table becomes OCCUPIED if remaining active orders or seated reservations exist,
    // RESERVED if confirmed reservation exists, otherwise AVAILABLE.
    const remainingOrdersOnSource = updatedOrders.filter(
      (o) =>
        o.id !== order.id &&
        (o.tableId === sourceTable.id || o.tableNumber === sourceTable.number) &&
        ACTIVE_ORDER_STATUSES.includes(o.status),
    );
    const seatedResOnSource = this.reservations().filter(
      (r) =>
        (r.tableId === sourceTable.id || r.tableNumber === sourceTable.number) &&
        r.status === 'SEATED',
    );
    const confirmedResOnSource = this.reservations().filter(
      (r) =>
        (r.tableId === sourceTable.id || r.tableNumber === sourceTable.number) &&
        r.status === 'CONFIRMED',
    );

    let newSourceStatus: TableStatus = 'AVAILABLE';
    if (remainingOrdersOnSource.length > 0 || seatedResOnSource.length > 0) {
      newSourceStatus = 'OCCUPIED';
    } else if (confirmedResOnSource.length > 0) {
      newSourceStatus = 'RESERVED';
    } else if (sourceTable.status === 'DIRTY') {
      newSourceStatus = 'DIRTY';
    }

    const updatedTables = this.tables().map((t) => {
      if (t.id === destTable.id) {
        return { ...t, status: 'OCCUPIED' as TableStatus };
      }
      if (t.id === sourceTable.id) {
        return { ...t, status: newSourceStatus };
      }
      return t;
    });
    this.tables.set(updatedTables);
    this.saveLocal('tables', updatedTables);

    // 4. Update Invoices associated with this order
    const updatedInvoices = this.invoices().map((inv) =>
      inv.orderId === order.id ? { ...inv, tableNumber: destTable.number } : inv,
    );
    this.invoices.set(updatedInvoices);
    this.saveLocal('invoices', updatedInvoices);

    // 5. Append Transfer Record
    const updatedTransfers = [transferRecord, ...this.tableTransfers()];
    this.tableTransfers.set(updatedTransfers);
    this.saveLocal('table_transfers', updatedTransfers);

    // 6. Record Audit Log
    this.recordAuditLog({
      restaurantId: order.restaurantId || 'rest-001',
      actorRole: 'STAFF',
      actorLabel: transferRecord.staffName || 'Staff',
      action: 'ORDER_UPDATED' as any,
      entityType: 'ORDER',
      entityId: order.id,
      payloadAfter: {
        sourceTable: sourceTable.number,
        destinationTable: destTable.number,
        orderNumber: order.orderNumber,
      } as any,
      notes: `Order ${order.orderNumber} transferred from Table ${sourceTable.number} to Table ${destTable.number}`,
    });

    return { success: true, transfer: transferRecord };
  }

  /**
   * Splits an eligible order's bill equally across N splits.
   * Deterministically distributes remainder cents to ensure sum of split bills
   * reconciles 100% to the original payable amount, taxes, subtotal, and discount,
   * with zero internal component mismatch on each individual bill.
   */
  splitOrderEqual(req: { orderId: string; splitCount: number }): {
    success: boolean;
    error?: string;
    splitBills?: SplitBill[];
  } {
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.paymentStatus === 'PAID') {
      return { success: false, error: 'Cannot split an already settled bill' };
    }

    if (order.isSplit) {
      return { success: false, error: 'This order has already been split' };
    }

    const n = Math.floor(req.splitCount);
    if (n < 2 || n > 10) {
      return { success: false, error: 'Number of splits must be between 2 and 10' };
    }

    // Allocate in integer paise (cents) to guarantee zero arithmetic discrepancies
    const totalCents = Math.round(order.totalAmount * 100);
    const baseTotalCents = Math.floor(totalCents / n);
    const remTotalCents = totalCents % n;

    const subtotalCents = Math.round(order.subtotal * 100);
    const discountCents = Math.round(order.discountAmount * 100);
    const taxCents = Math.round(order.taxAmount * 100);

    const hasConsistentComponents =
      Math.abs(subtotalCents - discountCents + taxCents - totalCents) <= 1;

    let effSubCents = subtotalCents;
    let effDiscCents = discountCents;

    if (!hasConsistentComponents) {
      effSubCents = totalCents;
      effDiscCents = 0;
    }

    const baseSubCents = Math.floor(effSubCents / n);
    const remSubCents = effSubCents % n;

    const baseDiscCents = Math.floor(effDiscCents / n);
    const remDiscCents = effDiscCents % n;

    const splits: SplitBill[] = [];
    for (let i = 0; i < n; i++) {
      const tCents = baseTotalCents + (i < remTotalCents ? 1 : 0);
      const sCents = baseSubCents + (i < remSubCents ? 1 : 0);
      const dCents = baseDiscCents + (i < remDiscCents ? 1 : 0);
      const xCents = tCents - sCents + dCents;
      const cCents = Math.round(xCents / 2);
      const gCents = xCents - cCents;

      const billSubtotal = sCents / 100;
      const billDiscount = dCents / 100;
      const billTax = xCents / 100;
      const billTotal = tCents / 100;

      splits.push({
        id: `split-${order.id}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        pickupReference: order.pickupReference,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        splitIndex: i + 1,
        splitTotalCount: n,
        splitType: 'EQUAL',
        subtotal: billSubtotal,
        discountAmount: billDiscount,
        taxAmount: billTax,
        totalAmount: billTotal,
        paymentStatus: 'UNPAID',
        totalRefunded: 0,
        taxBreakdown: [
          { name: 'CGST (2.5%)', rate: 2.5, amount: cCents / 100 },
          { name: 'SGST (2.5%)', rate: 2.5, amount: gCents / 100 },
        ],
      });
    }

    // Persist split bills
    const updatedSplitBills = [...splits, ...this.splitBills()];
    this.splitBills.set(updatedSplitBills);
    this.saveLocal('split_bills', updatedSplitBills);

    // Update parent order
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      isSplit: true,
      splitCount: n,
      paymentStatus: 'PARTIALLY_PAID',
      updatedAt: now,
      timeline: [
        ...order.timeline,
        {
          status: 'BILL_SPLIT',
          timestamp: now,
          note: `Bill split into ${n} equal parts of approx ₹${splits[0].totalAmount}`,
        },
      ],
    };
    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    return { success: true, splitBills: splits };
  }

  /**
   * Splits an eligible order's bill based on item and quantity allocations.
   * Reconciles quantities, discounts, and taxes exactly to the parent order.
   */
  splitOrderItemBased(req: {
    orderId: string;
    splits: { allocatedItems: { orderItemId: string; quantity: number }[] }[];
  }): { success: boolean; error?: string; splitBills?: SplitBill[] } {
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.paymentStatus === 'PAID') {
      return { success: false, error: 'Cannot split an already settled bill' };
    }

    if (order.isSplit) {
      return { success: false, error: 'This order has already been split' };
    }

    if (!req.splits || req.splits.length < 2) {
      return { success: false, error: 'Item-based split requires at least 2 bills' };
    }

    // Verify quantity allocations
    const itemQuantityMap = new Map<string, number>();
    for (const item of order.items) {
      itemQuantityMap.set(item.id, item.quantity);
    }

    const allocatedQuantityMap = new Map<string, number>();
    for (const split of req.splits) {
      for (const alloc of split.allocatedItems) {
        if (
          !alloc ||
          typeof alloc.quantity !== 'number' ||
          alloc.quantity <= 0 ||
          isNaN(alloc.quantity)
        ) {
          return { success: false, error: 'Allocated item quantity must be greater than zero' };
        }
        if (!itemQuantityMap.has(alloc.orderItemId)) {
          return { success: false, error: `Invalid item ID "${alloc.orderItemId}" not in order` };
        }
        const current = allocatedQuantityMap.get(alloc.orderItemId) || 0;
        allocatedQuantityMap.set(alloc.orderItemId, current + alloc.quantity);
      }
    }

    // Must match total quantities of all items exactly
    for (const [itemId, originalQty] of itemQuantityMap.entries()) {
      const allocatedQty = allocatedQuantityMap.get(itemId) || 0;
      if (allocatedQty !== originalQty) {
        const itemObj = order.items.find((i) => i.id === itemId);
        return {
          success: false,
          error: `Item "${itemObj?.name || itemId}" total quantity (${originalQty}) must be fully allocated across splits (currently ${allocatedQty})`,
        };
      }
    }

    const n = req.splits.length;
    const splitBills: SplitBill[] = [];
    let accumulatedSubtotalCents = 0;
    let accumulatedDiscountCents = 0;
    let accumulatedTaxCents = 0;
    let accumulatedCgstCents = 0;
    let accumulatedSgstCents = 0;

    const totalSubCents = Math.round(order.subtotal * 100);
    const totalDiscCents = Math.round(order.discountAmount * 100);
    const totalTaxCents = Math.round(order.taxAmount * 100);
    const totalCgstCents = Math.round(order.cgstAmount * 100);
    const totalSgstCents = Math.round(order.sgstAmount * 100);

    for (let i = 0; i < n; i++) {
      const splitAlloc = req.splits[i];
      const isLast = i === n - 1;

      const splitItems: {
        orderItemId: string;
        name: string;
        unitPrice: number;
        quantity: number;
        itemTotal: number;
      }[] = [];
      let splitSubCents = 0;

      for (const alloc of splitAlloc.allocatedItems) {
        const orderItem = order.items.find((it) => it.id === alloc.orderItemId);
        if (!orderItem) continue;
        const lineTotalCents = Math.round(alloc.quantity * orderItem.unitPrice * 100);
        splitItems.push({
          orderItemId: orderItem.id,
          name: orderItem.name,
          unitPrice: orderItem.unitPrice,
          quantity: alloc.quantity,
          itemTotal: lineTotalCents / 100,
        });
        splitSubCents += lineTotalCents;
      }

      let sCents = splitSubCents;
      let dCents = 0;
      let cCents = 0;
      let gCents = 0;
      let xCents = 0;

      if (isLast) {
        sCents = totalSubCents - accumulatedSubtotalCents;
        dCents = totalDiscCents - accumulatedDiscountCents;
        cCents = totalCgstCents - accumulatedCgstCents;
        gCents = totalSgstCents - accumulatedSgstCents;
        xCents = cCents + gCents;
      } else {
        const ratio = totalSubCents > 0 ? sCents / totalSubCents : 1 / n;
        dCents = Math.round(totalDiscCents * ratio);
        cCents = Math.round(totalCgstCents * ratio);
        gCents = Math.round(totalSgstCents * ratio);
        xCents = cCents + gCents;

        accumulatedSubtotalCents += sCents;
        accumulatedDiscountCents += dCents;
        accumulatedCgstCents += cCents;
        accumulatedSgstCents += gCents;
        accumulatedTaxCents += xCents;
      }

      const tCents = sCents - dCents + xCents;

      splitBills.push({
        id: `split-${order.id}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        pickupReference: order.pickupReference,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        splitIndex: i + 1,
        splitTotalCount: n,
        splitType: 'ITEM_BASED',
        allocatedItems: splitItems,
        subtotal: sCents / 100,
        discountAmount: dCents / 100,
        taxAmount: xCents / 100,
        totalAmount: tCents / 100,
        paymentStatus: 'UNPAID',
        totalRefunded: 0,
        taxBreakdown: [
          { name: 'CGST (2.5%)', rate: 2.5, amount: cCents / 100 },
          { name: 'SGST (2.5%)', rate: 2.5, amount: gCents / 100 },
        ],
      });
    }

    // Persist split bills
    const updatedSplitBills = [...splitBills, ...this.splitBills()];
    this.splitBills.set(updatedSplitBills);
    this.saveLocal('split_bills', updatedSplitBills);

    // Update parent order
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      isSplit: true,
      splitCount: n,
      paymentStatus: 'PARTIALLY_PAID',
      updatedAt: now,
      timeline: [
        ...order.timeline,
        {
          status: 'BILL_SPLIT',
          timestamp: now,
          note: `Bill split into ${n} item-based bills`,
        },
      ],
    };
    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    return { success: true, splitBills };
  }

  /**
   * Settles an individual split bill via CASH or UPI.
   * If all sibling split bills for the order are settled, parent order becomes PAID.
   */
  settleSplitBill(req: {
    orderId: string;
    splitBillId: string;
    paymentMethod: 'CASH' | 'UPI' | 'CARD';
  }): {
    success: boolean;
    error?: string;
    splitBill?: SplitBill;
  } {
    const splitBill = this.splitBills().find((b) => b.id === req.splitBillId);
    if (!splitBill) return { success: false, error: 'Split bill not found' };

    if (splitBill.paymentStatus === 'PAID') {
      return { success: false, error: 'This split bill is already settled' };
    }
    if (splitBill.paymentStatus === 'REFUNDED') {
      return { success: false, error: 'Cannot settle a refunded split bill' };
    }
    if (splitBill.paymentStatus !== 'UNPAID') {
      return { success: false, error: 'Only unpaid split bills can be settled' };
    }

    const now = new Date().toISOString();
    const settledBill: SplitBill = {
      ...splitBill,
      paymentStatus: 'PAID',
      paymentMethod: req.paymentMethod,
      settledAt: now,
    };

    const updatedSplitBills = this.splitBills().map((b) =>
      b.id === splitBill.id ? settledBill : b,
    );
    this.splitBills.set(updatedSplitBills);
    this.saveLocal('split_bills', updatedSplitBills);

    // Check sibling split bills for this order
    const siblings = updatedSplitBills.filter((b) => b.orderId === req.orderId);
    const allSettled =
      siblings.length > 0 &&
      siblings.every((b) => b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED');
    const allPaid = siblings.length > 0 && siblings.every((b) => b.paymentStatus === 'PAID');

    // Update parent order status
    const order = this.orders().find((o) => o.id === req.orderId);
    if (order) {
      const updatedOrder: Order = {
        ...order,
        paymentStatus: allPaid ? 'PAID' : allSettled ? 'PAID' : 'PARTIALLY_PAID',
        paymentMethod: allSettled ? req.paymentMethod : order.paymentMethod,
        settledAt: allPaid || allSettled ? now : order.settledAt,
        updatedAt: now,
        timeline: [
          ...order.timeline,
          {
            status: allSettled ? 'PAID' : 'SPLIT_BILL_SETTLED',
            timestamp: now,
            note: `Split bill #${settledBill.splitIndex} (₹${settledBill.totalAmount}) settled via ${req.paymentMethod}`,
          },
        ],
      };
      const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
      this.orders.set(updatedOrders);
      this.saveLocal('orders', updatedOrders);
    }

    return { success: true, splitBill: settledBill };
  }

  /**
   * Authoritative settlement for a full dining order.
   * Rejects split orders to prevent bypass of split-bill reconciliation.
   */
  settleOrder(req: { orderId: string; paymentMethod: 'CASH' | 'UPI' | 'CARD' }): {
    success: boolean;
    error?: string;
    order?: Order;
    invoice?: Invoice;
  } {
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.paymentStatus === 'PAID') {
      return { success: false, error: `Order ${order.orderNumber} is already settled` };
    }

    if (order.isSplit) {
      return {
        success: false,
        error: `Order ${order.orderNumber} is split into individual bills. Settle via its split bills.`,
      };
    }

    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      paymentStatus: 'PAID',
      paymentMethod: req.paymentMethod,
      settledAt: now,
      updatedAt: now,
      timeline: [
        ...order.timeline,
        {
          status: 'PAID',
          timestamp: now,
          note: `Dining bill settled via ${req.paymentMethod} (₹${order.totalAmount})`,
        },
      ],
    };

    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    // Update Invoices
    const existingInvoices = this.invoices();
    const existingIndex = existingInvoices.findIndex((inv) => inv.orderId === order.id);
    let updatedInvoices: Invoice[];
    if (existingIndex > -1) {
      updatedInvoices = existingInvoices.map((inv) =>
        inv.orderId === order.id
          ? {
              ...inv,
              orderType: order.orderType,
              pickupReference: order.pickupReference,
              tableNumber: order.tableNumber,
              paymentStatus: 'PAID' as const,
              paymentMethod: req.paymentMethod,
              issuedAt: now,
            }
          : inv,
      );
    } else {
      const newInv: Invoice = {
        id: `inv-${order.id}`,
        invoiceNumber: `INV-2026-${order.orderNumber.replace(/[^0-9]/g, '')}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        pickupReference: order.pickupReference,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        issuedAt: now,
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
        paymentStatus: 'PAID',
        paymentMethod: req.paymentMethod,
      };
      updatedInvoices = [newInv, ...existingInvoices];
    }
    this.invoices.set(updatedInvoices);
    this.saveLocal('invoices', updatedInvoices);

    const generatedInvoice = updatedInvoices.find((inv) => inv.orderId === order.id);
    return { success: true, order: updatedOrder, invoice: generatedInvoice };
  }

  /**
   * Returns the remaining refundable balance for an order or split bill.
   */
  getRemainingRefundableAmount(orderId: string, splitBillId?: string): number {
    if (splitBillId) {
      const bill = this.splitBills().find((b) => b.id === splitBillId);
      if (!bill || bill.paymentStatus !== 'PAID') return 0;
      const completedRefunds = this.refunds()
        .filter((r) => r.splitBillId === splitBillId && r.status === 'COMPLETED')
        .reduce((sum, r) => sum + r.refundAmount, 0);
      return Math.max(0, Math.round((bill.totalAmount - completedRefunds) * 100) / 100);
    }

    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order || (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_PAID')) {
      return 0;
    }
    const completedRefunds = this.refunds()
      .filter((r) => r.orderId === order.id && r.status === 'COMPLETED')
      .reduce((sum, r) => sum + r.refundAmount, 0);
    return Math.max(0, Math.round((order.totalAmount - completedRefunds) * 100) / 100);
  }

  /**
   * Records a full or partial refund for a settled order or split bill.
   * Validates non-negative amounts, remaining refundable limits, idempotency, and maintains audit trail.
   */
  recordRefund(req: {
    orderId: string;
    splitBillId?: string;
    refundAmount: number;
    reason: string;
    staffName?: string;
    idempotencyKey?: string;
    status?: 'COMPLETED' | 'PENDING';
  }): { success: boolean; error?: string; refund?: RefundRecord } {
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_PAID') {
      return {
        success: false,
        error: 'Only settled or partially paid transactions can be refunded',
      };
    }

    if (typeof req.refundAmount !== 'number' || isNaN(req.refundAmount) || req.refundAmount <= 0) {
      return { success: false, error: 'Refund amount must be a positive number greater than zero' };
    }

    if (!req.reason || !req.reason.trim()) {
      return { success: false, error: 'A valid refund reason is required' };
    }

    const roundedAmount = Math.round(req.refundAmount * 100) / 100;

    // Idempotency and duplicate check
    if (req.idempotencyKey) {
      const existingKey = this.refunds().find((r) => r.idempotencyKey === req.idempotencyKey);
      if (existingKey) {
        return { success: true, refund: existingKey };
      }
    }

    // Protect against rapid accidental double submission within 3 seconds
    const recentDuplicate = this.refunds().find(
      (r) =>
        r.orderId === order.id &&
        r.splitBillId === req.splitBillId &&
        r.refundAmount === roundedAmount &&
        r.reason === req.reason.trim() &&
        Math.abs(Date.now() - new Date(r.createdAt).getTime()) < 3000,
    );
    if (recentDuplicate) {
      return { success: true, refund: recentDuplicate };
    }

    const splitBill = req.splitBillId
      ? this.splitBills().find((b) => b.id === req.splitBillId)
      : undefined;

    if (req.splitBillId && (!splitBill || splitBill.paymentStatus !== 'PAID')) {
      return { success: false, error: 'Split bill not found or not settled' };
    }

    const maxRefundable = this.getRemainingRefundableAmount(order.id, req.splitBillId);
    if (roundedAmount > maxRefundable + 0.0001) {
      return {
        success: false,
        error: `Refund amount (₹${roundedAmount}) exceeds maximum refundable balance (₹${maxRefundable})`,
      };
    }

    const now = new Date().toISOString();
    const refundStatus = req.status || 'COMPLETED';
    const refundRecord: RefundRecord = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      splitBillId: req.splitBillId,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      originalPaymentMethod: splitBill ? splitBill.paymentMethod : order.paymentMethod,
      refundAmount: roundedAmount,
      reason: req.reason.trim(),
      status: refundStatus,
      createdAt: now,
      completedAt: refundStatus === 'COMPLETED' ? now : undefined,
      staffName: req.staffName || 'Staff',
      idempotencyKey: req.idempotencyKey,
    };

    // 1. Append Refund Record
    const updatedRefunds = [refundRecord, ...this.refunds()];
    this.refunds.set(updatedRefunds);
    this.saveLocal('refunds', updatedRefunds);

    // Only COMPLETED refunds adjust remaining refundable balance and order/bill status
    if (refundStatus === 'COMPLETED') {
      // 2. Update split bill if applicable
      if (splitBill) {
        const allSplitRefunds = updatedRefunds
          .filter((r) => r.splitBillId === splitBill.id && r.status === 'COMPLETED')
          .reduce((sum, r) => sum + r.refundAmount, 0);
        const isSplitFullyRefunded = allSplitRefunds >= splitBill.totalAmount - 0.001;

        const updatedSplitBills = this.splitBills().map((b) =>
          b.id === splitBill.id
            ? {
                ...b,
                totalRefunded: allSplitRefunds,
                paymentStatus: isSplitFullyRefunded ? ('REFUNDED' as const) : b.paymentStatus,
              }
            : b,
        );
        this.splitBills.set(updatedSplitBills);
        this.saveLocal('split_bills', updatedSplitBills);
      }

      // 3. Update order status and refund totals
      const totalOrderRefunds = updatedRefunds
        .filter((r) => r.orderId === order.id && r.status === 'COMPLETED')
        .reduce((sum, r) => sum + r.refundAmount, 0);
      const isOrderFullyRefunded = totalOrderRefunds >= order.totalAmount - 0.001;

      const updatedOrder: Order = {
        ...order,
        totalRefunded: totalOrderRefunds,
        paymentStatus: isOrderFullyRefunded ? 'REFUNDED' : order.paymentStatus,
        updatedAt: now,
        timeline: [
          ...order.timeline,
          {
            status: 'REFUND_RECORDED',
            timestamp: now,
            note: `Refund of ₹${refundRecord.refundAmount} recorded. Reason: ${refundRecord.reason}`,
          },
        ],
      };
      const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
      this.orders.set(updatedOrders);
      this.saveLocal('orders', updatedOrders);

      // 4. Update Invoice status if order is fully refunded
      if (isOrderFullyRefunded) {
        const updatedInvoices = this.invoices().map((inv) =>
          inv.orderId === order.id ? { ...inv, paymentStatus: 'REFUNDED' as const } : inv,
        );
        this.invoices.set(updatedInvoices);
        this.saveLocal('invoices', updatedInvoices);
      }

      // 5. Record Audit Log
      this.recordAuditLog({
        restaurantId: order.restaurantId || 'rest-001',
        actorRole: 'STAFF',
        actorLabel: refundRecord.staffName || 'Staff',
        action: 'ORDER_UPDATED' as any,
        entityType: 'ORDER',
        entityId: order.id,
        payloadAfter: refundRecord as any,
        notes: `Recorded refund ₹${refundRecord.refundAmount} for ${order.orderNumber} (${refundRecord.reason})`,
      });
    }

    return { success: true, refund: refundRecord };
  }

  /**
   * Transitions a PENDING refund to COMPLETED or CANCELLED.
   * When completing, verifies remaining refundable balance before applying mutations.
   */
  updateRefundStatus(
    refundId: string,
    targetStatus: 'COMPLETED' | 'CANCELLED',
  ): { success: boolean; error?: string; refund?: RefundRecord } {
    const refund = this.refunds().find((r) => r.id === refundId);
    if (!refund) return { success: false, error: 'Refund not found' };

    if (refund.status === 'CANCELLED') {
      return { success: false, error: 'Cancelled refund cannot be updated' };
    }

    if (refund.status === targetStatus) {
      return { success: true, refund };
    }

    const order = this.orders().find((o) => o.id === refund.orderId);
    if (!order) return { success: false, error: 'Associated order not found' };

    const now = new Date().toISOString();

    if (targetStatus === 'COMPLETED') {
      // Re-verify that remaining balance can still cover this refund
      const maxRefundable = this.getRemainingRefundableAmount(order.id, refund.splitBillId);
      if (refund.refundAmount > maxRefundable + 0.0001) {
        return {
          success: false,
          error: `Refund amount (₹${refund.refundAmount}) exceeds current maximum refundable balance (₹${maxRefundable})`,
        };
      }

      const updatedRefund: RefundRecord = {
        ...refund,
        status: 'COMPLETED',
        completedAt: refund.completedAt || now,
        updatedAt: now,
      };

      const updatedRefunds = this.refunds().map((r) => (r.id === refund.id ? updatedRefund : r));
      this.refunds.set(updatedRefunds);
      this.saveLocal('refunds', updatedRefunds);

      // Update split bill if applicable
      if (refund.splitBillId) {
        const splitBill = this.splitBills().find((b) => b.id === refund.splitBillId);
        if (splitBill) {
          const allSplitRefunds = updatedRefunds
            .filter((r) => r.splitBillId === splitBill.id && r.status === 'COMPLETED')
            .reduce((sum, r) => sum + r.refundAmount, 0);
          const isSplitFullyRefunded = allSplitRefunds >= splitBill.totalAmount - 0.001;

          const updatedSplitBills = this.splitBills().map((b) =>
            b.id === splitBill.id
              ? {
                  ...b,
                  totalRefunded: allSplitRefunds,
                  paymentStatus: isSplitFullyRefunded ? ('REFUNDED' as const) : b.paymentStatus,
                }
              : b,
          );
          this.splitBills.set(updatedSplitBills);
          this.saveLocal('split_bills', updatedSplitBills);
        }
      }

      // Update order status
      const totalOrderRefunds = updatedRefunds
        .filter((r) => r.orderId === order.id && r.status === 'COMPLETED')
        .reduce((sum, r) => sum + r.refundAmount, 0);
      const isOrderFullyRefunded = totalOrderRefunds >= order.totalAmount - 0.001;

      const updatedOrder: Order = {
        ...order,
        totalRefunded: totalOrderRefunds,
        paymentStatus: isOrderFullyRefunded ? 'REFUNDED' : order.paymentStatus,
        updatedAt: now,
        timeline: [
          ...order.timeline,
          {
            status: 'REFUND_COMPLETED',
            timestamp: now,
            note: `Pending refund ₹${refund.refundAmount} transitioned to COMPLETED`,
          },
        ],
      };
      const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
      this.orders.set(updatedOrders);
      this.saveLocal('orders', updatedOrders);

      return { success: true, refund: updatedRefund };
    } else {
      // CANCELLED
      const updatedRefund: RefundRecord = {
        ...refund,
        status: 'CANCELLED',
        completedAt: undefined,
        updatedAt: now,
      };

      const updatedRefunds = this.refunds().map((r) => (r.id === refund.id ? updatedRefund : r));
      this.refunds.set(updatedRefunds);
      this.saveLocal('refunds', updatedRefunds);
      return { success: true, refund: updatedRefund };
    }
  }

  // ============================================================================
  // PHASE 3: INVENTORY, RECIPE MANAGEMENT & AUDITABLE STOCK LEDGER
  // ============================================================================

  getDefaultMenuItems(): MenuItem[] {
    return [
      {
        id: 'item-001',
        categoryId: 'cat-01',
        name: 'Dahi Ke Kebab',
        description:
          'Velvety spiced hung curd patties crusted with roasted gram flour and pomegranate pearls',
        price: 385,
        imageUrl:
          'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'VEG',
        prepTimeMinutes: 15,
      },
      {
        id: 'item-002',
        categoryId: 'cat-01',
        name: 'Kurkuri Nadru (Crispy Lotus Stem)',
        description:
          'Kashmiri lotus stems tossed in raw mango dust, crushed coriander seeds, and mountain honey glaze',
        price: 345,
        imageUrl:
          'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'VEG',
        prepTimeMinutes: 12,
      },
      {
        id: 'item-003',
        categoryId: 'cat-02',
        name: 'Murgh Malai Kebab',
        description:
          'Tender boneless chicken morsels steeped overnight in clotted cream, cardamom, and royal saffron',
        price: 495,
        imageUrl:
          'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'NON_VEG',
        prepTimeMinutes: 20,
      },
      {
        id: 'item-004',
        categoryId: 'cat-02',
        name: 'Bhatti Ka Galouti Kebab',
        description: 'Melt-in-mouth smoked lamb patties infused with 32 secret Awadhi potli spices',
        price: 625,
        imageUrl:
          'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'NON_VEG',
        prepTimeMinutes: 22,
      },
      {
        id: 'item-005',
        categoryId: 'cat-02',
        name: 'Paneer Tikka Angara',
        description:
          'Handcrafted cottage cheese cubes marinated in smoked yellow chilli oil and hung curd',
        price: 445,
        imageUrl:
          'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'VEG',
        prepTimeMinutes: 18,
      },
      {
        id: 'item-006',
        categoryId: 'cat-03',
        name: "Dal Makhani 'The Royal Reserve'",
        description:
          'Black lentils slow-cooked for 36 hours over tandoor embers, finished with white churned butter',
        price: 425,
        imageUrl:
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'VEG',
        prepTimeMinutes: 15,
      },
      {
        id: 'item-007',
        categoryId: 'cat-03',
        name: 'Murgh Lababdar',
        description:
          'Tandoori chicken simmered in rich tomato, cashew, and caramelized onion gravy',
        price: 545,
        imageUrl:
          'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'NON_VEG',
        prepTimeMinutes: 20,
      },
      {
        id: 'item-008',
        categoryId: 'cat-03',
        name: 'Nalli Rogan Josh',
        description: 'Prime baby lamb shanks braised in Kashmiri Ratanjot bark and fennel broth',
        price: 695,
        imageUrl:
          'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        dietary: 'NON_VEG',
        prepTimeMinutes: 25,
      },
    ];
  }

  getDefaultIngredients(): Ingredient[] {
    const now = new Date('2026-10-01T08:00:00Z').toISOString();
    return [
      {
        id: 'ing-01',
        name: 'Basmati Rice Extra Long',
        description: 'Aged Himalayan long grain basmati rice for royal biryanis',
        category: 'GRAINS',
        currentStock: 25.0,
        unit: 'kg',
        minThreshold: 10.0,
        targetStock: 50.0,
        costPerUnit: 110,
        costUnit: 'kg',
        supplierName: 'Punjab Agro Farms',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-02',
        name: 'Fresh Malai Paneer',
        description: 'Traditional full-cream block cottage cheese',
        category: 'DAIRY',
        currentStock: 8.5,
        unit: 'kg',
        minThreshold: 3.0,
        targetStock: 15.0,
        costPerUnit: 340,
        costUnit: 'kg',
        supplierName: 'Verka Dairy Co.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-03',
        name: 'Boneless Chicken Breast',
        description: 'Fresh chilled antibiotic-free boneless chicken breast morsels',
        category: 'MEAT',
        currentStock: 15.0,
        unit: 'kg',
        minThreshold: 5.0,
        targetStock: 25.0,
        costPerUnit: 260,
        costUnit: 'kg',
        supplierName: 'Fresh Farms Poultry',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-04',
        name: 'Mutton Shanks (Nalli)',
        description: 'Prime baby goat shanks slow-simmered for Rogan Josh',
        category: 'MEAT',
        currentStock: 6.0,
        unit: 'kg',
        minThreshold: 2.5,
        targetStock: 12.0,
        costPerUnit: 780,
        costUnit: 'kg',
        supplierName: 'Al-Kabeer Gourmet Meats',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-05',
        name: 'Artisanal White Butter',
        description: 'Hand-churned unsalted Punjabi makkhan',
        category: 'DAIRY',
        currentStock: 5.0,
        unit: 'kg',
        minThreshold: 2.0,
        targetStock: 10.0,
        costPerUnit: 480,
        costUnit: 'kg',
        supplierName: 'Amul Fresh',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-06',
        name: 'Heavy Dairy Cream',
        description: 'Rich pasteurized dairy cream for gravies and marinades',
        category: 'DAIRY',
        currentStock: 10.0,
        unit: 'l',
        minThreshold: 3.0,
        targetStock: 20.0,
        costPerUnit: 220,
        costUnit: 'l',
        supplierName: 'Amul Fresh',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-07',
        name: 'Black Urad Lentils',
        description: 'Whole organic black gram lentils for 36-hour Dal Makhani',
        category: 'GRAINS',
        currentStock: 20.0,
        unit: 'kg',
        minThreshold: 5.0,
        targetStock: 30.0,
        costPerUnit: 140,
        costUnit: 'kg',
        supplierName: 'Agro Food Corp',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-08',
        name: 'Yellow Onions (Nashik)',
        description: 'High-pungency golden onions for gravies and biryani birista',
        category: 'PRODUCE',
        currentStock: 35.0,
        unit: 'kg',
        minThreshold: 10.0,
        targetStock: 50.0,
        costPerUnit: 32,
        costUnit: 'kg',
        supplierName: 'Nashik Mandi Direct',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-09',
        name: 'Ripe Hybrid Tomatoes',
        description: 'Vine-ripened red plum tomatoes for gravies',
        category: 'PRODUCE',
        currentStock: 25.0,
        unit: 'kg',
        minThreshold: 8.0,
        targetStock: 40.0,
        costPerUnit: 40,
        costUnit: 'kg',
        supplierName: 'Local Mandi Direct',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-10',
        name: 'Royal Garam Masala Blend',
        description: 'Stone-ground whole spice blend featuring black cardamom and mace',
        category: 'SPICES',
        currentStock: 3.5,
        unit: 'kg',
        minThreshold: 1.0,
        targetStock: 6.0,
        costPerUnit: 950,
        costUnit: 'kg',
        supplierName: 'MDH Master Blend',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-11',
        name: 'Kashmiri Chilli & Saffron',
        description: 'Sun-dried Deggi chilli and grade-1 Pampore saffron threads',
        category: 'SPICES',
        currentStock: 1.2,
        unit: 'kg',
        minThreshold: 0.5,
        targetStock: 2.5,
        costPerUnit: 1800,
        costUnit: 'kg',
        supplierName: 'Kashmir Emporium',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-12',
        name: 'Cold-Pressed Mustard Oil',
        description: 'Kachi Ghani pungent mustard oil for tandoor marination',
        category: 'OTHER',
        currentStock: 12.0,
        unit: 'l',
        minThreshold: 4.0,
        targetStock: 25.0,
        costPerUnit: 175,
        costUnit: 'l',
        supplierName: 'Engine Brand',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ing-13',
        name: 'Farm Fresh Whole Eggs',
        description: 'Graded brown farm eggs for breads and batters',
        category: 'DAIRY',
        currentStock: 90,
        unit: 'pcs',
        minThreshold: 30,
        targetStock: 150,
        costPerUnit: 7,
        costUnit: 'pcs',
        supplierName: 'Eggoz Poultry',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  getDefaultRecipes(): Recipe[] {
    const now = new Date('2026-10-01T08:00:00Z').toISOString();
    return [
      {
        id: 'rec-005',
        menuItemId: 'item-005',
        menuItemName: 'Paneer Tikka Angara',
        version: 1,
        items: [
          { ingredientId: 'ing-02', quantity: 0.25, unit: 'kg' }, // 250g Paneer
          { ingredientId: 'ing-06', quantity: 0.05, unit: 'l' }, // 50ml Cream
          { ingredientId: 'ing-10', quantity: 0.015, unit: 'kg' }, // 15g Garam Masala
          { ingredientId: 'ing-12', quantity: 0.02, unit: 'l' }, // 20ml Mustard oil
        ],
        instructions:
          'Marinate paneer cubes in spiced hung curd and mustard oil; char over acacia coals.',
        indicativeCost: 114.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-006',
        menuItemId: 'item-006',
        menuItemName: "Dal Makhani 'The Royal Reserve'",
        version: 1,
        items: [
          { ingredientId: 'ing-07', quantity: 0.15, unit: 'kg' }, // 150g Black lentils
          { ingredientId: 'ing-05', quantity: 0.04, unit: 'kg' }, // 40g White butter
          { ingredientId: 'ing-06', quantity: 0.05, unit: 'l' }, // 50ml Cream
          { ingredientId: 'ing-09', quantity: 0.1, unit: 'kg' }, // 100g Tomatoes
          { ingredientId: 'ing-10', quantity: 0.01, unit: 'kg' }, // 10g Garam Masala
        ],
        instructions:
          'Slow-simmer lentils for 36 hours; finish with hand-churned white butter and cream.',
        indicativeCost: 64.7,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-007',
        menuItemId: 'item-007',
        menuItemName: 'Murgh Lababdar',
        version: 1,
        items: [
          { ingredientId: 'ing-03', quantity: 0.28, unit: 'kg' }, // 280g Chicken
          { ingredientId: 'ing-06', quantity: 0.06, unit: 'l' }, // 60ml Cream
          { ingredientId: 'ing-08', quantity: 0.12, unit: 'kg' }, // 120g Onions
          { ingredientId: 'ing-09', quantity: 0.15, unit: 'kg' }, // 150g Tomatoes
          { ingredientId: 'ing-10', quantity: 0.015, unit: 'kg' }, // 15g Garam Masala
        ],
        instructions: 'Simmer roasted tandoori chicken in satin tomato, onion, and cashew gravy.',
        indicativeCost: 110.1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-008',
        menuItemId: 'item-008',
        menuItemName: 'Nalli Rogan Josh',
        version: 1,
        items: [
          { ingredientId: 'ing-04', quantity: 0.35, unit: 'kg' }, // 350g Lamb shanks
          { ingredientId: 'ing-08', quantity: 0.15, unit: 'kg' }, // 150g Onions
          { ingredientId: 'ing-12', quantity: 0.04, unit: 'l' }, // 40ml Mustard oil
          { ingredientId: 'ing-11', quantity: 0.02, unit: 'kg' }, // 20g Saffron & Kashmiri chilli
          { ingredientId: 'ing-10', quantity: 0.02, unit: 'kg' }, // 20g Garam Masala
        ],
        instructions: 'Slow-braise baby mutton shanks in ratanjot infused Kashmiri spice broth.',
        indicativeCost: 340.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-003',
        menuItemId: 'item-003',
        menuItemName: 'Murgh Malai Kebab',
        version: 1,
        items: [
          { ingredientId: 'ing-03', quantity: 0.25, unit: 'kg' }, // 250g Chicken
          { ingredientId: 'ing-06', quantity: 0.08, unit: 'l' }, // 80ml Cream
          { ingredientId: 'ing-10', quantity: 0.01, unit: 'kg' }, // 10g Garam Masala
        ],
        instructions: 'Steep overnight in cream, cardamom, and saffron before skewering.',
        indicativeCost: 92.1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  getDefaultStockMovements(): StockMovement[] {
    const defaultIngs = this.getDefaultIngredients();
    const now = new Date('2026-10-01T08:00:00Z').toISOString();
    return defaultIngs.map((ing) => ({
      id: `mov-init-${ing.id}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: 'OPENING_STOCK',
      quantityDelta: ing.currentStock,
      quantityBefore: 0,
      quantityAfter: ing.currentStock,
      unit: ing.unit,
      reason: 'Opening stock audit baseline',
      staffName: 'Ranveer B. (General Manager)',
      timestamp: now,
    }));
  }

  /**
   * Calculates indicative portion cost in INR based on ingredient costs and required units.
   */
  calculateRecipeCost(items: RecipeItem[]): number {
    let totalCost = 0;
    for (const item of items) {
      const ing = this.ingredients().find((i) => i.id === item.ingredientId);
      if (!ing || !ing.costPerUnit) continue;

      try {
        const convertedQuantity = convertUnit(item.quantity, item.unit, ing.costUnit);
        totalCost += convertedQuantity * ing.costPerUnit;
      } catch (err) {
        console.warn(
          `[MockDataService] Cannot compute cost for ingredient ${item.ingredientId}:`,
          err,
        );
      }
    }
    return roundStock(totalCost, 2);
  }

  /**
   * Creates a new ingredient and appends an auditable OPENING_STOCK movement.
   */
  createIngredient(dto: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>): Ingredient {
    const id = `ing-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const newIngredient: Ingredient = {
      ...dto,
      id,
      currentStock: roundStock(Math.max(0, dto.currentStock)),
      minThreshold: roundStock(Math.max(0, dto.minThreshold)),
      costPerUnit: roundStock(Math.max(0, dto.costPerUnit), 2),
      createdAt: now,
      updatedAt: now,
    };

    const updatedIngredients = [...this.ingredients(), newIngredient];
    this.ingredients.set(updatedIngredients);
    this.saveLocal('ingredients', updatedIngredients);

    if (newIngredient.currentStock > 0) {
      const openingMov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: newIngredient.id,
        ingredientName: newIngredient.name,
        type: 'OPENING_STOCK',
        quantityDelta: newIngredient.currentStock,
        quantityBefore: 0,
        quantityAfter: newIngredient.currentStock,
        unit: newIngredient.unit,
        reason: 'New ingredient initial stock registration',
        staffName: 'Staff',
        timestamp: now,
      };
      const updatedMovements = [openingMov, ...this.stockMovements()];
      this.stockMovements.set(updatedMovements);
      this.saveLocal('stock_movements', updatedMovements);
    }

    return newIngredient;
  }

  /**
   * Updates an existing ingredient's configuration.
   */
  updateIngredient(id: string, updates: Partial<Ingredient>): Ingredient {
    const list = this.ingredients().map((ing) => {
      if (ing.id === id) {
        return {
          ...ing,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }
      return ing;
    });

    this.ingredients.set(list);
    this.saveLocal('ingredients', list);
    return list.find((i) => i.id === id)!;
  }

  /**
   * Performs an auditable stock adjustment (Restock, Wastage, Correction, etc.)
   * Negative stock is prohibited for ordinary manual operations.
   */
  adjustStock(params: {
    ingredientId: string;
    delta: number;
    type: StockMovementType;
    reason: string;
    referenceId?: string;
    staffName?: string;
    allowNegative?: boolean;
  }): { success: boolean; movement?: StockMovement; error?: string } {
    if (params.delta === 0) {
      return { success: false, error: 'Adjustment quantity cannot be 0' };
    }

    const ing = this.ingredients().find((i) => i.id === params.ingredientId);
    if (!ing) {
      return { success: false, error: 'Ingredient not found' };
    }

    const quantityBefore = ing.currentStock;
    const quantityAfter = roundStock(quantityBefore + params.delta);

    if (quantityAfter < 0 && !params.allowNegative) {
      return {
        success: false,
        error: `Adjustment would result in negative stock (${quantityAfter} ${ing.unit}). Prohibited for standard operations.`,
      };
    }

    const now = new Date().toISOString();
    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: params.type,
      quantityDelta: params.delta,
      quantityBefore,
      quantityAfter,
      unit: ing.unit,
      reason: params.reason || `Stock update: ${params.type}`,
      referenceId: params.referenceId,
      staffName: params.staffName || 'Staff',
      timestamp: now,
    };

    const updatedIngredients = this.ingredients().map((i) =>
      i.id === ing.id ? { ...i, currentStock: quantityAfter, updatedAt: now } : i,
    );
    this.ingredients.set(updatedIngredients);
    this.saveLocal('ingredients', updatedIngredients);

    const updatedMovements = [movement, ...this.stockMovements()];
    this.stockMovements.set(updatedMovements);
    this.saveLocal('stock_movements', updatedMovements);

    return { success: true, movement };
  }

  /**
   * Authoritatively records an auditable stock wastage movement.
   * Validates positive quantity, valid unit, available unreserved stock,
   * prevents duplicate submissions via idempotencyKey, and updates on-hand inventory.
   */
  recordWastage(params: {
    ingredientId: string;
    quantity: number;
    unit?: MeasurementUnit;
    reason: string;
    staffName?: string;
    idempotencyKey?: string;
  }): { success: boolean; movement?: StockMovement; error?: string; isDuplicate?: boolean } {
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      return { success: false, error: 'Wastage quantity must be a positive finite number' };
    }

    if (params.idempotencyKey) {
      const existing = this.stockMovements().find(
        (m) => m.type === 'WASTAGE' && m.referenceId === params.idempotencyKey,
      );
      if (existing) {
        return { success: true, movement: existing, isDuplicate: true };
      }
    }

    const ing = this.ingredients().find((i) => i.id === params.ingredientId);
    if (!ing) {
      return { success: false, error: 'Ingredient not found' };
    }
    if (!ing.isActive) {
      return { success: false, error: `Ingredient '${ing.name}' is inactive` };
    }

    const unit = params.unit || ing.unit;
    let qtyInIngUnit = params.quantity;
    if (unit !== ing.unit) {
      try {
        qtyInIngUnit = convertUnit(params.quantity, unit, ing.unit);
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Incompatible measurement unit for wastage',
        };
      }
    }

    // Protection: wastage cannot exceed available-to-promise (unreserved) stock
    const availableStock = this.getAvailableStock(ing.id);
    if (availableStock < qtyInIngUnit) {
      const reserved = this.getReservedQuantity(ing.id);
      return {
        success: false,
        error: `Cannot record wastage of ${params.quantity} ${unit} (${qtyInIngUnit} ${ing.unit}). Available unreserved stock is ${availableStock} ${ing.unit} (physical: ${ing.currentStock} ${ing.unit}, reserved: ${reserved} ${ing.unit}).`,
      };
    }

    const quantityBefore = ing.currentStock;
    const quantityAfter = roundStock(quantityBefore - qtyInIngUnit, 3);
    const now = new Date().toISOString();

    const movement: StockMovement = {
      id: `mov-waste-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: 'WASTAGE',
      quantityDelta: -qtyInIngUnit,
      quantityBefore,
      quantityAfter,
      unit: ing.unit,
      reason: params.reason || 'Inventory Wastage / Spoilage',
      referenceId: params.idempotencyKey,
      staffName: params.staffName || 'Kitchen Staff',
      timestamp: now,
    };

    const updatedIngredients = this.ingredients().map((i) =>
      i.id === ing.id ? { ...i, currentStock: quantityAfter, updatedAt: now } : i,
    );
    this.ingredients.set(updatedIngredients);
    this.saveLocal('ingredients', updatedIngredients);

    const updatedMovements = [movement, ...this.stockMovements()];
    this.stockMovements.set(updatedMovements);
    this.saveLocal('stock_movements', updatedMovements);

    return { success: true, movement };
  }

  /**
   * Creates a new Recipe connecting a menu item to its ingredient requirements.
   */
  createRecipe(
    dto: Omit<Recipe, 'id' | 'version' | 'indicativeCost' | 'createdAt' | 'updatedAt'>,
  ): { success: boolean; recipe?: Recipe; error?: string } {
    const menuItem = this.menuItems().find((m) => m.id === dto.menuItemId);
    if (!menuItem) {
      return { success: false, error: `Menu item '${dto.menuItemId}' does not exist` };
    }

    const existingRecipe = this.recipes().find(
      (r) => r.menuItemId === dto.menuItemId && r.isActive,
    );
    if (existingRecipe) {
      return { success: false, error: `An active recipe already exists for '${menuItem.name}'` };
    }

    if (!dto.items || dto.items.length === 0) {
      return { success: false, error: 'Recipe must contain at least one ingredient' };
    }

    // Validate duplicate ingredients
    const seenIngredients = new Set<string>();
    for (const it of dto.items) {
      if (seenIngredients.has(it.ingredientId)) {
        return {
          success: false,
          error: 'Duplicate ingredients are not allowed in the same recipe',
        };
      }
      seenIngredients.add(it.ingredientId);

      if (it.quantity <= 0) {
        return { success: false, error: 'Ingredient quantity must be strictly greater than 0' };
      }

      const ing = this.ingredients().find((i) => i.id === it.ingredientId);
      if (!ing) {
        return {
          success: false,
          error: `Referenced ingredient '${it.ingredientId}' does not exist`,
        };
      }

      if (!areUnitsCompatible(it.unit, ing.unit)) {
        return {
          success: false,
          error: `Recipe unit '${it.unit}' is incompatible with ingredient unit '${ing.unit}' for '${ing.name}'`,
        };
      }
    }

    const now = new Date().toISOString();
    const calculatedCost = this.calculateRecipeCost(dto.items);

    const newRecipe: Recipe = {
      ...dto,
      id: `rec-${Date.now().toString().slice(-4)}`,
      menuItemName: menuItem.name,
      version: 1,
      indicativeCost: calculatedCost,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const updatedRecipes = [newRecipe, ...this.recipes()];
    this.recipes.set(updatedRecipes);
    this.saveLocal('recipes', updatedRecipes);

    return { success: true, recipe: newRecipe };
  }

  /**
   * Updates an existing Recipe with versioning and recalculates indicative portion cost.
   */
  updateRecipe(
    id: string,
    updates: Partial<Recipe>,
  ): { success: boolean; recipe?: Recipe; error?: string } {
    const existing = this.recipes().find((r) => r.id === id);
    if (!existing) {
      return { success: false, error: 'Recipe not found' };
    }

    if (updates.items) {
      if (updates.items.length === 0) {
        return { success: false, error: 'Recipe must contain at least one ingredient' };
      }
      const seen = new Set<string>();
      for (const it of updates.items) {
        if (seen.has(it.ingredientId)) {
          return {
            success: false,
            error: 'Duplicate ingredients are not allowed in the same recipe',
          };
        }
        seen.add(it.ingredientId);
        if (it.quantity <= 0) {
          return { success: false, error: 'Ingredient quantity must be greater than 0' };
        }
        const ing = this.ingredients().find((i) => i.id === it.ingredientId);
        if (!ing) {
          return { success: false, error: `Ingredient ${it.ingredientId} not found` };
        }
        if (!areUnitsCompatible(it.unit, ing.unit)) {
          return {
            success: false,
            error: `Recipe unit '${it.unit}' is incompatible with ingredient '${ing.name}' unit '${ing.unit}'`,
          };
        }
      }
    }

    const itemsToCost = updates.items || existing.items;
    const indicativeCost = this.calculateRecipeCost(itemsToCost);
    const now = new Date().toISOString();

    const updatedRecipe: Recipe = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      indicativeCost,
      updatedAt: now,
    };

    const updatedRecipes = this.recipes().map((r) => (r.id === id ? updatedRecipe : r));
    this.recipes.set(updatedRecipes);
    this.saveLocal('recipes', updatedRecipes);

    return { success: true, recipe: updatedRecipe };
  }

  /**
   * Toggles recipe active status.
   */
  toggleRecipeStatus(id: string): Recipe | null {
    const existing = this.recipes().find((r) => r.id === id);
    if (!existing) return null;
    const res = this.updateRecipe(id, { isActive: !existing.isActive });
    return res.recipe || null;
  }

  /**
   * Returns total active stock reserved across active accepted orders for an ingredient.
   */
  getReservedQuantity(ingredientId: string, excludeOrderId?: string): number {
    return this.stockReservations()
      .filter(
        (r) => r.ingredientId === ingredientId && (!excludeOrderId || r.orderId !== excludeOrderId),
      )
      .reduce((sum, r) => roundStock(sum + r.quantity), 0);
  }

  /**
   * Returns available-to-promise stock (on-hand physical stock minus active reservations).
   */
  getAvailableStock(ingredientId: string, excludeOrderId?: string): number {
    const ing = this.ingredients().find((i) => i.id === ingredientId);
    if (!ing) return 0;
    const reserved = this.getReservedQuantity(ingredientId, excludeOrderId);
    const available = roundStock(ing.currentStock - reserved);
    return Math.max(0, available);
  }

  /**
   * Aggregates required ingredient demand across all items of an order, converted to each ingredient's unit.
   */
  calculateOrderIngredientDemand(items: OrderItem[]): {
    demand: Map<string, { needed: number; unit: MeasurementUnit; ingredientName: string }>;
    errors: string[];
  } {
    const demand = new Map<
      string,
      { needed: number; unit: MeasurementUnit; ingredientName: string }
    >();
    const errors: string[] = [];

    for (const item of items) {
      const recipe = this.recipes().find((r) => r.menuItemId === item.menuItemId && r.isActive);
      if (!recipe) continue; // Untracked item, no recipe demand

      for (const rItem of recipe.items) {
        const ing = this.ingredients().find((i) => i.id === rItem.ingredientId);
        if (!ing || !ing.isActive) {
          errors.push(
            `Ingredient '${ing ? ing.name : rItem.ingredientId}' is missing or deactivated`,
          );
          continue;
        }

        let neededInIngUnit = 0;
        try {
          const qtyPerServingInIngUnit = convertUnit(rItem.quantity, rItem.unit, ing.unit);
          neededInIngUnit =
            ing.unit === 'pcs'
              ? Math.round(qtyPerServingInIngUnit * item.quantity)
              : roundStock(qtyPerServingInIngUnit * item.quantity);
        } catch (e: any) {
          errors.push(e.message || `Unit conversion error for '${ing.name}'`);
          continue;
        }

        const curr = demand.get(ing.id);
        if (curr) {
          const newNeeded =
            ing.unit === 'pcs'
              ? Math.round(curr.needed + neededInIngUnit)
              : roundStock(curr.needed + neededInIngUnit);
          demand.set(ing.id, {
            needed: newNeeded,
            unit: ing.unit,
            ingredientName: ing.name,
          });
        } else {
          demand.set(ing.id, {
            needed: neededInIngUnit,
            unit: ing.unit,
            ingredientName: ing.name,
          });
        }
      }
    }

    return { demand, errors };
  }

  /**
   * Calculates whether a menu item is producible based on its active recipe and available-to-promise stocks.
   */
  checkMenuItemAvailability(menuItemId: string): StockAvailabilityCheck {
    const item = this.menuItems().find((m) => m.id === menuItemId);
    if (!item) {
      return {
        menuItemId,
        status: 'UNTRACKED',
        produciblePortions: 999,
        missingIngredients: [],
      };
    }

    // If staff explicitly flagged item as unavailable
    if (item.isAvailable === false) {
      return {
        menuItemId,
        status: 'OUT_OF_STOCK',
        produciblePortions: 0,
        missingIngredients: ['Item toggled unavailable by restaurant manager'],
      };
    }

    const recipe = this.recipes().find((r) => r.menuItemId === menuItemId && r.isActive);
    if (!recipe || recipe.items.length === 0) {
      // Untracked items without recipes are producible without stock constraints
      return {
        menuItemId,
        status: 'UNTRACKED',
        produciblePortions: 999,
        missingIngredients: [],
      };
    }

    let minPortions = Infinity;
    let limitingIng: string | undefined;
    const missing: string[] = [];

    for (const rItem of recipe.items) {
      const ing = this.ingredients().find((i) => i.id === rItem.ingredientId);
      if (!ing || !ing.isActive) {
        missing.push(ing ? ing.name : rItem.ingredientId);
        minPortions = 0;
        continue;
      }

      let requiredQtyInIngUnit = rItem.quantity;
      if (rItem.unit !== ing.unit) {
        try {
          requiredQtyInIngUnit = convertUnit(rItem.quantity, rItem.unit, ing.unit);
        } catch {
          missing.push(`${ing.name} (unit mismatch)`);
          minPortions = 0;
          continue;
        }
      }

      if (requiredQtyInIngUnit <= 0) continue;

      // Available-to-promise stock: physical on-hand stock minus active reservations
      const availableStock = this.getAvailableStock(ing.id);
      const portionsForIng = Math.floor(availableStock / requiredQtyInIngUnit);
      if (portionsForIng < minPortions) {
        minPortions = portionsForIng;
        limitingIng = ing.name;
      }

      if (portionsForIng === 0) {
        missing.push(ing.name);
      }
    }

    const produciblePortions = minPortions === Infinity ? 0 : Math.max(0, minPortions);
    let status: MenuStockStatus = 'AVAILABLE';

    if (produciblePortions === 0) {
      status = 'OUT_OF_STOCK';
    } else if (produciblePortions <= 5) {
      status = 'LOW_STOCK';
    } else {
      status = 'AVAILABLE';
    }

    return {
      menuItemId,
      status,
      produciblePortions,
      limitingIngredient: limitingIng,
      missingIngredients: missing,
    };
  }

  /**
   * Convenience helper returning menu stock status badge.
   */
  getMenuItemAvailability(menuItemId: string): MenuStockStatus {
    return this.checkMenuItemAvailability(menuItemId).status;
  }

  /**
   * Pre-flight validation of an order's aggregated stock demand against available-to-promise stock.
   */
  validateOrderStockAvailability(items: OrderItem[]): { isValid: boolean; errors: string[] } {
    const { demand, errors } = this.calculateOrderIngredientDemand(items);

    // Also verify menu items are active/available
    for (const item of items) {
      const menuItem = this.menuItems().find((m) => m.id === item.menuItemId);
      if (menuItem && !menuItem.isAvailable) {
        errors.push(`'${menuItem.name}' is currently unavailable`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    for (const [ingId, req] of demand.entries()) {
      const available = this.getAvailableStock(ingId);
      if (available < req.needed) {
        const ing = this.ingredients().find((i) => i.id === ingId);
        const reserved = this.getReservedQuantity(ingId);
        errors.push(
          `Insufficient available stock for '${req.ingredientName}': required ${req.needed} ${req.unit}, available ${available} ${req.unit} (physical: ${ing?.currentStock ?? 0}, reserved: ${reserved})`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Reserves stock for an accepted order.
   * Idempotent: if reservations already exist for this order, returns them without duplicates.
   * Validates available-to-promise stock for all required ingredients in pre-flight.
   */
  reserveStockForOrder(orderId: string): {
    success: boolean;
    reservations?: StockReservation[];
    error?: string;
    alreadyReserved?: boolean;
  } {
    const existing = this.stockReservations().filter((r) => r.orderId === orderId);
    if (existing.length > 0) {
      return { success: true, reservations: existing, alreadyReserved: true };
    }

    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, error: `Order '${orderId}' not found` };
    }

    const { demand, errors } = this.calculateOrderIngredientDemand(order.items);
    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    if (demand.size === 0) {
      return { success: true, reservations: [] };
    }

    // Pre-flight check on available-to-promise stock
    for (const [ingId, req] of demand.entries()) {
      const ing = this.ingredients().find((i) => i.id === ingId);
      if (!ing || !ing.isActive) {
        return {
          success: false,
          error: `Ingredient '${req.ingredientName}' is missing or deactivated`,
        };
      }
      const available = this.getAvailableStock(ingId);
      if (available < req.needed) {
        const reserved = this.getReservedQuantity(ingId);
        return {
          success: false,
          error: `Cannot accept order ${order.orderNumber}: insufficient available stock for '${req.ingredientName}' (required: ${req.needed} ${req.unit}, available: ${available} ${req.unit}, physical: ${ing.currentStock} ${req.unit}, reserved: ${reserved} ${req.unit})`,
        };
      }
    }

    // Atomically create reservations
    const now = new Date().toISOString();
    const newReservations: StockReservation[] = Array.from(demand.entries()).map(
      ([ingId, req]) => ({
        id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        orderId: order.id,
        ingredientId: ingId,
        quantity: req.needed,
        unit: req.unit,
        createdAt: now,
      }),
    );

    const updated = [...this.stockReservations(), ...newReservations];
    this.stockReservations.set(updated);
    this.saveLocal('stock_reservations', updated);

    return { success: true, reservations: newReservations };
  }

  /**
   * Releases any active stock reservations held by an order.
   * Idempotent: safe to call repeatedly.
   */
  releaseStockReservation(orderId: string): { success: boolean; releasedCount: number } {
    const current = this.stockReservations();
    const remaining = current.filter((r) => r.orderId !== orderId);
    const releasedCount = current.length - remaining.length;

    if (releasedCount > 0) {
      this.stockReservations.set(remaining);
      this.saveLocal('stock_reservations', remaining);
    }

    return { success: true, releasedCount };
  }

  /**
   * Updates order items with atomic stock reservation re-balancing.
   * If order is in ACCEPTED/PREPARING/READY status, validates available stock for any increased demand.
   */
  updateOrderItems(
    orderId: string,
    newItems: OrderItem[],
  ): { success: boolean; order?: Order; error?: string } {
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, error: `Order '${orderId}' not found` };
    }

    if (['SERVED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
      return {
        success: false,
        error: `Cannot modify items for order in '${order.status}' status`,
      };
    }

    const isReservedStatus = ['ACCEPTED', 'PREPARING', 'READY'].includes(order.status);

    if (isReservedStatus) {
      const { demand: newDemand, errors } = this.calculateOrderIngredientDemand(newItems);
      if (errors.length > 0) {
        return { success: false, error: errors.join('; ') };
      }

      // Check available stock excluding this order's current reservations
      for (const [ingId, req] of newDemand.entries()) {
        const available = this.getAvailableStock(ingId, order.id);
        if (available < req.needed) {
          return {
            success: false,
            error: `Cannot update items: insufficient stock for '${req.ingredientName}' (required: ${req.needed} ${req.unit}, available: ${available} ${req.unit})`,
          };
        }
      }

      // Atomically replace reservations for this order
      const remainingReservations = this.stockReservations().filter((r) => r.orderId !== order.id);
      const now = new Date().toISOString();
      const updatedReservations: StockReservation[] = [
        ...remainingReservations,
        ...Array.from(newDemand.entries()).map(([ingId, req]) => ({
          id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orderId: order.id,
          ingredientId: ingId,
          quantity: req.needed,
          unit: req.unit,
          createdAt: now,
        })),
      ];
      this.stockReservations.set(updatedReservations);
      this.saveLocal('stock_reservations', updatedReservations);
    }

    // Recalculate order financial totals
    const subtotal = newItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const taxRate = 0.05;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const halfTax = taxAmount / 2;
    const totalAmount = subtotal + taxAmount - (order.discountAmount || 0);

    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...order,
      items: newItems,
      subtotal,
      taxAmount,
      cgstAmount: halfTax,
      sgstAmount: halfTax,
      totalAmount,
      updatedAt: now,
      timeline: [
        ...order.timeline,
        {
          status: order.status,
          timestamp: now,
          note: 'Order items and quantities updated',
        },
      ],
    };

    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    return { success: true, order: updatedOrder };
  }

  /**
   * Commits stock consumption for an order exactly once upon transition to SERVED or COMPLETED.
   * Converts active reservations into physical consumption movements.
   * Pre-flight checks physical stock for all ingredients before deducting any stock.
   */
  consumeStockForOrder(orderId: string): {
    success: boolean;
    movements?: StockMovement[];
    error?: string;
    alreadyConsumed?: boolean;
  } {
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, error: `Order '${orderId}' not found` };
    }

    const { demand, errors } = this.calculateOrderIngredientDemand(order.items);
    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    // Untracked order with no recipe items
    if (demand.size === 0) {
      this.releaseStockReservation(order.id);
      return { success: true, movements: [] };
    }

    // 1. Idempotency & Incomplete Prior Operation Guard
    const existing = this.stockMovements().filter(
      (m) => m.type === 'RECIPE_CONSUMPTION' && m.referenceId === order.id,
    );
    if (existing.length >= demand.size) {
      // Fully consumed already - ensure reservations are cleared
      this.releaseStockReservation(order.id);
      return { success: true, movements: existing, alreadyConsumed: true };
    } else if (existing.length > 0 && existing.length < demand.size) {
      return {
        success: false,
        error: `Incomplete prior stock consumption detected for order ${order.orderNumber} (found ${existing.length} of ${demand.size} movements)`,
      };
    }

    // 2. Pre-flight check on PHYSICAL on-hand stock
    for (const [ingId, req] of demand.entries()) {
      const ing = this.ingredients().find((i) => i.id === ingId);
      if (!ing || !ing.isActive) {
        return {
          success: false,
          error: `Required ingredient '${req.ingredientName}' is deactivated or missing`,
        };
      }
      if (ing.currentStock < req.needed) {
        return {
          success: false,
          error: `Cannot fulfill order ${order.orderNumber}: insufficient stock for '${ing.name}' (available: ${ing.currentStock} ${ing.unit}, needed: ${req.needed} ${req.unit})`,
        };
      }
    }

    // 3. Atomically commit deductions to inventory and write auditable stock movements
    const movements: StockMovement[] = [];
    const now = new Date().toISOString();
    const updatedIngredients = [...this.ingredients()];

    for (const [ingId, req] of demand.entries()) {
      const idx = updatedIngredients.findIndex((i) => i.id === ingId);
      const ing = updatedIngredients[idx];
      const quantityBefore = ing.currentStock;
      const quantityAfter =
        ing.unit === 'pcs'
          ? Math.round(quantityBefore - req.needed)
          : roundStock(quantityBefore - req.needed);

      updatedIngredients[idx] = {
        ...ing,
        currentStock: quantityAfter,
        updatedAt: now,
      };

      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        type: 'RECIPE_CONSUMPTION',
        quantityDelta: -req.needed,
        quantityBefore,
        quantityAfter,
        unit: ing.unit,
        reason: `Recipe consumption for Order ${order.orderNumber} (Table ${order.tableNumber})`,
        referenceId: order.id,
        staffName: 'Kitchen Automation',
        timestamp: now,
      };
      movements.push(mov);
    }

    // Update ingredients and stock movements signals and localStorage
    this.ingredients.set(updatedIngredients);
    this.saveLocal('ingredients', updatedIngredients);

    const updatedMovements = [...movements, ...this.stockMovements()];
    this.stockMovements.set(updatedMovements);
    this.saveLocal('stock_movements', updatedMovements);

    // Atomically release active reservations since they are now physically consumed
    this.releaseStockReservation(order.id);

    return { success: true, movements };
  }

  /**
   * Reverses previously committed recipe consumption for an order (audited explicit action).
   */
  reverseOrderStockConsumption(
    orderId: string,
    reason: string,
  ): { success: boolean; movements?: StockMovement[]; error?: string } {
    const consumptions = this.stockMovements().filter(
      (m) => m.type === 'RECIPE_CONSUMPTION' && m.referenceId === orderId,
    );

    if (consumptions.length === 0) {
      return { success: false, error: `No recipe consumption found for order '${orderId}'` };
    }

    const alreadyReversed = this.stockMovements().some(
      (m) => m.type === 'REVERSAL' && m.referenceId === orderId,
    );
    if (alreadyReversed) {
      return {
        success: false,
        error: `Consumption for order '${orderId}' has already been reversed`,
      };
    }

    const reversalMovements: StockMovement[] = [];
    for (const c of consumptions) {
      const delta = Math.abs(c.quantityDelta);
      const res = this.adjustStock({
        ingredientId: c.ingredientId,
        delta,
        type: 'REVERSAL',
        reason: reason || `Explicit reversal of order ${orderId} stock consumption`,
        referenceId: orderId,
        staffName: 'Floor Dispatch',
      });
      if (res.movement) {
        reversalMovements.push(res.movement);
      }
    }

    return { success: true, movements: reversalMovements };
  }

  /**
   * Authoritative service-level mutation boundary for all order status transitions.
   * Atomically synchronizes order status with inventory reservations, consumption,
   * table occupancy, timeline audit log, and persistent storage.
   */
  updateOrderStatusAtomic(
    orderId: string,
    targetStatus: OrderStatus,
    options?: { note?: string; staffName?: string },
  ): { success: boolean; order?: Order; error?: string } {
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, error: `Order '${orderId}' not found` };
    }

    // Idempotent no-op if status is already identical
    if (order.status === targetStatus) {
      return { success: true, order };
    }

    // 1. Transition to ACCEPTED: reserve required ingredients
    if (targetStatus === 'ACCEPTED') {
      const resResult = this.reserveStockForOrder(order.id);
      if (!resResult.success) {
        return { success: false, error: resResult.error };
      }
    }

    // 2. Transition to CANCELLED:
    if (targetStatus === 'CANCELLED') {
      const wasConsumed = this.stockMovements().some(
        (m) => m.type === 'RECIPE_CONSUMPTION' && m.referenceId === order.id,
      );
      if (!wasConsumed) {
        // Release active reservations held by this order
        this.releaseStockReservation(order.id);
      }
      // If wasConsumed, physically consumed stock is NOT silently restored
    }

    // 3. Transition to SERVED or COMPLETED: consume stock atomically
    if (targetStatus === 'SERVED' || targetStatus === 'COMPLETED') {
      const consResult = this.consumeStockForOrder(order.id);
      if (!consResult.success) {
        // Do NOT advance order status! Return clear error and preserve order state.
        return { success: false, error: consResult.error };
      }
    }

    // 4. Update order status and append timeline audit entry
    const now = new Date().toISOString();
    const updatedTimeline = [
      ...order.timeline,
      {
        status: targetStatus,
        timestamp: now,
        note:
          options?.note ||
          `Status updated to ${targetStatus}${options?.staffName ? ' by ' + options.staffName : ''}`,
      },
    ];

    const updatedOrder: Order = {
      ...order,
      status: targetStatus,
      updatedAt: now,
      timeline: updatedTimeline,
    };

    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    // 5. Update dining table occupancy if completed or cancelled (only for dine-in orders)
    const tableIdOrNumber = order.tableId || order.tableNumber;
    if (
      (targetStatus === 'COMPLETED' || targetStatus === 'CANCELLED') &&
      order.orderType !== 'TAKEAWAY' &&
      tableIdOrNumber
    ) {
      this.recalculateTableStatus(tableIdOrNumber);
    }

    return { success: true, order: updatedOrder };
  }

  /**
   * Returns inventory valuation and movement summary metrics.
   */
  getInventoryValuationSummary(): {
    totalTracked: number;
    lowStockCount: number;
    outOfStockCount: number;
    estimatedValue: number;
    totalWastageCost: number;
  } {
    const ings = this.ingredients().filter((i) => i.isActive);
    const totalTracked = ings.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let estimatedValue = 0;

    for (const ing of ings) {
      if (ing.currentStock <= 0) {
        outOfStockCount++;
      } else if (ing.currentStock <= ing.minThreshold) {
        lowStockCount++;
      }
      try {
        const qtyInCostUnit = convertUnit(ing.currentStock, ing.unit, ing.costUnit);
        estimatedValue += qtyInCostUnit * ing.costPerUnit;
      } catch {
        estimatedValue += ing.currentStock * ing.costPerUnit;
      }
    }

    let totalWastageCost = 0;
    const wastageMovements = this.stockMovements().filter((m) => m.type === 'WASTAGE');
    for (const w of wastageMovements) {
      const ing = this.ingredients().find((i) => i.id === w.ingredientId);
      if (ing) {
        const wastedQty = Math.abs(w.quantityDelta);
        try {
          const qtyInCost = convertUnit(wastedQty, w.unit, ing.costUnit);
          totalWastageCost += qtyInCost * ing.costPerUnit;
        } catch {
          totalWastageCost += wastedQty * ing.costPerUnit;
        }
      }
    }

    return {
      totalTracked,
      lowStockCount,
      outOfStockCount,
      estimatedValue: roundStock(estimatedValue, 2),
      totalWastageCost: roundStock(totalWastageCost, 2),
    };
  }

  /**
   * Tracks and records printing of an order tax invoice.
   * Maintains print count and logs an immutable entry in the timeline audit trail.
   */
  recordOrderPrint(
    orderId: string,
    isReprint: boolean,
    staffName: string = 'Staff',
  ): { success: boolean; printCount: number; error?: string } {
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, printCount: 0, error: `Order '${orderId}' not found` };
    }

    const currentCount = order.printCount || 0;
    const newCount = currentCount + 1;
    const now = new Date().toISOString();
    const note = isReprint
      ? `Tax Invoice reprinted (Copy #${newCount}) authorized by Admin`
      : `Tax Invoice printed (Original - Copy #1) by ${staffName}`;

    const updatedTimeline = [
      ...order.timeline,
      {
        status: order.status,
        timestamp: now,
        note,
      },
    ];

    const updatedOrder: Order = {
      ...order,
      printCount: newCount,
      lastPrintedAt: now,
      updatedAt: now,
      timeline: updatedTimeline,
    };

    const updatedOrders = this.orders().map((o) => (o.id === order.id ? updatedOrder : o));
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    return { success: true, printCount: newCount };
  }

  /**
   * Tracks and records printing of an individual split bill receipt.
   * Maintains print count on the split bill and updates persistence.
   */
  recordSplitBillPrint(
    splitBillId: string,
    isReprint: boolean,
    staffName: string = 'Staff',
  ): { success: boolean; printCount: number; error?: string } {
    const split = this.splitBills().find((b) => b.id === splitBillId);
    if (!split) {
      return { success: false, printCount: 0, error: `Split bill '${splitBillId}' not found` };
    }

    const currentCount = split.printCount || 0;
    const newCount = currentCount + 1;

    const updatedSplitBills = this.splitBills().map((b) =>
      b.id === split.id ? { ...b, printCount: newCount } : b,
    );
    this.splitBills.set(updatedSplitBills);
    this.saveLocal('split_bills', updatedSplitBills);

    return { success: true, printCount: newCount };
  }
}
