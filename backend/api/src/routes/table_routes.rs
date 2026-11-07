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
        table::{AssignTableStaffRequest, TransferTableRequest, UpdateTableStatusRequest},
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
        req.status.as_deref(),
        req.active_order_id,
        req.assigned_staff_id.map(Some),
    )
    .await?;

    Ok(Json(ApiResponse::success(table)))
}

pub async fn assign_table_staff(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(table_id): Path<Uuid>,
    Json(req): Json<AssignTableStaffRequest>,
) -> Result<impl IntoResponse, AppError> {
    let table = TableRepository::assign_staff(
        &pool,
        tenant.restaurant_id,
        table_id,
        req.assigned_staff_id,
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
