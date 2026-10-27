use axum::{
    extract::{Path, Query, State},
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
        common::{ApiResponse, PaginationQuery},
        order::{CreateOrderRequest, UpdateOrderStatusRequest},
    },
    repositories::OrderRepository,
};

#[derive(Debug, Deserialize)]
pub struct ListOrdersQuery {
    pub status: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationQuery,
}

pub async fn list_orders(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<ListOrdersQuery>,
) -> Result<impl IntoResponse, AppError> {
    let orders =
        OrderRepository::list_orders(&pool, tenant.restaurant_id, query.status, query.pagination)
            .await?;

    Ok(Json(ApiResponse::success(orders)))
}

pub async fn create_order(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateOrderRequest>,
) -> Result<impl IntoResponse, AppError> {
    let order =
        OrderRepository::create_order(&pool, tenant.restaurant_id, Some(tenant.user.user_id), req)
            .await?;

    Ok(Json(ApiResponse::success(order)))
}

pub async fn get_order(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let order = OrderRepository::get_order(&pool, tenant.restaurant_id, order_id).await?;
    match order {
        Some(o) => Ok(Json(ApiResponse::success(o))),
        None => Err(AppError::NotFound("Order not found".to_string())),
    }
}

pub async fn update_order_status(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
    Json(req): Json<UpdateOrderStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let order = OrderRepository::update_status(
        &pool,
        tenant.restaurant_id,
        order_id,
        &req.status,
        req.notes,
        Some(tenant.user.user_id),
    )
    .await?;

    Ok(Json(ApiResponse::success(order)))
}
