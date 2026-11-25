-- Render owns cloud reads and writes. Client roles need no direct migration or helper access.
ALTER TABLE public._sqlx_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._sqlx_migrations FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_customer_id(), public.current_staff_role(),
    public.current_staff_restaurant_id(), public.handle_new_user(), public.trg_fn_order_lifecycle(),
    public.fn_validate_coupon_server_side(uuid, uuid, varchar, bigint)
    FROM PUBLIC, anon, authenticated;

-- Earlier installs published these tables. Neither client subscribes to Postgres Changes.
DO $$
DECLARE
    target text;
BEGIN
    FOREACH target IN ARRAY ARRAY['orders','order_items','tables','customer_feedback','payments','sync_outbox'] LOOP
        IF EXISTS (
            SELECT 1 FROM pg_publication_rel pr
            JOIN pg_publication p ON p.oid = pr.prpubid
            WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = to_regclass(format('public.%I', target))
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target);
        END IF;
        -- Preserve replica identity if another configured publication still uses the table.
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename=target) THEN
            EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY DEFAULT', target);
        END IF;
    END LOOP;
END $$;
