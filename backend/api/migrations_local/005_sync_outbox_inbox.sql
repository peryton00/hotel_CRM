-- ==============================================================================
-- 005_sync_outbox_inbox.sql: Local Transactional Outbox & Inbound Sync Queue
-- Core Engine for HOTEL_CRM Desktop-First Offline Architecture
-- ==============================================================================

-- 1. LOCAL TRANSACTIONAL OUTBOX
-- Every local operational mutation (orders, payments, bills, stock) commits an event here in the same ACID transaction.
CREATE TABLE IF NOT EXISTS sync_outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,    -- 'order', 'payment', 'inventory', 'table', 'customer'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,        -- 'ORDER_CREATED', 'ORDER_STATUS_UPDATED', 'PAYMENT_SETTLED', 'STOCK_WASTED'
    payload JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_FLIGHT', 'COMPLETED', 'FAILED'
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, created_at);

-- 2. LOCAL TRANSACTIONAL INBOX
-- Digital customer orders and remote cloud configuration land here before being ingested into local operational tables.
CREATE TABLE IF NOT EXISTS sync_inbox (
    inbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_origin VARCHAR(50) NOT NULL DEFAULT 'SUPABASE_CLOUD',
    event_type VARCHAR(50) NOT NULL,        -- 'CLOUD_ORDER_SUBMITTED', 'CLOUD_MENU_MODIFIED'
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSED', 'REJECTED'
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending ON sync_inbox(status, received_at);

-- 3. SYNC CHECKPOINTS & HEARTBEAT LOG
-- Tracks sync cursor watermarks and connectivity telemetry.
CREATE TABLE IF NOT EXISTS sync_checkpoints (
    id VARCHAR(50) PRIMARY KEY,             -- 'cloud_outbox_cursor', 'cloud_inbox_cursor'
    last_synced_event_id UUID,
    last_synced_timestamp TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'IDLE', -- 'IDLE', 'SYNCING', 'DEGRADED', 'ERROR'
    details JSONB
);
