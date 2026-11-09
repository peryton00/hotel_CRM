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
    let pool_to_check = state.cloud_pool.as_ref().unwrap_or(&state.pool);
    let is_online = GatewayHeartbeatClient::is_restaurant_online(pool_to_check, restaurant_id).await;

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
