-- ==============================================================================
-- 20261027000003_inventory_and_recipes.sql
-- HOTEL_CRM Inventory, Recipe Management, Auditable Stock Ledger, and Wastage
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INVENTORY ITEMS & AVAILABLE-TO-PROMISE (ATP)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    unit VARCHAR(20) NOT NULL, -- 'KG', 'G', 'L', 'ML', 'PCS', 'PORTION'
    current_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_stock >= 0),
    reserved_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (reserved_stock >= 0),
    min_threshold NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (min_threshold >= 0),
    unit_cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
    supplier_name VARCHAR(150),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_inventory_item_name UNIQUE (restaurant_id, name),
    CONSTRAINT chk_reserved_not_exceed_stock CHECK (reserved_stock <= current_stock)
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);

-- ------------------------------------------------------------------------------
-- 2. RECIPES & INGREDIENT COSTING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    yield_portions INT NOT NULL DEFAULT 1 CHECK (yield_portions > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recipe_menu_item UNIQUE (restaurant_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON recipes(menu_item_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    CONSTRAINT uq_recipe_ingredient UNIQUE (recipe_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- ------------------------------------------------------------------------------
-- 3. AUDITABLE STOCK MOVEMENTS LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'SALE_FULFILLMENT', 'WASTAGE', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE'
    quantity_change NUMERIC(12, 4) NOT NULL,
    previous_stock NUMERIC(12, 4) NOT NULL,
    new_stock NUMERIC(12, 4) NOT NULL,
    unit_cost_paise BIGINT NOT NULL DEFAULT 0,
    total_cost_paise BIGINT NOT NULL DEFAULT 0,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reason TEXT,
    performed_by VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant_time ON stock_movements(restaurant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id);

-- ------------------------------------------------------------------------------
-- 4. INVENTORY WASTAGE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wastage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    unit_cost_paise BIGINT NOT NULL DEFAULT 0,
    total_value_paise BIGINT NOT NULL DEFAULT 0,
    reason VARCHAR(50) NOT NULL, -- 'SPOILAGE', 'EXPIRY', 'SPILLAGE', 'PREPARATION_WASTE', 'QUALITY_REJECTION', 'OTHER'
    notes TEXT,
    reported_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wastage_records_restaurant_date ON wastage_records(restaurant_id, created_at);
