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
        common::ApiResponse,
        menu::{
            CreateMenuCategoryRequest, CreateMenuItemRequest, UpdateItemAvailabilityRequest,
            UpdateMenuItemRequest,
        },
    },
    repositories::MenuRepository,
};

#[derive(Debug, Deserialize)]
pub struct ListMenuQuery {
    pub category_id: Option<Uuid>,
}

pub async fn list_categories(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let categories = MenuRepository::list_categories(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(categories)))
}

pub async fn create_category(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateMenuCategoryRequest>,
) -> Result<impl IntoResponse, AppError> {
    let category = MenuRepository::create_category(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(category)))
}

pub async fn delete_category(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(category_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    MenuRepository::delete_category(&pool, tenant.restaurant_id, category_id).await?;
    Ok(Json(ApiResponse::with_message(
        serde_json::json!({ "deleted": true }),
        "Menu category deleted successfully",
    )))
}

pub async fn list_items(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<ListMenuQuery>,
) -> Result<impl IntoResponse, AppError> {
    let items = MenuRepository::list_items(&pool, tenant.restaurant_id, query.category_id).await?;
    Ok(Json(ApiResponse::success(items)))
}

pub async fn create_item(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateMenuItemRequest>,
) -> Result<impl IntoResponse, AppError> {
    let item = MenuRepository::create_item(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(item)))
}

pub async fn update_item(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(item_id): Path<Uuid>,
    Json(req): Json<UpdateMenuItemRequest>,
) -> Result<impl IntoResponse, AppError> {
    let item = MenuRepository::update_item(&pool, tenant.restaurant_id, item_id, req).await?;
    Ok(Json(ApiResponse::success(item)))
}

pub async fn delete_item(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(item_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    MenuRepository::delete_item(&pool, tenant.restaurant_id, item_id).await?;
    Ok(Json(ApiResponse::with_message(
        serde_json::json!({ "deleted": true }),
        "Menu item deleted successfully",
    )))
}

pub async fn update_availability(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(item_id): Path<Uuid>,
    Json(req): Json<UpdateItemAvailabilityRequest>,
) -> Result<impl IntoResponse, AppError> {
    let item =
        MenuRepository::update_availability(&pool, tenant.restaurant_id, item_id, req.is_available)
            .await?;

    Ok(Json(ApiResponse::success(item)))
}
