use super::device::{DeviceClient, SyncRequest};
use serde_json::Value;
use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub(super) struct OutboxRow {
    pub(super) event_id: Uuid,
    pub(super) aggregate_id: Uuid,
    pub(super) event_type: String,
    pub(super) payload: Value,
    pub(super) idempotency_key: String,
}

pub struct SyncWorker {
    local_pool: PgPool,
    device: DeviceClient,
}

impl SyncWorker {
    pub fn new(local_pool: PgPool, device: DeviceClient) -> Self {
        Self { local_pool, device }
    }

    /// Spawns the resilient background sync loop as a non-blocking Tokio task
    pub fn spawn(self, restaurant_id: Uuid) {
        tokio::spawn(async move {
            tracing::info!("Background Cloud Sync Engine started (5s sync cadence)");
            let mut backoff_secs = 5;

            loop {
                match self.run_sync_cycle().await {
                    Ok(events_synced) => {
                        if events_synced > 0 {
                            tracing::info!(
                                "Cloud Sync: successfully processed {} events",
                                events_synced
                            );
                        }
                        let heartbeat = self
                            .device
                            .post::<()>(&SyncRequest::Heartbeat { restaurant_id })
                            .await;
                        if heartbeat.is_ok() {
                            if let Err(err)=sqlx::query("INSERT INTO sync_checkpoints(id,last_synced_timestamp,status) VALUES('device_gateway',now(),'IDLE') ON CONFLICT(id) DO UPDATE SET last_synced_timestamp=now(),last_attempt_at=now(),status='IDLE'").execute(&self.local_pool).await {
                                tracing::warn!("Could not save device sync time: {err}");
                            }
                        } else if let Err(err) = heartbeat {
                            tracing::warn!("Device heartbeat failed: {err}");
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
    pub async fn run_sync_cycle(&self) -> Result<usize, sqlx::Error> {
        self.publish_catalog().await?;
        self.publish_tables().await?;
        self.pull_inbound_cloud_orders().await?;
        let events = sqlx::query_as::<_, OutboxRow>(
            r#"
            SELECT event_id, aggregate_id, event_type, payload, idempotency_key
            FROM sync_outbox
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT 50
            "#,
        )
        .fetch_all(&self.local_pool)
        .await?;

        if events.is_empty() {
            return Ok(0);
        }

        let count = events.len();
        for event in events {
            match self.sync_single_event(&event).await {
                Ok(_) => {
                    sqlx::query(
                        r#"
                        UPDATE sync_outbox
                        SET status = 'SYNCED', synced_at = NOW(), last_error = NULL
                        WHERE event_id = $1
                        "#,
                    )
                    .bind(event.event_id)
                    .execute(&self.local_pool)
                    .await?;
                }
                Err(err) => {
                    let err_msg = err.to_string();
                    tracing::warn!(
                        "Failed to sync event [{}:{}] to cloud: {}",
                        event.event_type,
                        event.event_id,
                        err_msg
                    );
                    sqlx::query(
                        r#"
                        UPDATE sync_outbox
                        SET retry_count = retry_count + 1, last_error = $2
                        WHERE event_id = $1
                        "#,
                    )
                    .bind(event.event_id)
                    .bind(err_msg)
                    .execute(&self.local_pool)
                    .await?;

                    // Network/pool failure: abort batch and back off
                    return Err(err);
                }
            }
        }

        Ok(count)
    }

    async fn publish_catalog(&self) -> Result<(), sqlx::Error> {
        type Catalog = (Uuid, Uuid, Value, Value, Value);
        let snapshots: Vec<Catalog> = sqlx::query_as("SELECT r.id,p.revision,to_jsonb(r),
            COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM menu_categories c WHERE c.restaurant_id=r.id),'[]'),
            COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM menu_items i WHERE i.restaurant_id=r.id),'[]')
            FROM catalog_publications p JOIN restaurants r ON r.id=p.restaurant_id")
            .fetch_all(&self.local_pool).await?;
        for (id, revision, restaurant, categories, items) in snapshots {
            self.device
                .post::<()>(&SyncRequest::Catalog {
                    id,
                    restaurant,
                    categories,
                    items,
                })
                .await?;
            sqlx::query("DELETE FROM catalog_publications WHERE restaurant_id=$1 AND revision=$2")
                .bind(id)
                .bind(revision)
                .execute(&self.local_pool)
                .await?;
        }
        Ok(())
    }

    async fn publish_tables(&self) -> Result<(), sqlx::Error> {
        let pending: Vec<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT table_id,revision FROM table_publications ORDER BY table_id LIMIT 50",
        )
        .fetch_all(&self.local_pool)
        .await?;
        for (id, revision) in pending {
            let table: Option<serde_json::Value> =
                sqlx::query_scalar("SELECT to_jsonb(t) FROM tables t WHERE id=$1")
                    .bind(id)
                    .fetch_optional(&self.local_pool)
                    .await?;
            self.device
                .post::<()>(&SyncRequest::Table { id, table })
                .await?;
            sqlx::query("DELETE FROM table_publications WHERE table_id=$1 AND revision=$2")
                .bind(id)
                .bind(revision)
                .execute(&self.local_pool)
                .await?;
        }
        Ok(())
    }

    async fn sync_single_event(&self, event: &OutboxRow) -> Result<(), sqlx::Error> {
        let mut outgoing = event.clone();
        outgoing.payload = match event.event_type.as_str() {
            "PAYMENT_SETTLED" => {
                sqlx::query_scalar("SELECT to_jsonb(p) FROM payments p WHERE id=$1")
                    .bind(event.aggregate_id)
                    .fetch_one(&self.local_pool)
                    .await?
            }
            "REFUND_REQUESTED" | "REFUND_STATUS_UPDATED" => {
                sqlx::query_scalar("SELECT to_jsonb(r) FROM refunds r WHERE id=$1")
                    .bind(event.aggregate_id)
                    .fetch_one(&self.local_pool)
                    .await?
            }
            _ => event.payload.clone(),
        };
        self.device
            .post(&SyncRequest::Event { event: outgoing })
            .await
    }

    /// Ingests customer QR digital orders submitted to Cloud Supabase into the local PostgreSQL database
    async fn pull_inbound_cloud_orders(&self) -> Result<(), sqlx::Error> {
        let orders: Vec<crate::models::order::OrderWithItems> =
            self.device.post(&SyncRequest::Pending).await?;
        for source in orders {
            let id = source.order.id;
            let restaurant_id = source.order.restaurant_id;
            // Check if already in local DB
            let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM orders WHERE id = $1")
                .bind(id)
                .fetch_optional(&self.local_pool)
                .await?;

            if existing.is_none() {
                let order = source.order;
                let mut tx = self.local_pool.begin().await?;
                sqlx::query("INSERT INTO orders(id,restaurant_id,order_number,order_type,status,payment_status,table_id,customer_name,customer_phone_e164,customer_phone,subtotal_paise,discount_paise,tax_paise,total_amount_paise,notes,seating_session_id,cgst_rate,sgst_rate,service_charge_paise,round_off_paise,applied_coupon_code,created_at)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT(id) DO NOTHING")
                    .bind(id).bind(restaurant_id).bind(order.order_number).bind(order.order_type).bind(order.status).bind(order.payment_status)
                    .bind(order.table_id).bind(order.customer_name).bind(order.customer_phone_e164).bind(order.subtotal_paise).bind(order.discount_paise)
                    .bind(order.tax_paise).bind(order.total_amount_paise).bind(order.notes).bind(order.seating_session_id.map(|s|s.to_string()))
                    .bind(order.cgst_rate).bind(order.sgst_rate).bind(order.service_charge_paise).bind(order.round_off_paise)
                    .bind(order.applied_coupon_code).bind(order.created_at).execute(&mut *tx).await?;
                let cloud_items = source.items;
                if cloud_items.is_empty() {
                    return Err(sqlx::Error::Protocol("Guest ticket has no lines".into()));
                }

                for ci in cloud_items {
                    sqlx::query(
                        r#"
                        INSERT INTO order_items (
                            id, order_id, menu_item_id, name, quantity, unit_price_paise,
                            subtotal_paise, tax_paise, discount_paise, total_paise, item_total_paise, notes, status
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12)
                        ON CONFLICT (id) DO NOTHING
                        "#,
                    )
                    .bind(ci.id)
                    .bind(id)
                    .bind(ci.menu_item_id)
                    .bind(&ci.item_name)
                    .bind(ci.quantity)
                    .bind(ci.unit_price_paise)
                    .bind(ci.subtotal_paise)
                    .bind(ci.tax_paise)
                    .bind(ci.discount_paise)
                    .bind(ci.total_paise)
                    .bind(&ci.notes)
                    .bind(&ci.status)
                    .execute(&mut *tx)
                    .await?;
                }

                if let Some(tbl) = order.table_id {
                    sqlx::query("UPDATE tables SET active_order_id=$1 WHERE id=$2 AND current_seating_session_id=$3 AND status='OCCUPIED'")
                        .bind(id).bind(tbl).bind(order.seating_session_id.map(|s|s.to_string())).execute(&mut *tx).await?;
                }
                tx.commit().await?;
            }
            // A previous attempt may have committed locally just before connectivity failed.
            self.device
                .post::<()>(&SyncRequest::Acknowledge { id })
                .await?;
        }

        Ok(())
    }
}
