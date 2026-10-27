export type CouponDiscountType = 'PERCENTAGE' | 'FIXED';
export type CouponAssignmentStatus = 'ACTIVE' | 'EXHAUSTED' | 'REVOKED' | 'EXPIRED';

/**
 * Master coupon campaign definition.
 * Managed by restaurant administrators.
 */
export interface Coupon {
  id: string; // UUID primary key
  restaurantId?: string; // Tenant isolation key
  code: string; // Unique promo code (e.g. TASTE50)
  name: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  assignedCustomerIds?: string[]; // Legacy convenience pointer
  isTargeted?: boolean; // When true, only customers with explicit CouponAssignment can redeem
  usageLimit: number; // Global maximum redemptions across all patrons
  perCustomerLimit: number; // Maximum redemptions per individual customer
  redemptionCount: number; // Current global redemption counter
  isActive: boolean;
}

/**
 * Explicit customer entitlement record.
 * Maps targeted coupons to specific verified customer UUIDs.
 */
export interface CouponAssignment {
  id: string; // UUID primary key
  restaurantId: string; // Tenant foreign key
  couponId: string; // Coupon foreign key
  couponCode: string;
  customerId: string; // Customer UUID foreign key
  customerPhoneE164: string; // Normalized E.164 phone
  customerName?: string;
  assignedBy: string; // Staff member UUID or 'SYSTEM'
  assignedAt: string;
  validFrom: string;
  validUntil: string;
  maxRedemptions: number; // Entitlement quota (default 1)
  redemptionsUsed: number;
  status: CouponAssignmentStatus;
  notes?: string;
}

/**
 * Immutable audit record of a redeemed coupon on a finalized order.
 */
export interface CouponRedemption {
  id: string; // UUID primary key
  restaurantId: string;
  couponId: string;
  couponCode: string;
  assignmentId?: string; // Optional reference to explicit entitlement
  customerId: string; // Customer UUID
  orderId: string; // Order foreign key
  discountAmountApplied: number; // Authoritative discount amount applied
  idempotencyKey: string; // Unique deduplication key
  redeemedAt: string;
}

/**
 * Server-side coupon eligibility evaluation request.
 */
export interface CouponEligibilityRequest {
  couponCode: string;
  cartSubtotal: number;
  customerId?: string; // Customer UUID (if identified)
  customerPhoneE164?: string; // Normalized phone
  applicableItemIds?: string[];
}

/**
 * Server-authoritative coupon eligibility evaluation response.
 * The client UI must NEVER compute or decide final discounts autonomously.
 */
export interface CouponEligibilityResponse {
  isValid: boolean;
  authorizedDiscountAmount: number;
  couponId?: string;
  assignmentId?: string;
  rejectionReason?: string;
  calculatedBy: 'SERVER_AUTHORITATIVE' | 'CLIENT_MOCK_SIMULATION';
  checkedAt: string;
}

/**
 * Backward compatibility interface for existing UI components.
 */
export interface CouponValidationResult {
  isValid: boolean;
  discountAmount: number;
  reason?: string;
  authorizedDiscountAmount?: number;
  rejectionReason?: string;
}
