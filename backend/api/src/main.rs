use std::net::SocketAddr;
use std::time::Duration;

use hotel_crm_api::config::{AppConfig, AppState};
use hotel_crm_api::routes;
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hotel_crm_api=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Load configuration
    let config = AppConfig::from_env();
    tracing::info!("Starting HOTEL_CRM API in {} mode...", config.environment);

    // 3. Configure Primary (Local/Operational) PostgreSQL connection pool
    let max_conns = if config.is_offline_first { 20 } else { 5 };
    let pool = PgPoolOptions::new()
        .max_connections(max_conns)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect_lazy(&config.database_url)?;

    match pool.acquire().await {
        Ok(conn) => {
            drop(conn);
            tracing::info!(
                "Successfully connected to {} PostgreSQL database!",
                if config.is_offline_first { "local" } else { "primary" }
            );
            if config.is_offline_first {
                apply_local_migrations(&pool).await;
            } else {
                ensure_schema_and_seed(&pool).await;
            }
        }
        Err(e) => tracing::error!("Failed to connect to primary PostgreSQL database: {:?}", e),
    }

    // 4. Optionally configure Cloud PostgreSQL connection pool for sync
    let cloud_pool = if let Some(ref cloud_url) = config.cloud_database_url {
        match PgPoolOptions::new()
            .max_connections(5)
            .min_connections(0)
            .acquire_timeout(Duration::from_secs(15))
            .idle_timeout(Duration::from_secs(300))
            .connect_lazy(cloud_url)
        {
            Ok(cp) => {
                tracing::info!("Cloud synchronization pool initialized.");
                Some(cp)
            }
            Err(e) => {
                tracing::warn!("Cloud synchronization pool initialization warning: {:?}", e);
                None
            }
        }
    } else {
        None
    };

    let app_state = AppState {
        pool,
        cloud_pool,
        config: config.clone(),
    };

    // 4. Build application router
    let app = routes::create_router(app_state);

    // 5. Bind HTTP listener
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("HOTEL_CRM API successfully listening on http://{}", addr);

    // 6. Serve with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("HOTEL_CRM API server stopped gracefully.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C interrupt, initiating shutdown...");
        },
        _ = terminate => {
            tracing::info!("Received SIGTERM terminate, initiating shutdown...");
        },
    }
}

async fn apply_local_migrations(pool: &sqlx::PgPool) {
    tracing::info!("Applying local offline PostgreSQL schema migrations...");

    let migrations = [
        ("001_core", include_str!("../migrations_local/001_core.sql")),
        ("002_billing_payments", include_str!("../migrations_local/002_billing_payments.sql")),
        ("003_inventory_recipes", include_str!("../migrations_local/003_inventory_recipes.sql")),
        ("004_staff_coupons_reservations", include_str!("../migrations_local/004_staff_coupons_reservations.sql")),
        ("005_sync_outbox_inbox", include_str!("../migrations_local/005_sync_outbox_inbox.sql")),
        ("000_seed", include_str!("../migrations_local/000_seed.sql")),
    ];

    for (name, sql) in &migrations {
        match sqlx::raw_sql(sql).execute(pool).await {
            Ok(_) => tracing::info!("Local migration [{}] verified.", name),
            Err(e) => tracing::warn!("Local migration [{}] notice: {}", name, e),
        }
    }

    tracing::info!("Local PostgreSQL schema and initial canonical seeds are ready.");
}

async fn ensure_schema_and_seed(pool: &sqlx::PgPool) {
    let batch_sql = r#"
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS email VARCHAR(100);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state VARCHAR(100);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS fssai_license VARCHAR(50);
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS table_number VARCHAR(20);
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_code_identifier VARCHAR(64);
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS active_order_id UUID;
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE tables SET table_number = COALESCE(table_number, number), qr_code_identifier = COALESCE(qr_code_identifier, qr_token);
        ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
        ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS base_price_paise BIGINT;
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5,2) DEFAULT 5.0;
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT TRUE;
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS preparation_time_minutes INT DEFAULT 15;
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS auth_user_id UUID;
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS shift VARCHAR(100) DEFAULT 'General Shift';
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS assigned_section VARCHAR(100) DEFAULT 'Main Dining Floor';
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS login_id VARCHAR(100);
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS monthly_salary_paise BIGINT DEFAULT 1500000;
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS payroll_cycle_start_day INT DEFAULT 1;
        ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE tables ADD COLUMN IF NOT EXISTS assigned_staff_id UUID;
        CREATE TABLE IF NOT EXISTS staff_attendance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            restaurant_id UUID NOT NULL,
            staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
            attendance_date DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
            check_in_time TIMESTAMPTZ,
            check_out_time TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(restaurant_id, staff_id, attendance_date)
        );
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, anon, authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, anon, authenticated;
        ALTER TABLE customers ALTER COLUMN phone_e164 DROP NOT NULL;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
        UPDATE customers SET phone = COALESCE(phone, phone_e164) WHERE phone IS NULL;
        ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
        ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_count INT DEFAULT 2;
        UPDATE reservations SET customer_phone = COALESCE(customer_phone, customer_phone_e164) WHERE customer_phone IS NULL;
        UPDATE reservations SET guest_count = COALESCE(guest_count, party_size) WHERE guest_count IS NULL;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS inventory_item_id UUID;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_order_id UUID;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_wastage_id UUID;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
        ALTER TABLE stock_movements ALTER COLUMN ingredient_id DROP NOT NULL;
        ALTER TABLE stock_movements ALTER COLUMN previous_stock DROP NOT NULL;
        ALTER TABLE stock_movements ALTER COLUMN new_stock DROP NOT NULL;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12, 4) DEFAULT 0.0000;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        UPDATE stock_movements SET notes = COALESCE(notes, reason) WHERE notes IS NULL;
        UPDATE stock_movements SET created_at = COALESCE(created_at, "timestamp") WHERE created_at IS NULL;
        UPDATE stock_movements SET inventory_item_id = COALESCE(inventory_item_id, ingredient_id) WHERE inventory_item_id IS NULL;
        ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS inventory_item_id UUID;
        ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20);
        ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS cost_impact_paise BIGINT DEFAULT 0;
        ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS reported_by_staff_id UUID;
        ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
        ALTER TABLE wastage_records ALTER COLUMN ingredient_id DROP NOT NULL;
        ALTER TABLE wastage_records ALTER COLUMN unit DROP NOT NULL;
        ALTER TABLE wastage_records ALTER COLUMN reported_by DROP NOT NULL;
        UPDATE wastage_records SET inventory_item_id = COALESCE(inventory_item_id, ingredient_id) WHERE inventory_item_id IS NULL;
        ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
        ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS discount_applied_paise BIGINT DEFAULT 0;
        ALTER TABLE coupon_redemptions ALTER COLUMN customer_id DROP NOT NULL;
        ALTER TABLE coupon_redemptions ALTER COLUMN discount_amount_applied_paise DROP NOT NULL;
        ALTER TABLE coupon_redemptions ALTER COLUMN idempotency_key DROP NOT NULL;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
        UPDATE invoices SET discount_paise = COALESCE(discount_paise, discount_amount_paise) WHERE discount_paise IS NULL;
        UPDATE invoices SET tax_paise = COALESCE(tax_paise, tax_amount_paise) WHERE tax_paise IS NULL;
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_dinein_table;
        ALTER TABLE orders ALTER COLUMN customer_name DROP NOT NULL;
        ALTER TABLE orders ALTER COLUMN customer_phone_e164 DROP NOT NULL;
        ALTER TABLE orders ALTER COLUMN order_type TYPE VARCHAR(50) USING order_type::text;
        ALTER TABLE orders ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
        ALTER TABLE orders ALTER COLUMN payment_status TYPE VARCHAR(50) USING payment_status::text;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_paise BIGINT DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS round_off_paise BIGINT DEFAULT 0;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS server_staff_id UUID;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS legacy_unknown_timestamp BOOLEAN DEFAULT FALSE;
        ALTER TABLE orders ALTER COLUMN legacy_unknown_timestamp TYPE BOOLEAN USING FALSE;
        ALTER TABLE orders ALTER COLUMN legacy_unknown_timestamp SET DEFAULT FALSE;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_total_paise BIGINT DEFAULT 0;
        ALTER TABLE order_items ALTER COLUMN item_total_paise DROP NOT NULL;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal_paise BIGINT DEFAULT 0;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_paise BIGINT DEFAULT 0;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'confirmed';
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS from_status VARCHAR(50);
        ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS to_status VARCHAR(50);
        ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS performed_by UUID;
        ALTER TABLE order_timeline_events ALTER COLUMN status DROP NOT NULL;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS upi_transaction_ref VARCHAR(100);
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS legacy_unknown_timestamp BOOLEAN DEFAULT FALSE;
        ALTER TABLE payments ALTER COLUMN legacy_unknown_timestamp TYPE BOOLEAN USING FALSE;
        ALTER TABLE payments ALTER COLUMN legacy_unknown_timestamp SET DEFAULT FALSE;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20);
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(12, 4) DEFAULT 0.0000;
        ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_per_unit_paise BIGINT DEFAULT 0;
        UPDATE inventory_items SET unit_of_measure = COALESCE(unit_of_measure, unit) WHERE unit_of_measure IS NULL;
        UPDATE inventory_items SET reorder_level = COALESCE(reorder_level, min_threshold) WHERE reorder_level IS NULL;
        UPDATE inventory_items SET cost_per_unit_paise = COALESCE(cost_per_unit_paise, unit_cost_paise) WHERE cost_per_unit_paise IS NULL;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order_amount_paise BIGINT DEFAULT 0;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS one_time_per_customer BOOLEAN DEFAULT TRUE;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 year';
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        INSERT INTO restaurants (
            id, slug, name, tagline, description, phone, email, address, city, state, postal_code,
            gstin, fssai_license, currency, currency_symbol, gst_rate, service_charge_rate, timezone, is_active
        ) VALUES (
            '00000000-0000-0000-0000-000000000001',
            'gurukripa-dhaba',
            'Gurukripa Dhaba',
            'Authentic Punjabi & North Indian Cuisine',
            'Serving authentic rich Punjabi delicacies since 1998.',
            '+91 98765 43210',
            'info@gurukripadhaba.in',
            'G.T. Road, Near Highway Plaza',
            'Ludhiana',
            'Punjab',
            '141001',
            '03AABCG1234F1Z5',
            '10019011000123',
            'INR',
            '₹',
            5.00,
            0.00,
            'Asia/Kolkata',
            true
        ) ON CONFLICT (id) DO UPDATE SET
            phone = COALESCE(restaurants.phone, EXCLUDED.phone),
            email = COALESCE(restaurants.email, EXCLUDED.email),
            address = COALESCE(restaurants.address, EXCLUDED.address),
            city = COALESCE(restaurants.city, EXCLUDED.city),
            state = COALESCE(restaurants.state, EXCLUDED.state),
            postal_code = COALESCE(restaurants.postal_code, EXCLUDED.postal_code),
            gstin = COALESCE(restaurants.gstin, EXCLUDED.gstin),
            fssai_license = COALESCE(restaurants.fssai_license, EXCLUDED.fssai_license);

        INSERT INTO tables (id, restaurant_id, number, table_number, capacity, section, qr_token, qr_code_identifier, status, ordering_enabled)
        VALUES
            ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'T-01', 'tbl-01', 4, 'Main Hall', 'tbl-01', 'tbl-01', 'AVAILABLE', true),
            ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'T-02', 'tbl-02', 2, 'Main Hall', 'tbl-02', 'tbl-02', 'AVAILABLE', true),
            ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'T-03', 'tbl-03', 6, 'Family Section', 'tbl-03', 'tbl-03', 'AVAILABLE', true),
            ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'T-04', 'tbl-04', 4, 'Garden Terrace', 'tbl-04', 'tbl-04', 'AVAILABLE', true),
            ('11111111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'T-07', 'tbl-07', 4, 'VIP Lounge', 'tbl-07', 'tbl-07', 'AVAILABLE', true)
        ON CONFLICT (id) DO UPDATE SET
            table_number = EXCLUDED.table_number,
            qr_code_identifier = EXCLUDED.qr_code_identifier;

        INSERT INTO menu_categories (id, restaurant_id, name, slug, sort_order, display_order, is_active)
        VALUES
            ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Starters', 'starters', 1, 1, true),
            ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Course', 'main-course', 2, 2, true),
            ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Breads & Rice', 'breads-rice', 3, 3, true),
            ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Beverages & Desserts', 'beverages-desserts', 4, 4, true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO menu_items (
            id, restaurant_id, category_id, name, description, price_paise, base_price_paise,
            dietary, is_veg, is_available, preparation_time_minutes, image_url, display_order
        ) VALUES
            ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Paneer Tikka', 'Charcoal grilled cottage cheese marinated in spiced yogurt.', 28000, 28000, 'VEG', true, true, 15, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500', 1),
            ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Crispy Corn Salt & Pepper', 'Sweet corn kernels tossed with crushed pepper and spring onion.', 22000, 22000, 'VEG', true, true, 12, 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=500', 2),
            ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Dal Makhani Special', 'Slow cooked black lentils with churned butter and dairy cream.', 32000, 32000, 'VEG', true, true, 20, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500', 1),
            ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Paneer Butter Masala', 'Fresh cottage cheese cubes in rich velvety tomato cashew gravy.', 34000, 34000, 'VEG', true, true, 15, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500', 2),
            ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Butter Garlic Naan', 'Clay oven baked flatbread brushed with garlic butter.', 6000, 6000, 'VEG', true, true, 8, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500', 1),
            ('33333333-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'Special Amritsari Lassi', 'Chilled sweet churned yogurt topped with thick malai and pistachios.', 12000, 12000, 'VEG', true, true, 5, 'https://images.unsplash.com/photo-1571006687694-733e08f51a44?w=500', 1)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO staff_members (id, restaurant_id, name, role, email, login_id, pin_hash, phone, phone_e164, is_active, shift, assigned_section)
        VALUES (
            '44444444-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000001',
            'Super Admin',
            'ADMIN',
            'admin@hotelcrm.com',
            'admin',
            'Admin@123',
            '+91 98765 43210',
            '+919876543210',
            true,
            'Management',
            'Executive HQ'
        ) ON CONFLICT (id) DO UPDATE SET
            login_id = COALESCE(staff_members.login_id, EXCLUDED.login_id),
            email = COALESCE(staff_members.email, EXCLUDED.email),
            phone = COALESCE(staff_members.phone, EXCLUDED.phone),
            shift = COALESCE(staff_members.shift, EXCLUDED.shift),
            assigned_section = COALESCE(staff_members.assigned_section, EXCLUDED.assigned_section);
    "#;

    match sqlx::raw_sql(batch_sql).execute(pool).await {
        Ok(_) => tracing::info!("Schema synchronization and canonical seed verification completed."),
        Err(e) => tracing::warn!("Schema harmonization / seed notice: {}", e),
    }
}
