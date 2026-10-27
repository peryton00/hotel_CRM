use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{
        common::ApiResponse,
        customer::{
            CreateCustomerRequest, CreateReservationRequest, UpdateReservationStatusRequest,
        },
    },
    repositories::CustomerRepository,
};

#[derive(Debug, Deserialize)]
pub struct CustomerSearchQuery {
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReservationQuery {
    pub from_time: Option<DateTime<Utc>>,
}

pub async fn list_customers(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<CustomerSearchQuery>,
) -> Result<impl IntoResponse, AppError> {
    let customers =
        CustomerRepository::list_customers(&pool, tenant.restaurant_id, query.search).await?;
    Ok(Json(ApiResponse::success(customers)))
}

pub async fn create_customer(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateCustomerRequest>,
) -> Result<impl IntoResponse, AppError> {
    let customer = CustomerRepository::create_customer(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(customer)))
}

pub async fn list_reservations(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<ReservationQuery>,
) -> Result<impl IntoResponse, AppError> {
    let reservations =
        CustomerRepository::list_reservations(&pool, tenant.restaurant_id, query.from_time).await?;
    Ok(Json(ApiResponse::success(reservations)))
}

pub async fn create_reservation(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(req): Json<CreateReservationRequest>,
) -> Result<impl IntoResponse, AppError> {
    let reservation =
        CustomerRepository::create_reservation(&pool, tenant.restaurant_id, req).await?;
    Ok(Json(ApiResponse::success(reservation)))
}

pub async fn update_reservation_status(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(reservation_id): Path<Uuid>,
    Json(req): Json<UpdateReservationStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let reservation = CustomerRepository::update_reservation_status(
        &pool,
        tenant.restaurant_id,
        reservation_id,
        &req.status,
    )
    .await?;

    Ok(Json(ApiResponse::success(reservation)))
}
