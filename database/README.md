# Database Architecture & Production PostgreSQL Schemas

This directory contains the production-grade PostgreSQL / Supabase relational schema, Row-Level Security (RLS) policies, concurrency control stored procedures, and triggers for the Restaurant CRM and Digital Ordering Platform.

## Relational Schema DDL
The full production schema is defined in [database/schema.sql](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/database/schema.sql), which includes:
- Multi-tenant data isolation (`restaurant_id` on all entities).
- Customer identity resolution via stable UUIDs and normalized E.164 phone numbers.
- Phone number verification challenges (`customer_auth_challenges`).
- Three-way coupon normalization:
  - `coupons`: Master campaign rules, spend thresholds, and discount caps.
  - `coupon_assignments`: Explicit targeted patron entitlements.
  - `coupon_redemptions`: Immutable redemption audit history.
- Idempotency key store (`idempotency_records`) with 24-hour TTL retention.
- Comprehensive PostgreSQL Row-Level Security (RLS) policies.
- Concurrency-safe stored procedures using `SELECT FOR UPDATE` row locks:
  - `fn_validate_coupon_server_side`: Server-authoritative eligibility evaluation.
- Immutable audit log (`audit_logs`) tracking administrative and transactional events.

For in-depth architectural specifications and the migration strategy from the mock contract layer to Supabase PostgreSQL, refer to:
- [docs/SECURITY_DATA_ISOLATION_COUPONS.md](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/docs/SECURITY_DATA_ISOLATION_COUPONS.md)
- [docs/FUTURE_SUPABASE_INTEGRATION.md](file:///c:/Users/sudip/OneDrive/Desktop/webProjects/HOTEL_CRM/docs/FUTURE_SUPABASE_INTEGRATION.md)

