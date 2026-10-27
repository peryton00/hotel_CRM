/**
 * Idempotency Key and Unique Identifier Generation Utilities.
 * Provides client-side idempotency keys for retry-sensitive operations (orders, redemptions).
 */

/**
 * Generates an RFC 4122 v4 compliant UUID.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments lacking crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates an idempotency key with operation tag and optional customer reference.
 * Format: idemp_<operation>_<timestamp>_<randomHex>
 */
export function generateIdempotencyKey(operation: string, customerId?: string): string {
  const prefix = operation.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  const custSuffix = customerId ? `_${customerId.slice(-6)}` : '';
  return `idemp_${prefix}_${ts}_${rand}${custSuffix}`;
}
