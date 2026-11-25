-- Apply after the Supabase base schema.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS whatsapp_templates jsonb;
CREATE TABLE IF NOT EXISTS restaurant_heartbeats (
    restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id), is_online boolean NOT NULL,
    last_seen_at timestamptz NOT NULL, metadata jsonb
);
ALTER TABLE restaurant_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON restaurant_heartbeats FROM anon, authenticated;

REVOKE INSERT ON orders, order_items FROM anon;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Staff permissions are provisioned by the operator through the POS.
    UPDATE public.users SET email=NEW.email, updated_at=NOW() WHERE id=NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

