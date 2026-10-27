use axum::{extract::State, response::IntoResponse, Json};
use sqlx::PgPool;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{
        common::ApiResponse,
        coupon::{RedeemCouponRequest, ValidateCouponRequest},
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
