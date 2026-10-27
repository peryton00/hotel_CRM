# Future Supabase Integration Guide

This document outlines the architectural blueprint for transitioning from the in-memory mock repository layer to a fully integrated Supabase backend.

---

## 1. Zero UI Code Disruption Guarantee
The entire application UI interacts exclusively with repository contracts located under `src/app/data-access/contracts/`.

For example:
```typescript
export interface OrderRepository {
  getOrders(): Observable<Order[]>;
  getOrderById(id: string): Observable<Order | null>;
  createOrder(order: Partial<Order>): Observable<Order>;
  updateOrderStatus(orderId: string, status: OrderStatus): Observable<Order>;
}
```

To migrate to Supabase:
1. Implement `SupabaseOrderRepository implements OrderRepository`.
2. Swap the DI provider token in `app.config.ts`:
   ```typescript
   { provide: ORDER_REPOSITORY_TOKEN, useClass: SupabaseOrderRepository }
   ```
3. Components require **zero lines of code changes**.

---

## 2. Recommended Database Schema in PostgreSQL / Supabase
- `restaurants`: Store brand configuration, GST tax percentage, opening hours.
- `tables`: Physical table numbers, capacity, sections, and cryptographic QR tokens with expiration / rotation support.
- `customers`: Synced with Supabase Auth or phone OTP verification records.
- `menu_categories` & `menu_items`: Dish metadata, prices, tags, image URLs hosted in Supabase Storage (`/menu-assets/`).
- `orders` & `order_items`: Real-time order placement. Postgres `orders` table triggers broadcast notifications via Supabase Realtime Channels to admin dispatch boards.
- `coupons` & `coupon_redemptions`: Enforces atomic transaction checks in PostgreSQL function `redeem_coupon(order_id, coupon_code, customer_phone)` to guarantee single-use limits.
- `invoices`: Immutable sequential invoice records with GST breakdowns.

---

## 3. Security & Row Level Security (RLS) Policies
- **Admin CRM**: Access guarded by Supabase Auth JWT claims (`role = 'admin'` or `'staff'`). RLS policies allow SELECT, INSERT, UPDATE, DELETE for authenticated staff members.
- **Customer Table Sessions**: QR code scans generate a temporary ephemeral table session signed via HMAC or Supabase edge function. Customers can only read the menu catalog and insert an order tied strictly to their validated `table_id`.
- **Order Tracking**: Order tracking requires both `order_id` and the matching customer phone / session token, preventing brute-force order scanning.
- **Service Role Secrets**: The Supabase Service Role Key must NEVER be placed in the frontend bundle. Frontend clients only hold the public anon key.
