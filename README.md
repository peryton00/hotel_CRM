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
├── frontend/
│   └── restaurant-web/            # Angular standalone application
│       ├── public/data/           # Baseline JSON seed fixtures
│       ├── src/app/
│       │   ├── core/              # Config, guards, models, services
│       │   ├── shared/            # Reusable UI components & pipes
│       │   ├── layouts/           # AdminLayout & CustomerLayout
│       │   ├── features/          # Feature views (Admin & Customer)
│       │   ├── data-access/       # Repository contracts & mock implementations
│       │   └── styles/            # SCSS design tokens, typography, utilities
├── shared/                        # Shared contracts and domain types
├── backend/                       # Placeholder for future backend services
├── database/                      # Placeholder for future Supabase migrations
├── docs/                          # Comprehensive architecture & design docs
├── package.json                   # Root orchestrator scripts
└── README.md
```

---

## Quickstart & Local Execution

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm start
# or: cd frontend/restaurant-web && npm start
```
Navigate to `http://localhost:4200/` in your browser.
- **Admin CRM**: `http://localhost:4200/admin/dashboard`
- **Customer Menu**: `http://localhost:4200/menu/gurukripa-dhaba/table/tbl-07`

### 3. Build for Production
```bash
npm run build
```

### 4. Run Automated Tests
```bash
npm test
```

---

## Architecture & Supabase Readiness
For technical deep dives, review the documentation in the `/docs` folder:
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- [DATA_MODEL.md](docs/DATA_MODEL.md)
- [MOCK_DATA.md](docs/MOCK_DATA.md)
- [ROUTES.md](docs/ROUTES.md)
- [FEATURE_STATUS.md](docs/FEATURE_STATUS.md)
- [FUTURE_SUPABASE_INTEGRATION.md](docs/FUTURE_SUPABASE_INTEGRATION.md)
