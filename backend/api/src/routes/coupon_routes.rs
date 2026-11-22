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
        coupon::{
            CreateCouponRequest, RedeemCouponRequest, UpdateCouponRequest,
            UpdateCouponStatusRequest, ValidateCouponRequest,
        },
    },
    repositories::CouponRepository,
};

pub async fn list_coupons(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let coupons = CouponRepository::list_coupons(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(coupons)))
}

pub async fn create_coupon(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateCouponRequest>,
) -> Result<impl IntoResponse, AppError> {
    let coupon = CouponRepository::create_coupon(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(coupon)))
}

pub async fn update_coupon_status(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(coupon_id): Path<Uuid>,
    Json(req): Json<UpdateCouponStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let coupon =
        CouponRepository::update_status(&pool, tenant.restaurant_id, coupon_id, req.is_active)
            .await?;
    Ok(Json(ApiResponse::success(coupon)))
}

pub async fn update_coupon(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(coupon_id): Path<Uuid>,
    Json(req): Json<UpdateCouponRequest>,
) -> Result<impl IntoResponse, AppError> {
    let coupon =
        CouponRepository::update_coupon(&pool, tenant.restaurant_id, coupon_id, req).await?;
    Ok(Json(ApiResponse::success(coupon)))
}

pub async fn delete_coupon(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(coupon_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    CouponRepository::delete_coupon(&pool, tenant.restaurant_id, coupon_id).await?;
    Ok(Json(ApiResponse::with_message(
        serde_json::json!({ "deleted": true }),
        "Coupon deleted successfully",
    )))
}

pub async fn validate_coupon(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<ValidateCouponRequest>,
) -> Result<impl IntoResponse, AppError> {
    let result = CouponRepository::validate_coupon(&pool, tenant.restaurant_id, &req).await?;
    Ok(Json(ApiResponse::success(result)))
}

pub async fn redeem_coupon(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<RedeemCouponRequest>,
) -> Result<impl IntoResponse, AppError> {
    let redemption = CouponRepository::redeem_coupon(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::with_message(
        redemption,
        "Coupon redeemed successfully",
    )))
}
