# Mock Data Architecture & Simulation Guide

## 1. Seed Datasets (`public/data/*.json`)
The application bundles realistic seed datasets mirroring an upscale fine-dining and contemporary bistro named **"GuruKripa Dhaba"**:
- `restaurant.json`: Full restaurant profile, address, operating hours, currency, and GST settings.
- `navigation.json`: Navigation items for Admin CRM and Customer web.
- `customers.json`: 15+ synthetic customer profiles with phone numbers, visit history, loyalty tiers, and spend metrics.
- `tables.json`: 12 restaurant tables across Main Dining, Terrace Garden, and Private Lounge with mock QR tokens and statuses.
- `menu-categories.json`: Categories (Starters, Tandoor & Kebabs, Main Course, Biryani & Rice, Artisanal Breads, Desserts, Signature Beverages).
- `menu-items.json`: 25+ rich food catalog items with authentic Indian and continental culinary descriptions, HD Unsplash food images, portion options (Half/Full), dietary indicators (Veg/Non-Veg/Egg/Vegan), spice level options, and add-ons.
- `orders.json`: Initial active and historical dine-in orders with diverse order statuses (`PENDING`, `PREPARING`, `SERVED`, `COMPLETED`).
- `reservations.json`: Upcoming and past table bookings.
- `coupons.json`: System-wide and targeted coupons (`ROYAL20`, `WELCOME100`, `VIPDINER`, `SWEETTOOTH`).
- `loyalty.json`: Loyalty rules, tiers, and customer balance ledgers.
- `feedback.json`: Real ratings and guest reviews with managerial responses.
- `staff.json`: Kitchen, service, management, and billing staff directory.
- `dashboard.json`: Pre-computed metrics for dashboard overview.

---

## 2. In-Memory Signal Store & Session Persistence
- **Zero Raw File Coupling**: UI components never fetch JSON files directly. All operations route through typed Angular repository services.
- **Unified Single Source of Truth**: When an order is placed from the Customer Ordering view, the in-memory `OrderRepository` updates its reactive Signal store and synchronizes with localStorage (`hotel_crm_orders_v1`).
- **Live Cross-Tab / Cross-View Synchronization**: The Admin Orders queue observes the same reactive signal. Status updates in Admin immediately reflect in Customer Order Tracking.
- **Demo Reset Button**: A dedicated "Reset Mock Data" action in Admin Settings clears the local cache and re-seeds from the pristine JSON fixtures, with confirmation safety.
