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
    sqlx::raw_sql(
        r#"
        -- Restaurants tax rates
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2);
        ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
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
        UPDATE invoices SET total_amount_paise = COALESCE(total_amount_paise, total_paise, 0) WHERE total_amount_paise IS NULL;
        UPDATE invoices SET total_paise = COALESCE(total_paise, total_amount_paise, 0) WHERE total_paise IS NULL;

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
        "#,
    )
    .execute(&pool)
    .await?;

    println!("Restaurants and Invoices tables harmonized successfully!");
    Ok(())
}
