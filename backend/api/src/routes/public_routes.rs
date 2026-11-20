use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        common::ApiResponse,
        order::{CreateOrderItemInput, CreateOrderRequest},
    },
    repositories::{menu_repo::MenuRepository, order_repo::OrderRepository},
};

// ─── Handler 1: Get public table by QR token ────────────────────────────────

#[derive(Deserialize)]
pub struct TableTokenQuery {
    pub rid: Uuid,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicTable {
    pub id: Uuid,
    pub table_number: String,
    pub section: String,
    pub status: String,
    pub ordering_enabled: bool,
    #[sqlx(default)]
    pub gst_rate: Option<f64>,
    #[sqlx(default)]
    pub cgst_rate: Option<f64>,
    #[sqlx(default)]
    pub sgst_rate: Option<f64>,
    #[sqlx(default)]
    pub service_charge_rate: Option<f64>,
    #[sqlx(default)]
    pub restaurant_phone: Option<String>,
    #[sqlx(default)]
    pub is_pos_online: bool,
    #[sqlx(default)]
    pub restaurant_status: String,
}

pub async fn get_public_table(
    State(pool): State<PgPool>,
    Path(token): Path<String>,
    Query(q): Query<TableTokenQuery>,
) -> Result<Json<ApiResponse<PublicTable>>, AppError> {
    let mut table = sqlx::query_as::<_, PublicTable>(
        r#"
        SELECT t.id,
               COALESCE(t.table_number, t.number) AS table_number,
               t.section,
               t.status::text AS status,
               t.ordering_enabled,
               COALESCE(r.gst_rate, 5.0)::float8 AS gst_rate,
               COALESCE(r.cgst_rate, r.gst_rate / 2.0, 2.5)::float8 AS cgst_rate,
               COALESCE(r.sgst_rate, r.gst_rate / 2.0, 2.5)::float8 AS sgst_rate,
               COALESCE(r.service_charge_rate, 0.0)::float8 AS service_charge_rate,
               r.phone AS restaurant_phone,
               false AS is_pos_online,
               'ONLINE'::text AS restaurant_status
        FROM tables t
        LEFT JOIN restaurants r ON r.id = t.restaurant_id
        WHERE (COALESCE(t.qr_code_identifier, t.qr_token) = $1)
          AND t.restaurant_id = $2
        "#,
    )
    .bind(&token)
    .bind(q.rid)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Table not found".to_string()))?;

    if !table.ordering_enabled {
        return Err(AppError::Forbidden(
            "Ordering is currently disabled for this table".to_string(),
        ));
    }
    if table.status == "cleaning" {
        return Err(AppError::BadRequest(
            "Table is being cleaned. Please wait a moment.".to_string(),
        ));
    }

    let is_online = crate::gateway::GatewayHeartbeatClient::is_restaurant_online(&pool, q.rid)
        .await
        || crate::ws::has_active_crm_clients();

    table.is_pos_online = is_online;
    table.restaurant_status = if is_online {
        "ONLINE".to_string()
    } else {
        "OFFLINE".to_string()
    };

    Ok(Json(ApiResponse::success(table)))
}

#[derive(Debug, Serialize)]
pub struct RestaurantStatusResponse {
    pub restaurant_id: Uuid,
    pub is_pos_online: bool,
    pub restaurant_status: String,
    pub phone: Option<String>,
    pub message: String,
}

pub async fn get_public_restaurant_status(
    State(pool): State<PgPool>,
    Query(q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<RestaurantStatusResponse>>, AppError> {
    let is_online = crate::gateway::GatewayHeartbeatClient::is_restaurant_online(&pool, q.rid)
        .await
        || crate::ws::has_active_crm_clients();

    let phone: Option<String> = sqlx::query_scalar("SELECT phone FROM restaurants WHERE id = $1")
        .bind(q.rid)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None)
        .flatten();

    let (status, message) = if is_online {
        (
            "ONLINE",
            "Restaurant POS is online and actively receiving orders".to_string(),
        )
    } else {
        (
            "OFFLINE",
            "Restaurant kitchen system is currently offline. Please call staff to place your order directly.".to_string(),
        )
    };

    Ok(Json(ApiResponse::success(RestaurantStatusResponse {
        restaurant_id: q.rid,
        is_pos_online: is_online,
        restaurant_status: status.to_string(),
        phone,
        message,
    })))
}

// ─── Handler 2: Get public menu ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RestaurantIdQuery {
    pub rid: Uuid,
}

pub async fn get_public_menu(
    State(pool): State<PgPool>,
    Query(q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let (categories_res, items_res, rest_res) = tokio::join!(
        MenuRepository::list_categories(&pool, q.rid),
        MenuRepository::list_items(&pool, q.rid, None),
        sqlx::query_as::<_, (Option<f64>, Option<f64>, Option<f64>, Option<f64>)>(
            "SELECT COALESCE(gst_rate, 5.0)::float8, COALESCE(cgst_rate, gst_rate / 2.0, 2.5)::float8, COALESCE(sgst_rate, gst_rate / 2.0, 2.5)::float8, COALESCE(service_charge_rate, 0.0)::float8 FROM restaurants WHERE id = $1"
        )
        .bind(q.rid)
        .fetch_optional(&pool)
    );

    let categories = categories_res?;
    let items: Vec<_> = items_res?
        .into_iter()
        .filter(|item| item.is_available)
        .collect();

    let (gst_rate, cgst_rate, sgst_rate, service_charge_rate) = rest_res
        .ok()
        .flatten()
        .map(|(g, c, s, sc)| {
            (
                g.unwrap_or(5.0),
                c.unwrap_or(2.5),
                s.unwrap_or(2.5),
                sc.unwrap_or(0.0),
            )
        })
        .unwrap_or((5.0, 2.5, 2.5, 0.0));

    Ok(Json(ApiResponse::success(json!({
        "categories": categories,
        "items": items,
        "gst_rate": gst_rate,
        "cgst_rate": cgst_rate,
        "sgst_rate": sgst_rate,
        "service_charge_rate": service_charge_rate,
    }))))
}

// ─── Handler 3: Create public order ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PublicOrderItem {
    pub menu_item_id: Uuid,
    pub item_name: String,
    pub quantity: i32,
    pub unit_price_paise: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PublicCreateOrderRequest {
    pub restaurant_id: Uuid,
    pub table_id: Option<Uuid>,
    pub table_number: Option<String>,
    pub customer_name: String,
    pub customer_phone: String,
    pub items: Vec<PublicOrderItem>,
    pub notes: Option<String>,
}

pub async fn create_public_order(
    State(pool): State<PgPool>,
    Json(req): Json<PublicCreateOrderRequest>,
) -> Result<Json<ApiResponse<crate::models::order::OrderWithItems>>, AppError> {
    if req.customer_name.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Customer name is required".to_string(),
        ));
    }
    if req.customer_phone.trim().len() < 10 {
        return Err(AppError::BadRequest(
            "Customer phone must be at least 10 characters".to_string(),
        ));
    }

    let is_pos_online =
        crate::gateway::GatewayHeartbeatClient::is_restaurant_online(&pool, req.restaurant_id)
            .await
            || crate::ws::has_active_crm_clients();

    if !is_pos_online {
        return Err(AppError::Conflict(
            "RESTAURANT_POS_OFFLINE: Restaurant kitchen system is currently offline. Please call staff to place your order directly.".to_string(),
        ));
    }

    let create_req = CreateOrderRequest {
        order_type: "dine_in".to_string(),
        table_id: req.table_id,
        customer_name: Some(req.customer_name),
        customer_phone: Some(req.customer_phone),
        items: req
            .items
            .into_iter()
            .map(|i| CreateOrderItemInput {
                menu_item_id: Some(i.menu_item_id),
                item_name: i.item_name,
                quantity: i.quantity,
                unit_price_paise: i.unit_price_paise,
                notes: i.notes,
            })
            .collect(),
        notes: req.notes,
        discount_paise: None,
        applied_coupon_code: None,
        pickup_reference: None,
        customer_id: None,
    };

    let order = OrderRepository::create_order(&pool, req.restaurant_id, None, create_req).await?;

    // Broadcast to WS clients (Phase 2 dependency — compiles once ws.rs is in place)
    crate::ws::broadcast_new_order(&order);

    Ok(Json(ApiResponse::success(order)))
}

// ─── Handler 4: Get customer orders by phone ───────────────────────────────

#[derive(Deserialize)]
pub struct CustomerOrdersQuery {
    pub rid: Uuid,
    pub phone: String,
    pub table_id: Option<Uuid>,
}

pub async fn get_customer_orders(
    State(pool): State<PgPool>,
    Query(q): Query<CustomerOrdersQuery>,
) -> Result<Json<ApiResponse<Vec<crate::models::order::OrderWithItems>>>, AppError> {
    let clean_phone = q
        .phone
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>();
    if clean_phone.len() < 10 {
        return Ok(Json(ApiResponse::success(Vec::new())));
    }

    let orders =
        OrderRepository::list_orders_by_customer_phone(&pool, q.rid, &clean_phone, q.table_id)
            .await?;

    Ok(Json(ApiResponse::success(orders)))
}
