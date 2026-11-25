-- Destructive development reset for a dedicated restaurant cloud database.
-- Stop Render and disconnect the till before resetting. Run schema.sql afterward.
-- This only resets cloud CRM data. The till retains its SQLite database and sync history.
BEGIN;
SELECT pg_advisory_xact_lock(718104521);
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop related tables in one statement so their internal dependencies are removed together.
-- RESTRICT makes an unexpected external dependency roll back the entire reset.
DROP TABLE IF EXISTS
    public.restaurants,
    public.users,
    public.staff_members,
    public.staff_attendance,
    public.customers,
    public.customer_auth_challenges,
    public.tables,
    public.table_transfers,
    public.menu_categories,
    public.menu_items,
    public.orders,
    public.order_items,
    public.order_timeline_events,
    public.split_bills,
    public.split_bill_items,
    public.payments,
    public.refunds,
    public.invoices,
    public.invoice_prints,
    public.inventory_items,
    public.recipes,
    public.recipe_ingredients,
    public.stock_movements,
    public.wastage_records,
    public.coupons,
    public.coupon_assignments,
    public.coupon_redemptions,
    public.reservations,
    public.customer_feedback,
    public.sync_outbox,
    public.sync_inbox,
    public.sync_checkpoints,
    public.idempotency_records,
    public.audit_logs,
    public._sqlx_migrations,
    public.restaurant_heartbeats,
    public.guest_order_receipts,
    public.device_events
RESTRICT;

DROP FUNCTION IF EXISTS public.current_staff_restaurant_id(), public.current_customer_id(),
    public.current_staff_role(), public.trg_fn_order_lifecycle(), public.handle_new_user(),
    public.fn_validate_coupon_server_side(uuid, uuid, varchar, bigint);
DROP TYPE IF EXISTS public.order_type, public.order_status, public.payment_status, public.table_status, public.customer_status, public.loyalty_tier, public.actor_role;
COMMIT;
