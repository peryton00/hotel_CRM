# Application Route Map

## Admin CRM (`/admin/*`)
All admin routes are encapsulated in `AdminLayoutComponent`, providing sidebar navigation, responsive collapsible drawer, top context bar, notifications, and user profile switcher.

| Path | Component | Purpose |
|------|-----------|---------|
| `/admin` | Redirect | Redirects to `/admin/dashboard` |
| `/admin/dashboard` | `AdminDashboardComponent` | Core KPIs, revenue, active tables, order status summary, live charts |
| `/admin/customers` | `CustomerListComponent` | Customer directory, search, filter by tier/status, customer create modal |
| `/admin/customers/:customerId` | `CustomerDetailComponent` | 360-degree guest profile, past orders, loyalty ledger, coupon assignments |
| `/admin/tables` | `TableListComponent` | Table grid, live occupancy status, QR generator, print & download modal |
| `/admin/menu` | `MenuManagementComponent` | Catalog editor, category tabs, dish creation/edit, portions, variant management |
| `/admin/orders` | `OrderQueueComponent` | Operational live dispatch board, status filtering (`PENDING` -> `COMPLETED`) |
| `/admin/orders/:orderId` | `OrderDetailComponent` | Full itemized billable order details, custom requests, status change controls |
| `/admin/billing` | `BillingQueueComponent` | Eligible orders for payment & invoice settlement |
| `/admin/billing/:orderId` | `InvoicePreviewComponent` | Bill preview, GST computation, printable receipt modal & browser print |
| `/admin/coupons` | `CouponManagementComponent` | Campaign builder, percentage/fixed discounts, max cap, customer assignment |
| `/admin/reservations` | `ReservationListComponent` | Table booking management, timeline, party size, status dispatch |
| `/admin/loyalty` | `LoyaltyManagementComponent` | Tier threshold management, guest points adjustment, rewards log |
| `/admin/feedback` | `FeedbackListComponent` | Guest ratings, comments, filter by rating, administrative resolution |
| `/admin/reports` | `ReportsComponent` | Sales analytics, average order size, category breakdown, exportable views |
| `/admin/staff` | `StaffListComponent` | Staff directory, role-based records (Manager, Kitchen, Service, Cashier) |
| `/admin/settings` | `SettingsComponent` | Restaurant info, GST / tax settings, currency, demo reset control |

---

## Customer Digital Ordering (`/menu/*`)
Mobile-first dining web application accessed via QR scan or direct link. Inherits `CustomerLayoutComponent` with sticky table context, zero admin chrome, and persistent mobile cart bar.

| Path | Component | Purpose |
|------|-----------|---------|
| `/menu/:restaurantSlug` | `RestaurantHomeComponent` | Restaurant landing page, dining vibe, opening hours, featured dishes |
| `/menu/:restaurantSlug/table/:tableToken` | `MenuCatalogComponent` | Table-identified menu browsing with live category tabs & search |
| `/menu/:restaurantSlug/cart` | `CartViewComponent` | Itemized tray review, portion & addon display, discount calculations |
| `/menu/:restaurantSlug/coupons` | `CustomerCouponsComponent` | Targeted promo codes, eligibility tester, one-tap apply |
| `/menu/:restaurantSlug/checkout` | `CheckoutComponent` | Guest contact capture (name, mobile), table verification, order placement |
| `/menu/:restaurantSlug/order/:orderId` | `OrderConfirmationComponent`| Instant confirmation screen, order number, preparation estimate |
| `/menu/:restaurantSlug/order/:orderId/tracking` | `OrderTrackingComponent` | Live 5-stage status progress timeline (`RECEIVED` -> `SERVED`) |
| `/menu/:restaurantSlug/feedback/:orderId` | `CustomerFeedbackComponent` | Post-dining review and rating form |
