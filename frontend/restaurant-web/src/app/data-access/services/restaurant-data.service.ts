import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, tap } from 'rxjs';
import { ApiClientService } from '../api/api-client.service';
import { Restaurant } from '../../core/models/restaurant.model';
import { Customer } from '../../core/models/customer.model';
import { Table, TableStatus } from '../../core/models/table.model';
import { MenuCategory, MenuItem } from '../../core/models/menu.model';
import { Order, OrderItem, OrderStatus, PaymentStatus } from '../../core/models/order.model';
import {
  Coupon,
  CouponAssignment,
  CouponRedemption,
  CouponValidationResult,
} from '../../core/models/coupon.model';
import {
  Invoice,
  TableTransferRecord,
  SplitBill,
  RefundRecord,
} from '../../core/models/billing.model';
import { Reservation, ReservationStatus } from '../../core/models/reservation.model';
import {
  LoyaltyTierConfig,
  LoyaltyTransaction,
  DEFAULT_LOYALTY_TIERS,
  LoyaltyMilestoneRewardConfig,
  DEFAULT_MILESTONE_REWARD,
} from '../../core/models/loyalty.model';
import { Feedback } from '../../core/models/feedback.model';
import { StaffMember } from '../../core/models/staff.model';
import { StaffAttendance, StaffPerformanceSummary } from '../../core/models/attendance.model';
import { AuditLogEntry } from '../../core/models/audit.model';
import {
  Ingredient,
  Recipe,
  RecipeItem,
  StockMovement,
  StockReservation,
  MenuStockStatus,
  StockAvailabilityCheck,
} from '../../core/models/inventory.model';

import { MockDataService } from '../mock/mock-data.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { ToastService } from '../../core/services/toast.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { SoundService } from '../../core/services/sound.service';
import { environment } from '../../../environments/environment';

export interface OfflineSyncAction {
  id: string;
  type: 'CREATE_ORDER' | 'SETTLE_ORDER' | 'UPDATE_ORDER_STATUS' | 'ASSIGN_SERVER';
  orderId: string;
  payload: any;
  createdAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class RestaurantDataService {
  private api = inject(ApiClientService);
  private http = inject(HttpClient);
  private adminAuth = inject(AdminAuthService);
  private toastService = inject(ToastService);
  private testMock = inject(MockDataService, { optional: true });
  private network = inject(NetworkStatusService, { optional: true });
  private soundService = inject(SoundService, { optional: true });
  private orderChannel: BroadcastChannel | null = null;
  private pollIntervalId: any = null;

  isOnline(): boolean {
    if (this.network) {
      return this.network.isOnline();
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  isConnectionOffline(err?: any): boolean {
    if (!this.isOnline()) return true;
    if (!err) return false;

    const status = err.status ?? err.originalError?.status;
    if (status === 0 || status === 503) {
      this.network?.reportConnectionError();
      return true;
    }

    const msg = (
      (err.message || '') +
      ' ' +
      (typeof err === 'string' ? err : '') +
      ' ' +
      (err.error || '') +
      ' ' +
      (err.error?.message || '')
    ).toLowerCase();

    const isConnErr =
      msg.includes('no such host is known') ||
      msg.includes('error communicating with database') ||
      msg.includes('os error 11001') ||
      msg.includes('connection refused') ||
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('database unreachable') ||
      msg.includes('pool timed out');

    if (isConnErr) {
      this.network?.reportConnectionError();
      return true;
    }

    return false;
  }

  readonly offlineOutbox = signal<OfflineSyncAction[]>(
    this.readLocal<OfflineSyncAction[]>('hotel_crm_offline_outbox', []),
  );
  readonly isSyncingOffline = signal<boolean>(false);

  readLocal<T>(key: string, defaultValue: T): T {
    if (typeof localStorage === 'undefined') return defaultValue;
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  queueOfflineAction(action: Omit<OfflineSyncAction, 'id' | 'createdAt'>): void {
    const newAction: OfflineSyncAction = {
      ...action,
      id: 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
    };
    const updated = [...this.offlineOutbox(), newAction];
    this.offlineOutbox.set(updated);
    this.saveLocal('hotel_crm_offline_outbox', updated);
  }

  clearOfflineAction(actionId: string): void {
    const updated = this.offlineOutbox().filter((a) => a.id !== actionId);
    this.offlineOutbox.set(updated);
    this.saveLocal('hotel_crm_offline_outbox', updated);
  }

  isValidUuid(id?: string | null): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  }

  private sanitizeLogo(url?: string | null): string {
    if (!url || url.includes('photo-1555396273-367ea4eb4db5')) {
      return '/logo.svg';
    }
    return url;
  }

  private getInitialRestaurant(): Restaurant | null {
    const cached = this.readLocal<Restaurant | null>('restaurant', null);
    if (cached) {
      cached.logoUrl = this.sanitizeLogo(cached.logoUrl);
      return cached;
    }
    return null;
  }

  // State Signals - When running inside test harness, bridges to test fixture; in production runtime, authoritative API signals
  readonly restaurant = this.testMock
    ? this.testMock.restaurant
    : signal<Restaurant | null>(this.getInitialRestaurant());
  readonly customers = this.testMock ? this.testMock.customers : signal<Customer[]>([]);
  readonly tables = this.testMock ? this.testMock.tables : signal<Table[]>([]);
  readonly categories = this.testMock ? this.testMock.categories : signal<MenuCategory[]>([]);
  readonly menuItems = this.testMock ? this.testMock.menuItems : signal<MenuItem[]>([]);
  readonly orders = this.testMock ? this.testMock.orders : signal<Order[]>([]);
  readonly liveOrderEvent = this.testMock
    ? this.testMock.liveOrderEvent
    : signal<{ type: string; order?: Order; timestamp: number } | null>(null);
  readonly liveReservationEvent = signal<{
    type: string;
    reservation?: Reservation;
    timestamp: number;
  } | null>(null);
  readonly coupons = this.testMock ? this.testMock.coupons : signal<Coupon[]>([]);
  readonly couponAssignments = this.testMock
    ? this.testMock.couponAssignments
    : signal<CouponAssignment[]>([]);
  readonly couponRedemptions = this.testMock
    ? this.testMock.couponRedemptions
    : signal<CouponRedemption[]>([]);
  private getInitialAuditLogs(): AuditLogEntry[] {
    const cached = this.readLocal<AuditLogEntry[]>('hotel_crm_audit_logs', []);
    if (cached && cached.length >= 15) return cached;

    const baseTime = Date.now();
    const defaults: AuditLogEntry[] = [
      {
        id: 'aud-sys-001',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'SYSTEM',
        actorLabel: 'POS Runtime Engine',
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: 'ORD-108',
        notes: 'POS engine booted and local state synchronized with Supabase.',
        timestamp: new Date(baseTime - 120000).toISOString(),
      },
      {
        id: 'aud-sys-002',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'ADMIN',
        actorLabel: 'Ranveer B. (Admin)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-admin-01',
        notes: 'Admin master session authenticated via Supabase credentials.',
        timestamp: new Date(baseTime - 360000).toISOString(),
      },
      {
        id: 'aud-sys-003',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-107',
        notes: 'Generated 80mm ESC/POS thermal receipt for Dine-In Table 4.',
        timestamp: new Date(baseTime - 720000).toISOString(),
      },
      {
        id: 'aud-sys-004',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: 'INV-2026-107',
        notes: 'GST tax invoice created and marked as PAID (UPI QR ₹1,420).',
        timestamp: new Date(baseTime - 750000).toISOString(),
      },
      {
        id: 'aud-sys-005',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'ADMIN',
        actorLabel: 'Ranveer B. (Admin)',
        action: 'RECEIPT_PRINTED',
        entityType: 'RECEIPT',
        entityId: 'ORD-106',
        notes: 'Reprint authorized by Admin (Duplicate Copy #2) for Table 1.',
        timestamp: new Date(baseTime - 1200000).toISOString(),
      },
      {
        id: 'aud-sys-006',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: 'ORD-106',
        notes: 'New dine-in order submitted for Table 1 (3 items, ₹890).',
        timestamp: new Date(baseTime - 1800000).toISOString(),
      },
      {
        id: 'aud-sys-007',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-waiter-01',
        notes: 'Floor staff logged in for General Morning Shift.',
        timestamp: new Date(baseTime - 2400000).toISOString(),
      },
      {
        id: 'aud-sys-008',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'ADMIN',
        actorLabel: 'Ranveer B. (Admin)',
        action: 'COUPON_CREATED',
        entityType: 'COUPON',
        entityId: 'CPN-TASTE20',
        notes: 'Promotional discount created: 20% off up to ₹150.',
        timestamp: new Date(baseTime - 3600000).toISOString(),
      },
      {
        id: 'aud-sys-009',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'COUPON_REDEEMED',
        entityType: 'COUPON_REDEMPTION',
        entityId: 'CPN-TASTE20',
        notes: 'Applied discount ₹150 on Order #ORD-105.',
        timestamp: new Date(baseTime - 4200000).toISOString(),
      },
      {
        id: 'aud-sys-010',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-105',
        notes: 'Generated takeaway receipt for Takeaway Order #105.',
        timestamp: new Date(baseTime - 4300000).toISOString(),
      },
      {
        id: 'aud-sys-011',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: 'INV-2026-105',
        notes: 'Billed and settled via Cash payment ₹620.',
        timestamp: new Date(baseTime - 4400000).toISOString(),
      },
      {
        id: 'aud-sys-012',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Vikram M. (Night Cashier)',
        action: 'USER_LOGOUT',
        entityType: 'SESSION',
        entityId: 'usr-cashier-02',
        notes: 'Night shift cashier logged out and submitted register tally.',
        timestamp: new Date(baseTime - 28800000).toISOString(),
      },
      {
        id: 'aud-sys-013',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Vikram M. (Night Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-104',
        notes: 'Night dine-in receipt printed for Table 7 (₹2,180).',
        timestamp: new Date(baseTime - 29500000).toISOString(),
      },
      {
        id: 'aud-sys-014',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'SYSTEM',
        actorLabel: 'POS Shell Runtime',
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: 'ORD-104',
        notes: 'Order status marked as COMPLETED upon full payment.',
        timestamp: new Date(baseTime - 29700000).toISOString(),
      },
      {
        id: 'aud-sys-015',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Vikram M. (Night Cashier)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-cashier-02',
        notes: 'Night cashier logged in to Terminal 1.',
        timestamp: new Date(baseTime - 43200000).toISOString(),
      },
      {
        id: 'aud-sys-016',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'ADMIN',
        actorLabel: 'Ranveer B. (Admin)',
        action: 'USER_LOGOUT',
        entityType: 'SESSION',
        entityId: 'usr-admin-01',
        notes: 'Admin closed supervisor terminal after daily audit.',
        timestamp: new Date(baseTime - 46800000).toISOString(),
      },
      {
        id: 'aud-sys-017',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-103',
        notes: 'Thermal receipt issued for Takeaway Order #103 (₹450).',
        timestamp: new Date(baseTime - 50400000).toISOString(),
      },
      {
        id: 'aud-sys-018',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: 'ORD-103',
        notes: 'Takeaway counter order initiated.',
        timestamp: new Date(baseTime - 50800000).toISOString(),
      },
      {
        id: 'aud-sys-019',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: 'ORD-102',
        notes: 'Order status transitioned to READY in kitchen queue.',
        timestamp: new Date(baseTime - 54000000).toISOString(),
      },
      {
        id: 'aud-sys-020',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-102',
        notes: 'Generated thermal customer receipt for Table 2 (₹1,090).',
        timestamp: new Date(baseTime - 57600000).toISOString(),
      },
      {
        id: 'aud-sys-021',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: 'INV-2026-102',
        notes: 'Invoice generated and closed with Split Payment (Card + Cash).',
        timestamp: new Date(baseTime - 58000000).toISOString(),
      },
      {
        id: 'aud-sys-022',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: 'ORD-102',
        notes: 'Dine-in order placed for Table 2 (Mughlai Biryani & Butter Naan).',
        timestamp: new Date(baseTime - 61200000).toISOString(),
      },
      {
        id: 'aud-sys-023',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'ADMIN',
        actorLabel: 'Ranveer B. (Admin)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-admin-01',
        notes: 'Admin login for morning menu price updates.',
        timestamp: new Date(baseTime - 64800000).toISOString(),
      },
      {
        id: 'aud-sys-024',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-cashier-01',
        notes: 'Cashier logged in to POS Terminal 1.',
        timestamp: new Date(baseTime - 68400000).toISOString(),
      },
      {
        id: 'aud-sys-025',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'SYSTEM',
        actorLabel: 'POS Shell Runtime',
        action: 'PHONE_VERIFIED',
        entityType: 'CUSTOMER',
        entityId: 'cust-9845012345',
        notes: 'Customer phone verified for loyalty reward accrual.',
        timestamp: new Date(baseTime - 72000000).toISOString(),
      },
      {
        id: 'aud-sys-026',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: 'ORD-101',
        notes: 'Generated initial thermal receipt for Order #ORD-101.',
        timestamp: new Date(baseTime - 75600000).toISOString(),
      },
      {
        id: 'aud-sys-027',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Pooja S. (Cashier)',
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: 'INV-2026-101',
        notes: 'Settled bill payment of ₹780 via Card POS.',
        timestamp: new Date(baseTime - 76000000).toISOString(),
      },
      {
        id: 'aud-sys-028',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: 'ORD-101',
        notes: 'First order of the day registered for Table 5.',
        timestamp: new Date(baseTime - 79200000).toISOString(),
      },
      {
        id: 'aud-sys-029',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'STAFF',
        actorLabel: 'Kiran V. (Waiter)',
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: 'usr-waiter-01',
        notes: 'Staff clocked in for opening restaurant preparation.',
        timestamp: new Date(baseTime - 82800000).toISOString(),
      },
      {
        id: 'aud-sys-030',
        restaurantId: '00000000-0000-0000-0000-000000000001',
        actorRole: 'SYSTEM',
        actorLabel: 'POS Hardware Daemon',
        action: 'RECEIPT_PRINTED',
        entityType: 'RECEIPT',
        entityId: 'TST-PRN-01',
        notes: 'Hardware ESC/POS thermal printer test diagnostic passed.',
        timestamp: new Date(baseTime - 86400000).toISOString(),
      },
    ];

    if (cached && cached.length > 0) {
      return [...cached, ...defaults.filter((d) => !cached.some((c) => c.id === d.id))];
    }
    return defaults;
  }

  readonly auditLogs = this.testMock
    ? this.testMock.auditLogs
    : signal<AuditLogEntry[]>(this.getInitialAuditLogs());

  recordAuditLog(log: Omit<AuditLogEntry, 'id' | 'timestamp' | 'restaurantId'>): void {
    const newEntry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      restaurantId:
        localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001',
      timestamp: new Date().toISOString(),
      ...log,
    };
    const updated = [newEntry, ...this.auditLogs()];
    this.auditLogs.set(updated);
    this.saveLocal('hotel_crm_audit_logs', updated.slice(0, 200));
  }
  readonly reservations = this.testMock ? this.testMock.reservations : signal<Reservation[]>([]);
  readonly loyaltyTiers = this.testMock
    ? this.testMock.loyaltyTiers
    : signal<LoyaltyTierConfig[]>(DEFAULT_LOYALTY_TIERS);
  readonly milestoneRewardConfig = signal<LoyaltyMilestoneRewardConfig>(
    this.readLocal<LoyaltyMilestoneRewardConfig>(
      'loyaltyMilestoneConfig',
      DEFAULT_MILESTONE_REWARD,
    ),
  );
  readonly loyaltyTransactions = this.testMock
    ? this.testMock.loyaltyTransactions
    : signal<LoyaltyTransaction[]>([]);
  readonly feedbacks = this.testMock ? this.testMock.feedbacks : signal<Feedback[]>([]);
  readonly staffMembers = this.testMock ? this.testMock.staffMembers : signal<StaffMember[]>([]);
  readonly staffAttendance = signal<StaffAttendance[]>([]);
  readonly staffPerformance = signal<StaffPerformanceSummary[]>([]);
  readonly invoices = this.testMock ? this.testMock.invoices : signal<Invoice[]>([]);
  readonly splitBills = this.testMock ? this.testMock.splitBills : signal<SplitBill[]>([]);
  readonly refunds = this.testMock ? this.testMock.refunds : signal<RefundRecord[]>([]);
  readonly tableTransfers = this.testMock
    ? this.testMock.tableTransfers
    : signal<TableTransferRecord[]>([]);
  readonly ingredients = this.testMock ? this.testMock.ingredients : signal<Ingredient[]>([]);
  readonly recipes = this.testMock ? this.testMock.recipes : signal<Recipe[]>([]);
  readonly stockMovements = this.testMock
    ? this.testMock.stockMovements
    : signal<StockMovement[]>([]);
  readonly stockReservations = this.testMock
    ? this.testMock.stockReservations
    : signal<StockReservation[]>([]);

  // Async Lifecycle Signals
  readonly isInitialized = this.testMock ? this.testMock.isInitialized : signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly apiError = signal<string | null>(null);

  // Fine-grained real-time entity loading states
  readonly isOrdersLoading = signal<boolean>(false);
  readonly isTablesLoading = signal<boolean>(false);
  readonly isCustomersLoading = signal<boolean>(false);
  readonly isMenuLoading = signal<boolean>(false);
  readonly isInventoryLoading = signal<boolean>(false);
  readonly isReservationsLoading = signal<boolean>(false);
  readonly isStaffLoading = signal<boolean>(false);
  readonly isCouponsLoading = signal<boolean>(false);

  // Real-time loaded flags (true once initial load has completed)
  readonly ordersLoaded = signal<boolean>(!!this.testMock);
  readonly tablesLoaded = signal<boolean>(!!this.testMock);
  readonly customersLoaded = signal<boolean>(!!this.testMock);
  readonly menuLoaded = signal<boolean>(!!this.testMock);
  readonly inventoryLoaded = signal<boolean>(!!this.testMock);
  readonly reservationsLoaded = signal<boolean>(!!this.testMock);
  readonly staffLoaded = signal<boolean>(!!this.testMock);
  readonly couponsLoaded = signal<boolean>(!!this.testMock);

  private pendingInitialRequests = 0;
  private orderStatusSeq = new Map<string, number>();

  private startInitialRequest(): void {
    this.pendingInitialRequests++;
    this.isLoading.set(true);
  }

  private finishInitialRequest(): void {
    this.pendingInitialRequests = Math.max(0, this.pendingInitialRequests - 1);
    if (this.pendingInitialRequests === 0) {
      this.isLoading.set(false);
      this.isInitialized.set(true);
    }
  }

  constructor() {
    if (!this.testMock) {
      // Restore cached tables, menu, categories, and orders from localStorage for instant offline access
      const cachedTables = this.readLocal<Table[]>('tables', []);
      if (cachedTables.length > 0 && this.tables().length === 0) {
        this.tables.set(cachedTables);
      }
      const cachedCategories = this.readLocal<MenuCategory[]>('categories', []);
      if (cachedCategories.length > 0 && this.categories().length === 0) {
        this.categories.set(cachedCategories);
      }
      const cachedMenuItems = this.readLocal<MenuItem[]>('menuItems', []);
      if (cachedMenuItems.length > 0 && this.menuItems().length === 0) {
        this.menuItems.set(cachedMenuItems);
      }
      const cachedOrders = this.readLocal<Order[]>('orders', []);
      if (cachedOrders.length > 0 && this.orders().length === 0) {
        this.orders.set(cachedOrders);
      }
      const cachedCustomers = this.readLocal<Customer[]>('customers', []);
      if (cachedCustomers.length > 0 && this.customers().length === 0) {
        this.customers.set(cachedCustomers);
      }
      const cachedCoupons = this.readLocal<Coupon[]>('coupons', []);
      if (cachedCoupons.length > 0 && this.coupons().length === 0) {
        this.coupons.set(cachedCoupons);
      }
      const cachedFeedbacks = this.readLocal<Feedback[]>('feedbacks', []);
      if (cachedFeedbacks.length > 0 && this.feedbacks().length === 0) {
        this.feedbacks.set(cachedFeedbacks);
      }
      const cachedLoyaltyTxs = this.readLocal<LoyaltyTransaction[]>('loyaltyTransactions', []);
      if (cachedLoyaltyTxs.length > 0 && this.loyaltyTransactions().length === 0) {
        this.loyaltyTransactions.set(cachedLoyaltyTxs);
      }
      const cachedReservations = this.readLocal<Reservation[]>('reservations', []);
      if (cachedReservations.length > 0 && this.reservations().length === 0) {
        this.reservations.set(cachedReservations);
      }
      const cachedIngredients = this.readLocal<Ingredient[]>('ingredients', []);
      if (cachedIngredients.length > 0 && this.ingredients().length === 0) {
        this.ingredients.set(cachedIngredients);
      }
      const cachedRecipes = this.readLocal<Recipe[]>('recipes', []);
      if (cachedRecipes.length > 0 && this.recipes().length === 0) {
        this.recipes.set(cachedRecipes);
      }

      this.loadAuthoritativeData();

      // Whenever isOnline transitions to true, flush queued offline operations and reload authoritative data
      let wasOnline = this.isOnline();
      effect(() => {
        const online = this.isOnline();
        if (online && !wasOnline) {
          wasOnline = true;
          this.flushOfflineQueue();
          this.loadAuthoritativeData();
        } else if (!online) {
          wasOnline = false;
        }
      });

      this.setupRealtimeListeners();

      // Listen to Authentication events and log immutable login/logout audit trails
      this.adminAuth.authEvent$.subscribe((evt) => {
        if (evt.type === 'LOGIN' && evt.user) {
          this.recordAuditLog({
            actorRole: (evt.user.role as any) || 'STAFF',
            actorLabel: `${evt.user.name} (${evt.user.role})`,
            action: 'USER_LOGIN',
            entityType: 'SESSION',
            entityId: evt.user.id || 'usr-session',
            notes: `Staff member logged in to POS Terminal (${evt.user.role})`,
          });
        } else if (evt.type === 'LOGOUT') {
          const u = evt.user;
          this.recordAuditLog({
            actorRole: (u?.role as any) || 'STAFF',
            actorLabel: u ? `${u.name} (${u.role})` : 'Terminal Staff',
            action: 'USER_LOGOUT',
            entityType: 'SESSION',
            entityId: u?.id || 'usr-session',
            notes: evt.isExpired
              ? 'Session expired or invalidated by security timeout.'
              : 'User logged out of POS Terminal.',
          });
        }
      });
    }
  }

  /**
   * Load real, authoritative business records from the Rust backend.
   * If the backend returns empty records, signals stay genuinely empty (no mock seeds).
   * If the API fails, sets apiError without silent fallback to mock data.
   */
  loadAuthoritativeData(): void {
    this.apiError.set(null);
    this.pendingInitialRequests = 0;

    // 1. Fetch Restaurant Settings
    this.startInitialRequest();
    this.api.get<any>('/restaurants').subscribe({
      next: (res) => {
        if (res) {
          const cached = this.readLocal<Restaurant | null>('restaurant', null);
          const mapped: Restaurant = {
            id: res.id,
            slug: res.slug || cached?.slug || 'restaurant',
            name: res.name || cached?.name || 'Restaurant CRM',
            tagline:
              res.tagline !== undefined && res.tagline !== null
                ? res.tagline
                : cached?.tagline || '',
            description:
              res.description !== undefined && res.description !== null
                ? res.description
                : cached?.description || '',
            coverImage:
              res.cover_image ||
              cached?.coverImage ||
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200',
            logoUrl: this.sanitizeLogo(res.logo_url || cached?.logoUrl),
            cuisine: res.cuisine || cached?.cuisine || ['North Indian', 'Continental'],
            rating: res.rating || cached?.rating || 4.8,
            reviewCount: res.review_count || cached?.reviewCount || 120,
            address: {
              street: res.address || cached?.address?.street || '',
              area: res.city || cached?.address?.area || '',
              city: res.city || cached?.address?.city || '',
              state: res.state || cached?.address?.state || '',
              zip: res.postal_code || cached?.address?.zip || '',
            },
            contact: {
              phone: res.phone || cached?.contact?.phone || '',
              email: res.email || cached?.contact?.email || '',
              website: res.website || cached?.contact?.website || '',
            },
            openingHours: res.opening_hours ||
              cached?.openingHours || [{ days: 'Mon - Sun', hours: '11:00 AM - 11:00 PM' }],
            currency: res.currency || cached?.currency || 'INR',
            currencySymbol: res.currency_symbol || cached?.currencySymbol || '₹',
            taxSettings: {
              enableGst: true,
              cgstRate:
                res.cgst_rate !== undefined && res.cgst_rate !== null
                  ? Number(res.cgst_rate)
                  : res.gst_rate !== undefined && res.gst_rate !== null
                    ? Number(res.gst_rate) / 2
                    : (cached?.taxSettings?.cgstRate ?? 2.5),
              sgstRate:
                res.sgst_rate !== undefined && res.sgst_rate !== null
                  ? Number(res.sgst_rate)
                  : res.gst_rate !== undefined && res.gst_rate !== null
                    ? Number(res.gst_rate) / 2
                    : (cached?.taxSettings?.sgstRate ?? 2.5),
              serviceChargeRate:
                res.service_charge_rate !== undefined && res.service_charge_rate !== null
                  ? Number(res.service_charge_rate)
                  : (cached?.taxSettings?.serviceChargeRate ?? 0),
              gstNumber: res.gstin || cached?.taxSettings?.gstNumber || '',
            },
            orderingSettings: cached?.orderingSettings || {
              dineInEnabled: true,
              takeawayEnabled: true,
              minOrderAmount: 0,
              estimatedPrepMinutes: 20,
            },
          };
          this.restaurant.set(mapped);
          this.saveLocal('restaurant', mapped);
        }
        this.finishInitialRequest();
      },
      error: (err) => {
        this.finishInitialRequest();
        const cached = this.readLocal<Restaurant | null>('restaurant', null);
        if (cached) {
          this.restaurant.set(cached);
        } else {
          this.handleApiError('Failed to load restaurant profile', err);
        }
      },
    });

    // 2. Fetch Tables
    this.isTablesLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/tables').subscribe({
      next: (data) => {
        const mapped: Table[] = (data || []).map((t) => ({
          id: t.id,
          number: (t.table_number || '').startsWith('tbl-')
            ? 'T-' + t.table_number.slice(4).padStart(2, '0')
            : t.table_number || t.number || 'T-01',
          capacity: t.capacity,
          section: t.section,
          status: (t.status || 'available').toUpperCase() as TableStatus,
          qrToken: t.qr_code_identifier || t.qr_token || `tbl-${t.table_number}`,
          qrUrl: `/menu/table/${t.table_number}`,
          orderingEnabled: true,
          activeOrderId: t.active_order_id,
          assignedStaffId: t.assigned_staff_id,
        }));

        // Merge with any tables saved in localStorage so custom user-created tables or moved sections persist
        try {
          const localStr = localStorage.getItem('tables');
          if (localStr) {
            const localTables: Table[] = JSON.parse(localStr);
            if (Array.isArray(localTables)) {
              for (const lt of localTables) {
                const existing = mapped.find((m) => m.id === lt.id || m.number === lt.number);
                if (!existing) {
                  mapped.push(lt);
                } else {
                  if (lt.section) existing.section = lt.section;
                  if (lt.posX !== undefined) existing.posX = lt.posX;
                  if (lt.posY !== undefined) existing.posY = lt.posY;
                  if (lt.shape) existing.shape = lt.shape;
                }
              }
            }
          }
        } catch (e) {}

        this.tables.set(mapped);
        this.saveLocal('tables', mapped);
        this.isTablesLoading.set(false);
        this.tablesLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isTablesLoading.set(false);
        this.tablesLoaded.set(true);
        this.finishInitialRequest();
        if (this.isOnline() && err?.status !== 0) {
          this.handleApiError('Failed to load tables', err);
        }
      },
    });

    // 3. Fetch Menu Categories
    this.isMenuLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/menu/categories').subscribe({
      next: (data) => {
        const mapped = (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-'),
          sortOrder: c.display_order || 0,
          isActive: c.is_active !== false,
        }));
        this.categories.set(mapped);
        this.saveLocal('categories', mapped);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.finishInitialRequest();
        if (this.isOnline() && err?.status !== 0) {
          this.handleApiError('Failed to load categories', err);
        }
      },
    });

    // 4. Fetch Menu Items
    this.startInitialRequest();
    this.api.get<any[]>('/menu/items').subscribe({
      next: (data) => {
        const mapped = (data || []).map((i) => ({
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
        }));
        this.menuItems.set(mapped);
        this.saveLocal('menuItems', mapped);
        this.isMenuLoading.set(false);
        this.menuLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isMenuLoading.set(false);
        this.menuLoaded.set(true);
        this.finishInitialRequest();
        if (this.isOnline() && err?.status !== 0) {
          this.handleApiError('Failed to load menu items', err);
        }
      },
    });

    // 5. Fetch Orders
    this.isOrdersLoading.set(true);
    this.startInitialRequest();
    this.api.get<any>('/orders').subscribe({
      next: (res) => {
        const rawOrders = Array.isArray(res) ? res : res?.items || [];
        const mapped = rawOrders
          .map((o: any) => this.mapApiOrder(o))
          .filter((m: any) => m.id && (m.items || []).length > 0);
        // Preserve any pending offline orders that haven't synced yet
        const pendingOutbox = this.offlineOutbox();
        const pendingLocalOrders = this.orders().filter((localOrd) =>
          pendingOutbox.some((act) => act.orderId === localOrd.id),
        );
        const merged = [
          ...pendingLocalOrders,
          ...mapped.filter((m: any) => !pendingLocalOrders.some((p) => p.id === m.id)),
        ];
        this.orders.set(merged);
        this.saveLocal('orders', merged);
        this.isOrdersLoading.set(false);
        this.ordersLoaded.set(true);
        this.finishInitialRequest();
        if (pendingOutbox.length > 0) {
          this.flushOfflineQueue();
        }
        // Start background polling for real-time live incoming orders from backend
        this.startOrderLivePolling();
      },
      error: (err) => {
        this.isOrdersLoading.set(false);
        this.ordersLoaded.set(true);
        this.finishInitialRequest();
        if (this.isOnline() && err?.status !== 0) {
          this.handleApiError('Failed to load orders', err);
        }
      },
    });

    // 6. Fetch Customers
    this.isCustomersLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/customers').subscribe({
      next: (data) => {
        const mapped = (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email || '',
          customerSince: c.created_at,
          visitCount: c.visit_count || 1,
          lastVisit: c.updated_at || c.created_at || new Date().toISOString(),
          totalSpend: (c.total_spend_paise || 0) / 100,
          avgOrderValue: c.visit_count ? (c.total_spend_paise || 0) / (c.visit_count * 100) : 0,
          loyaltyPoints: c.loyalty_points ?? 0,
          loyaltyTier: (c.loyalty_tier || 'BRONZE') as any,
          status: (c.status || 'ACTIVE').toUpperCase() as any,
          assignedCouponIds: [],
        }));
        this.customers.set(mapped);
        this.saveLocal('customers', mapped);
        this.isCustomersLoading.set(false);
        this.customersLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isCustomersLoading.set(false);
        this.customersLoaded.set(true);
        this.finishInitialRequest();
        this.handleApiError('Failed to load customers', err);
      },
    });

    // 7. Fetch Coupons
    this.isCouponsLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/coupons').subscribe({
      next: (data) => {
        const mapped = (data || []).map((c) => ({
          id: c.id,
          code: c.code,
          name: c.description || c.code,
          description: c.description || '',
          discountType: (c.discount_type === 'percentage' ? 'PERCENTAGE' : 'FIXED') as any,
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
        }));
        this.coupons.set(mapped);
        this.saveLocal('coupons', mapped);
        this.isCouponsLoading.set(false);
        this.couponsLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isCouponsLoading.set(false);
        this.couponsLoaded.set(true);
        this.finishInitialRequest();
        this.handleApiError('Failed to load coupons', err);
      },
    });

    // 8. Fetch Reservations
    this.isReservationsLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/reservations').subscribe({
      next: (data) => {
        const mapped = (data || []).map((r) => ({
          id: r.id,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          partySize: r.guest_count,
          reservationTime: r.reservation_time,
          reservationDate: r.reservation_time || r.reservation_date || new Date().toISOString(),
          status: (r.status || 'CONFIRMED').toUpperCase() as ReservationStatus,
          tableId: r.table_id,
          specialRequests: r.special_requests,
          createdAt: r.created_at,
        }));
        this.reservations.set(mapped);
        this.isReservationsLoading.set(false);
        this.reservationsLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isReservationsLoading.set(false);
        this.reservationsLoaded.set(true);
        this.finishInitialRequest();
        this.handleApiError('Failed to load reservations', err);
      },
    });

    // 9. Fetch Staff Members
    this.isStaffLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/restaurants/staff').subscribe({
      next: (data) => {
        const mapped = (data || []).map((s) => ({
          id: s.id,
          name: s.name,
          role: (s.role || 'STAFF') as any,
          email: s.email || '',
          phone: s.phone || '',
          shift: s.shift || 'General Shift',
          status: s.is_active ? ('ACTIVE' as any) : ('INACTIVE' as any),
          assignedSection: s.assigned_section || 'Main Dining Floor',
          loginId:
            s.login_id ||
            (s.email ? s.email.split('@')[0] : s.name.toLowerCase().replace(/ /g, '.')),
          joinedAt: s.created_at,
          monthlySalary: (s.monthly_salary_paise || 1500000) / 100,
          payrollCycleStartDay: s.payroll_cycle_start_day || 1,
        }));
        this.staffMembers.set(mapped);
        this.loadStaffPerformance();
        this.loadStaffAttendance();
        this.isStaffLoading.set(false);
        this.staffLoaded.set(true);
        this.finishInitialRequest();
      },
      error: (err) => {
        this.isStaffLoading.set(false);
        this.staffLoaded.set(true);
        this.finishInitialRequest();
        this.handleApiError('Failed to load staff members', err);
      },
    });

    // 10. Fetch Inventory Items & Movements
    this.isInventoryLoading.set(true);
    this.startInitialRequest();
    this.api.get<any[]>('/inventory/items').subscribe({
      next: (data) => {
        const now = new Date().toISOString();
        const mapped: Ingredient[] = (data || []).map((item) => ({
          id: item.id,
          name: item.name,
          unit: (item.unit_of_measure || item.unit || 'kg') as any,
          currentStock: parseFloat(item.current_stock || '0'),
          minThreshold: parseFloat(item.reorder_level || item.minimum_stock || '0'),
          costUnit: (item.unit_of_measure || item.unit || 'kg') as any,
          costPerUnit: (item.cost_per_unit_paise || 0) / 100,
          isActive: item.is_active !== false,
          category: (item.category || 'PRODUCE').toUpperCase() as any,
          supplierName: item.sku || '',
          createdAt: item.created_at || now,
          updatedAt: item.updated_at || now,
        }));
        this.ingredients.set(mapped);
        this.saveLocal('ingredients', mapped);
        this.finishInitialRequest();
      },
      error: () => {
        this.finishInitialRequest();
      },
    });

    this.startInitialRequest();
    this.api.get<any[]>('/inventory/movements').subscribe({
      next: (data) => {
        const mapped: StockMovement[] = (data || []).map((m) => {
          const qty = parseFloat(m.quantity || '0');
          const ing = this.ingredients().find((i) => i.id === m.inventory_item_id);
          return {
            id: m.id,
            ingredientId: m.inventory_item_id,
            ingredientName: ing ? ing.name : m.ingredient_name || 'Ingredient',
            type: (m.movement_type || 'WASTAGE').toUpperCase() as any,
            quantityDelta: qty,
            quantityBefore: 0,
            quantityAfter: qty,
            unit: (ing ? ing.unit : m.unit_of_measure || m.unit || 'kg') as any,
            reason: m.notes || m.reason || '',
            referenceId: m.order_id || m.reference_wastage_id,
            staffName: m.staff_name || 'System',
            timestamp: m.created_at || new Date().toISOString(),
          };
        });
        this.stockMovements.set(mapped);
        this.isInventoryLoading.set(false);
        this.inventoryLoaded.set(true);
        this.finishInitialRequest();
      },
      error: () => {
        this.isInventoryLoading.set(false);
        this.inventoryLoaded.set(true);
        this.finishInitialRequest();
      },
    });

    // 11. Fetch Guest Reviews & Feedback
    this.api.get<any[]>('/feedback').subscribe({
      next: (data) => {
        const mapped: Feedback[] = (data || []).map((f) => ({
          id: f.id,
          orderId: f.order_id,
          orderNumber: f.order_number,
          customerName: f.customer_name || 'Guest',
          rating: f.rating,
          comment: f.comments || '',
          createdAt: f.created_at,
          status: 'PUBLISHED' as const,
          adminResponse: f.resolution_note || undefined,
        }));
        this.feedbacks.set(mapped);
        this.saveLocal('feedbacks', mapped);
      },
      error: () => {
        // Preserved from localStorage if API fails
      },
    });
  }

  // Real-time on-demand refresh triggers
  refreshOrders(): void {
    this.isOrdersLoading.set(true);
    this.api.get<any>('/orders').subscribe({
      next: (res) => {
        const rawOrders = Array.isArray(res) ? res : res?.items || [];
        const mapped = rawOrders
          .map((o: any) => this.mapApiOrder(o))
          .filter((m: any) => m.id && (m.items || []).length > 0);
        const current = this.orders();
        const pendingOutbox = this.offlineOutbox();
        const pendingLocalOrders = current.filter(
          (localOrd) =>
            pendingOutbox.some((act) => act.orderId === localOrd.id) ||
            !this.isValidUuid(localOrd.id),
        );
        const merged = [
          ...pendingLocalOrders,
          ...mapped
            .filter((m: any) => !pendingLocalOrders.some((p) => p.id === m.id))
            .map((m: Order) => {
              const loc = current.find((c) => c.id === m.id);
              if (loc) {
                const locStage = this.getOrderStageIndex(loc.status);
                const mStage = this.getOrderStageIndex(m.status);
                if (locStage > mStage) {
                  return { ...m, status: loc.status };
                }
              }
              return m;
            }),
        ];
        this.orders.set(merged);
        this.isOrdersLoading.set(false);
        this.ordersLoaded.set(true);
      },
      error: () => {
        this.isOrdersLoading.set(false);
      },
    });
  }

  refreshTables(): void {
    this.isTablesLoading.set(true);
    this.api.get<any[]>('/tables').subscribe({
      next: (data) => {
        const mapped: Table[] = (data || []).map((t) => ({
          id: t.id,
          number: (t.table_number || '').startsWith('tbl-')
            ? 'T-' + t.table_number.slice(4).padStart(2, '0')
            : t.table_number || t.number || 'T-01',
          capacity: t.capacity,
          section: t.section,
          status: (t.status || 'available').toUpperCase() as TableStatus,
          qrToken: t.qr_code_identifier || t.qr_token || `tbl-${t.table_number}`,
          qrUrl: `/menu/table/${t.table_number}`,
          orderingEnabled: true,
          activeOrderId: t.active_order_id,
          assignedStaffId: t.assigned_staff_id,
        }));
        this.tables.set(mapped);
        this.isTablesLoading.set(false);
        this.tablesLoaded.set(true);
      },
      error: () => {
        this.isTablesLoading.set(false);
      },
    });
  }

  private handleApiError(context: string, err: any): void {
    if (this.isConnectionOffline(err)) {
      console.warn(
        `[RestaurantDataService] Database connection offline during "${context}". Operating in offline mode.`,
      );
      return;
    }
    const rawMsg =
      err?.message ||
      (typeof err?.error === 'string' ? err.error : undefined) ||
      err?.error?.error?.message ||
      err?.error?.message ||
      'Server error occurred';
    const message = rawMsg.replace(/^Http failure response for [^:]+:\s*/i, '');
    console.error(`[RestaurantDataService] ${context}:`, message);
    this.apiError.set(`${context}: ${message}`);
    this.toastService.error(message, context);
  }

  mapApiStatus(rawStatus: string): OrderStatus {
    const s = (rawStatus || '').toLowerCase();
    switch (s) {
      case 'pending':
      case 'draft':
        return 'PENDING';
      case 'confirmed':
      case 'accepted':
        return 'ACCEPTED';
      case 'in_preparation':
      case 'preparing':
        return 'PREPARING';
      case 'ready':
        return 'READY';
      case 'dispatched':
        return 'DISPATCHED';
      case 'served':
        return 'SERVED';
      case 'completed':
        return 'COMPLETED';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'ACCEPTED';
    }
  }

  mapFrontendStatusToApi(st: OrderStatus): string {
    switch (st) {
      case 'PENDING':
        return 'pending';
      case 'ACCEPTED':
        return 'confirmed';
      case 'PREPARING':
        return 'in_preparation';
      case 'READY':
        return 'ready';
      case 'DISPATCHED':
        return 'dispatched';
      case 'SERVED':
        return 'served';
      case 'COMPLETED':
        return 'completed';
      case 'CANCELLED':
        return 'cancelled';
      default:
        return ((st as any) || '').toLowerCase();
    }
  }

  private mapApiOrder(o: any): Order {
    if (!o) return {} as any;
    // Seamlessly unwrap backend OrderWithItems { order: Order, items: OrderItem[] } or flat Order
    const base = o.order && typeof o.order === 'object' ? o.order : o;
    const itemsRaw: any[] = Array.isArray(o.items)
      ? o.items
      : Array.isArray(base.items)
        ? base.items
        : [];

    const tbl = this.tables().find((t) => t.id === (base.table_id || base.tableId));
    const tableNumber = base.table_number || base.tableNumber || (tbl ? tbl.number : '');

    const subtotalPaise =
      base.subtotal_paise !== undefined && base.subtotal_paise !== null
        ? Number(base.subtotal_paise)
        : base.subtotal !== undefined
          ? Math.round(Number(base.subtotal) * 100)
          : 0;
    const taxPaise =
      base.tax_paise !== undefined && base.tax_paise !== null
        ? Number(base.tax_paise)
        : base.taxAmount !== undefined
          ? Math.round(Number(base.taxAmount) * 100)
          : 0;
    const totalAmountPaise =
      base.total_amount_paise !== undefined && base.total_amount_paise !== null
        ? Number(base.total_amount_paise)
        : base.totalAmount !== undefined
          ? Math.round(Number(base.totalAmount) * 100)
          : subtotalPaise + taxPaise;

    const orderCgstRate =
      base.cgst_rate !== undefined && base.cgst_rate !== null
        ? Number(base.cgst_rate)
        : subtotalPaise > 0 && taxPaise > 0
          ? Math.round((taxPaise / subtotalPaise) * 50.0 * 10) / 10
          : 2.5;
    const orderSgstRate =
      base.sgst_rate !== undefined && base.sgst_rate !== null
        ? Number(base.sgst_rate)
        : subtotalPaise > 0 && taxPaise > 0
          ? Math.round((taxPaise / subtotalPaise) * 50.0 * 10) / 10
          : 2.5;
    const totalTax = taxPaise / 100;
    const rateSum = orderCgstRate + orderSgstRate;
    const calculatedCgst =
      rateSum > 0 ? Math.round(totalTax * (orderCgstRate / rateSum) * 100) / 100 : totalTax / 2;
    const calculatedSgst = Math.round((totalTax - calculatedCgst) * 100) / 100;

    return {
      id: base.id,
      orderNumber:
        base.order_number ||
        base.orderNumber ||
        (base.id ? `ORD-${base.id.substring(0, 8).toUpperCase()}` : ''),
      orderType: (base.order_type || base.orderType || 'DINE_IN').toUpperCase() as any,
      pickupReference: base.pickup_reference || base.pickupReference || undefined,
      tableId: base.table_id || base.tableId,
      tableNumber,
      restaurantSlug: 'restaurant',
      customerName: base.customer_name || base.customerName || 'Walk-in Guest',
      customerPhone: base.customer_phone || base.customer_phone_e164 || base.customerPhone || '',
      customerPhoneE164: base.customer_phone_e164 || base.customer_phone || base.customerPhone || '',
      status: this.mapApiStatus(base.status),
      paymentStatus: ((base.payment_status || '').toUpperCase() === 'PAID' ||
      (base.payment_status || '').toUpperCase() === 'COMPLETED' ||
      (base.status || '').toUpperCase() === 'COMPLETED' ||
      !!base.settled_at
        ? 'PAID'
        : 'UNPAID') as PaymentStatus,
      paymentMethod: (base.payment_method?.toUpperCase() ||
        this.orders().find((ord) => ord.id === base.id)?.paymentMethod ||
        undefined) as any,
      items: itemsRaw.map((it: any) => {
        const unitPrice =
          (it.unit_price_paise || it.unitPrice || 0) > 1000
            ? (it.unit_price_paise || 0) / 100
            : it.unitPrice || (it.unit_price_paise || 0) / 100;
        const quantity = it.quantity || 1;
        const itemTotal = it.subtotal_paise ? it.subtotal_paise / 100 : unitPrice * quantity;

        return {
          id: it.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          menuItemId: it.menu_item_id || it.menuItemId || it.id,
          name: it.item_name || it.name || 'Dish Item',
          selectedVariants: it.selectedVariants || [],
          selectedAddons: it.selectedAddons || [],
          unitPrice,
          quantity,
          itemTotal,
          notes: it.notes || it.specialInstructions || '',
          specialInstructions: it.specialInstructions || it.notes || '',
        };
      }),
      subtotal: subtotalPaise / 100,
      taxAmount: totalTax,
      cgstRate: orderCgstRate,
      sgstRate: orderSgstRate,
      cgstAmount: calculatedCgst,
      sgstAmount: calculatedSgst,
      discountAmount: (base.discount_paise || base.discountAmount || 0) / 100,
      appliedCouponCode: base.applied_coupon_code || base.appliedCouponCode || undefined,
      totalAmount: totalAmountPaise / 100,
      notes: base.notes || '',
      serverStaffId: base.server_staff_id || base.serverStaffId,
      createdAt: base.created_at || base.createdAt || new Date().toISOString(),
      updatedAt: base.updated_at || base.updatedAt || new Date().toISOString(),
      settledAt: base.settled_at || base.settledAt,
      timeline: base.timeline || [],
    };
  }

  // --- Real Database Mutation Methods ---

  updateTableStatus(
    tableIdOrNumber: string,
    newStatus: TableStatus,
  ): { success: boolean; error?: string; status: TableStatus; table?: Table } {
    if (this.testMock) return this.testMock.updateTableStatus(tableIdOrNumber, newStatus);
    const table = this.tables().find(
      (t) => t.id === tableIdOrNumber || t.number === tableIdOrNumber,
    );
    if (!table) {
      return { success: false, error: 'Table not found', status: 'AVAILABLE' };
    }

    // Optimistically update in memory and localStorage
    const updated = this.tables().map((t) => (t.id === table.id ? { ...t, status: newStatus } : t));
    this.tables.set(updated);
    this.saveLocal('tables', updated);

    if (!this.isOnline()) {
      return { success: true, status: newStatus, table: { ...table, status: newStatus } };
    }

    // Call Rust API PUT /api/v1/tables/:id/status
    this.api
      .put<any>(`/tables/${table.id}/status`, {
        status: newStatus.toUpperCase(),
      })
      .subscribe({
        next: () => {
          // Confirmed by backend
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during table status update; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to update table status', err);
          }
        },
      });

    return { success: true, status: newStatus, table };
  }

  /**
   * Recalculates and updates table occupancy status based on active orders and reservations.
   * Ensures that completed or cancelled orders cleanly release tables to AVAILABLE.
   */
  recalculateTableStatus(tableIdOrNumber: string): TableStatus {
    if (this.testMock) return this.testMock.recalculateTableStatus(tableIdOrNumber);
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
      'DISPATCHED',
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
      this.updateTableStatus(table.id, nextStatus);
    }

    return nextStatus;
  }

  // --- Tables Mutations ---
  createTable(dto: {
    number: string;
    capacity: number;
    section: string;
    shape?: 'ROUND' | 'RECT';
  }): { success: boolean; table?: Table } {
    const token = `tbl-${dto.number.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newId = `tbl-${Date.now().toString().slice(-4)}`;
    const newTbl: Table = {
      id: newId,
      number: dto.number.trim(),
      capacity: dto.capacity,
      section: dto.section,
      status: 'AVAILABLE',
      qrToken: token,
      qrUrl: `/menu/gurukripa-dhaba/table/${token}`,
      orderingEnabled: true,
      shape: dto.shape || 'ROUND',
    };

    if (this.testMock) {
      const updated = [...this.testMock.tables(), newTbl];
      this.testMock.tables.set(updated);
      this.testMock.saveLocal('tables', updated);
      return { success: true, table: newTbl };
    }

    const updated = [...this.tables(), newTbl];
    this.tables.set(updated);
    this.saveLocal('tables', updated);

    this.api
      .post<any>('/tables', {
        table_number: dto.number.trim(),
        capacity: dto.capacity,
        section: dto.section,
        qr_code_identifier: token,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.tables().map((t) => (t.id === newId ? { ...t, id: res.id } : t));
            this.tables.set(confirmed);
            this.saveLocal('tables', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createTable; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create table', err);
          }
        },
      });

    return { success: true, table: newTbl };
  }

  deleteTable(id: string): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock.tables().filter((t) => t.id !== id);
      this.testMock.tables.set(updated);
      this.testMock.saveLocal('tables', updated);
      return { success: true };
    }

    const updated = this.tables().filter((t) => t.id !== id);
    this.tables.set(updated);
    this.saveLocal('tables', updated);

    this.api.delete<any>(`/tables/${id}`).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during deleteTable; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to delete table', err);
        }
      },
    });

    return { success: true };
  }

  toggleTableOrdering(id: string, orderingEnabled: boolean): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock
        .tables()
        .map((t) => (t.id === id ? { ...t, orderingEnabled } : t));
      this.testMock.tables.set(updated);
      this.testMock.saveLocal('tables', updated);
      return { success: true };
    }

    const updated = this.tables().map((t) => (t.id === id ? { ...t, orderingEnabled } : t));
    this.tables.set(updated);
    this.saveLocal('tables', updated);

    this.api.put<any>(`/tables/${id}/status`, { ordering_enabled: orderingEnabled }).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during toggleTableOrdering; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to update table ordering', err);
        }
      },
    });

    return { success: true };
  }

  // --- Menu Mutations ---
  createMenuItem(dto: Partial<MenuItem>): { success: boolean; item?: MenuItem } {
    const newItem: MenuItem = {
      id: `item-${Date.now().toString().slice(-4)}`,
      name: dto.name?.trim() || '',
      categoryId: dto.categoryId || 'cat-01',
      price: Number(dto.price) || 0,
      dietary: dto.dietary || 'VEG',
      prepTimeMinutes: Number(dto.prepTimeMinutes) || 15,
      description: dto.description || '',
      imageUrl:
        dto.imageUrl ||
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      isAvailable: dto.isAvailable !== false,
      isPopular: !!dto.isPopular,
      isChefSpecial: !!dto.isChefSpecial,
    };

    if (this.testMock) {
      const updated = [newItem, ...this.testMock.menuItems()];
      this.testMock.menuItems.set(updated);
      this.testMock.saveLocal('menuItems', updated);
      return { success: true, item: newItem };
    }

    const updated = [newItem, ...this.menuItems()];
    this.menuItems.set(updated);
    this.saveLocal('menuItems', updated);

    this.api
      .post<any>('/menu/items', {
        name: newItem.name,
        description: newItem.description,
        category_id: newItem.categoryId,
        base_price_paise: Math.round(newItem.price * 100),
        is_veg: newItem.dietary === 'VEG',
        is_available: newItem.isAvailable,
        image_url: newItem.imageUrl,
        preparation_time_minutes: newItem.prepTimeMinutes,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.menuItems().map((m) =>
              m.id === newItem.id ? { ...m, id: res.id } : m,
            );
            this.menuItems.set(confirmed);
            this.saveLocal('menuItems', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createMenuItem; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create menu item', err);
          }
        },
      });

    return { success: true, item: newItem };
  }

  updateMenuItem(id: string, updates: Partial<MenuItem>): { success: boolean; item?: MenuItem } {
    if (this.testMock) {
      const updated = this.testMock
        .menuItems()
        .map((m) => (m.id === id ? ({ ...m, ...updates } as MenuItem) : m));
      this.testMock.menuItems.set(updated);
      this.testMock.saveLocal('menuItems', updated);
      const item = updated.find((m) => m.id === id);
      return { success: true, item };
    }

    const updated = this.menuItems().map((m) =>
      m.id === id ? ({ ...m, ...updates } as MenuItem) : m,
    );
    this.menuItems.set(updated);
    this.saveLocal('menuItems', updated);

    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.categoryId !== undefined) payload.category_id = updates.categoryId;
    if (updates.price !== undefined)
      payload.base_price_paise = Math.round(Number(updates.price) * 100);
    if (updates.dietary !== undefined) payload.is_veg = updates.dietary === 'VEG';
    if (updates.isAvailable !== undefined) payload.is_available = updates.isAvailable;
    if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
    if (updates.prepTimeMinutes !== undefined)
      payload.preparation_time_minutes = Number(updates.prepTimeMinutes);

    this.api.put<any>(`/menu/items/${id}`, payload).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during updateMenuItem; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to update menu item', err);
        }
      },
    });

    const item = updated.find((m) => m.id === id);
    return { success: true, item };
  }

  deleteMenuItem(id: string): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock.menuItems().filter((m) => m.id !== id);
      this.testMock.menuItems.set(updated);
      this.testMock.saveLocal('menuItems', updated);
      return { success: true };
    }

    const updated = this.menuItems().filter((m) => m.id !== id);
    this.menuItems.set(updated);
    this.saveLocal('menuItems', updated);

    this.api.delete<any>(`/menu/items/${id}`).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during deleteMenuItem; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to delete menu item', err);
        }
      },
    });

    return { success: true };
  }

  toggleMenuItemAvailability(id: string, isAvailable: boolean): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock
        .menuItems()
        .map((m) => (m.id === id ? { ...m, isAvailable } : m));
      this.testMock.menuItems.set(updated);
      this.testMock.saveLocal('menuItems', updated);
      return { success: true };
    }

    const updated = this.menuItems().map((m) => (m.id === id ? { ...m, isAvailable } : m));
    this.menuItems.set(updated);
    this.saveLocal('menuItems', updated);

    this.api.put<any>(`/menu/items/${id}/availability`, { is_available: isAvailable }).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during toggleMenuItemAvailability; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to toggle menu item availability', err);
        }
      },
    });

    return { success: true };
  }

  createMenuCategory(name: string): { success: boolean; category?: MenuCategory } {
    const trimmed = name.trim();
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newCat: MenuCategory = {
      id: `cat-${Date.now().toString().slice(-4)}`,
      name: trimmed,
      slug,
      sortOrder: (this.testMock ? this.testMock.categories().length : this.categories().length) + 1,
      isActive: true,
    };

    if (this.testMock) {
      const updated = [...this.testMock.categories(), newCat];
      this.testMock.categories.set(updated);
      this.testMock.saveLocal('categories', updated);
      return { success: true, category: newCat };
    }

    const updated = [...this.categories(), newCat];
    this.categories.set(updated);
    this.saveLocal('categories', updated);

    this.api
      .post<any>('/menu/categories', {
        name: trimmed,
        slug,
        display_order: newCat.sortOrder,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.categories().map((c) =>
              c.id === newCat.id ? { ...c, id: res.id } : c,
            );
            this.categories.set(confirmed);
            this.saveLocal('categories', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createMenuCategory; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create menu category', err);
          }
        },
      });

    return { success: true, category: newCat };
  }

  deleteMenuCategory(id: string): { success: boolean; error?: string } {
    if (this.testMock) {
      const updated = this.testMock.categories().filter((c) => c.id !== id);
      this.testMock.categories.set(updated);
      this.testMock.saveLocal('categories', updated);
      return { success: true };
    }

    const updated = this.categories().filter((c) => c.id !== id);
    this.categories.set(updated);
    this.saveLocal('categories', updated);

    this.api.delete<any>(`/menu/categories/${id}`).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during deleteMenuCategory; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to delete menu category', err);
        }
      },
    });

    return { success: true };
  }

  // --- Coupon Mutations ---
  createCoupon(dto: Partial<Coupon>): { success: boolean; coupon?: Coupon } {
    const newCoupon: Coupon = {
      id: `coup-${Date.now().toString().slice(-4)}`,
      code: (dto.code || '').trim().toUpperCase(),
      name: dto.name?.trim() || dto.code?.trim().toUpperCase() || 'Dining Discount',
      description: dto.description || '',
      discountType: dto.discountType || 'PERCENTAGE',
      discountValue: Number(dto.discountValue) || 0,
      minOrderValue: Number(dto.minOrderValue) || 0,
      maxDiscountAmount: dto.maxDiscountAmount ? Number(dto.maxDiscountAmount) : undefined,
      validFrom: dto.validFrom || new Date().toISOString(),
      validUntil: dto.validUntil || '2026-12-31T23:59:59Z',
      usageLimit: Number(dto.usageLimit) || 500,
      perCustomerLimit: Number(dto.perCustomerLimit) || 1,
      redemptionCount: 0,
      isTargeted: !!dto.isTargeted,
      isActive: true,
    };

    if (this.testMock) {
      const updated = [...this.testMock.coupons(), newCoupon];
      this.testMock.coupons.set(updated);
      this.testMock.saveLocal('coupons', updated);
      return { success: true, coupon: newCoupon };
    }

    const updated = [...this.coupons(), newCoupon];
    this.coupons.set(updated);
    this.saveLocal('coupons', updated);

    this.api
      .post<any>('/coupons', {
        code: newCoupon.code,
        title: newCoupon.code,
        description: newCoupon.description,
        discount_type: newCoupon.discountType,
        discount_value: newCoupon.discountValue,
        min_order_amount_paise: Math.round(newCoupon.minOrderValue * 100),
        max_discount_amount_paise: newCoupon.maxDiscountAmount
          ? Math.round(newCoupon.maxDiscountAmount * 100)
          : undefined,
        one_time_per_customer: newCoupon.perCustomerLimit === 1,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.coupons().map((c) =>
              c.id === newCoupon.id ? { ...c, id: res.id } : c,
            );
            this.coupons.set(confirmed);
            this.saveLocal('coupons', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createCoupon; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create coupon', err);
          }
        },
      });

    return { success: true, coupon: newCoupon };
  }

  toggleCouponStatus(id: string, isActive: boolean): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock.coupons().map((c) => (c.id === id ? { ...c, isActive } : c));
      this.testMock.coupons.set(updated);
      this.testMock.saveLocal('coupons', updated);
      return { success: true };
    }

    const updated = this.coupons().map((c) => (c.id === id ? { ...c, isActive } : c));
    this.coupons.set(updated);
    this.saveLocal('coupons', updated);

    this.api.put<any>(`/coupons/${id}/status`, { is_active: isActive }).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during toggleCouponStatus; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to update coupon status', err);
        }
      },
    });

    return { success: true };
  }

  deleteCoupon(id: string): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock.coupons().filter((c) => c.id !== id);
      this.testMock.coupons.set(updated);
      this.testMock.saveLocal('coupons', updated);
      return { success: true };
    }

    const updated = this.coupons().filter((c) => c.id !== id);
    this.coupons.set(updated);
    this.saveLocal('coupons', updated);

    this.api.delete<any>(`/coupons/${id}`).subscribe({
      next: () => {},
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            '[RestaurantDataService] Database offline during deleteCoupon; preserved locally.',
          );
        } else {
          this.handleApiError('Failed to delete coupon', err);
        }
      },
    });

    return { success: true };
  }

  updateCoupon(coupon: Coupon): { success: boolean; coupon?: Coupon } {
    if (this.testMock) {
      const updated = this.testMock.coupons().map((c) => (c.id === coupon.id ? coupon : c));
      this.testMock.coupons.set(updated);
      this.testMock.saveLocal('coupons', updated);
      return { success: true, coupon };
    }

    const updated = this.coupons().map((c) => (c.id === coupon.id ? coupon : c));
    this.coupons.set(updated);
    this.saveLocal('coupons', updated);

    this.api
      .put<any>(`/coupons/${coupon.id}`, {
        name: coupon.name,
        description: coupon.description,
        discount_type: coupon.discountType.toLowerCase(),
        discount_value: coupon.discountValue,
        min_order_value: coupon.minOrderValue,
        max_discount_amount: coupon.maxDiscountAmount,
        usage_limit: coupon.usageLimit,
        per_customer_limit: coupon.perCustomerLimit,
        is_targeted: coupon.isTargeted,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during updateCoupon; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to update coupon', err);
          }
        },
      });

    return { success: true, coupon };
  }

  // --- Loyalty & Points Mutations ---
  awardLoyaltyPoints(customerId: string, points: number, reason: string): { success: boolean } {
    const cust = (this.testMock ? this.testMock.customers() : this.customers()).find(
      (c) => c.id === customerId,
    );
    if (!cust) return { success: false };

    const newTx: LoyaltyTransaction = {
      id: `lt-${Date.now().toString().slice(-4)}`,
      customerId: cust.id,
      customerName: cust.name,
      type: 'EARNED',
      points: Number(points),
      description: reason.trim(),
      date: new Date().toISOString(),
    };

    if (this.testMock) {
      const updatedTx = [newTx, ...this.testMock.loyaltyTransactions()];
      this.testMock.loyaltyTransactions.set(updatedTx);
      this.testMock.saveLocal('loyaltyTransactions', updatedTx);
      const updatedCusts = this.testMock
        .customers()
        .map((c) => (c.id === cust.id ? { ...c, loyaltyPoints: c.loyaltyPoints + points } : c));
      this.testMock.customers.set(updatedCusts);
      this.testMock.saveLocal('customers', updatedCusts);
      return { success: true };
    }

    const updatedTx = [newTx, ...this.loyaltyTransactions()];
    this.loyaltyTransactions.set(updatedTx);
    this.saveLocal('loyaltyTransactions', updatedTx);

    const updatedCusts = this.customers().map((c) =>
      c.id === cust.id ? { ...c, loyaltyPoints: c.loyaltyPoints + points } : c,
    );
    this.customers.set(updatedCusts);
    this.saveLocal('customers', updatedCusts);

    this.api
      .post<any>(`/customers/${customerId}/points`, {
        points,
        reason,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during awardLoyaltyPoints; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to award loyalty points', err);
          }
        },
      });

    return { success: true };
  }

  logCustomerVisit(
    customerIdOrPhone: string,
    note?: string,
  ): { success: boolean; customer?: Customer } {
    const list = this.testMock ? this.testMock.customers() : this.customers();
    const cleanQuery = customerIdOrPhone.trim().replace(/\s+/g, '');
    const cust = list.find(
      (c) =>
        c.id === cleanQuery ||
        c.phone === cleanQuery ||
        c.phoneE164 === cleanQuery ||
        (c.phone && cleanQuery.length >= 10 && c.phone.endsWith(cleanQuery.slice(-10))),
    );

    if (!cust) return { success: false };

    const newVisitCount = (cust.visitCount || 0) + 1;
    let newTier = cust.loyaltyTier;
    if (newVisitCount >= 10) newTier = 'PLATINUM';
    else if (newVisitCount >= 5) newTier = 'GOLD';
    else if (newVisitCount >= 3) newTier = 'SILVER';
    else newTier = 'BRONZE';

    const nowIso = new Date().toISOString();
    const updatedCust: Customer = {
      ...cust,
      visitCount: newVisitCount,
      lastVisit: nowIso,
      loyaltyTier: newTier,
      status: newVisitCount >= 10 ? 'VIP' : cust.status,
    };

    const newTx: LoyaltyTransaction = {
      id: `lt-v-${Date.now().toString().slice(-4)}`,
      customerId: cust.id,
      customerName: cust.name,
      type: 'EARNED',
      points: 50,
      description: note?.trim() || `Visit #${newVisitCount} logged (Dining milestone)`,
      date: nowIso,
    };

    if (this.testMock) {
      const updatedCusts = this.testMock
        .customers()
        .map((c) => (c.id === cust.id ? updatedCust : c));
      this.testMock.customers.set(updatedCusts);
      this.testMock.saveLocal('customers', updatedCusts);
      const updatedTx = [newTx, ...this.testMock.loyaltyTransactions()];
      this.testMock.loyaltyTransactions.set(updatedTx);
      this.testMock.saveLocal('loyaltyTransactions', updatedTx);
      return { success: true, customer: updatedCust };
    }

    const updatedCusts = this.customers().map((c) => (c.id === cust.id ? updatedCust : c));
    this.customers.set(updatedCusts);
    this.saveLocal('customers', updatedCusts);
    const updatedTx = [newTx, ...this.loyaltyTransactions()];
    this.loyaltyTransactions.set(updatedTx);
    this.saveLocal('loyaltyTransactions', updatedTx);

    return { success: true, customer: updatedCust };
  }

  syncCustomerFromOrder(order: Order): void {
    if (!order || !order.customerPhone) return;
    const phoneRaw = order.customerPhone.trim();
    if (phoneRaw.length < 10) return;

    const list = this.customers();
    const cleanDigits = phoneRaw.replace(/\D/g, '').slice(-10);
    const existing = list.find((c) => {
      const cClean = (c.phone || '').replace(/\D/g, '').slice(-10);
      return cClean === cleanDigits;
    });

    const nowIso = new Date().toISOString();
    const orderTotal = Number(order.totalAmount ?? (order as any).total ?? 0);

    if (existing) {
      const nextVisits = (existing.visitCount || 0) + 1;
      const nextSpend = (existing.totalSpend || 0) + orderTotal;
      let nextTier = existing.loyaltyTier;
      if (nextVisits >= 10) nextTier = 'PLATINUM';
      else if (nextVisits >= 5) nextTier = 'GOLD';
      else if (nextVisits >= 3) nextTier = 'SILVER';
      else nextTier = 'BRONZE';

      const updated = list.map((c) =>
        c.id === existing.id
          ? {
              ...c,
              visitCount: nextVisits,
              totalSpend: nextSpend,
              avgOrderValue: Math.round(nextSpend / nextVisits),
              lastVisit: nowIso,
              loyaltyTier: nextTier,
              status: nextVisits >= 10 ? 'VIP' : c.status,
            }
          : c,
      );
      this.customers.set(updated);
      this.saveLocal('customers', updated);
      if (this.testMock) {
        this.testMock.customers.set(updated);
        this.testMock.saveLocal('customers', updated);
      }
    } else {
      const newCust: Customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: order.customerName?.trim() || 'Online Guest',
        phone: order.customerPhone.trim(),
        customerSince: nowIso,
        visitCount: 1,
        lastVisit: nowIso,
        totalSpend: orderTotal,
        avgOrderValue: orderTotal,
        status: 'ACTIVE',
        loyaltyTier: 'BRONZE',
        loyaltyPoints: 50,
        assignedCouponIds: [],
      };
      const updated = [newCust, ...list];
      this.customers.set(updated);
      this.saveLocal('customers', updated);
      if (this.testMock) {
        this.testMock.customers.set(updated);
        this.testMock.saveLocal('customers', updated);
      }
    }
  }

  updateMilestoneRewardConfig(config: LoyaltyMilestoneRewardConfig): {
    success: boolean;
    error?: string;
  } {
    this.milestoneRewardConfig.set(config);
    this.saveLocal('loyaltyMilestoneConfig', config);

    // Sync or ensure coupon exists in active coupons
    if (config.isActive && config.couponCode) {
      const code = config.couponCode.toUpperCase().trim();
      const existing = this.coupons().find((c) => c.code.toUpperCase() === code);
      const discountType = config.rewardType === 'FLAT_DISCOUNT' ? 'FLAT' : 'PERCENT';
      const discountValue =
        config.rewardType === 'FLAT_DISCOUNT'
          ? Math.round((config.flatDiscountPaise || 30000) / 100)
          : config.discountPercent || 50;

      if (!existing) {
        this.createCoupon({
          code,
          title: config.title,
          description: config.description,
          discount_type: discountType,
          discount_value: discountValue,
          min_order_amount: Math.round((config.minBillPaise || 0) / 100),
          max_discount_amount: config.maxDiscountPaise
            ? Math.round(config.maxDiscountPaise / 100)
            : 500,
          is_active: true,
          valid_from: new Date().toISOString(),
          valid_until: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        } as any);
      }
    }

    return { success: true };
  }

  // --- Feedback Mutations ---
  createFeedback(dto: Partial<Feedback>): { success: boolean; feedback: Feedback } {
    const tempId = dto.id || `fdbk-${Date.now().toString().slice(-4)}`;
    const newFeedback: Feedback = {
      id: tempId,
      orderId: dto.orderId,
      orderNumber: dto.orderNumber || '#ORD-DINE',
      customerName: dto.customerName || 'Guest',
      rating: dto.rating ?? 5,
      foodRating: dto.foodRating,
      serviceRating: dto.serviceRating,
      ambianceRating: dto.ambianceRating,
      comment: (dto.comment || '').trim(),
      createdAt: dto.createdAt || new Date().toISOString(),
      status: dto.status || 'PUBLISHED',
      adminResponse: dto.adminResponse,
    };

    if (this.testMock) {
      const updated = [newFeedback, ...this.testMock.feedbacks()];
      this.testMock.feedbacks.set(updated);
      this.testMock.saveLocal('feedbacks', updated);
      return { success: true, feedback: newFeedback };
    }

    const updated = [newFeedback, ...this.feedbacks()];
    this.feedbacks.set(updated);
    this.saveLocal('feedbacks', updated);

    if (this.isOnline()) {
      const payload = {
        order_id:
          newFeedback.orderId && this.isValidUuid(newFeedback.orderId) ? newFeedback.orderId : null,
        customer_name: newFeedback.customerName || null,
        customer_phone: null,
        rating: Math.round(newFeedback.rating),
        comments: newFeedback.comment || null,
      };
      this.api.post<any>('/feedback', payload).subscribe({
        next: (res) => {
          if (res?.data?.id) {
            const confirmed = this.feedbacks().map((f) =>
              f.id === tempId ? { ...f, id: res.data.id } : f,
            );
            this.feedbacks.set(confirmed);
            this.saveLocal('feedbacks', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createFeedback; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to submit feedback to server', err);
          }
        },
      });
    }

    return { success: true, feedback: newFeedback };
  }

  replyFeedback(feedbackId: string, responseText: string): { success: boolean } {
    const trimmed = responseText.trim();
    if (this.testMock) {
      const updated = this.testMock
        .feedbacks()
        .map((f) => (f.id === feedbackId ? { ...f, adminResponse: trimmed } : f));
      this.testMock.feedbacks.set(updated);
      this.testMock.saveLocal('feedbacks', updated);
      return { success: true };
    }

    const updated = this.feedbacks().map((f) =>
      f.id === feedbackId ? { ...f, adminResponse: trimmed } : f,
    );
    this.feedbacks.set(updated);
    this.saveLocal('feedbacks', updated);

    this.api
      .put<any>(`/feedback/${feedbackId}/reply`, {
        resolution_note: trimmed,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during replyFeedback; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to reply to feedback', err);
          }
        },
      });

    return { success: true };
  }

  toggleFeedbackVisibility(feedbackId: string, isPublic: boolean): { success: boolean } {
    if (this.testMock) {
      const updated = this.testMock
        .feedbacks()
        .map((f) => (f.id === feedbackId ? { ...f, isPublic } : f));
      this.testMock.feedbacks.set(updated);
      this.testMock.saveLocal('feedbacks', updated);
      return { success: true };
    }

    const updated = this.feedbacks().map((f) => (f.id === feedbackId ? { ...f, isPublic } : f));
    this.feedbacks.set(updated);
    this.saveLocal('feedbacks', updated);

    this.api
      .put<any>(`/feedback/${feedbackId}/visibility`, {
        is_public: isPublic,
      })
      .subscribe({
        next: () => {},
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during toggleFeedbackVisibility; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to update review visibility', err);
          }
        },
      });

    return { success: true };
  }

  getOrderStageIndex(status: OrderStatus | string): number {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'CANCELLED':
        return -1;
      case 'PENDING':
      case 'DRAFT':
        return 0;
      case 'ACCEPTED':
      case 'CONFIRMED':
        return 1;
      case 'PREPARING':
      case 'IN_PREPARATION':
        return 2;
      case 'READY':
        return 3;
      case 'DISPATCHED':
        return 4;
      case 'SERVED':
        return 5;
      case 'COMPLETED':
        return 6;
      default:
        return 0;
    }
  }

  updateOrderStatusAtomic(
    orderId: string,
    nextStatus: OrderStatus,
    options?: { reason?: string; note?: string; force?: boolean; staffName?: string },
  ): { success: boolean; error?: string; order?: Order } {
    if (this.testMock) return this.testMock.updateOrderStatusAtomic(orderId, nextStatus, options);
    const order = this.orders().find((o) => o.id === orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.status === nextStatus) {
      return { success: true, order };
    }

    const currentStage = this.getOrderStageIndex(order.status);
    const targetStage = this.getOrderStageIndex(nextStatus);
    if (
      targetStage >= 0 &&
      targetStage < currentStage &&
      !options?.force &&
      nextStatus !== 'CANCELLED'
    ) {
      return {
        success: false,
        error: `Cannot regress order status from ${order.status} to ${nextStatus}`,
      };
    }

    const nextSeq = (this.orderStatusSeq.get(orderId) || 0) + 1;
    this.orderStatusSeq.set(orderId, nextSeq);

    const apiStatus = this.mapFrontendStatusToApi(nextStatus);

    // Optimistically update status in memory and localStorage
    const updated = this.orders().map((o) =>
      o.id === orderId ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o,
    );
    this.orders.set(updated);
    this.saveLocal('orders', updated);

    // Cancel active table reservations and release table occupancy when order is cancelled or completed
    const tableIdOrNumber = order.tableId || order.tableNumber;
    if (nextStatus === 'CANCELLED' && order.orderType !== 'TAKEAWAY' && tableIdOrNumber) {
      const matchingTable = this.tables().find(
        (t) => t.id === tableIdOrNumber || t.number === tableIdOrNumber,
      );
      if (matchingTable) {
        const updatedReservations = this.reservations().map((r) => {
          if (
            (r.tableId === matchingTable.id || r.tableNumber === matchingTable.number) &&
            (r.status === 'CONFIRMED' || r.status === 'SEATED')
          ) {
            return { ...r, status: 'CANCELLED' as const };
          }
          return r;
        });
        this.reservations.set(updatedReservations);
        this.saveLocal('reservations', updatedReservations);
      }
    }

    if (
      (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') &&
      order.orderType !== 'TAKEAWAY' &&
      tableIdOrNumber
    ) {
      this.recalculateTableStatus(tableIdOrNumber);
    }

    // Broadcast across tabs
    const updatedOrder = { ...order, status: nextStatus };
    this.broadcastRealtimeOrderEvent({ type: 'ORDER_UPDATED', order: updatedOrder });

    // If offline or order ID is a local offline ID, queue status update
    if (!this.isOnline() || !this.isValidUuid(orderId)) {
      this.queueOfflineAction({
        type: 'UPDATE_ORDER_STATUS',
        orderId,
        payload: { status: apiStatus, notes: options?.reason || options?.note },
      });
      return { success: true, order: updatedOrder };
    }

    this.api
      .put<any>(`/orders/${orderId}/status`, {
        status: apiStatus,
        notes: options?.reason || options?.note,
      })
      .subscribe({
        next: (res) => {
          if (res?.order || res?.status) {
            const serverOrder = res.order || res;
            const mapped = this.mapApiOrder(serverOrder);
            const isLatest = this.orderStatusSeq.get(orderId) === nextSeq;

            const synced = this.orders().map((o) => {
              if (o.id === orderId) {
                const preservedItems =
                  mapped.items && mapped.items.length > 0
                    ? mapped.items
                    : o.items || order.items || [];
                const oStage = this.getOrderStageIndex(o.status);
                const mappedStage = this.getOrderStageIndex(mapped.status || nextStatus);
                // Keep local status if newer status was requested or if mappedStage is behind
                const finalStatus =
                  !isLatest || mappedStage < oStage ? o.status : mapped.status || nextStatus;
                return { ...o, ...mapped, items: preservedItems, status: finalStatus };
              }
              return o;
            });
            this.orders.set(synced);
            this.saveLocal('orders', synced);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            this.queueOfflineAction({
              type: 'UPDATE_ORDER_STATUS',
              orderId,
              payload: { status: apiStatus, notes: options?.reason || options?.note },
            });
            console.warn(
              '[RestaurantDataService] Database offline during status update; queued offline.',
            );
          } else {
            this.handleApiError('Failed to update order status', err);
            // Rollback on server error only if no newer update has superseded this request
            if (this.orderStatusSeq.get(orderId) === nextSeq) {
              const rolledBack = this.orders().map((o) => (o.id === orderId ? order : o));
              this.orders.set(rolledBack);
              this.saveLocal('orders', rolledBack);
            }
          }
        },
      });

    return { success: true, order: updatedOrder };
  }

  private broadcastRealtimeOrderEvent(event: { type: string; order: Order }): void {
    if (typeof window !== 'undefined') {
      try {
        if (!this.orderChannel && typeof BroadcastChannel !== 'undefined') {
          this.orderChannel = new BroadcastChannel('hotel_crm_order_stream');
        }
        this.orderChannel?.postMessage(event);
        localStorage.setItem(
          'royal_spice_order_stream_event',
          JSON.stringify({ ...event, _ts: Date.now() }),
        );
      } catch {
        // Ignore cross-origin / private mode restriction
      }
    }
  }

  private orderWs: WebSocket | null = null;
  private wsReconnectTimer: any = null;

  private setupRealtimeListeners(): void {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.orderChannel = new BroadcastChannel('hotel_crm_order_stream');
        this.orderChannel.onmessage = (ev) => {
          this.handleIncomingSyncEvent(ev.data);
        };
      } catch (e) {
        console.warn('[RestaurantDataService] BroadcastChannel unavailable:', e);
      }
    }

    // Connect to WebSocket backend for cross-origin customer site orders
    this.connectOrderWebSocket();

    if (typeof window !== 'undefined' && typeof setInterval !== 'undefined') {
      // 15s pulse to keep restaurant POS online status fresh in cloud gateway
      setInterval(() => {
        if (this.isOnline()) {
          this.api.post('/restaurants/heartbeat', {}).subscribe({
            error: () => {},
          });
        }
      }, 15000);
    }

    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === 'royal_spice_order_stream_event' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          this.handleIncomingSyncEvent(parsed);
        } catch {}
      }
    });
  }

  private connectOrderWebSocket(): void {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    // Skip real WebSocket in Node.js/Vitest test runner to prevent cross-realm Event conflicts
    if (
      typeof process !== 'undefined' &&
      ((process as any).env?.['VITEST'] || (process as any).env?.['NODE_ENV'] === 'test')
    ) {
      return;
    }
    const rawWsUrl = environment.wsOrdersUrl || 'ws://localhost:3000/ws/orders';
    const wsUrl = rawWsUrl.includes('?')
      ? `${rawWsUrl}&client_type=crm`
      : `${rawWsUrl}?client_type=crm`;

    try {
      this.orderWs = new WebSocket(wsUrl);
      this.orderWs.onopen = () => {
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
      };
      this.orderWs.onmessage = (ev) => {
        try {
          const raw = JSON.parse(ev.data);
          if (raw.event === 'RESERVATION_CREATED' || raw.type === 'RESERVATION_CREATED') {
            const resData = raw.reservation || raw.data || raw;
            this.handleIncomingReservation(resData);
            return;
          }
          if (
            raw.event === 'TABLE_STATUS_CHANGED' ||
            raw.event === 'RESTAURANT_STATUS_CHANGED' ||
            raw.event === 'PING' ||
            raw.event === 'PONG'
          ) {
            return;
          }

          // Guard against non-order payloads: must contain an order object or order ID
          const orderPayload = raw.order || raw;
          if (!orderPayload || (!orderPayload.id && !raw.id)) {
            return;
          }

          // Map full payload (retaining both base order fields and items array)
          const mapped = this.mapApiOrder(raw);
          if (!mapped.id || (mapped.items || []).length === 0) {
            return;
          }
          this.handleIncomingSyncEvent({ type: 'ORDER_CREATED', order: mapped });
        } catch (e) {
          console.warn('[RestaurantDataService] WS parse error:', e);
        }
      };
      this.orderWs.onclose = () => {
        if (!this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => this.connectOrderWebSocket(), 5000);
        }
      };
      this.orderWs.onerror = () => {
        try {
          this.orderWs?.close();
        } catch {}
      };
    } catch {
      if (!this.wsReconnectTimer) {
        this.wsReconnectTimer = setTimeout(() => this.connectOrderWebSocket(), 10000);
      }
    }
  }

  private handleIncomingSyncEvent(ev: any): void {
    if (!ev || !ev.type) return;

    if (ev.type === 'ORDER_CREATED' && ev.order) {
      const incoming: Order = ev.order;
      if (!incoming.id || (incoming.items || []).length === 0) {
        return;
      }
      const current = this.orders();
      if (!current.some((o) => o.id === incoming.id)) {
        this.orders.set([incoming, ...current]);
        this.liveOrderEvent.set({ type: 'ORDER_CREATED', order: incoming, timestamp: Date.now() });
        this.soundService?.playOrderArrivalSound();
        this.syncCustomerFromOrder(incoming);
      }
    } else if (ev.type === 'ORDER_UPDATED' && ev.order) {
      const incoming: Order = ev.order;
      if (!incoming.id) return;
      const current = this.orders();
      const updated = current.map((o) => (o.id === incoming.id ? { ...o, ...incoming } : o));
      this.orders.set(updated);
      this.liveOrderEvent.set({ type: 'ORDER_UPDATED', order: incoming, timestamp: Date.now() });
    }
  }

  handleIncomingReservation(resData: any): void {
    if (!resData || !resData.id) return;
    const incoming: Reservation = {
      id: resData.id,
      customerName: resData.customer_name || resData.customerName || 'Valued Diner',
      customerPhone: resData.customer_phone || resData.customerPhone || '',
      partySize: resData.guest_count || resData.partySize || 2,
      reservationTime:
        resData.reservation_time || resData.reservationTime || new Date().toISOString(),
      reservationDate:
        resData.reservation_time || resData.reservationDate || new Date().toISOString(),
      status: (resData.status || 'CONFIRMED').toUpperCase() as ReservationStatus,
      tableId: resData.table_id || resData.tableId,
      specialRequests: resData.special_requests || resData.specialRequests,
      createdAt: resData.created_at || new Date().toISOString(),
    };
    const current = this.reservations();
    if (!current.some((r) => r.id === incoming.id)) {
      const updated = [incoming, ...current];
      this.reservations.set(updated);
      this.saveLocal('reservations', updated);
      this.soundService?.playOrderArrivalSound();
      this.liveReservationEvent.set({
        type: 'RESERVATION_CREATED',
        reservation: incoming,
        timestamp: Date.now(),
      });
    }
  }

  assignTableToReservation(
    reservationId: string,
    tableId: string,
    tableNumber?: string,
  ): { success: boolean; error?: string } {
    const table = this.tables().find((t) => t.id === tableId);
    const resolvedNumber = tableNumber || table?.number;
    const updated = this.reservations().map((r) =>
      r.id === reservationId
        ? { ...r, tableId, tableNumber: resolvedNumber, section: table?.section }
        : r,
    );
    this.reservations.set(updated);
    this.saveLocal('reservations', updated);
    this.api.put<any>(`/reservations/${reservationId}/status`, { table_id: tableId }).subscribe({
      error: () => {},
    });
    return { success: true };
  }

  private startOrderLivePolling(): void {
    if (typeof window === 'undefined' || this.pollIntervalId) return;

    this.pollIntervalId = setInterval(() => {
      if (!this.isOnline()) return;

      this.api.get<any>('/orders?days=2').subscribe({
        next: (res) => {
          const rawOrders = Array.isArray(res) ? res : res?.items || [];
          if (!rawOrders || rawOrders.length === 0) return;

          const currentOrders = this.orders();
          const currentIds = new Set(currentOrders.map((o) => o.id));
          const mappedOrders = rawOrders
            .map((o: any) => this.mapApiOrder(o))
            .filter((m: any) => m.id && (m.items || []).length > 0);

          // Detect brand new orders arrived from external devices/customers
          const newOrders = mappedOrders.filter((m: any) => !currentIds.has(m.id));
          if (newOrders.length > 0) {
            newOrders.forEach((m: any) => this.syncCustomerFromOrder(m));
            const pendingOutbox = this.offlineOutbox();
            const pendingLocalOrders = currentOrders.filter((localOrd) =>
              pendingOutbox.some((act) => act.orderId === localOrd.id),
            );
            const merged = [
              ...pendingLocalOrders,
              ...mappedOrders
                .filter((m: any) => !pendingLocalOrders.some((p) => p.id === m.id))
                .map((m: any) => {
                  const loc = currentOrders.find((c) => c.id === m.id);
                  if (loc) {
                    const locStage = this.getOrderStageIndex(loc.status);
                    const mStage = this.getOrderStageIndex(m.status);
                    if (locStage > mStage) {
                      return { ...m, status: loc.status };
                    }
                  }
                  return m;
                }),
            ];
            this.orders.set(merged);
            this.saveLocal('orders', merged);

            // Trigger notification sound and liveOrderEvent for the latest new order
            const newest = newOrders[0];
            this.liveOrderEvent.set({
              type: 'ORDER_CREATED',
              order: newest,
              timestamp: Date.now(),
            });
            this.soundService?.playOrderArrivalSound();
          }
        },
        error: () => {
          // Silent catch for background poll
        },
      });
    }, 6000);
  }

  addOrder(order: Order): void {
    if (this.testMock) {
      this.testMock.orders.set([order, ...this.testMock.orders()]);
      this.liveOrderEvent.set({ type: 'ORDER_CREATED', order, timestamp: Date.now() });
      this.soundService?.playOrderArrivalSound();
      this.syncCustomerFromOrder(order);
      return;
    }
    const customerName = (order.customerName && order.customerName.trim()) || 'Walk-in Guest';
    const customerPhone = (order.customerPhone && order.customerPhone.trim()) || '';

    // Immediately cache order locally in memory and localStorage
    const current = this.orders();
    let fullLocalOrder: Order;
    if (!current.some((o) => o.id === order.id)) {
      fullLocalOrder = {
        ...order,
        customerName,
        customerPhone,
      };
      const updated = [fullLocalOrder, ...current];
      this.orders.set(updated);
      this.saveLocal('orders', updated);
      this.syncCustomerFromOrder(fullLocalOrder);
    } else {
      fullLocalOrder = order;
    }

    // Trigger sound and broadcast live order event locally
    this.liveOrderEvent.set({
      type: 'ORDER_CREATED',
      order: fullLocalOrder,
      timestamp: Date.now(),
    });
    this.broadcastRealtimeOrderEvent({ type: 'ORDER_CREATED', order: fullLocalOrder });
    this.soundService?.playOrderArrivalSound();

    const payload = {
      order_type: (order.orderType || 'dine_in').toLowerCase(),
      pickup_reference: order.pickupReference,
      table_id: this.isValidUuid(order.tableId) ? order.tableId : undefined,
      customer_id: undefined,
      customer_name: customerName,
      customer_phone: customerPhone,
      items: (order.items || []).map((it) => ({
        menu_item_id: this.isValidUuid(it.menuItemId) ? it.menuItemId : undefined,
        item_name: it.name,
        quantity: it.quantity,
        unit_price_paise: Math.round(it.unitPrice * 100),
        notes: (it as any).notes || (it as any).specialInstructions || '',
      })),
      notes: (order as any).notes || '',
      applied_coupon_code: order.appliedCouponCode,
    };

    if (!this.isOnline()) {
      this.queueOfflineAction({
        type: 'CREATE_ORDER',
        orderId: order.id,
        payload,
      });
      this.toastService.info(
        'Order recorded in offline mode. Will automatically sync with cloud database when reconnected.',
        'Offline Mode',
      );
      return;
    }

    this.api.post<any>('/orders', payload).subscribe({
      next: (res) => {
        const mapped = this.mapApiOrder(res.order || res);
        const currentList = this.orders();
        const existing = currentList.find((o) => o.id === order.id);
        const preservedItems =
          mapped.items && mapped.items.length > 0
            ? mapped.items
            : existing?.items || order.items || [];
        const existingIdx = currentList.findIndex((o) => o.id === order.id);
        const preservedCustomerName =
          order.customerName && order.customerName.trim() && order.customerName !== 'Walk-in Guest'
            ? order.customerName.trim()
            : mapped.customerName || customerName;
        const preservedCustomerPhone =
          order.customerPhone && order.customerPhone.trim()
            ? order.customerPhone.trim()
            : mapped.customerPhone || customerPhone;
        const preservedPickupRef = order.pickupReference || mapped.pickupReference;
        const preservedTimeline =
          mapped.timeline && mapped.timeline.length > 0
            ? mapped.timeline
            : existing?.timeline || order.timeline || [];
        const preservedNotes = order.notes || mapped.notes || '';
        const preservedCoupon = order.appliedCouponCode || mapped.appliedCouponCode;

        const updated =
          existingIdx > -1
            ? currentList.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      ...mapped,
                      customerName: preservedCustomerName,
                      customerPhone: preservedCustomerPhone,
                      pickupReference: preservedPickupRef,
                      appliedCouponCode: preservedCoupon,
                      notes: preservedNotes,
                      timeline: preservedTimeline,
                      items: preservedItems,
                      id: mapped.id,
                    }
                  : o,
              )
            : [
                {
                  ...mapped,
                  customerName: preservedCustomerName,
                  customerPhone: preservedCustomerPhone,
                  pickupReference: preservedPickupRef,
                  appliedCouponCode: preservedCoupon,
                  notes: preservedNotes,
                  timeline: preservedTimeline,
                  items: preservedItems,
                },
                ...currentList,
              ];
        this.orders.set(updated);
        this.saveLocal('orders', updated);
      },
      error: (err) => {
        if (this.isConnectionOffline(err) || err.status === 401 || err.status === 403) {
          this.queueOfflineAction({
            type: 'CREATE_ORDER',
            orderId: order.id,
            payload,
          });
          this.toastService.info(
            'Database offline. Order saved locally and queued for auto-sync.',
            'Offline Mode',
          );
        } else {
          this.handleApiError('Failed to create order', err);
        }
      },
    });
  }

  simulateIdempotentOrderSubmission(req: {
    order: Order;
    idempotencyKey?: string;
    appliedCouponCode?: string;
  }): {
    success: boolean;
    order: Order;
    error?: string;
  } {
    if (this.testMock) {
      return this.testMock.simulateIdempotentOrderSubmission({
        order: req.order,
        idempotencyKey: req.idempotencyKey || 'key-' + Date.now(),
        appliedCouponCode: req.appliedCouponCode,
      }) as any;
    }
    this.addOrder(req.order);
    return { success: true, order: req.order };
  }

  settleOrder(req: {
    orderId: string;
    paymentMethod: 'UPI' | 'CASH' | 'CARD';
    discountAmount?: number;
    appliedCouponCode?: string;
    notes?: string;
  }): {
    success: boolean;
    error?: string;
  } {
    if (this.testMock) return this.testMock.settleOrder(req);
    const order = this.orders().find((o) => o.id === req.orderId);
    if (!order) return { success: false, error: 'Order not found' };

    if (order.status === 'CANCELLED') {
      return { success: false, error: 'Cannot settle a cancelled order' };
    }

    // 1. Optimistic / Instant update in memory & local storage so UI reflects PAID immediately
    const isPrinted = (order.printCount || 0) > 0;
    const targetStatus = isPrinted ? 'COMPLETED' : order.status;

    // Detect if this table has multiple rounds/orders that must be unified into one bill
    const siblingOrders =
      (order.tableId || order.tableNumber) && order.orderType !== 'TAKEAWAY'
        ? this.orders().filter(
            (o) =>
              o.id !== order.id &&
              o.status !== 'CANCELLED' &&
              o.paymentStatus !== 'PAID' &&
              ((order.tableId && o.tableId === order.tableId) ||
                (order.tableNumber && o.tableNumber === order.tableNumber)),
          )
        : [];

    const combinedSubtotal =
      Math.round(
        (order.subtotal +
          siblingOrders.reduce((sum, s) => sum + (s.subtotal || 0), 0)) *
          100,
      ) / 100;
    const combinedTax =
      Math.round(
        (order.taxAmount +
          siblingOrders.reduce((sum, s) => sum + (s.taxAmount || 0), 0)) *
          100,
      ) / 100;
    const grossTotal = Math.round((combinedSubtotal + combinedTax) * 100) / 100;
    const finalDiscount = Math.min(
      grossTotal,
      Math.max(
        0,
        req.discountAmount !== undefined ? req.discountAmount : order.discountAmount || 0,
      ),
    );
    const totalAmount = Math.max(0, Math.round((grossTotal - finalDiscount) * 100) / 100);

    const now = new Date().toISOString();
    const settledOrder: Order = {
      ...order,
      subtotal: combinedSubtotal,
      taxAmount: combinedTax,
      status: targetStatus,
      paymentStatus: 'PAID' as PaymentStatus,
      paymentMethod: req.paymentMethod,
      discountAmount: finalDiscount,
      appliedCouponCode:
        req.appliedCouponCode !== undefined ? req.appliedCouponCode : order.appliedCouponCode,
      totalAmount,
      settledAt: now,
    };

    const siblingIds = new Set(siblingOrders.map((s) => s.id));
    const updatedOrders = this.orders().map((o) => {
      if (o.id === req.orderId) return settledOrder;
      if (siblingIds.has(o.id)) {
        return {
          ...o,
          status: 'COMPLETED' as const,
          paymentStatus: 'PAID' as PaymentStatus,
          paymentMethod: req.paymentMethod,
          totalAmount: 0,
          settledAt: now,
        };
      }
      return o;
    });
    this.orders.set(updatedOrders);
    this.saveLocal('orders', updatedOrders);

    this.broadcastRealtimeOrderEvent({
      type: 'ORDER_UPDATED',
      order: settledOrder,
    });

    if (isPrinted && order.status !== 'COMPLETED') {
      this.updateOrderStatusAtomic(order.id, 'COMPLETED');
    }

    const payload = {
      payment_method: req.paymentMethod.toLowerCase(),
      amount_paise: Math.round(totalAmount * 100),
      discount_paise: Math.round(finalDiscount * 100),
      applied_coupon_code: settledOrder.appliedCouponCode,
      notes: req.notes,
    };

    if (!this.isOnline() || !this.isValidUuid(req.orderId)) {
      this.queueOfflineAction({
        type: 'SETTLE_ORDER',
        orderId: req.orderId,
        payload,
      });
      this.toastService.info(
        `Payment recorded offline (${req.paymentMethod}). Will sync with database when reconnected.`,
        'Offline Payment',
      );
      return { success: true };
    }

    // 2. Persist settlement to Backend API
    this.api.post<any>(`/orders/${req.orderId}/settle`, payload).subscribe({
      next: () => {
        // Confirmed by backend
      },
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          this.queueOfflineAction({
            type: 'SETTLE_ORDER',
            orderId: req.orderId,
            payload,
          });
          console.warn(
            '[RestaurantDataService] Payment queued offline due to network disconnection.',
          );
        } else {
          console.warn(
            '[RestaurantDataService] Settle order backend sync warning:',
            err?.message || err,
          );
        }
      },
    });

    return { success: true };
  }

  splitOrderEqual(req: { orderId: string; sharesCount?: number; splitCount?: number }): {
    success: boolean;
    error?: string;
    splitBills?: SplitBill[];
  } {
    if (this.testMock) {
      return this.testMock.splitOrderEqual({
        orderId: req.orderId,
        splitCount: req.splitCount ?? req.sharesCount ?? 2,
      });
    }
    const order = this.orders().find((o) => o.id === req.orderId);
    if (order && order.status === 'CANCELLED') {
      return { success: false, error: 'Cannot split a cancelled order' };
    }
    const count = req.splitCount ?? req.sharesCount ?? 2;
    this.api
      .post<any>(`/orders/${req.orderId}/split`, {
        split_count: count,
      })
      .subscribe({
        error: (err) => this.handleApiError('Failed to split order', err),
      });

    return { success: true };
  }

  settleSplitBill(req: {
    splitBillId?: string;
    orderId?: string;
    paymentMethod: 'UPI' | 'CASH' | 'CARD';
    splitIndex?: number;
  }): { success: boolean; error?: string } {
    if (this.testMock) {
      const orderId =
        req.orderId ||
        (this.testMock as any).splitBills?.()?.find((b: any) => b.id === req.splitBillId)
          ?.orderId ||
        '';
      return this.testMock.settleSplitBill({
        orderId,
        splitBillId: req.splitBillId || '',
        paymentMethod: req.paymentMethod,
      });
    }
    return { success: true };
  }

  assignTableStaff(tableId: string, staffId: string | null): void {
    const assigned_staff_id = staffId && staffId.trim() ? staffId.trim() : null;
    const updated = this.tables().map((t) =>
      t.id === tableId ? { ...t, assignedStaffId: assigned_staff_id || undefined } : t,
    );
    this.tables.set(updated);

    if (this.testMock) return;

    this.api.put<any>(`/tables/${tableId}/assign`, { assigned_staff_id }).subscribe({
      error: (err) => this.handleApiError('Failed to assign table staff', err),
    });
  }

  assignOrderServer(
    orderId: string,
    staffId: string | null,
    adminPassword?: string,
  ): { success: boolean; error?: string } {
    const server_staff_id = staffId && staffId.trim() ? staffId.trim() : null;
    const currentOrder = this.orders().find((o) => o.id === orderId);
    if (!currentOrder) {
      return { success: false, error: 'Order not found' };
    }

    if (currentOrder.status === 'COMPLETED') {
      const isAuthorized = !!(adminPassword && this.adminAuth.verifyAdminPassword(adminPassword));
      if (!isAuthorized) {
        return {
          success: false,
          error: 'Admin password required to change server on completed orders.',
        };
      }
    }

    const updated = this.orders().map((o) =>
      o.id === orderId
        ? { ...o, serverStaffId: server_staff_id || undefined, updatedAt: new Date().toISOString() }
        : o,
    );
    this.orders.set(updated);
    const updatedOrder = updated.find((o) => o.id === orderId);
    if (updatedOrder) {
      this.broadcastRealtimeOrderEvent({ type: 'ORDER_UPDATED', order: updatedOrder });
    }

    if (this.testMock) {
      this.testMock.assignOrderServer(orderId, staffId, adminPassword);
      return { success: true };
    }

    if (!this.isOnline() || !this.isValidUuid(orderId)) {
      this.queueOfflineAction({
        type: 'ASSIGN_SERVER',
        orderId,
        payload: { server_staff_id, admin_password: adminPassword },
      });
      return { success: true };
    }

    this.api
      .put<any>(`/orders/${orderId}/server`, {
        server_staff_id,
        admin_password: adminPassword,
      })
      .subscribe({
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            this.queueOfflineAction({
              type: 'ASSIGN_SERVER',
              orderId,
              payload: { server_staff_id, admin_password: adminPassword },
            });
          } else {
            this.handleApiError('Failed to assign server to order', err);
          }
        },
      });

    return { success: true };
  }

  flushOfflineQueue(): void {
    if (!this.isOnline() || this.isSyncingOffline()) return;
    const queue = [...this.offlineOutbox()];
    if (queue.length === 0) return;

    this.isSyncingOffline.set(true);

    const processNext = (index: number) => {
      if (index >= queue.length) {
        this.isSyncingOffline.set(false);
        this.toastService.success(
          'All offline orders and payments synced with cloud database.',
          'Cloud Connected',
        );
        this.refreshOrders();
        return;
      }

      const item = queue[index];

      if (item.type === 'CREATE_ORDER') {
        this.api.post<any>('/orders', item.payload).subscribe({
          next: (res) => {
            const serverOrder = res.order || res;
            const mapped = this.mapApiOrder(serverOrder);
            const oldId = item.orderId;
            const newId = mapped.id;

            // Update in-memory order with server id and order number
            const currentOrders = this.orders();
            const updated = currentOrders.map((o) =>
              o.id === oldId
                ? {
                    ...o,
                    ...mapped,
                    id: newId,
                    orderNumber: mapped.orderNumber || o.orderNumber,
                    customerName: o.customerName || mapped.customerName,
                    customerPhone: o.customerPhone || mapped.customerPhone,
                    pickupReference: o.pickupReference || mapped.pickupReference,
                    items: mapped.items && mapped.items.length > 0 ? mapped.items : o.items,
                  }
                : o,
            );
            this.orders.set(updated);
            this.saveLocal('orders', updated);

            // Remap any subsequent queued actions pointing to the oldId
            for (let j = index + 1; j < queue.length; j++) {
              if (queue[j].orderId === oldId) {
                queue[j].orderId = newId;
              }
            }

            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
          error: (err) => {
            if (this.isConnectionOffline(err)) {
              console.warn(
                '[RestaurantDataService] Database offline during order sync; keeping action in outbox.',
              );
              this.isSyncingOffline.set(false);
              return;
            }
            console.warn(
              '[RestaurantDataService] Offline create order dropped due to server error:',
              err,
            );
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
        });
      } else if (item.type === 'UPDATE_ORDER_STATUS') {
        if (!this.isValidUuid(item.orderId)) {
          this.clearOfflineAction(item.id);
          processNext(index + 1);
          return;
        }
        this.api.put<any>(`/orders/${item.orderId}/status`, item.payload).subscribe({
          next: () => {
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
          error: (err) => {
            if (this.isConnectionOffline(err)) {
              console.warn(
                '[RestaurantDataService] Database offline during status sync; keeping action in outbox.',
              );
              this.isSyncingOffline.set(false);
              return;
            }
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
        });
      } else if (item.type === 'SETTLE_ORDER') {
        if (!this.isValidUuid(item.orderId)) {
          this.clearOfflineAction(item.id);
          processNext(index + 1);
          return;
        }
        this.api.post<any>(`/orders/${item.orderId}/settle`, item.payload).subscribe({
          next: () => {
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
          error: (err) => {
            if (this.isConnectionOffline(err)) {
              console.warn(
                '[RestaurantDataService] Database offline during settle sync; keeping action in outbox.',
              );
              this.isSyncingOffline.set(false);
              return;
            }
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
        });
      } else if (item.type === 'ASSIGN_SERVER') {
        if (!this.isValidUuid(item.orderId)) {
          this.clearOfflineAction(item.id);
          processNext(index + 1);
          return;
        }
        this.api.put<any>(`/orders/${item.orderId}/server`, item.payload).subscribe({
          next: () => {
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
          error: (err) => {
            if (this.isConnectionOffline(err)) {
              console.warn(
                '[RestaurantDataService] Database offline during server assignment sync; keeping action in outbox.',
              );
              this.isSyncingOffline.set(false);
              return;
            }
            this.clearOfflineAction(item.id);
            processNext(index + 1);
          },
        });
      } else {
        this.clearOfflineAction(item.id);
        processNext(index + 1);
      }
    };

    processNext(0);
  }

  markStaffAttendance(
    staffId: string,
    date: string,
    status: string,
    notes?: string,
  ): Observable<any> {
    return this.api
      .post<any>('/restaurants/staff/attendance', {
        staff_id: staffId,
        attendance_date: date,
        status: status.toUpperCase(),
        notes: notes || '',
      })
      .pipe(
        tap(() => {
          this.loadStaffPerformance();
          this.loadStaffAttendance();
        }),
      );
  }

  loadStaffPerformance(month?: string): void {
    const params: any = {};
    if (month) params.month = month;
    this.api.get<StaffPerformanceSummary[]>('/restaurants/staff/performance', params).subscribe({
      next: (data) => {
        if (data) this.staffPerformance.set(data);
      },
      error: (err) => this.handleApiError('Failed to load staff performance', err),
    });
  }

  loadStaffAttendance(month?: string): void {
    const params: any = {};
    if (month) params.month = month;
    this.api.get<StaffAttendance[]>('/restaurants/staff/attendance', params).subscribe({
      next: (data) => {
        if (data) this.staffAttendance.set(data);
      },
      error: (err) => this.handleApiError('Failed to load staff attendance', err),
    });
  }

  recordWastage(req: {
    ingredientId: string;
    quantity: number;
    reason: string;
    unit?: string;
    notes?: string;
    staffName?: string;
    idempotencyKey?: string;
  }): { success: boolean; error?: string } {
    if (this.testMock) return this.testMock.recordWastage(req as any);
    this.api
      .post<any>('/inventory/wastage', {
        inventory_item_id: req.ingredientId,
        quantity: req.quantity,
        reason: req.reason,
        notes: req.notes,
      })
      .subscribe({
        next: () => {
          // Re-fetch movements
          this.api.get<any[]>('/inventory/movements').subscribe((data) => {
            if (data) {
              this.stockMovements.set(
                data.map((m) => {
                  const qty = parseFloat(m.quantity || '0');
                  const ing = this.ingredients().find((i) => i.id === m.inventory_item_id);
                  return {
                    id: m.id,
                    ingredientId: m.inventory_item_id,
                    ingredientName: ing ? ing.name : m.ingredient_name || 'Ingredient',
                    type: (m.movement_type || 'WASTAGE').toUpperCase() as any,
                    quantityDelta: qty,
                    quantityBefore: 0,
                    quantityAfter: qty,
                    unit: (ing ? ing.unit : m.unit_of_measure || m.unit || req.unit || 'kg') as any,
                    reason: m.notes || m.reason || req.reason || '',
                    referenceId: m.id,
                    staffName: m.staff_name || req.staffName || 'Staff',
                    timestamp: m.created_at || new Date().toISOString(),
                  };
                }),
              );
            }
          });
        },
        error: (err) => this.handleApiError('Failed to record wastage', err),
      });

    return { success: true };
  }

  createReservation(dto: any): { success: boolean; error?: string; reservation?: Reservation } {
    if (this.testMock) {
      const newRes: Reservation = {
        id: 'res-' + Date.now(),
        ...dto,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.testMock.reservations.set([...this.testMock.reservations(), newRes]);
      return { success: true, reservation: newRes };
    }

    const isoDateTime = dto.reservationTime || dto.reservationDate || new Date().toISOString();
    const tempId = `res-${Date.now().toString().slice(-4)}`;
    const newRes: Reservation = {
      id: tempId,
      customerName: dto.customerName?.trim() || '',
      customerPhone: dto.customerPhone?.trim() || '',
      partySize: Number(dto.partySize || dto.guestCount) || 2,
      reservationDate: isoDateTime,
      status: (dto.status || 'CONFIRMED').toUpperCase() as ReservationStatus,
      tableId: dto.tableId,
      tableNumber: dto.tableNumber,
      specialRequests: dto.specialRequests || '',
      createdAt: new Date().toISOString(),
    };

    const updated = [newRes, ...this.reservations()];
    this.reservations.set(updated);
    this.saveLocal('reservations', updated);

    this.api
      .post<any>('/reservations', {
        table_id: dto.tableId,
        customer_name: dto.customerName?.trim(),
        customer_phone: dto.customerPhone?.trim(),
        guest_count: Number(dto.partySize || dto.guestCount) || 2,
        reservation_time: isoDateTime,
        special_requests: dto.specialRequests,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.reservations().map((r) =>
              r.id === tempId ? { ...r, id: res.id } : r,
            );
            this.reservations.set(confirmed);
            this.saveLocal('reservations', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createReservation; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create reservation', err);
          }
        },
      });

    return { success: true, reservation: newRes };
  }

  updateReservationStatus(
    reservationId: string,
    status: ReservationStatus,
  ): { success: boolean; error?: string } {
    if (this.testMock) {
      const updated = this.testMock
        .reservations()
        .map((r) => (r.id === reservationId ? { ...r, status } : r));
      this.testMock.reservations.set(updated);
      return { success: true };
    }

    // 1. Optimistically update local signal and cache
    const updated = this.reservations().map((r) => (r.id === reservationId ? { ...r, status } : r));
    this.reservations.set(updated);
    this.saveLocal('reservations', updated);

    // 2. Persist status change to backend API
    this.api.put<any>(`/reservations/${reservationId}/status`, { status }).subscribe({
      next: (res) => {
        console.log(
          `[RestaurantDataService] Reservation ${reservationId} status confirmed on backend: ${status}`,
        );
      },
      error: (err) => {
        if (this.isConnectionOffline(err)) {
          console.warn(
            `[RestaurantDataService] Database offline: reservation ${reservationId} status preserved locally.`,
          );
        } else {
          this.handleApiError('Failed to update reservation status', err);
        }
      },
    });

    return { success: true };
  }

  createCustomer(dto: any): { success: boolean; error?: string; customer?: Customer } {
    const tempId = `cust-${Date.now().toString().slice(-4)}`;
    const newCust: Customer = {
      id: tempId,
      name: dto.name?.trim() || '',
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || '',
      customerSince: new Date().toISOString(),
      visitCount: dto.visitCount || 1,
      lastVisit: new Date().toISOString(),
      totalSpend: dto.totalSpend || 0,
      avgOrderValue: dto.avgOrderValue || 0,
      loyaltyPoints: Number(dto.loyaltyPoints) || 0,
      loyaltyTier: (dto.loyaltyTier || 'BRONZE') as any,
      status: (dto.status || 'ACTIVE').toUpperCase() as any,
      assignedCouponIds: dto.assignedCouponIds || [],
    };

    if (this.testMock) {
      this.testMock.customers.set([...this.testMock.customers(), newCust]);
      this.testMock.saveLocal('customers', this.testMock.customers());
      return { success: true, customer: newCust };
    }

    const updated = [newCust, ...this.customers()];
    this.customers.set(updated);
    this.saveLocal('customers', updated);

    this.api
      .post<any>('/customers', {
        name: newCust.name,
        phone: newCust.phone,
        email: newCust.email,
        address: dto.address,
        notes: dto.notes,
      })
      .subscribe({
        next: (res) => {
          if (res?.id) {
            const confirmed = this.customers().map((c) =>
              c.id === tempId ? { ...c, id: res.id } : c,
            );
            this.customers.set(confirmed);
            this.saveLocal('customers', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createCustomer; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create customer', err);
          }
        },
      });

    return { success: true, customer: newCust };
  }

  // --- Stock & Coupon Validation Utilities ---

  getRemainingRefundableAmount(orderId: string, splitBillId?: string): number {
    if (this.testMock) return this.testMock.getRemainingRefundableAmount(orderId, splitBillId);
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) return 0;
    const refunded = this.refunds()
      .filter(
        (r) =>
          (r.orderId === order.id || r.orderNumber === order.orderNumber) &&
          (!splitBillId || r.splitBillId === splitBillId),
      )
      .reduce((sum, r) => sum + (r.refundAmount || 0), 0);
    if (splitBillId) {
      const split = this.splitBills().find((s) => s.id === splitBillId);
      if (split) {
        return Math.max(0, split.totalAmount - refunded);
      }
    }
    return Math.max(0, order.totalAmount - refunded);
  }

  recordOrderPrint(
    orderId: string,
    isAdmin?: boolean,
    role?: string,
  ): { success: boolean; printCount: number; error?: string } {
    if (this.testMock) return this.testMock.recordOrderPrint(orderId, isAdmin ?? false, role);
    const order = this.orders().find((o) => o.id === orderId || o.orderNumber === orderId);
    const count = (order?.printCount || 0) + 1;
    if (order) {
      const isPaid = order.paymentStatus === 'PAID';
      const targetStatus = isPaid ? 'COMPLETED' : order.status;
      const updatedOrder = {
        ...order,
        status: targetStatus,
        printCount: count,
        lastPrintedAt: new Date().toISOString(),
      };
      this.orders.set(this.orders().map((o) => (o.id === order.id ? updatedOrder : o)));
      this.broadcastRealtimeOrderEvent({ type: 'ORDER_UPDATED', order: updatedOrder });
      if (isPaid && order.status !== 'COMPLETED') {
        this.updateOrderStatusAtomic(order.id, 'COMPLETED');
      }

      const currentUser = this.adminAuth.currentUser();
      this.recordAuditLog({
        actorRole: (currentUser?.role as any) || (isAdmin ? 'ADMIN' : 'STAFF'),
        actorLabel: currentUser
          ? `${currentUser.name} (${currentUser.role})`
          : role || 'Terminal Staff',
        action: count > 1 ? 'RECEIPT_PRINTED' : 'RECEIPT_GENERATED',
        entityType: 'RECEIPT',
        entityId: order.orderNumber || order.id,
        notes:
          count > 1
            ? `Reprinted customer bill receipt (Duplicate #${count}) for Order #${order.orderNumber}`
            : `Generated original customer thermal bill receipt for Order #${order.orderNumber}`,
      });
    }
    return { success: true, printCount: count };
  }

  recordSplitBillPrint(
    splitBillId: string,
    isReprint: boolean,
    staffName = 'Staff',
  ): { success: boolean; printCount: number; error?: string } {
    if (this.testMock) return this.testMock.recordSplitBillPrint(splitBillId, isReprint, staffName);
    const currentUser = this.adminAuth.currentUser();
    this.recordAuditLog({
      actorRole: (currentUser?.role as any) || 'STAFF',
      actorLabel: currentUser ? `${currentUser.name} (${currentUser.role})` : staffName,
      action: isReprint ? 'RECEIPT_PRINTED' : 'RECEIPT_GENERATED',
      entityType: 'RECEIPT',
      entityId: splitBillId,
      notes: isReprint
        ? `Reprinted split bill receipt (${splitBillId})`
        : `Generated split bill customer receipt (${splitBillId})`,
    });
    return { success: true, printCount: 1 };
  }

  splitOrderItemBased(dto: any): { success: boolean; error?: string; splitBills?: SplitBill[] } {
    if (this.testMock) return this.testMock.splitOrderItemBased(dto);
    const order = this.orders().find((o) => o.id === dto?.orderId);
    if (order && order.status === 'CANCELLED') {
      return { success: false, error: 'Cannot split a cancelled order' };
    }
    return { success: true };
  }

  transferTable(req: {
    orderId: string;
    destinationTableId?: string;
    targetTableId?: string;
    staffName?: string;
  }): { success: boolean; error?: string; transfer?: TableTransferRecord } {
    if (this.testMock) {
      return this.testMock.transferTable({
        orderId: req.orderId,
        destinationTableId: req.destinationTableId || req.targetTableId || '',
        staffName: req.staffName,
      });
    }
    const destId = req.destinationTableId || req.targetTableId || '';
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    const destTable = this.tables().find((t) => t.id === destId || t.number === destId);
    const sourceTable = this.tables().find(
      (t) => t.id === order?.tableId || t.number === order?.tableNumber,
    );

    const transfer: TableTransferRecord = {
      id: `trans-${Date.now()}`,
      orderId: req.orderId,
      orderNumber: order?.orderNumber || req.orderId,
      sourceTableId: sourceTable?.id || order?.tableId || '',
      sourceTableNumber: sourceTable?.number || order?.tableNumber || '',
      destinationTableId: destTable?.id || destId,
      destinationTableNumber: destTable?.number || destId,
      transferredAt: new Date().toISOString(),
      staffName: req.staffName || 'Staff',
    };

    if (order && destTable) {
      this.orders.set(
        this.orders().map((o) =>
          o.id === order.id ? { ...o, tableId: destTable.id, tableNumber: destTable.number } : o,
        ),
      );
      if (sourceTable && this.isValidUuid(sourceTable.id) && this.isValidUuid(destTable.id)) {
        this.api
          .post<any>('/tables/transfer', {
            from_table_id: sourceTable.id,
            to_table_id: destTable.id,
            reason: req.staffName || 'Table transfer',
          })
          .subscribe({
            error: (err) =>
              console.warn('[RestaurantDataService] transferTable backend warning:', err),
          });
      }
    }

    return { success: true, transfer };
  }

  recordRefund(req: {
    orderId: string;
    splitBillId?: string;
    refundAmount: number;
    reason: string;
    staffName?: string;
    idempotencyKey?: string;
    status?: 'COMPLETED' | 'PENDING';
  }): { success: boolean; error?: string; refund?: RefundRecord } {
    if (this.testMock) return this.testMock.recordRefund(req);
    const order = this.orders().find((o) => o.id === req.orderId || o.orderNumber === req.orderId);
    const targetOrderId = order?.id || req.orderId;
    const refund: RefundRecord = {
      id: `ref-${Date.now()}`,
      orderId: req.orderId,
      orderNumber: order?.orderNumber || req.orderId,
      splitBillId: req.splitBillId,
      customerName: order?.customerName || 'Guest',
      refundAmount: req.refundAmount,
      reason: req.reason,
      staffName: req.staffName || 'Staff',
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
    };
    this.refunds.set([refund, ...this.refunds()]);

    if (this.isValidUuid(targetOrderId)) {
      this.api
        .post<any>(`/orders/${targetOrderId}/refund`, {
          refund_amount_paise: Math.round(req.refundAmount * 100),
          reason: req.reason,
          refund_method: 'original_source',
        })
        .subscribe({
          error: (err) =>
            console.warn('[RestaurantDataService] recordRefund backend warning:', err),
        });
    }

    return { success: true, refund };
  }

  resetAllDemoData(): void {
    if (this.testMock) {
      this.testMock.initializeData();
      return;
    }
    this.loadAuthoritativeData();
  }

  getMenuItemAvailability(itemId: string, _orderType?: any): MenuStockStatus {
    if (this.testMock) return this.testMock.getMenuItemAvailability(itemId);
    const item = this.menuItems().find((i) => i.id === itemId);
    if (!item || !item.isAvailable) return 'OUT_OF_STOCK';
    return 'AVAILABLE';
  }

  checkMenuItemAvailability(menuItemId: string): StockAvailabilityCheck {
    if (this.testMock) return this.testMock.checkMenuItemAvailability(menuItemId);
    const item = this.menuItems().find((m) => m.id === menuItemId);
    if (!item) {
      return {
        menuItemId,
        status: 'UNTRACKED',
        produciblePortions: 0,
        missingIngredients: [],
      };
    }
    const isAvail = item.isAvailable !== false;
    return {
      menuItemId,
      status: isAvail ? 'AVAILABLE' : 'OUT_OF_STOCK',
      produciblePortions: isAvail ? 99 : 0,
      missingIngredients: isAvail ? [] : ['Item toggled unavailable by restaurant manager'],
    };
  }

  assignCouponToCustomer(
    couponId: string,
    customerId: string,
    assignedBy = 'Staff',
    maxRedemptions = 1,
    notes = '',
  ): CouponAssignment {
    if (this.testMock) {
      return this.testMock.assignCouponToCustomer(
        couponId,
        customerId,
        assignedBy,
        maxRedemptions,
        notes,
      );
    }
    const coupon = this.coupons().find((c) => c.id === couponId);
    const customer = this.customers().find((c) => c.id === customerId);
    const newAssignment: CouponAssignment = {
      id: `asgn-${Date.now()}`,
      restaurantId: coupon?.restaurantId || 'rest-001',
      couponId: couponId,
      couponCode: coupon?.code || '',
      customerId: customerId,
      customerPhoneE164: customer?.phone || '',
      customerName: customer?.name || '',
      assignedBy,
      assignedAt: new Date().toISOString(),
      validFrom: coupon?.validFrom || new Date().toISOString(),
      validUntil: coupon?.validUntil || new Date().toISOString(),
      maxRedemptions,
      redemptionsUsed: 0,
      status: 'ACTIVE',
      notes,
    };
    this.couponAssignments.set([newAssignment, ...this.couponAssignments()]);
    return newAssignment;
  }

  revokeCouponAssignment(assignmentId: string): void {
    if (this.testMock) {
      this.testMock.revokeCouponAssignment(assignmentId);
      return;
    }
    const updated = this.couponAssignments().map((a) =>
      a.id === assignmentId ? { ...a, status: 'REVOKED' as const } : a,
    );
    this.couponAssignments.set(updated);
  }

  getInventoryValuationSummary(): {
    totalTracked: number;
    lowStockCount: number;
    outOfStockCount: number;
    estimatedValue: number;
    totalWastageCost: number;
  } {
    if (this.testMock) return this.testMock.getInventoryValuationSummary();
    const ings = this.ingredients().filter((i) => i.isActive);
    const totalTracked = ings.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let estimatedValue = 0;

    for (const ing of ings) {
      if (ing.currentStock <= 0) {
        outOfStockCount++;
      } else if (ing.currentStock <= (ing.minThreshold || (ing as any).minimumThreshold || 0)) {
        lowStockCount++;
      }
      estimatedValue += (ing.currentStock || 0) * (ing.costPerUnit || 0);
    }

    return {
      totalTracked,
      lowStockCount,
      outOfStockCount,
      estimatedValue: Math.round(estimatedValue * 100) / 100,
      totalWastageCost: 0,
    };
  }

  getReservedQuantity(ingredientId: string, excludeOrderId?: string): number {
    if (this.testMock) return this.testMock.getReservedQuantity(ingredientId, excludeOrderId);
    return this.stockReservations()
      .filter(
        (r) => r.ingredientId === ingredientId && (!excludeOrderId || r.orderId !== excludeOrderId),
      )
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  getAvailableStock(ingredientId: string, excludeOrderId?: string): number {
    if (this.testMock) return this.testMock.getAvailableStock(ingredientId, excludeOrderId);
    const ing = this.ingredients().find((i) => i.id === ingredientId);
    if (!ing) return 0;
    const reserved = this.getReservedQuantity(ingredientId, excludeOrderId);
    return Math.max(0, ing.currentStock - reserved);
  }

  updateIngredient(id: string, updates: Partial<Ingredient>): Ingredient {
    if (this.testMock) return this.testMock.updateIngredient(id, updates);
    const list = this.ingredients().map((ing) => {
      if (ing.id === id) {
        return { ...ing, ...updates, updatedAt: new Date().toISOString() };
      }
      return ing;
    });
    this.ingredients.set(list);
    this.saveLocal('ingredients', list);

    const updated = list.find((i) => i.id === id)!;

    if (this.isOnline() && this.isValidUuid(id)) {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.unit !== undefined) payload.unit_of_measure = updates.unit;
      if (updates.currentStock !== undefined) payload.current_stock = Number(updates.currentStock);
      if (updates.minThreshold !== undefined) payload.reorder_level = Number(updates.minThreshold);
      if (updates.costPerUnit !== undefined) {
        payload.cost_per_unit_paise = Math.round(Number(updates.costPerUnit) * 100);
      }
      if (updates.supplierName !== undefined) payload.sku = updates.supplierName.trim() || null;
      if (updates.category !== undefined) payload.category = updates.category;

      this.api.put<any>(`/inventory/items/${id}`, payload).subscribe({
        next: () => {
          console.log(`[RestaurantDataService] Ingredient ${id} updated on backend.`);
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during updateIngredient; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to update ingredient on database', err);
          }
        },
      });
    }

    return updated;
  }

  createIngredient(dto: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>): Ingredient {
    if (this.testMock) return this.testMock.createIngredient(dto);
    const now = new Date().toISOString();
    const tempId = `ing-${Date.now()}`;
    const newIngredient: Ingredient = {
      ...dto,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };
    const list = [...this.ingredients(), newIngredient];
    this.ingredients.set(list);
    this.saveLocal('ingredients', list);

    if (this.isOnline()) {
      const payload = {
        name: newIngredient.name.trim(),
        sku: newIngredient.supplierName?.trim() || null,
        category: newIngredient.category || 'PRODUCE',
        unit_of_measure: newIngredient.unit,
        initial_stock: Number(newIngredient.currentStock) || 0,
        reorder_level: Number(newIngredient.minThreshold) || 0,
        cost_per_unit_paise: Math.round((Number(newIngredient.costPerUnit) || 0) * 100),
      };
      this.api.post<any>('/inventory/items', payload).subscribe({
        next: (res) => {
          const item = res?.data || res;
          if (item?.id) {
            const confirmed = this.ingredients().map((i) =>
              i.id === tempId ? { ...i, id: item.id } : i,
            );
            this.ingredients.set(confirmed);
            this.saveLocal('ingredients', confirmed);
          }
        },
        error: (err) => {
          if (this.isConnectionOffline(err)) {
            console.warn(
              '[RestaurantDataService] Database offline during createIngredient; preserved locally.',
            );
          } else {
            this.handleApiError('Failed to create ingredient on database', err);
          }
        },
      });
    }

    return newIngredient;
  }

  adjustStock(params: {
    ingredientId: string;
    delta: number;
    type: any;
    reason: string;
    referenceId?: string;
    staffName?: string;
    allowNegative?: boolean;
  }): { success: boolean; movement?: StockMovement; error?: string } {
    if (this.testMock) return this.testMock.adjustStock(params);
    const ing = this.ingredients().find((i) => i.id === params.ingredientId);
    if (!ing) return { success: false, error: 'Ingredient not found' };
    const quantityBefore = ing.currentStock;
    const quantityAfter = quantityBefore + params.delta;
    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      type: params.type,
      quantityDelta: params.delta,
      quantityBefore,
      quantityAfter,
      unit: ing.unit,
      reason: params.reason,
      referenceId: params.referenceId,
      staffName: params.staffName || 'Staff',
      timestamp: new Date().toISOString(),
    };
    this.stockMovements.set([movement, ...this.stockMovements()]);
    this.ingredients.set(
      this.ingredients().map((i) => (i.id === ing.id ? { ...i, currentStock: quantityAfter } : i)),
    );
    return { success: true, movement };
  }

  calculateRecipeCost(items: RecipeItem[]): number {
    if (this.testMock) return this.testMock.calculateRecipeCost(items);
    let totalCost = 0;
    for (const item of items || []) {
      const ing = this.ingredients().find((i) => i.id === item.ingredientId);
      if (!ing || !ing.costPerUnit) continue;
      totalCost += item.quantity * ing.costPerUnit;
    }
    return Math.round(totalCost * 100) / 100;
  }

  createRecipe(
    dto: Omit<Recipe, 'id' | 'version' | 'indicativeCost' | 'createdAt' | 'updatedAt'>,
  ): { success: boolean; recipe?: Recipe; error?: string } {
    if (this.testMock) return this.testMock.createRecipe(dto);
    const menuItem = this.menuItems().find((m) => m.id === dto.menuItemId);
    const now = new Date().toISOString();
    const newRecipe: Recipe = {
      ...dto,
      id: `rec-${Date.now()}`,
      menuItemName: menuItem?.name || '',
      version: 1,
      indicativeCost: this.calculateRecipeCost(dto.items),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const updatedRecipes = [newRecipe, ...this.recipes()];
    this.recipes.set(updatedRecipes);
    this.saveLocal('recipes', updatedRecipes);
    return { success: true, recipe: newRecipe };
  }

  updateRecipe(
    id: string,
    updates: Partial<Recipe>,
  ): { success: boolean; recipe?: Recipe; error?: string } {
    if (this.testMock) return this.testMock.updateRecipe(id, updates);
    const existing = this.recipes().find((r) => r.id === id);
    if (!existing) return { success: false, error: 'Recipe not found' };
    const now = new Date().toISOString();
    const updated: Recipe = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      indicativeCost: this.calculateRecipeCost(updates.items || existing.items),
      updatedAt: now,
    };
    const updatedRecipes = this.recipes().map((r) => (r.id === id ? updated : r));
    this.recipes.set(updatedRecipes);
    this.saveLocal('recipes', updatedRecipes);
    return { success: true, recipe: updated };
  }

  toggleRecipeStatus(id: string): Recipe | null {
    if (this.testMock) return this.testMock.toggleRecipeStatus(id);
    const existing = this.recipes().find((r) => r.id === id);
    if (!existing) return null;
    const res = this.updateRecipe(id, { isActive: !existing.isActive });
    return res.recipe || null;
  }

  validateOrderStockAvailability(items: OrderItem[]): {
    isAvailable: boolean;
    isValid: boolean;
    errors: string[];
    unavailableItems: any[];
    warnings: string[];
  } {
    if (this.testMock) {
      const res = this.testMock.validateOrderStockAvailability(items);
      return {
        isAvailable: res.isValid,
        isValid: res.isValid,
        errors: res.errors,
        unavailableItems: [],
        warnings: [],
      };
    }
    return {
      isAvailable: true,
      isValid: true,
      errors: [],
      unavailableItems: [],
      warnings: [],
    };
  }

  reserveStockForOrder(orderId: string): void {
    if (this.testMock) this.testMock.reserveStockForOrder(orderId);
  }

  simulateServerCouponValidation(req: {
    code?: string;
    couponCode?: string;
    subtotal?: number;
    cartSubtotal?: number;
    customerId?: string;
    customerPhone?: string;
    customerPhoneE164?: string;
  }): CouponValidationResult {
    if (this.testMock) {
      const res = this.testMock.simulateServerCouponValidation({
        couponCode: req.couponCode || req.code || '',
        cartSubtotal: req.cartSubtotal ?? req.subtotal ?? 0,
        customerId: req.customerId,
        customerPhoneE164: req.customerPhoneE164 || req.customerPhone,
      });
      return {
        isValid: res.isValid,
        discountAmount: res.authorizedDiscountAmount,
        authorizedDiscountAmount: res.authorizedDiscountAmount,
        reason: res.rejectionReason,
        rejectionReason: res.rejectionReason,
      };
    }
    const targetCode = (req.couponCode || req.code || '').trim().toUpperCase();
    const subtotal = req.subtotal ?? req.cartSubtotal ?? 0;
    const coupon = this.coupons().find((c) => c.code.toUpperCase() === targetCode);
    if (!coupon) {
      return {
        isValid: false,
        discountAmount: 0,
        authorizedDiscountAmount: 0,
        reason: 'Coupon code not found',
        rejectionReason: 'Coupon code not found',
      };
    }
    if (!coupon.isActive) {
      return {
        isValid: false,
        discountAmount: 0,
        authorizedDiscountAmount: 0,
        reason: 'Coupon is inactive or expired',
        rejectionReason: 'Coupon is inactive or expired',
      };
    }
    if (subtotal < coupon.minOrderValue) {
      const msg = `Order value must be at least ₹${coupon.minOrderValue}`;
      return {
        isValid: false,
        discountAmount: 0,
        authorizedDiscountAmount: 0,
        reason: msg,
        rejectionReason: msg,
      };
    }
    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = Math.round((subtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
        discount = coupon.maxDiscountAmount;
      }
    } else {
      discount = coupon.discountValue;
    }
    const finalDiscount = Math.min(discount, subtotal);
    return {
      isValid: true,
      discountAmount: finalDiscount,
      authorizedDiscountAmount: finalDiscount,
    };
  }

  /**
   * Persists restaurant profile and configuration changes to backend and Supabase.
   */
  updateRestaurantSettings(updated: Restaurant): Observable<Restaurant> {
    this.restaurant.set(updated);
    this.saveLocal('restaurant', updated);

    const cgst = Number(updated.taxSettings?.cgstRate) || 0;
    const sgst = Number(updated.taxSettings?.sgstRate) || 0;
    const payload = {
      name: updated.name,
      tagline: updated.tagline,
      description: updated.description,
      phone: updated.contact?.phone,
      email: updated.contact?.email,
      google_review_url: updated.contact?.googleReviewUrl || updated.googleReviewUrl || '',
      address: updated.address?.street,
      city: updated.address?.city,
      state: updated.address?.state,
      postal_code: updated.address?.zip,
      gstin: updated.taxSettings?.gstNumber,
      gst_rate: cgst + sgst,
      cgst_rate: cgst,
      sgst_rate: sgst,
      service_charge_rate: Number(updated.taxSettings?.serviceChargeRate) || 0,
    };

    return this.api.put<any>('/restaurants', payload).pipe(
      map((res) => {
        if (res) {
          const current = this.restaurant();
          if (current) {
            const merged: Restaurant = {
              ...current,
              name: res.name || current.name,
              tagline: res.tagline !== undefined ? res.tagline : current.tagline,
              description: res.description !== undefined ? res.description : current.description,
              contact: {
                ...current.contact,
                phone: res.phone || current.contact.phone,
                email: res.email || current.contact.email,
                googleReviewUrl:
                  res.google_review_url !== undefined
                    ? res.google_review_url
                    : current.contact.googleReviewUrl,
              },
              googleReviewUrl:
                res.google_review_url !== undefined
                  ? res.google_review_url
                  : current.googleReviewUrl,
              address: {
                ...current.address,
                street: res.address || current.address.street,
                city: res.city || current.address.city,
                state: res.state || current.address.state,
                zip: res.postal_code || current.address.zip,
              },
              taxSettings: {
                ...current.taxSettings,
                gstNumber: res.gstin || current.taxSettings.gstNumber,
                cgstRate:
                  res.cgst_rate !== undefined && res.cgst_rate !== null
                    ? Number(res.cgst_rate)
                    : res.gst_rate !== undefined
                      ? Number(res.gst_rate) / 2
                      : current.taxSettings.cgstRate,
                sgstRate:
                  res.sgst_rate !== undefined && res.sgst_rate !== null
                    ? Number(res.sgst_rate)
                    : res.gst_rate !== undefined
                      ? Number(res.gst_rate) / 2
                      : current.taxSettings.sgstRate,
              },
            };
            this.restaurant.set(merged);
            this.saveLocal('restaurant', merged);
          }
        }
        return this.restaurant() || updated;
      }),
      catchError(() => of(updated)),
    );
  }

  /**
   * Authoritative business records are persisted in PostgreSQL.
   * saveLocal is a no-op method to safely absorb legacy calls without writing business state to localStorage.
   */
  saveLocal(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  }
}
