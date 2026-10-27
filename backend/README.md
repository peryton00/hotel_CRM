# HOTEL_CRM — Rust API & Supabase PostgreSQL Migration

Production-grade, asynchronous backend API for the HOTEL_CRM restaurant management system.

## 1. Architecture Overview

- **Framework**: Rust with Axum 0.7 & Tokio runtime
- **Database**: Supabase PostgreSQL with SQLx connection pooling
- **Authentication**: Supabase Auth with server-side JWT verification
- **Financial Architecture**: Strict integer paise arithmetic (`i64`), non-retroactive refund attribution, signed net collections
- **Tenant Isolation**: Multi-tenant database schema enforced via restaurant ID context and PostgreSQL Row-Level Security (RLS)

---

## 2. Directory Structure

```
backend/api/
├── Cargo.toml
├── .cargo/config.toml        # Resolves Windows target lock
├── .env.example              # Template environment variables
├── src/
│   ├── main.rs               # Server startup, pool init, graceful shutdown
│   ├── lib.rs                # Library module exports
│   ├── config.rs             # Typed AppConfig & AppState
│   ├── error.rs              # AppError with sanitized JSON responses
│   ├── auth/                 # Supabase JWT claims & tenant extraction
│   ├── models/               # Strongly-typed domain models & paise math
│   ├── repositories/         # SQLx query layer with transactions
│   ├── routes/               # Axum REST endpoints under /api/v1
│   └── services/             # Order transitions, billing calculation, ATP inventory
├── tests/
│   └── domain_tests.rs       # Rust integration & business invariant tests
```

---

## 3. Local Development

### Prerequisites
- Rust 1.75+ (Cargo)
- PostgreSQL or Supabase CLI (optional for live database connection)

### Running the API locally
```bash
# 1. Enter the API directory
cd backend/api

# 2. Copy the environment template
cp .env.example .env

# 3. Check code and run unit tests
cargo test

# 4. Verify formatting and linting
cargo fmt --all -- --check
cargo clippy -- -D warnings

# 5. Run the development server
cargo run
```

---

## 4. Supabase Database Migrations

The migrations are version-controlled, additive, and stored in `supabase/migrations/`:

| Migration File | Description |
|---|---|
| `20261027000001_core_schema.sql` | Restaurants, staff, customers, tables, menu categories, menu items, orders, order items, timeline events, idempotency records, audit logs. |
| `20261027000002_billing_and_payments.sql` | Split bills, split items, payments, refunds (with `completed_at` timestamp check), invoices. |
| `20261027000003_inventory_and_recipes.sql` | Inventory items with ATP check constraint, recipes, stock movements ledger, wastage records. |
| `20261027000004_coupons_and_reservations.sql` | Coupons, customer coupon assignments, redemption history, customer reservations. |
| `20261027000005_rls_and_functions.sql` | Row-Level Security policies, tenant context helper functions, server-side coupon validation procedure. |

### Applying Migrations Locally
```bash
# Using Supabase CLI:
supabase db reset
# Or pushing to a remote database:
supabase db push
```

### Applying Migrations Directly via psql
```bash
psql "$DATABASE_URL" -f supabase/migrations/20261027000001_core_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20261027000002_billing_and_payments.sql
psql "$DATABASE_URL" -f supabase/migrations/20261027000003_inventory_and_recipes.sql
psql "$DATABASE_URL" -f supabase/migrations/20261027000004_coupons_and_reservations.sql
psql "$DATABASE_URL" -f supabase/migrations/20261027000005_rls_and_functions.sql
```

---

## 5. API Reference (`/api/v1`)

### Health Checks
- `GET /health/live` — Returns 200 OK `{"status": "alive"}`
- `GET /health/ready` — Tests database connectivity and returns 200 OK `{"status": "ready"}`

### Restaurant & Staff
- `GET /api/v1/restaurants` — Active restaurant context
- `GET /api/v1/restaurants/staff` — Staff members list

### Tables & Operations
- `GET /api/v1/tables` — List restaurant tables
- `PUT /api/v1/tables/:id/status` — Update table status (`available`, `occupied`, `billed`, `cleaning`)
- `POST /api/v1/tables/transfer` — Atomic table transfer

### Menu
- `GET /api/v1/menu/categories` — Menu categories
- `GET /api/v1/menu/items` — Menu items (filterable by category)
- `POST /api/v1/menu/items` — Create menu item
- `PUT /api/v1/menu/items/:id/availability` — Toggle item availability

### Orders
- `GET /api/v1/orders` — List orders with pagination & status filters
- `POST /api/v1/orders` — Create order with items & server-calculated totals
- `GET /api/v1/orders/:id` — Order details with item breakdown
- `PUT /api/v1/orders/:id/status` — Validated order status transition

### Billing, Splits & Refunds
- `POST /api/v1/orders/:id/settle` — Idempotent order payment settlement
- `POST /api/v1/orders/:id/split` — Split order equally with exact paise remainder allocation
- `POST /api/v1/orders/:id/refund` — Request a refund
- `PUT /api/v1/refunds/:id/status` — Complete or cancel refund (sets `completed_at`)
- `GET /api/v1/orders/:id/receipt` — Authoritative receipt print payload

### Inventory & Wastage
- `GET /api/v1/inventory/items` — Inventory items with Available-To-Promise (ATP)
- `POST /api/v1/inventory/items` — Create inventory item
- `POST /api/v1/inventory/wastage` — Idempotent wastage reporting with stock ledger impact
- `GET /api/v1/inventory/movements` — Stock movements audit log

### Coupons
- `GET /api/v1/coupons` — Active coupons
- `POST /api/v1/coupons/validate` — Server-side coupon eligibility and discount calculation
- `POST /api/v1/coupons/redeem` — Server-enforced one-time coupon redemption

### Customers & Reservations
- `GET /api/v1/customers` — Search customers
- `POST /api/v1/customers` — Create/upsert customer
- `GET /api/v1/reservations` — List reservations
- `POST /api/v1/reservations` — Book table reservation
- `PUT /api/v1/reservations/:id/status` — Update reservation status

### Reports & Dashboard
- `GET /api/v1/reports/period` — Authoritative financial metrics (sales, collections, refunds, net collections, cogs, wastage, receivables, legacy disclosure)
- `GET /api/v1/dashboard/summary` — Real-time summary dashboard

---

## 6. Render Deployment Guide

1. **Create Web Service** in Render pointing to this repository.
2. Set **Root Directory** to `backend/api`.
3. Set **Build Command** to `cargo build --release`.
4. Set **Start Command** to `./target/release/hotel_crm_api`.
5. Add Environment Variables:
   - `DATABASE_URL`: Your Supabase PostgreSQL Connection String (Transaction Pooler).
   - `SUPABASE_JWT_SECRET`: From Supabase Project Settings -> API -> JWT Secret.
   - `SUPABASE_URL`: `https://[PROJECT-REF].supabase.co`.
   - `ALLOWED_ORIGINS`: Frontend URL(s).
   - `ENVIRONMENT`: `production`.
6. Health Check Path: `/health/live`.
