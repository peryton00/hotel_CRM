use super::{
    device::{DeviceClient, SyncRequest},
    worker::OutboxRow,
};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

pub async fn run(pool: SqlitePool, client: DeviceClient) {
    let mut last = None;
    loop {
        if let Err(error) = cycle(&pool, &client, &mut last).await {
            tracing::warn!("SQLite device sync pending: {error}");
        }
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    }
}

async fn flush(
    pool: &SqlitePool,
    client: &DeviceClient,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rows=sqlx::query("SELECT event_id,aggregate_id,event_type,idempotency_key,payload FROM sync_outbox WHERE status='PENDING' ORDER BY rowid LIMIT 50").fetch_all(pool).await?;
    for row in rows {
        let id: String = row.try_get("event_id")?;
        let event = OutboxRow {
            event_id: Uuid::parse_str(&id)?,
            aggregate_id: Uuid::parse_str(row.try_get("aggregate_id")?)?,
            event_type: row.try_get("event_type")?,
            idempotency_key: row.try_get("idempotency_key")?,
            payload: serde_json::from_str(row.try_get("payload")?)?,
        };
        if let Err(error) = client.post::<()>(&SyncRequest::Event { event }).await {
            sqlx::query(
                "UPDATE sync_outbox SET retry_count=retry_count+1,last_error=? WHERE event_id=?",
            )
            .bind(error.to_string())
            .bind(id)
            .execute(pool)
            .await?;
            return Err(error.into());
        }
        sqlx::query("UPDATE sync_outbox SET status='SYNCED',synced_at=datetime('now'),last_error=NULL WHERE event_id=?").bind(id).execute(pool).await?;
    }
    Ok(())
}
type SyncResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
async fn rows(db: &mut sqlx::SqliteConnection, sql: &str) -> SyncResult<Vec<serde_json::Value>> {
    Ok(sqlx::query(sql)
        .fetch_all(db)
        .await?
        .into_iter()
        .map(crate::sqlite_sale::record)
        .collect::<Result<Vec<_>, _>>()?)
}
async fn cycle(
    pool: &SqlitePool,
    client: &DeviceClient,
    last: &mut Option<serde_json::Value>,
) -> SyncResult<()> {
    let mut tx = pool.begin().await?;
    let Some(restaurant) = rows(&mut tx, "SELECT * FROM restaurants ORDER BY id LIMIT 1")
        .await?
        .pop()
    else {
        return Ok(());
    };
    let id = Uuid::parse_str(restaurant["id"].as_str().ok_or("Missing restaurant ID")?)?;
    let categories = rows(&mut tx, "SELECT * FROM menu_categories ORDER BY id").await?;
    let items = rows(&mut tx, "SELECT * FROM menu_items ORDER BY id").await?;
    let tables = rows(&mut tx, "SELECT * FROM tables ORDER BY id").await?;
    tx.commit().await?;
    let state = serde_json::json!([restaurant, categories, items, tables]);
    if last.as_ref() != Some(&state) {
        client
            .post::<()>(&SyncRequest::Catalog {
                id,
                restaurant,
                categories: categories.into(),
                items: items.into(),
            })
            .await?;
        for table in tables {
            client
                .post::<()>(&SyncRequest::Table {
                    id: Uuid::parse_str(table["id"].as_str().ok_or("Invalid table ID")?)?,
                    table: Some(table),
                })
                .await?;
        }
        *last = Some(state);
    }
    flush(pool, client).await?;
    let tickets: Vec<crate::models::order::OrderWithItems> =
        client.post(&SyncRequest::Pending).await?;
    for ticket in tickets {
        let o = ticket.order;
        if o.restaurant_id != id || ticket.items.is_empty() {
            return Err("Invalid incoming ticket".into());
        }
        let order = o.id.to_string();
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
        let known: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sync_inbox WHERE inbox_id=?)")
                .bind(&order)
                .fetch_one(&mut *tx)
                .await?;
        if !known {
            sqlx::query("INSERT INTO orders(id,restaurant_id,order_number,order_type,status,payment_status,table_id,customer_name,customer_phone_e164,subtotal_paise,discount_paise,tax_paise,total_amount_paise,notes,seating_session_id,service_charge_paise,round_off_paise,created_at) VALUES(?,?,?,?,?,'UNPAID',?,?,?,?,?,?,?,?,?,?,?,?)")
                .bind(&order).bind(id.to_string()).bind(o.order_number).bind(o.order_type).bind(o.status.to_uppercase()).bind(o.table_id.map(|v|v.to_string())).bind(o.customer_name).bind(o.customer_phone_e164).bind(o.subtotal_paise).bind(o.discount_paise).bind(o.tax_paise).bind(o.total_amount_paise).bind(o.notes).bind(o.seating_session_id.map(|v|v.to_string())).bind(o.service_charge_paise).bind(o.round_off_paise).bind(o.created_at.to_rfc3339()).execute(&mut *tx).await?;
            for line in ticket.items {
                sqlx::query("INSERT INTO order_items(id,order_id,menu_item_id,name,quantity,unit_price_paise,subtotal_paise,tax_paise,discount_paise,total_paise,item_total_paise,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(line.id.to_string()).bind(&order).bind(line.menu_item_id.map(|v|v.to_string())).bind(line.item_name).bind(line.quantity).bind(line.unit_price_paise).bind(line.subtotal_paise).bind(line.tax_paise).bind(line.discount_paise).bind(line.total_paise).bind(line.total_paise).bind(line.notes).bind(line.status).execute(&mut *tx).await?;
            }
            sqlx::query("INSERT INTO sync_inbox(inbox_id,event_type,aggregate_id,payload,idempotency_key,status) VALUES(?,'ORDER_CREATED',?,'{}',?,'PROCESSED')").bind(&order).bind(&order).bind(&order).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        client
            .post::<()>(&SyncRequest::Acknowledge { id: o.id })
            .await?;
    }
    client
        .post::<()>(&SyncRequest::Heartbeat { restaurant_id: id })
        .await?;
    sqlx::query("INSERT INTO sync_checkpoints(id,last_synced_timestamp) VALUES('device_gateway',datetime('now')) ON CONFLICT(id) DO UPDATE SET last_synced_timestamp=excluded.last_synced_timestamp").execute(pool).await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::post, Json, Router};
    use serde_json::{json, Value};

    #[tokio::test]
    async fn gateway_replays_guest_ticket_without_duplicating_lines() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations_sqlite")
            .run(&pool)
            .await
            .unwrap();
        let id = Uuid::new_v4();
        let line = Uuid::new_v4();
        let now = chrono::Utc::now();
        let ticket = json!({"id":id,"restaurant_id":Uuid::from_u128(1),"order_number":"GUEST-1","order_type":"dine_in","status":"confirmed","payment_status":"pending","subtotal_paise":28000,"discount_paise":0,"tax_paise":1400,"service_charge_paise":0,"round_off_paise":0,"total_amount_paise":29400,"created_at":now,"updated_at":now,"legacy_unknown_timestamp":false,
        "items":[{"id":line,"order_id":id,"menu_item_id":"33333333-0000-0000-0000-000000000001","item_name":"Paneer Tikka","quantity":1,"unit_price_paise":28000,"subtotal_paise":28000,"tax_paise":0,"discount_paise":0,"total_paise":28000,"status":"confirmed","created_at":now}]});
        let gateway = Router::new().route(
            "/device/sync",
            post(move |Json(req): Json<Value>| {
                let ticket = ticket.clone();
                async move {
                    Json(if req["action"] == "pending" {
                        json!([ticket])
                    } else {
                        Value::Null
                    })
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, gateway).await.unwrap() });
        let client = DeviceClient::new(&url, "x".repeat(32)).unwrap();
        let mut last = None;
        for _ in 0..2 {
            cycle(&pool, &client, &mut last).await.unwrap();
        }
        let counts:(i64,i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM orders),(SELECT count(*) FROM order_items),(SELECT count(*) FROM sync_inbox)").fetch_one(&pool).await.unwrap();
        assert_eq!(counts, (1, 1, 1));
        task.abort();
    }
}
#[cfg(test)]
mod cloud_acceptance {
    use super::*;
    use serde_json::{json, Value};

    #[tokio::test]
    #[ignore = "requires POS_SQLITE_TEST_CLOUD_URL for a dedicated disposable Supabase-schema database"]
    async fn sqlite_shift_reconciles_on_postgres() -> SyncResult<()> {
        let cloud = sqlx::PgPool::connect(&std::env::var("POS_SQLITE_TEST_CLOUD_URL")?).await?;
        crate::migrations::migrate_cloud(&cloud).await?;
        let local = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;
        sqlx::migrate!("./migrations_sqlite").run(&local).await?;
        let secret = Uuid::new_v4().to_string();
        let gateway = super::super::device::router(cloud.clone(), secret.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let client = DeviceClient::new(&format!("http://{}", listener.local_addr()?), secret)?;
        let gateway_task =
            tokio::spawn(async move { axum::serve(listener, gateway).await.unwrap() });
        let till = crate::sqlite_staff::routes(local.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let api = format!("http://{}/api/v1", listener.local_addr()?);
        let till_task = tokio::spawn(async move { axum::serve(listener, till).await.unwrap() });
        let http = reqwest::Client::new();
        let auth: Value = http
            .post(format!("{api}/auth/setup"))
            .json(&json!({"login_id":"admin","password":"sqlite-qa-password"}))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let token = auth["data"]["token"].as_str().ok_or("no staff token")?;
        let order = Uuid::new_v4();
        let post = |path: String, body: Value| {
            http.post(format!("{api}/{path}"))
                .bearer_auth(token)
                .json(&body)
                .send()
        };
        let o:Value=post("orders".into(),json!({"id":order,"order_type":"takeaway","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1}]})).await?.error_for_status()?.json().await?;
        let full = o["data"]["total_amount_paise"].as_i64().ok_or("no total")?;
        let mut last = None;
        cycle(&local, &client, &mut last).await?;
        let splits: Value = post(format!("orders/{order}/split"), json!({"ways":2}))
            .await?
            .error_for_status()?
            .json()
            .await?;
        for (index, split) in splits["data"]
            .as_array()
            .ok_or("no split bills")?
            .iter()
            .enumerate()
        {
            post("payments".into(),json!({"order_id":order,"payment_method":"cash","amount_paise":split["amount_paise"],"split_bill_id":split["id"]})).await?.error_for_status()?;
            cycle(&local, &client, &mut last).await?;
            let status: String =
                sqlx::query_scalar("SELECT payment_status FROM orders WHERE id=$1")
                    .bind(order)
                    .fetch_one(&cloud)
                    .await?;
            assert_eq!(status, if index == 0 { "partial" } else { "paid" });
        }
        let r:Value=post(format!("orders/{order}/refund"),json!({"refund_amount_paise":full,"reason":"QA return","idempotency_key":Uuid::new_v4()})).await?.error_for_status()?.json().await?;
        http.put(format!(
            "{api}/refunds/{}/status",
            r["data"]["id"].as_str().unwrap()
        ))
        .bearer_auth(token)
        .json(&json!({"status":"completed"}))
        .send()
        .await?
        .error_for_status()?;
        cycle(&local, &client, &mut last).await?;
        let amounts:(i64,i64,String)=sqlx::query_as("SELECT (SELECT sum(amount_paise)::bigint FROM payments WHERE order_id=o.id),(SELECT sum(refund_amount_paise)::bigint FROM refunds WHERE order_id=o.id AND status='completed'),payment_status FROM orders o WHERE id=$1").bind(order).fetch_one(&cloud).await?;
        assert_eq!(amounts, (full, full, "refunded".into()));
        let pending: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sync_outbox WHERE status='PENDING'")
                .fetch_one(&local)
                .await?;
        assert_eq!(pending, 0);
        till_task.abort();
        gateway_task.abort();
        Ok(())
    }
}
