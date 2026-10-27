export type CustomerStatus = 'ACTIVE' | 'VIP' | 'INACTIVE';
export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface Customer {
  id: string; // Stable UUID primary identifier
  restaurantId?: string; // Tenant isolation key
  name: string;
  phone: string;
  phoneE164?: string; // Normalized E.164 standard (e.g. +919876543210)
  isPhoneVerified?: boolean; // Verified ownership status (OTP confirmed)
  verifiedAt?: string;
  phoneMasked?: string; // Masked PII representation (e.g. +91 98*** **210)
  email?: string;
  customerSince: string;
  visitCount: number;
  lastVisit: string;
  totalSpend: number;
  avgOrderValue: number;
  status: CustomerStatus;
  loyaltyTier: LoyaltyTier;
  loyaltyPoints: number;
  assignedCouponIds: string[];
}
