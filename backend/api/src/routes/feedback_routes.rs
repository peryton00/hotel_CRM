use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{
        common::ApiResponse,
        feedback::{CreateFeedbackRequest, ReplyFeedbackRequest, ToggleFeedbackVisibilityRequest},
    },
    repositories::FeedbackRepository,
};

pub async fn list_feedback(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let feedback = FeedbackRepository::list_feedback(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(feedback)))
}

pub async fn create_feedback(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateFeedbackRequest>,
) -> Result<impl IntoResponse, AppError> {
    let feedback = FeedbackRepository::create_feedback(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(feedback)))
}

pub async fn reply_feedback(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(feedback_id): Path<Uuid>,
    Json(req): Json<ReplyFeedbackRequest>,
) -> Result<impl IntoResponse, AppError> {
    let feedback = FeedbackRepository::reply_feedback(
        &pool,
        tenant.restaurant_id,
        feedback_id,
        req.resolution_note,
    )
    .await?;
    Ok(Json(ApiResponse::success(feedback)))
}

pub async fn toggle_feedback_visibility(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(feedback_id): Path<Uuid>,
    Json(req): Json<ToggleFeedbackVisibilityRequest>,
) -> Result<impl IntoResponse, AppError> {
    let feedback = FeedbackRepository::toggle_visibility(
        &pool,
        tenant.restaurant_id,
        feedback_id,
        req.is_public,
    )
    .await?;
    Ok(Json(ApiResponse::success(feedback)))
}
