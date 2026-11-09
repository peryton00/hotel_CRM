use std::time::Duration;
use sqlx::PgPool;
use uuid::Uuid;

pub struct GatewayHeartbeatClient {
    cloud_pool: PgPool,
    restaurant_id: Uuid,
}

impl GatewayHeartbeatClient {
    pub fn new(cloud_pool: PgPool, restaurant_id: Uuid) -> Self {
        Self {
            cloud_pool,
            restaurant_id,
        }
    }

    /// Spawns background heartbeat task emitting live status every 10 seconds
    pub fn spawn(self) {
        tokio::spawn(async move {
            tracing::info!(
                "Cloud Availability Gateway Client active for restaurant [{}] (10s pulse)",
                self.restaurant_id
            );

            // Ensure heartbeat table exists in cloud
            let ensure_sql = r#"
                CREATE TABLE IF NOT EXISTS restaurant_heartbeats (
                    restaurant_id UUID PRIMARY KEY,
                    is_online BOOLEAN NOT NULL DEFAULT TRUE,
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    metadata JSONB
                );
            "#;
            let _ = sqlx::raw_sql(ensure_sql).execute(&self.cloud_pool).await;

            loop {
                let pulse_result = sqlx::query(
                    r#"
                    INSERT INTO restaurant_heartbeats (restaurant_id, is_online, last_seen_at, metadata)
                    VALUES ($1, true, NOW(), '{"mode": "desktop-pos", "version": "1.0.0"}'::jsonb)
                    ON CONFLICT (restaurant_id) DO UPDATE SET
                        is_online = true,
                        last_seen_at = NOW(),
                        metadata = EXCLUDED.metadata
                    "#,
                )
                .bind(self.restaurant_id)
                .execute(&self.cloud_pool)
                .await;

                if let Err(e) = pulse_result {
                    tracing::debug!("Heartbeat pulse to cloud failed (offline mode): {}", e);
                }

                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });
    }

    /// Checks whether a restaurant is currently online within a 30-second window
    pub async fn is_restaurant_online(pool: &PgPool, restaurant_id: Uuid) -> bool {
        let row: Option<(bool,)> = sqlx::query_as(
            r#"
            SELECT (last_seen_at >= NOW() - INTERVAL '30 SECONDS') AND is_online
            FROM restaurant_heartbeats
            WHERE restaurant_id = $1
            "#,
        )
        .bind(restaurant_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        row.map(|r| r.0).unwrap_or(false)
    }
}
