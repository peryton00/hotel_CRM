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

    println!("Running migration on orders and customer_feedback tables...");
    sqlx::raw_sql(
        r#"
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_e164 VARCHAR(20);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_reference VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_coupon_code VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
        UPDATE orders SET order_number = 'ORD-' || UPPER(SUBSTRING(id::text, 1, 8)) WHERE order_number IS NULL;

        -- Customer feedback compatibility
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_id UUID;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS food_rating INT;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS service_rating INT;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS ambience_rating INT;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS resolution_note TEXT;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
        ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

        UPDATE customer_feedback f
        SET customer_name = COALESCE(f.customer_name, c.name, 'Valued Guest'),
            customer_phone = COALESCE(f.customer_phone, c.phone, c.phone_e164, '')
        FROM customers c
        WHERE f.customer_id = c.id AND f.customer_name IS NULL;
        "#,
    )
    .execute(&pool)
    .await?;

    println!("Migration executed successfully! Columns added to live database.");
    Ok(())
}
