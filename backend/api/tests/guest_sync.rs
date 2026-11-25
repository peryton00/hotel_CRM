use hotel_crm_api::{
    migrations,
    models::billing::{CreateRefundRequest, SettleOrderRequest},
    models::order::{CreateOrderItemInput, CreateOrderRequest},
    repositories::{BillingRepository, OrderRepository, TableRepository},
    sync::SyncWorker,
};
use sqlx::PgPool;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires independent disposable POS_SYNC_TEST_LOCAL_URL and POS_SYNC_TEST_CLOUD_URL with the Supabase base schema"]
async fn guest_ticket_reaches_the_till_once() -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPool::connect(&std::env::var("POS_SYNC_TEST_LOCAL_URL")?).await?;
    let cloud = PgPool::connect(&std::env::var("POS_SYNC_TEST_CLOUD_URL")?).await?;
    migrations::LOCAL.run(&pool).await?;
    migrations::migrate_cloud(&cloud).await?;
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
    let token = Uuid::new_v4().simple().to_string();
    let router = hotel_crm_api::sync::device::router(cloud.clone(), token.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let url = format!("http://{}", listener.local_addr()?);
    tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let denied = reqwest::Client::new()
        .post(format!("{url}/device/sync"))
        .json(&serde_json::json!({"action":"pending"}))
        .send()
        .await?;
    assert_eq!(denied.status(), 401);
    let worker = SyncWorker::new(
        pool.clone(),
        hotel_crm_api::sync::device::DeviceClient::new(&url, token).unwrap(),
    );
    worker.run_sync_cycle().await?;
    let key = Uuid::new_v4();
    let guest = OrderRepository::create_guest_order(&cloud, restaurant, req, key).await?;
    worker.run_sync_cycle().await?;
    let saved = OrderRepository::get_order(&pool, restaurant, guest.order.id)
        .await?
        .unwrap();
    assert_eq!(
        saved.order.total_amount_paise,
        guest.order.total_amount_paise
    );
    assert_eq!(saved.order.seating_session_id, session);
    assert_eq!(saved.order.created_at, guest.order.created_at);
    assert_eq!(saved.items[0].id, guest.items[0].id);
    // Simulate a lost acknowledgement after the local commit.
    sqlx::query("UPDATE guest_order_receipts SET received_at=NULL WHERE request_id=$1")
        .bind(key)
        .execute(&cloud)
        .await?;
    worker.run_sync_cycle().await?;
    let accepted: bool = sqlx::query_scalar(
        "SELECT received_at IS NOT NULL FROM guest_order_receipts WHERE request_id=$1",
    )
    .bind(key)
    .fetch_one(&cloud)
    .await?;
    assert!(accepted);
    assert_eq!(
        OrderRepository::get_order(&pool, restaurant, guest.order.id)
            .await?
            .unwrap()
            .items
            .len(),
        1
    );
    let id = guest.order.id;
    let amount = saved.order.total_amount_paise;
    let payment = BillingRepository::settle_order(
        &pool,
        restaurant,
        id,
        None,
        SettleOrderRequest {
            payment_method: "cash".into(),
            amount_paise: amount,
            upi_transaction_ref: None,
            idempotency_key: Some(format!("cash-{id}")),
            notes: None,
            discount_paise: None,
            applied_coupon_code: None,
        },
    )
    .await?;
    let refund = BillingRepository::create_refund(
        &pool,
        restaurant,
        id,
        CreateRefundRequest {
            payment_id: Some(payment.id),
            refund_amount_paise: amount,
            reason: "Test shift".into(),
            refund_method: Some("cash".into()),
            idempotency_key: Some(format!("refund-{id}")),
        },
        None,
    )
    .await?;
    BillingRepository::update_refund_status(&pool, restaurant, refund.id, "completed").await?;
    worker.run_sync_cycle().await?;
    let cloud_payment: (i64, Option<chrono::DateTime<chrono::Utc>>) =
        sqlx::query_as("SELECT amount_paise,settled_at FROM payments WHERE id=$1")
            .bind(payment.id)
            .fetch_one(&cloud)
            .await?;
    assert_eq!(cloud_payment, (amount, payment.settled_at));
    let cloud_order = OrderRepository::get_order(&cloud, restaurant, id)
        .await?
        .unwrap();
    assert_eq!(cloud_order.order.payment_status, "refunded");
    Ok(())
}
