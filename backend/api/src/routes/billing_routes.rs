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
        billing::{
            CreateRefundRequest, SettleOrderRequest, SplitOrderRequest, UpdateRefundStatusRequest,
        },
        common::ApiResponse,
    },
    repositories::BillingRepository,
};

pub async fn settle_order(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
    Json(req): Json<SettleOrderRequest>,
) -> Result<impl IntoResponse, AppError> {
    let payment = BillingRepository::settle_order(
        &pool,
        tenant.restaurant_id,
        order_id,
        Some(tenant.user.user_id),
        req,
    )
    .await?;

    Ok(Json(ApiResponse::with_message(
        payment,
        "Order settled successfully",
    )))
}

pub async fn split_order(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
    Json(req): Json<SplitOrderRequest>,
) -> Result<impl IntoResponse, AppError> {
    let splits = BillingRepository::split_order(&pool, tenant.restaurant_id, order_id, req).await?;
    Ok(Json(ApiResponse::success(splits)))
}

pub async fn create_refund(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
    Json(req): Json<CreateRefundRequest>,
) -> Result<impl IntoResponse, AppError> {
    let refund = BillingRepository::create_refund(
        &pool,
        tenant.restaurant_id,
        order_id,
        req,
        Some(tenant.user.user_id),
    )
    .await?;

    Ok(Json(ApiResponse::with_message(
        refund,
        "Refund request submitted",
    )))
}

pub async fn update_refund_status(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(refund_id): Path<Uuid>,
    Json(req): Json<UpdateRefundStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let refund = BillingRepository::update_refund_status(
        &pool,
        tenant.restaurant_id,
        refund_id,
        &req.status,
    )
    .await?;

    Ok(Json(ApiResponse::success(refund)))
}

pub async fn get_receipt(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let receipt =
        BillingRepository::generate_receipt(&pool, tenant.restaurant_id, order_id).await?;
    Ok(Json(ApiResponse::success(receipt)))
}
