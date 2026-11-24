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
            AwardPointsRequest, CreateCustomerRequest, CreateReservationRequest,
            UpdateReservationStatusRequest,
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

pub async fn award_points(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Path(customer_id): Path<Uuid>,
    Json(req): Json<AwardPointsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let customer =
        CustomerRepository::award_points(&pool, tenant.restaurant_id, customer_id, req.points)
            .await?;
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
    crate::ws::broadcast_new_reservation(&reservation);
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
        req.status.as_deref(),
        req.table_id,
    )
    .await?;

    // WhatsApp Notification on Status Lifecycle change
    let status_upper = reservation.status.to_uppercase();
    let restaurant = crate::repositories::RestaurantRepository::get_by_id(&pool, tenant.restaurant_id)
        .await
        .ok()
        .flatten();

    let restaurant_name = restaurant.as_ref().map(|r| r.name.as_str()).unwrap_or("The Restaurant");
    let custom_templates = restaurant.as_ref().and_then(|r| r.whatsapp_templates.as_ref());

    let date_str = reservation.reservation_time.format("%d %b %Y").to_string();
    let time_str = reservation.reservation_time.format("%I:%M %p").to_string();

    if status_upper == "CONFIRMED" {
        let table_info = if let Some(tbl_id) = reservation.table_id {
            crate::repositories::TableRepository::get_by_id(&pool, tenant.restaurant_id, tbl_id)
                .await
                .ok()
                .flatten()
        } else {
            None
        };

        let table_number = table_info
            .as_ref()
            .map(|t| t.table_number.as_str())
            .unwrap_or("Reserved");
        let section = table_info.as_ref().map(|t| t.section.as_str());

        let custom_template = custom_templates
            .and_then(|t| t.get("confirmed"))
            .and_then(|v| v.as_str());

        crate::services::WhatsAppService::notify_reservation_confirmed(
            restaurant_name,
            &reservation.customer_name,
            &reservation.customer_phone,
            &date_str,
            &time_str,
            reservation.guest_count,
            table_number,
            section,
            custom_template,
        );
    } else if status_upper == "CANCELLED" {
        let custom_template = custom_templates
            .and_then(|t| t.get("cancelled"))
            .and_then(|v| v.as_str());

        crate::services::WhatsAppService::notify_reservation_cancelled(
            restaurant_name,
            &reservation.customer_name,
            &reservation.customer_phone,
            &date_str,
            &time_str,
            custom_template,
        );
    }

    Ok(Json(ApiResponse::success(reservation)))
}
