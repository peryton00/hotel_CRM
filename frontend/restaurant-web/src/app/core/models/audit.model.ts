export type ActorRole = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';

export type AuditAction =
  | 'COUPON_CREATED'
  | 'COUPON_UPDATED'
  | 'COUPON_ASSIGNED'
  | 'COUPON_REVOKED'
  | 'COUPON_REDEEMED'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_CANCELLED'
  | 'INVOICE_GENERATED'
  | 'PHONE_VERIFIED';

/**
 * Immutable audit trail log entry for administrative and sensitive transactional actions.
 */
export interface AuditLogEntry {
  id: string; // UUID primary key
  restaurantId: string;
  actorId?: string; // UUID of customer or staff member
  actorRole: ActorRole;
  actorLabel?: string; // Display descriptor (e.g. "Ranveer B. (General Manager)")
  action: AuditAction;
  entityType:
    'COUPON' | 'COUPON_ASSIGNMENT' | 'COUPON_REDEMPTION' | 'ORDER' | 'CUSTOMER' | 'INVOICE';
  entityId: string;
  payloadBefore?: Record<string, any>;
  payloadAfter?: Record<string, any>;
  notes?: string;
  timestamp: string; // ISO 8601
}
