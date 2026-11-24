use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL not set");
    println!("Connecting to database...");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await?;

    println!("Checking database tables and columns...");
    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    .fetch_all(&pool)
    .await?;

    println!("Existing tables:");
    for (t,) in &tables {
        println!(" - {}", t);
    }

    println!("Harmonizing restaurants and invoices table columns...");

    let staff_list: Vec<(String, String, String, String, String)> = sqlx::query_as(
        "SELECT id::text, name, role, COALESCE(login_id, ''), pin_hash FROM staff_members WHERE is_active = true"
    )
    .fetch_all(&pool)
    .await?;
    println!("\nActive Staff Members in DB:");
    for (sid, sname, srole, slogin, spin) in staff_list {
        println!(
            " - ID: {}, Name: {}, Role: {}, LoginID: '{}', PinHashPrefix: '{}'",
            sid,
            sname,
            srole,
            slogin,
            &spin[..std::cmp::min(10, spin.len())]
        );
    }
    sqlx::raw_sql(
        r#"
        -- Restaurants tax rates & templates
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB;
        UPDATE restaurants SET cgst_rate = COALESCE(cgst_rate, gst_rate / 2.0, 2.5) WHERE cgst_rate IS NULL;
        UPDATE restaurants SET sgst_rate = COALESCE(sgst_rate, gst_rate / 2.0, 2.5) WHERE sgst_rate IS NULL;
        UPDATE restaurants SET gst_rate = COALESCE(gst_rate, cgst_rate + sgst_rate, 5.0) WHERE gst_rate IS NULL;

        -- Invoices table columns
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount_paise BIGINT;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_paise BIGINT;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'PAID';
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT FALSE;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS print_count INT DEFAULT 0;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_printed_at TIMESTAMPTZ;
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2);
        UPDATE orders SET
            cgst_rate = COALESCE(cgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END),
            sgst_rate = COALESCE(sgst_rate, CASE WHEN subtotal_paise > 0 AND tax_paise > 0 THEN ROUND((tax_paise::numeric / subtotal_paise::numeric * 50.0), 2) ELSE 2.5 END)
        WHERE cgst_rate IS NULL OR sgst_rate IS NULL;
        CREATE TABLE IF NOT EXISTS restaurant_heartbeats (
            restaurant_id UUID PRIMARY KEY,
            is_online BOOLEAN NOT NULL DEFAULT TRUE,
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB
        );

        -- Customers compatibility & unique constraint
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spend_paise BIGINT DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 0;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_restaurant_phone ON customers(restaurant_id, phone);
        ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(restaurant_id, customer_phone);
        CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_e164 ON orders(restaurant_id, customer_phone_e164);
        CREATE INDEX IF NOT EXISTS idx_orders_table_created ON orders(restaurant_id, table_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
        "#,
    )
    .execute(&pool)
    .await?;

    println!("Restaurants and Invoices tables harmonized successfully!");
    Ok(())
}
