use axum::{extract::State, response::IntoResponse, Json};
use sqlx::PgPool;

use crate::{
    auth::TenantContext, error::AppError, models::common::ApiResponse,
    repositories::RestaurantRepository,
};

pub async fn get_current_restaurant(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let restaurant = RestaurantRepository::get_by_id(&pool, tenant.restaurant_id).await?;
    match restaurant {
        Some(r) => Ok(Json(ApiResponse::success(r))),
        None => Err(AppError::NotFound(
            "Restaurant profile not found".to_string(),
        )),
    }
}

pub async fn list_staff_members(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let staff = RestaurantRepository::list_staff(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(staff)))
}
