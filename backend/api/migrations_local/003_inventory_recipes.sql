-- ==============================================================================
-- 003_inventory_recipes.sql: Local PostgreSQL Inventory & Recipes Schema
-- Part of HOTEL_CRM Desktop-First Offline Architecture
-- ==============================================================================

-- 1. INVENTORY ITEMS (Raw Ingredients & Bar Stock)
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50),
    unit VARCHAR(20) NOT NULL,
    unit_of_measure VARCHAR(20),
    current_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    min_threshold NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    reorder_level NUMERIC(12, 4) DEFAULT 0.0000,
    unit_cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
    cost_per_unit_paise BIGINT DEFAULT 0,
    category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_inventory_sku UNIQUE (restaurant_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);

-- 2. RECIPES & INGREDIENT MAPS
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    yield_servings INT NOT NULL DEFAULT 1 CHECK (yield_servings > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recipe_menu_item UNIQUE (menu_item_id)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC(12, 4) NOT NULL CHECK (quantity_required > 0),
    unit VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- 3. STOCK MOVEMENTS (Auditable Stock Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'ORDER_CONSUMPTION', 'WASTAGE', 'MANUAL_ADJUSTMENT'
    quantity NUMERIC(12, 4) NOT NULL,
    previous_stock NUMERIC(12, 4),
    new_stock NUMERIC(12, 4),
    balance_after NUMERIC(12, 4) DEFAULT 0.0000,
    unit_cost_paise BIGINT DEFAULT 0,
    reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reference_wastage_id UUID,
    idempotency_key VARCHAR(100),
    reason TEXT,
    notes TEXT,
    created_by VARCHAR(100) DEFAULT 'System',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_timestamp ON stock_movements(restaurant_id, created_at);

-- 4. WASTAGE RECORDS
CREATE TABLE IF NOT EXISTS wastage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20),
    unit_of_measure VARCHAR(20),
    cost_impact_paise BIGINT NOT NULL DEFAULT 0 CHECK (cost_impact_paise >= 0),
    reason TEXT NOT NULL,
    reported_by VARCHAR(100),
    reported_by_staff_id UUID,
    idempotency_key VARCHAR(100),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wastage_restaurant ON wastage_records(restaurant_id, created_at);
