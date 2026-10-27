use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{
        common::ApiResponse,
        inventory::{CreateInventoryItemRequest, RecordWastageRequest},
    },
    repositories::InventoryRepository,
};

#[derive(Debug, Deserialize)]
pub struct ListMovementsQuery {
    pub item_id: Option<Uuid>,
}

pub async fn list_items(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let items = InventoryRepository::list_items(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(items)))
}

pub async fn create_item(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateInventoryItemRequest>,
) -> Result<impl IntoResponse, AppError> {
    let item = InventoryRepository::create_item(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(item)))
}

pub async fn record_wastage(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<RecordWastageRequest>,
) -> Result<impl IntoResponse, AppError> {
    let wastage = InventoryRepository::record_wastage(
        &pool,
        tenant.restaurant_id,
        req,
        Some(tenant.user.user_id),
    )
    .await?;

    Ok(Json(ApiResponse::with_message(
        wastage,
        "Wastage recorded successfully",
    )))
}

pub async fn list_movements(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<ListMovementsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let movements =
        InventoryRepository::list_movements(&pool, tenant.restaurant_id, query.item_id).await?;
    Ok(Json(ApiResponse::success(movements)))
}
