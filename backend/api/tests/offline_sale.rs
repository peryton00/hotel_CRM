use hotel_crm_api::{
    migrations,
    models::{
        billing::SettleOrderRequest,
        order::{CreateOrderItemInput, CreateOrderRequest},
    },
    repositories::{BillingRepository, OrderRepository, TableRepository},
};
use sqlx::PgPool;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires POS_TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn offline_cash_sale_survives_reconnect() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("POS_TEST_DATABASE_URL")?;
    let pool = PgPool::connect(&url).await?;
    migrations::LOCAL.run(&pool).await?;
    migrations::LOCAL.run(&pool).await?;
    let restaurant = Uuid::new_v4();
    sqlx::query("INSERT INTO restaurants (id,slug,name) VALUES ($1,$2,'Test restaurant')")
        .bind(restaurant)
        .bind(restaurant.to_string())
        .execute(&pool)
        .await?;
    let table: Uuid = sqlx::query_scalar(
        "INSERT INTO tables (restaurant_id,number,qr_token) VALUES ($1,'1',$2) RETURNING id",
    )
    .bind(restaurant)
    .bind(Uuid::new_v4().to_string())
    .fetch_one(&pool)
    .await?;
    let session = TableRepository::update_status(
        &pool,
        restaurant,
        table,
        Some("OCCUPIED"),
        None,
        None,
        None,
    )
    .await?
    .current_seating_session_id;
    assert!(session.is_some());
    assert_eq!(
        TableRepository::list_by_restaurant(&pool, restaurant).await?[0].current_seating_session_id,
        session
    );
    let order = OrderRepository::create_order(
        &pool,
        restaurant,
        None,
        CreateOrderRequest {
            id: None,
            order_type: "DINE_IN".into(),
            table_id: Some(table),
            seating_session_id: session,
            pickup_reference: None,
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            notes: None,
            applied_coupon_code: None,
            discount_paise: None,
            items: vec![CreateOrderItemInput {
                menu_item_id: None,
                item_name: "Tea".into(),
                quantity: 2,
                unit_price_paise: 1000,
                notes: None,
            }],
        },
    )
    .await?;
    let id = order.order.id;
    assert_eq!(order.order.total_amount_paise, 2100);
    let payment = || SettleOrderRequest {
        payment_method: "cash".into(),
        amount_paise: 2100,
        upi_transaction_ref: None,
        idempotency_key: Some(format!("cash-{id}")),
        notes: None,
        discount_paise: None,
        applied_coupon_code: None,
    };
    let settled = BillingRepository::settle_order(&pool, restaurant, id, None, payment()).await?;
    pool.close().await;
    let reopened = PgPool::connect(&url).await?;
    assert_eq!(
        BillingRepository::settle_order(&reopened, restaurant, id, None, payment())
            .await?
            .id,
        settled.id
    );
    let totals: (i64, i64) =
        sqlx::query_as("SELECT COUNT(*),MAX(total_paise) FROM invoices WHERE order_id=$1")
            .bind(id)
            .fetch_one(&reopened)
            .await?;
    assert_eq!(totals, (1, 2100));
    let saved = OrderRepository::get_order(&reopened, restaurant, id)
        .await?
        .unwrap();
    assert_eq!(saved.order.payment_status, "paid");
    assert_eq!(saved.items.len(), 1);
    let receipt = BillingRepository::generate_receipt(&reopened, restaurant, id).await?;
    assert_eq!(receipt.final_amount_paise, 2100);
    assert_eq!(receipt.items[0].name, "Tea");
    let summary = hotel_crm_api::repositories::ReportsRepository::get_dashboard_summary(
        &reopened, restaurant,
    )
    .await?;
    assert_eq!(summary.today.collections.total_collections_paise, 2100);
    assert_eq!(
        TableRepository::list_by_restaurant(&reopened, restaurant).await?[0].status,
        "AVAILABLE"
    );
    Ok(())
}

#[tokio::test]
#[ignore = "requires POS_TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn guest_checkout_uses_catalog_and_deduplicates_retries(
) -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPool::connect(&std::env::var("POS_TEST_DATABASE_URL")?).await?;
    migrations::LOCAL.run(&pool).await?;
    let restaurant = Uuid::new_v4();
    sqlx::query("INSERT INTO restaurants (id,slug,name) VALUES ($1,$2,'Test restaurant')")
        .bind(restaurant)
        .bind(restaurant.to_string())
        .execute(&pool)
        .await?;
    let table: Uuid = sqlx::query_scalar(
        "INSERT INTO tables (restaurant_id,number,qr_token) VALUES ($1,'1',$2) RETURNING id",
    )
    .bind(restaurant)
    .bind(Uuid::new_v4().to_string())
    .fetch_one(&pool)
    .await?;
    let session = TableRepository::update_status(
        &pool,
        restaurant,
        table,
        Some("OCCUPIED"),
        None,
        None,
        None,
    )
    .await?
    .current_seating_session_id;
    let category: Uuid = sqlx::query_scalar(
        "INSERT INTO menu_categories(restaurant_id,name,slug) VALUES($1,'Tea','tea') RETURNING id",
    )
    .bind(restaurant)
    .fetch_one(&pool)
    .await?;
    let item: Uuid = sqlx::query_scalar("INSERT INTO menu_items(restaurant_id,category_id,name,price_paise) VALUES($1,$2,'Tea',1000) RETURNING id").bind(restaurant).bind(category).fetch_one(&pool).await?;
    let req = CreateOrderRequest {
        id: None,
        order_type: "DINE_IN".into(),
        table_id: Some(table),
        seating_session_id: session,
        pickup_reference: None,
        customer_id: None,
        customer_name: Some("Guest".into()),
        customer_phone: None,
        notes: None,
        applied_coupon_code: None,
        discount_paise: Some(50),
        items: vec![CreateOrderItemInput {
            menu_item_id: Some(item),
            item_name: "Cached name".into(),
            quantity: 2,
            unit_price_paise: 900,
            notes: None,
        }],
    };
    let key = Uuid::new_v4();
    let (first, second) = tokio::try_join!(
        OrderRepository::create_guest_order(&pool, restaurant, req.clone(), key),
        OrderRepository::create_guest_order(&pool, restaurant, req, key)
    )?;
    assert_eq!(first.order.id, second.order.id);
    assert_eq!(first.order.total_amount_paise, 2100);
    assert_eq!(first.items[0].item_name, "Tea");
    let pending: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM guest_order_receipts WHERE request_id=$1 AND received_at IS NULL",
    )
    .bind(key)
    .fetch_one(&pool)
    .await?;
    assert_eq!(pending, 1);
    Ok(())
}
