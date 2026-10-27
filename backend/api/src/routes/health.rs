use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use sqlx::PgPool;

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
