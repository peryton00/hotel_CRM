use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{config::AppState, gateway::GatewayHeartbeatClient};

pub async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

pub async fn liveness() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "alive" })))
}

pub async fn readiness(State(pool): State<PgPool>) -> Response {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ready" }))).into_response(),
        Err(err) => {
            tracing::error!("Readiness check failed: {}", err);
            // Don't expose internal db details to client
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "unhealthy", "error": "Database unreachable" })),
            )
                .into_response()
        }
    }
}

pub async fn check_restaurant_availability(
    Path(restaurant_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Response {
    let pool_to_check = &state.pool;
    let is_online =
        GatewayHeartbeatClient::is_restaurant_online(pool_to_check, restaurant_id).await;

    if is_online {
        (
            StatusCode::OK,
            Json(json!({
                "restaurant_id": restaurant_id,
                "status": "ONLINE",
                "can_accept_orders": true,
                "message": "Restaurant POS is online and actively receiving orders"
            })),
        )
            .into_response()
    } else {
        (
            StatusCode::OK,
            Json(json!({
                "restaurant_id": restaurant_id,
                "status": "OFFLINE",
                "can_accept_orders": false,
                "message": "Restaurant POS is currently offline. Please place your order directly with your server."
            })),
        )
            .into_response()
    }
}

pub async fn sync_status(
    _staff: crate::auth::TenantContext,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, crate::error::AppError> {
    let status:serde_json::Value=sqlx::query_scalar("SELECT jsonb_build_object('last_success',(SELECT last_synced_timestamp FROM sync_checkpoints WHERE id='device_gateway'),
        'online',COALESCE((SELECT last_synced_timestamp >= now()-interval '35 seconds' FROM sync_checkpoints WHERE id='device_gateway'),false),
        'pending',(SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING')+(SELECT COUNT(*) FROM catalog_publications)+(SELECT COUNT(*) FROM table_publications),
        'oldest_pending',(SELECT MIN(created_at) FROM sync_outbox WHERE status='PENDING'))").fetch_one(&state.pool).await?;
    Ok(Json(
        json!({"configured":state.config.device_sync_url.is_some(),"sync":status}),
    ))
}
