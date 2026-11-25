CREATE TABLE device_events (event_id uuid PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON device_events FROM anon, authenticated;
