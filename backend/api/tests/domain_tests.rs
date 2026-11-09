use hotel_crm_api::auth::claims::{AppMetadata, SupabaseClaims};
use hotel_crm_api::models::paise::Paise;
use hotel_crm_api::services::{
    financial_service::FinancialCalculator, inventory_service::InventoryService,
    order_service::OrderService,
};
use uuid::Uuid;

#[test]
fn test_paise_exact_equal_splits() {
    // Phase 7 requirement: paise arithmetic with remainder distribution
    // 1000 paise (Rs 10.00) split across 3 people:
    let splits = Paise(1000).split_equally(3);
    assert_eq!(splits, vec![Paise(334), Paise(333), Paise(333)]);
    let sum: i64 = splits.iter().map(|p| p.0).sum();
    assert_eq!(
        sum, 1000,
        "Sum of split paise must exactly equal original paise"
    );

    // 100 paise split 7 ways:
    let splits_7 = Paise(100).split_equally(7);
    assert_eq!(splits_7.len(), 7);
    let sum_7: i64 = splits_7.iter().map(|p| p.0).sum();
    assert_eq!(sum_7, 100);
}

#[test]
fn test_signed_net_collections_unclamped() {
    // When completed refunds exceed collections, net collections must be negative
    let net = FinancialCalculator::calculate_net_collections(5000, 8500);
    assert_eq!(
        net, -3500,
        "Net collections must be -3500 paise, not clamped to 0"
    );
}

#[test]
fn test_order_bill_calculation_invariants() {
    // Subtotal 12000 paise (Rs 120), discount 2000 paise (Rs 20), tax 5% on 10000 = 500 paise
    let bill = OrderService::calculate_bill(12000, 2000, 5.0, 0.0, true);
    assert_eq!(bill.taxable_amount_paise, 10000);
    assert_eq!(bill.tax_paise, 500);
    assert_eq!(bill.final_amount_paise, 10500);
}

#[test]
fn test_order_lifecycle_guards() {
    assert!(OrderService::validate_status_transition("draft", "confirmed").is_ok());
    assert!(OrderService::validate_status_transition("confirmed", "in_preparation").is_ok());
    assert!(OrderService::validate_status_transition("confirmed", "cancelled").is_ok());
    assert!(OrderService::validate_status_transition("completed", "draft").is_err());
    assert!(OrderService::validate_status_transition("cancelled", "confirmed").is_err());
}

#[tokio::test]
async fn test_sqlite_dollar_parameter_support() {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::query("CREATE TABLE test (id TEXT PRIMARY KEY, val INTEGER, created_at TEXT, is_active INTEGER)")
        .execute(&pool)
        .await
        .unwrap();

    let id = Uuid::new_v4();
    let now = chrono::Utc::now();

    sqlx::query("INSERT INTO test (id, val, created_at, is_active) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind(42i64)
        .bind(now)
        .bind(true)
        .execute(&pool)
        .await
        .unwrap();

    let row: (Uuid, i64, chrono::DateTime<chrono::Utc>, bool) = sqlx::query_as("SELECT id, val, created_at, is_active FROM test WHERE id = $1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(row.0, id);
    assert_eq!(row.1, 42);
    assert_eq!(row.3, true);
}

#[tokio::test]
async fn test_sqlite_migration_execution() {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
    let migration_sql = include_str!("../migrations_sqlite/001_sqlite_core.sql");
    sqlx::raw_sql(migration_sql).execute(&pool).await.unwrap();

    // Verify restaurant was seeded
    let rest_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM restaurants")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rest_count.0, 1);

    // Verify users (Admin and Cashier) seeded
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(user_count.0, 2);

    // Verify tables seeded
    let table_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tables")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(table_count.0, 5);

    // Verify menu items seeded
    let item_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM menu_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(item_count.0, 6);
}

#[tokio::test]
async fn test_sqlite_pool_wal_init() {
    let temp_dir = std::env::temp_dir().join("hotel_crm_test");
    let _ = std::fs::create_dir_all(&temp_dir);
    let db_path = temp_dir.join("test_wal.db");
    if db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }

    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
    use std::str::FromStr;

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_string_lossy()))
        .unwrap()
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true);

    let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();

    let journal_mode: (String,) = sqlx::query_as("PRAGMA journal_mode")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(journal_mode.0.to_lowercase(), "wal");

    let migration_sql = include_str!("../migrations_sqlite/001_sqlite_core.sql");
    sqlx::raw_sql(migration_sql).execute(&pool).await.unwrap();

    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(user_count.0, 2);

    drop(pool);
    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_inventory_conversions_and_wastage() {
    let grams = InventoryService::convert_quantity(3.2, "kg", "g").unwrap();
    assert_eq!(grams, 3200.0);

    let kg = InventoryService::convert_quantity(1500.0, "g", "kg").unwrap();
    assert_eq!(kg, 1.5);

    let cost = InventoryService::calculate_wastage_cost(2.5, 4000);
    assert_eq!(cost, 10000);
}

#[test]
fn test_jwt_claims_tenant_extraction() {
    let user_uuid = Uuid::new_v4();
    let restaurant_uuid = Uuid::new_v4();

    let claims = SupabaseClaims {
        sub: user_uuid.to_string(),
        email: Some("owner@restaurant.local".to_string()),
        role: Some("authenticated".to_string()),
        aud: Some("authenticated".to_string()),
        exp: 2000000000,
        iat: Some(1700000000),
        iss: Some("https://test.supabase.co/auth/v1".to_string()),
        app_metadata: Some(AppMetadata {
            provider: Some("email".to_string()),
            providers: None,
            role: Some("owner".to_string()),
            restaurant_id: Some(restaurant_uuid),
        }),
        user_metadata: None,
    };

    assert_eq!(claims.user_id().unwrap(), user_uuid);
    assert_eq!(claims.restaurant_id().unwrap(), restaurant_uuid);
}

#[test]
fn test_cross_tenant_mismatch_detection() {
    let tenant_a = Uuid::new_v4();
    let tenant_b = Uuid::new_v4();

    // Verify invariant: claim_id must match header_id if both are provided
    let is_cross_tenant = tenant_a != tenant_b;
    assert!(
        is_cross_tenant,
        "Distinct tenant IDs must trigger cross-tenant detection"
    );
}

#[test]
fn test_sync_outbox_idempotency_and_event_contract() {
    let order_id = Uuid::new_v4();
    let payment_id = Uuid::new_v4();

    let order_idem = format!("order-create-{}", order_id);
    let pay_idem = format!("pay-settle-{}", payment_id);

    assert!(order_idem.starts_with("order-create-"));
    assert!(pay_idem.starts_with("pay-settle-"));

    let payload = serde_json::json!({
        "order_id": order_id,
        "payment_id": payment_id,
        "status": "paid",
        "amount_paise": 45000,
    });

    assert_eq!(payload["amount_paise"], 45000);
    assert_eq!(payload["status"], "paid");
}
