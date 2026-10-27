# GuruKripa Dhaba — Premium Restaurant CRM & Digital Ordering Platform

A comprehensive, production-grade restaurant operating system built with Angular 21, TypeScript, and custom SCSS design tokens (zero 3rd-party CSS frameworks). The platform combines two tailored user experiences powered by a shared domain contract layer and reactive mock data repository:

1. **Admin CRM (`/admin/*`)**: High-efficiency operational hub for restaurant managers, floor staff, and kitchen dispatchers. Features real-time KPI metrics, customer 360 profiles, table & QR code generation, menu management, live order queue, itemized billing with GST calculation and print-ready receipts, coupon rules, reservations, loyalty points, feedback reviews, staff directory, and restaurant settings.
2. **Customer-Facing Digital Ordering Web App (`/menu/*`)**: Mobile-first dining experience designed for guests scanning dining table QR codes (e.g. `/menu/gurukripa-dhaba/table/tbl-07`). Features dish browsing with sticky category navigation, dietary filters (Veg/Non-Veg/Egg/Vegan), interactive dish customization (portions, spice levels, add-on toppings), reactive cart tray, coupon discovery & one-tap redemption, guest identification with demo OTP simulation, and live 5-stage order tracking.

---

## Brand Palette & Design System
Strict adherence to the 5 authoritative brand colors:
- **Crimson Ember (`#C21807`)**: Primary buttons, selected tabs, customer cart actions, brand highlights.
- **Bone White (`#F6F2EB`)**: App canvas background, customer menu background.
- **Onyx Black (`#121212`)**: Sidebar background, primary typography, high-contrast badges.
- **Gold Leaf (`#D4AF37`)**: Promotional accents, VIP tier markers, discount badges.
- **Warm Taupe (`#A39181`)**: Muted subtitles, subtle dividers, secondary metadata.

### Typography
- **Primary Display Font**: `Libre Baskerville` (Restaurant branding, major headers, hero banners)
- **Interface Font**: `Inter` (Navigation, data tables, forms, pricing, dashboard statistics)

---

## Repository Structure
```
HOTEL_CRM/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI/CD (Rust clippy/test, Angular test/build, Migrations lint)
├── backend/
│   └── api/                       # Rust Axum backend (Tokio, SQLx, Postgres, JWT, Invariants)
│       ├── src/                   # Domain handlers, services, models, paise math
│       ├── tests/                 # Integration and domain invariant tests
│       └── .env.example           # Backend environment template
├── frontend/
│   └── restaurant-web/            # Angular 21 standalone frontend
│       ├── src/app/
│       │   ├── core/              # Config, guards, models, services, contract tests
│       │   ├── shared/            # Reusable UI components & pipes
│       │   ├── layouts/           # AdminLayout & CustomerLayout
│       │   ├── features/          # Feature views (Admin & Customer)
│       │   ├── data-access/       # Authoritative RestaurantDataService & API client
│       │   └── styles/            # SCSS design tokens, typography, utilities
├── supabase/
│   └── migrations/                # Supabase PostgreSQL migrations (001 to 005)
├── docs/                          # Comprehensive architecture & design docs
├── .gitignore                     # Production-ready git ignore (Node, Rust, secrets, OS)
├── package.json                   # Root orchestrator scripts
└── README.md
```

---

## Quickstart & Local Execution

### 1. Prerequisites
- **Node.js**: v20+ and `npm`
- **Rust**: `rustc` and `cargo` (1.75+)
- **PostgreSQL / Supabase**: Local Postgres instance or Supabase project URL

### 2. Backend Setup (Rust Axum)
```bash
cd backend/api
cp .env.example .env
# Edit .env with your DATABASE_URL and SUPABASE_JWT_SECRET
cargo test
cargo run
```
Backend API will start on `http://127.0.0.1:3000`.

### 3. Database Migrations
Apply migrations in sequence using Supabase CLI or psql:
```bash
supabase db push
# Or run sql scripts in supabase/migrations/ sequentially:
# 20261027000001_core_schema.sql
# 20261027000002_billing_and_payments.sql
# 20261027000003_inventory_and_recipes.sql
# 20261027000004_coupons_and_reservations.sql
# 20261027000005_rls_and_functions.sql
```

### 4. Frontend Setup (Angular 21)
```bash
cd frontend/restaurant-web
npm install
npm test -- --watch=false
npm run build
npm start
```
Frontend will be available at `http://localhost:4200/`.
- **Admin CRM**: `http://localhost:4200/admin/dashboard`
- **Customer Menu**: `http://localhost:4200/menu/gurukripa-dhaba/table/tbl-07`

---

## Continuous Integration & Deployment (CI/CD)

GitHub Actions workflow is configured in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
- **Rust Backend**: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release`.
- **Frontend**: Prettier lint check, Vitest test suite (`229 passing tests`), Angular production build (`ng build`).
- **Database Migrations**: Automated verification of all 5 forward SQL migration files.
- **Deploy**: Automatic Render deployment trigger on pushes to `main`.
