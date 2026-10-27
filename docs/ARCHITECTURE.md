# Architecture & Design Overview

## 1. System Vision
The Premium Restaurant CRM & Digital Ordering Platform provides two integrated yet distinct user experiences powered by a shared brand identity, typed domain model, and repository-pattern data layer:

1. **Admin CRM (`/admin/*`)**:
   - Built for high information density, rapid operational dispatch, and end-to-end restaurant management.
   - Modules: Dashboard, Customers, Tables & QR Generation, Menu Catalog, Real-time Orders Queue, Billing & Invoicing, Coupons, Reservations, Loyalty, Feedback & Reviews, Reports & Analytics, Staff, and Settings.
   - Desktop, tablet, and responsive mobile layouts.

2. **Customer-Facing Digital Ordering Web App (`/menu/*`)**:
   - Tailored for high-conversion, mobile-first dining interactions initiated via physical QR codes on dining tables (e.g., `/menu/gurukripa-dhaba/table/tbl-07`).
   - Seamless menu exploration, live category navigation, dish customization modal (portions, spice levels, add-ons), sticky mobile cart summary, simulated customer identification & targeted coupon redemption, order placement, order confirmation, and real-time order tracking timeline.

Both modules run in a single Angular standalone application sharing core data contracts, state management, and mock repositories.

---

## 2. Monorepo Structure

```
HOTEL_CRM/
├── frontend/
│   └── restaurant-web/
│       ├── public/
│       │   ├── data/              # Initial seed JSON datasets
│       │   └── assets/            # Brand logos, dish photos, icons
│       ├── src/
│       │   ├── app/
│       │   │   ├── core/          # Config, guards, interceptors, models, services
│       │   │   ├── shared/        # UI components, directives, pipes, utilities
│       │   │   ├── layouts/       # AdminLayoutComponent, CustomerLayoutComponent
│       │   │   ├── features/
│       │   │   │   ├── admin/     # Admin CRM feature pages
│       │   │   │   └── customer/  # Customer ordering feature pages
│       │   │   ├── data-access/   # Repository contracts, mock implementations
│       │   │   ├── styles/        # SCSS design tokens, typography, resets
│       │   │   ├── app.routes.ts  # Unified route hierarchy
│       │   │   └── app.config.ts  # Application providers
│       ├── angular.json
│       ├── package.json
│       └── tsconfig.json
├── shared/
│   ├── contracts/                 # Cross-boundary domain interfaces
│   ├── documentation/             # System specs
│   └── fixtures/                  # Baseline seed JSON fixtures
├── backend/                       # Placeholder for future backend
├── database/                      # Placeholder for future DB/Supabase migrations
├── docs/                          # Comprehensive architectural and system docs
├── package.json                   # Root orchestrator scripts
└── README.md
```

---

## 3. Data Flow & Repository Abstraction
Presentation components NEVER load raw JSON files or directly couple to local storage. Instead, components inject strongly typed Repository contracts:
- `RestaurantRepository`
- `CustomerRepository`
- `TableRepository`
- `MenuRepository`
- `OrderRepository`
- `CouponRepository`
- `BillingRepository`
- `ReservationRepository`
- `LoyaltyRepository`
- `FeedbackRepository`
- `StaffRepository`
- `ReportRepository`

In this frontend phase, mock repositories initialize from the bundled JSON seed data into reactive in-memory signals with localStorage session caching, enabling immediate cross-view reactivity (e.g. creating an order on the customer phone view immediately reflects in the Admin Orders queue, and status changes in Admin reflect immediately in Customer Order Tracking).
When Supabase or REST services are introduced, new Supabase/HTTP implementations of these contracts are plugged in via Angular dependency injection without touching any component logic.
