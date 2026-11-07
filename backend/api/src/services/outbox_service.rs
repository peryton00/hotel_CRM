use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

pub struct OutboxService;

impl OutboxService {
    /// Atomically records a domain state transition into the `sync_outbox` table
    /// within the caller's active database transaction.
    pub async fn emit_event(
        tx: &mut Transaction<'_, Postgres>,
        aggregate_type: &str,
        aggregate_id: Uuid,
        event_type: &str,
        payload: Value,
        idempotency_key: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            INSERT INTO sync_outbox (
                aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
            )
            VALUES ($1, $2, $3, $4, $5, 'PENDING')
            ON CONFLICT (idempotency_key) DO NOTHING
            "#,
        )
        .bind(aggregate_type)
        .bind(aggregate_id)
        .bind(event_type)
        .bind(payload)
        .bind(idempotency_key)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }
}
