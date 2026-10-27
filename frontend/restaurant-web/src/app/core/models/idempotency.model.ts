export type IdempotencyOperationType = 'CREATE_ORDER' | 'REDEEM_COUPON' | 'RECORD_PAYMENT';

/**
 * Idempotency record stored by the server to safely de-duplicate retries.
 */
export interface IdempotencyRecord {
  idempotencyKey: string; // Client-provided unique key
  restaurantId: string;
  customerId?: string;
  operationType: IdempotencyOperationType;
  requestHash: string; // Hash of incoming request body to detect payload tampering
  responseStatus: number; // HTTP response status (e.g. 200, 201)
  responsePayload: any; // Cached JSON response returned to retrying client
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601 (typically 24 hours retention)
}
