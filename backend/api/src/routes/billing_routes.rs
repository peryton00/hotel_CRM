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
            CreatePaymentRequest, CreateRefundRequest, SettleOrderRequest, SplitOrderRequest,
            UpdateRefundStatusRequest,
        },
        common::ApiResponse,
    },
    repositories::BillingRepository,
};

pub async fn record_payment(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreatePaymentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let payment = BillingRepository::record_payment(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::with_message(
        payment,
        "Payment recorded successfully",
    )))
}

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

    crate::ws::broadcast_order_status(order_id, None, None, "COMPLETED", Some("PAID"));

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

pub async fn list_split_bills(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    let order_id = query
        .get("order_id")
        .and_then(|id| Uuid::parse_str(id).ok());
    let splits = BillingRepository::get_split_bills(&pool, tenant.restaurant_id, order_id).await?;
    Ok(Json(ApiResponse::success(splits)))
}

pub async fn get_order_split_bills(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(order_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let splits =
        BillingRepository::get_split_bills(&pool, tenant.restaurant_id, Some(order_id)).await?;
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
    if !matches!(
        tenant.staff_role.to_ascii_uppercase().as_str(),
        "ADMIN" | "MANAGER"
    ) {
        return Err(AppError::Forbidden(
            "A manager must approve refund decisions.".into(),
        ));
    }
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

pub async fn list_refunds(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let data:Vec<serde_json::Value>=sqlx::query_scalar("SELECT to_jsonb(r) || jsonb_build_object('order_number',o.order_number,'customer_name',o.customer_name,'split_bill_id',p.split_bill_id,'staff_name',s.name) FROM refunds r JOIN orders o ON o.id=r.order_id LEFT JOIN payments p ON p.id=r.payment_id LEFT JOIN staff_members s ON s.id=r.processed_by_staff_id WHERE r.restaurant_id=$1 ORDER BY r.created_at DESC,r.id").bind(tenant.restaurant_id).fetch_all(&pool).await?;
    Ok(Json(ApiResponse::success(data)))
}
