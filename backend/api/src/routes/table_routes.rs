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
        table::{TransferTableRequest, UpdateTableStatusRequest},
    },
    repositories::TableRepository,
};

pub async fn list_tables(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let tables = TableRepository::list_by_restaurant(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(tables)))
}

pub async fn update_table_status(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(table_id): Path<Uuid>,
    Json(req): Json<UpdateTableStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let table = TableRepository::update_status(
        &pool,
        tenant.restaurant_id,
        table_id,
        &req.status,
        req.active_order_id,
    )
    .await?;

    Ok(Json(ApiResponse::success(table)))
}

pub async fn transfer_table(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<TransferTableRequest>,
) -> Result<impl IntoResponse, AppError> {
    TableRepository::transfer_table(
        &pool,
        tenant.restaurant_id,
        req.from_table_id,
        req.to_table_id,
        req.reason,
        Some(tenant.user.user_id),
    )
    .await?;

    Ok(Json(ApiResponse::with_message(
        serde_json::json!({ "transferred": true }),
        "Table transfer completed successfully",
    )))
}
