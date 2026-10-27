use axum::{response::IntoResponse, Json};
use serde_json::json;

use crate::{auth::AuthenticatedUser, models::common::ApiResponse};

pub async fn get_me(user: AuthenticatedUser) -> impl IntoResponse {
    Json(ApiResponse::success(json!({
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
    })))
}
