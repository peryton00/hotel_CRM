use std::time::Duration;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, sqlx::FromRow)]
struct OutboxRow {
    event_id: Uuid,
    aggregate_type: String,
    aggregate_id: Uuid,
    event_type: String,
    payload: Value,
    idempotency_key: String,
    retry_count: i32,
}

pub struct SyncWorker {
    local_pool: PgPool,
    cloud_pool: PgPool,
}

impl SyncWorker {
    pub fn new(local_pool: PgPool, cloud_pool: PgPool) -> Self {
        Self {
            local_pool,
            cloud_pool,
        }
    }

    /// Spawns the resilient background sync loop as a non-blocking Tokio task
    pub fn spawn(self) {
        tokio::spawn(async move {
            tracing::info!("Background Cloud Sync Engine started (5s sync cadence)");
            let mut backoff_secs = 5;

            loop {
                match self.run_sync_cycle().await {
                    Ok(events_synced) => {
                        if events_synced > 0 {
                            tracing::info!("Cloud Sync: successfully processed {} events", events_synced);
                        }
                        backoff_secs = 5;
                    }
                    Err(err) => {
                        tracing::warn!(
                            "Cloud Sync encountered network/database error: {}. Backing off {}s...",
                            err,
                            backoff_secs
                        );
                        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                        backoff_secs = (backoff_secs * 2).min(60);
                        continue;
                    }
                }

                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
            }
        });
    }

    /// Single execution cycle: push local outbox events to cloud, then pull cloud digital orders
    async fn run_sync_cycle(&self) -> Result<usize, sqlx::Error> {
        let events = sqlx::query_as::<_, OutboxRow>(
            r#"
            SELECT event_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, retry_count
            FROM sync_outbox
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT 50
            "#,
        )
        .fetch_all(&self.local_pool)
        .await?;

        if events.is_empty() {
            // Also poll for any inbound cloud digital orders
            self.pull_inbound_cloud_orders().await?;
            return Ok(0);
        }

        let count = events.len();
        for event in events {
            match self.sync_single_event(&event).await {
                Ok(_) => {
                    let _ = sqlx::query(
                        r#"
                        UPDATE sync_outbox
                        SET status = 'SYNCED', synced_at = NOW(), error_message = NULL
                        WHERE event_id = $1
                        "#,
                    )
                    .bind(event.event_id)
                    .execute(&self.local_pool)
                    .await;
                }
                Err(err) => {
                    let err_msg = err.to_string();
                    tracing::warn!(
                        "Failed to sync event [{}:{}] to cloud: {}",
                        event.event_type,
                        event.event_id,
                        err_msg
                    );
                    let _ = sqlx::query(
                        r#"
                        UPDATE sync_outbox
                        SET retry_count = retry_count + 1, error_message = $2
                        WHERE event_id = $1
                        "#,
                    )
                    .bind(event.event_id)
                    .bind(err_msg)
                    .execute(&self.local_pool)
                    .await;

                    // Network/pool failure: abort batch and back off
                    return Err(err);
                }
            }
        }

        // Pull inbound customer orders
        let _ = self.pull_inbound_cloud_orders().await;

        Ok(count)
    }

    async fn sync_single_event(&self, event: &OutboxRow) -> Result<(), sqlx::Error> {
        match event.event_type.as_str() {
            "ORDER_CREATED" => {
                let p = &event.payload;
                let id = p.get("id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok()).unwrap_or(event.aggregate_id);
                let restaurant_id = p.get("restaurant_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let order_number = p.get("order_number").and_then(|v| v.as_str()).unwrap_or("ORD-0000");
                let order_type = p.get("order_type").and_then(|v| v.as_str()).unwrap_or("dine_in");
                let status = p.get("status").and_then(|v| v.as_str()).unwrap_or("confirmed");
                let payment_status = p.get("payment_status").and_then(|v| v.as_str()).unwrap_or("pending");
                let table_id = p.get("table_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let customer_id = p.get("customer_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let subtotal_paise = p.get("subtotal_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let discount_paise = p.get("discount_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let tax_paise = p.get("tax_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let service_charge_paise = p.get("service_charge_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let round_off_paise = p.get("round_off_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let total_amount_paise = p.get("total_amount_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let notes = p.get("notes").and_then(|v| v.as_str());

                sqlx::query(
                    r#"
                    INSERT INTO orders (
                        id, restaurant_id, order_number, order_type, status, payment_status,
                        table_id, customer_id, customer_name, customer_phone_e164,
                        subtotal_paise, discount_paise, tax_paise, service_charge_paise,
                        round_off_paise, total_amount_paise, notes, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Guest', '+919999999999', $9, $10, $11, $12, $13, $14, $15, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        updated_at = NOW()
                    "#,
                )
                .bind(id)
                .bind(restaurant_id)
                .bind(order_number)
                .bind(order_type)
                .bind(status)
                .bind(payment_status)
                .bind(table_id)
                .bind(customer_id)
                .bind(subtotal_paise)
                .bind(discount_paise)
                .bind(tax_paise)
                .bind(service_charge_paise)
                .bind(round_off_paise)
                .bind(total_amount_paise)
                .bind(notes)
                .execute(&self.cloud_pool)
                .await?;
            }

            "ORDER_STATUS_UPDATED" => {
                let p = &event.payload;
                let to_status = p.get("to_status").and_then(|v| v.as_str()).unwrap_or("confirmed");
                sqlx::query(
                    r#"
                    UPDATE orders
                    SET status = $2, updated_at = NOW()
                    WHERE id = $1
                    "#,
                )
                .bind(event.aggregate_id)
                .bind(to_status)
                .execute(&self.cloud_pool)
                .await?;
            }

            "PAYMENT_SETTLED" => {
                let p = &event.payload;
                let payment_id = p.get("payment_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok()).unwrap_or(event.aggregate_id);
                let order_id = p.get("order_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let restaurant_id = p.get("restaurant_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let amount_paise = p.get("amount_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let payment_method = p.get("payment_method").and_then(|v| v.as_str()).unwrap_or("cash");

                if let (Some(rid), Some(oid)) = (restaurant_id, order_id) {
                    sqlx::query(
                        r#"
                        INSERT INTO payments (
                            id, restaurant_id, order_id, amount_paise, payment_method, status,
                            idempotency_key, settled_at
                        )
                        VALUES ($1, $2, $3, $4, $5, 'completed', $6, NOW())
                        ON CONFLICT (id) DO NOTHING
                        "#,
                    )
                    .bind(payment_id)
                    .bind(rid)
                    .bind(oid)
                    .bind(amount_paise)
                    .bind(payment_method)
                    .bind(&event.idempotency_key)
                    .execute(&self.cloud_pool)
                    .await?;

                    // Update cloud order payment status
                    let _ = sqlx::query(
                        r#"
                        UPDATE orders
                        SET payment_status = 'paid', settled_at = NOW(), updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(oid)
                    .execute(&self.cloud_pool)
                    .await;
                }
            }

            "INVENTORY_WASTAGE_RECORDED" => {
                let p = &event.payload;
                let wastage_id = p.get("wastage_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok()).unwrap_or(event.aggregate_id);
                let restaurant_id = p.get("restaurant_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let item_id = p.get("inventory_item_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let quantity = p.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let unit = p.get("unit_of_measure").and_then(|v| v.as_str()).unwrap_or("kg");
                let cost_impact = p.get("cost_impact_paise").and_then(|v| v.as_i64()).unwrap_or(0);
                let reason = p.get("reason").and_then(|v| v.as_str()).unwrap_or("Wastage");

                if let (Some(rid), Some(iid)) = (restaurant_id, item_id) {
                    let _ = sqlx::query(
                        r#"
                        INSERT INTO wastage_records (
                            id, restaurant_id, inventory_item_id, quantity, unit_of_measure,
                            cost_impact_paise, reason, idempotency_key
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO NOTHING
                        "#,
                    )
                    .bind(wastage_id)
                    .bind(rid)
                    .bind(iid)
                    .bind(quantity)
                    .bind(unit)
                    .bind(cost_impact)
                    .bind(reason)
                    .bind(&event.idempotency_key)
                    .execute(&self.cloud_pool)
                    .await;
                }
            }

            "TABLE_TRANSFERRED" => {
                let p = &event.payload;
                let from_table_id = p.get("from_table_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let to_table_id = p.get("to_table_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());
                let order_id = p.get("order_id").and_then(|v| v.as_str()).and_then(|s| Uuid::parse_str(s).ok());

                if let (Some(from), Some(to), Some(oid)) = (from_table_id, to_table_id, order_id) {
                    let _ = sqlx::query("UPDATE tables SET status = 'available', active_order_id = NULL WHERE id = $1")
                        .bind(from)
                        .execute(&self.cloud_pool)
                        .await;
                    let _ = sqlx::query("UPDATE tables SET status = 'occupied', active_order_id = $1 WHERE id = $2")
                        .bind(oid)
                        .bind(to)
                        .execute(&self.cloud_pool)
                        .await;
                }
            }

            _ => {
                tracing::info!("SyncWorker: processed event type '{}'", event.event_type);
            }
        }

        Ok(())
    }

    /// Ingests customer QR digital orders submitted to Cloud Supabase into the local PostgreSQL database
    async fn pull_inbound_cloud_orders(&self) -> Result<(), sqlx::Error> {
        // Query cloud orders placed with type 'digital_qr'
        let cloud_orders = sqlx::query_as::<_, (Uuid, Uuid, String, Option<Uuid>, i64, i64, i64, i64, Option<String>)>(
            r#"
            SELECT id, restaurant_id, order_number, table_id, subtotal_paise, discount_paise,
                   tax_paise, total_amount_paise, notes
            FROM orders
            WHERE order_type = 'digital_qr'
              AND status = 'SUBMITTED'
            LIMIT 10
            "#,
        )
        .fetch_all(&self.cloud_pool)
        .await;

        let orders = match cloud_orders {
            Ok(o) => o,
            Err(_) => return Ok(()),
        };

        for (id, restaurant_id, order_number, table_id, subtotal, discount, tax, total, notes) in orders {
            // Check if already in local DB
            let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM orders WHERE id = $1")
                .bind(id)
                .fetch_optional(&self.local_pool)
                .await?;

            if existing.is_none() {
                // Ingest into local DB
                let mut tx = self.local_pool.begin().await?;

                sqlx::query(
                    r#"
                    INSERT INTO orders (
                        id, restaurant_id, order_number, order_type, status, payment_status,
                        table_id, subtotal_paise, discount_paise, tax_paise, total_amount_paise, notes
                    )
                    VALUES ($1, $2, $3, 'digital_qr', 'confirmed', 'pending', $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (id) DO NOTHING
                    "#,
                )
                .bind(id)
                .bind(restaurant_id)
                .bind(&order_number)
                .bind(table_id)
                .bind(subtotal)
                .bind(discount)
                .bind(tax)
                .bind(total)
                .bind(&notes)
                .execute(&mut *tx)
                .await?;

                if let Some(tbl) = table_id {
                    let _ = sqlx::query("UPDATE tables SET status = 'occupied', active_order_id = $1 WHERE id = $2")
                        .bind(id)
                        .bind(tbl)
                        .execute(&mut *tx)
                        .await;
                }

                tx.commit().await?;

                // Acknowledge to cloud that local ingested this order
                let _ = sqlx::query("UPDATE orders SET status = 'confirmed', updated_at = NOW() WHERE id = $1")
                    .bind(id)
                    .execute(&self.cloud_pool)
                    .await;

                tracing::info!("Ingested inbound customer digital order {} (#{}) into local POS", id, order_number);
            }
        }

        Ok(())
    }
}
