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
    repositories::{
        customer_repo::CustomerRepository, feedback_repo::FeedbackRepository,
        menu_repo::MenuRepository, order_repo::OrderRepository,
    },
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
    pub current_seating_session_id: Option<Uuid>,
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
               t.current_seating_session_id,
               COALESCE(r.gst_rate, 5.0)::float8 AS gst_rate,
               COALESCE(r.cgst_rate, r.gst_rate / 2.0, 2.5)::float8 AS cgst_rate,
               COALESCE(r.sgst_rate, r.gst_rate / 2.0, 2.5)::float8 AS sgst_rate,
               COALESCE(r.service_charge_rate, 0.0)::float8 AS service_charge_rate,
               r.phone AS restaurant_phone,
               false AS is_pos_online,
               'ONLINE'::text AS restaurant_status
        FROM tables t
        LEFT JOIN restaurants r ON r.id = t.restaurant_id
        WHERE (
            COALESCE(t.qr_code_identifier, t.qr_token) = $1
            OR LOWER(t.number) = LOWER($1)
            OR LOWER(COALESCE(t.table_number, '')) = LOWER($1)
            OR LOWER(REPLACE(t.number, 'T-', '')) = LOWER($1)
            OR LOWER(REPLACE(t.number, 'T-0', '')) = LOWER($1)
            OR LOWER(REPLACE(COALESCE(t.table_number, ''), 'tbl-', '')) = LOWER($1)
            OR LOWER(REPLACE(COALESCE(t.table_number, ''), 'tbl-0', '')) = LOWER($1)
            OR LOWER(t.number) = LOWER(CONCAT('T-', LPAD($1, 2, '0')))
            OR LOWER(COALESCE(t.table_number, '')) = LOWER(CONCAT('tbl-', LPAD($1, 2, '0')))
        )
          AND t.restaurant_id = $2
        "#,
    )
    .bind(&token)
    .bind(q.rid)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Table not found".to_string()))?;

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
    pub seating_session_id: Option<Uuid>,
    pub items: Vec<PublicOrderItem>,
    pub notes: Option<String>,
    pub coupon_code: Option<String>,
    pub discount_paise: Option<i64>,
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

    if req.items.is_empty() {
        return Err(AppError::BadRequest(
            "Order must contain at least one item".to_string(),
        ));
    }
    for item in &req.items {
        if item.quantity <= 0 {
            return Err(AppError::BadRequest(
                "Item quantity must be greater than zero".to_string(),
            ));
        }
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

    // PentAGI Replay & Rapid Double-Click Defense:
    // If an identical order from this phone was placed in the last 4 seconds for this table, return existing order
    if let Some(tbl_id) = req.table_id {
        let recent_order_id: Option<Uuid> = sqlx::query_scalar(
            r#"
            SELECT id FROM orders 
            WHERE table_id = $1 
              AND customer_phone = $2 
              AND restaurant_id = $3 
              AND created_at > NOW() - INTERVAL '4 seconds'
            ORDER BY created_at DESC 
            LIMIT 1
            "#,
        )
        .bind(tbl_id)
        .bind(&req.customer_phone)
        .bind(req.restaurant_id)
        .fetch_optional(&pool)
        .await?;

        if let Some(oid) = recent_order_id {
            if let Some(existing_order) =
                OrderRepository::get_order(&pool, req.restaurant_id, oid).await?
            {
                tracing::warn!(
                    "PentAGI: Blocked duplicate order submission within 4s window for order {oid}"
                );
                return Ok(Json(ApiResponse::success(existing_order)));
            }
        }
    }

    // Pattern 3 Host-Seated Verification + PentAGI Session Pinning
    if let Some(tbl_id) = req.table_id {
        let table_record: Option<(String, bool, Option<Uuid>)> = sqlx::query_as(
            "SELECT status::text, ordering_enabled, current_seating_session_id FROM tables WHERE id = $1 AND restaurant_id = $2",
        )
        .bind(tbl_id)
        .bind(req.restaurant_id)
        .fetch_optional(&pool)
        .await?;

        match table_record {
            Some((status, ordering_enabled, current_session)) => {
                if !ordering_enabled {
                    return Err(AppError::Forbidden(
                        "Ordering is currently disabled for this table.".to_string(),
                    ));
                }
                if status != "OCCUPIED" {
                    return Err(AppError::Forbidden(
                        "TABLE_UNSEATED: Table is currently unseated. Please ask restaurant staff to seat this table before ordering.".to_string(),
                    ));
                }
                if let (Some(tbl_session), Some(req_session)) =
                    (current_session, req.seating_session_id)
                {
                    if tbl_session != req_session {
                        return Err(AppError::Forbidden(
                            "EXPIRED_SEATING_SESSION: Dining session has concluded or is invalid. Please refresh the menu.".to_string(),
                        ));
                    }
                }
            }
            None => {
                return Err(AppError::NotFound(
                    "Table not found for this restaurant".to_string(),
                ));
            }
        }
    } else if let Some(ref num) = req.table_number {
        let table_record: Option<(String, bool, Option<Uuid>)> = sqlx::query_as(
            "SELECT status::text, ordering_enabled, current_seating_session_id FROM tables WHERE (number = $1 OR table_number = $1) AND restaurant_id = $2",
        )
        .bind(num)
        .bind(req.restaurant_id)
        .fetch_optional(&pool)
        .await?;

        match table_record {
            Some((status, ordering_enabled, current_session)) => {
                if !ordering_enabled {
                    return Err(AppError::Forbidden(
                        "Ordering is currently disabled for this table.".to_string(),
                    ));
                }
                if status != "OCCUPIED" {
                    return Err(AppError::Forbidden(
                        "TABLE_UNSEATED: Table is currently unseated. Please ask restaurant staff to seat this table before ordering.".to_string(),
                    ));
                }
                if let (Some(tbl_session), Some(req_session)) =
                    (current_session, req.seating_session_id)
                {
                    if tbl_session != req_session {
                        return Err(AppError::Forbidden(
                            "EXPIRED_SEATING_SESSION: Dining session has concluded or is invalid. Please refresh the menu.".to_string(),
                        ));
                    }
                }
            }
            None => {
                return Err(AppError::NotFound(
                    "Table not found for this restaurant".to_string(),
                ));
            }
        }
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
        discount_paise: req.discount_paise,
        applied_coupon_code: req.coupon_code,
        pickup_reference: None,
        customer_id: None,
        seating_session_id: req.seating_session_id,
    };

    let order = OrderRepository::create_order(&pool, req.restaurant_id, None, create_req).await?;

    // Broadcast to WS & SSE clients
    crate::ws::broadcast_new_order(&order);

    if let Some(table_id) = order.order.table_id {
        let table_num = req.table_number.unwrap_or_default();
        crate::ws::broadcast_table_status(
            table_id,
            &table_num,
            "OCCUPIED",
            true,
            req.seating_session_id,
        );
    }

    Ok(Json(ApiResponse::success(order)))
}

// ─── Handler 4: Get customer orders by phone ───────────────────────────────

#[derive(Deserialize)]
pub struct CustomerOrdersQuery {
    pub rid: Uuid,
    pub phone: Option<String>,
    pub table_id: Option<Uuid>,
}

pub async fn get_customer_orders(
    State(pool): State<PgPool>,
    Query(q): Query<CustomerOrdersQuery>,
) -> Result<Json<ApiResponse<Vec<crate::models::order::OrderWithItems>>>, AppError> {
    let clean_phone = q
        .phone
        .as_deref()
        .map(|p| p.chars().filter(|c| c.is_ascii_digit()).collect::<String>())
        .unwrap_or_default();

    if clean_phone.len() < 10 && q.table_id.is_none() {
        return Ok(Json(ApiResponse::success(Vec::new())));
    }

    let orders =
        OrderRepository::list_orders_by_customer_phone(&pool, q.rid, &clean_phone, q.table_id)
            .await?;

    Ok(Json(ApiResponse::success(orders)))
}

// ─── Handler 5: Public Reservations ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PublicReservationRequest {
    pub restaurant_id: Uuid,
    pub customer_name: String,
    pub customer_phone: String,
    pub guest_count: i32,
    pub reservation_time: chrono::DateTime<chrono::Utc>,
    pub special_requests: Option<String>,
    pub honeypot: Option<String>,
}

pub async fn create_public_reservation(
    State(pool): State<PgPool>,
    Json(req): Json<PublicReservationRequest>,
) -> Result<Json<ApiResponse<crate::models::customer::Reservation>>, AppError> {
    // PentAGI Honeypot anti-bot check
    if req
        .honeypot
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(AppError::BadRequest(
            "Invalid submission request".to_string(),
        ));
    }

    if req.customer_name.trim().len() < 2 {
        return Err(AppError::BadRequest(
            "Name must be at least 2 characters".to_string(),
        ));
    }
    let clean_phone = req
        .customer_phone
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>();
    if clean_phone.len() < 10 {
        return Err(AppError::BadRequest(
            "Please provide a valid 10-digit mobile number".to_string(),
        ));
    }
    if req.guest_count < 1 || req.guest_count > 30 {
        return Err(AppError::BadRequest(
            "Party size must be between 1 and 30 guests".to_string(),
        ));
    }

    // PentAGI & Gravitas trust boundary: prevent booking a date before today or in the past
    let now = chrono::Utc::now();
    if req.reservation_time < now - chrono::Duration::minutes(15) {
        return Err(AppError::BadRequest(
            "Reservation date cannot be before today".to_string(),
        ));
    }

    // PentAGI Rapid Double-Click Defense:
    let recent_reservation: Option<crate::models::customer::Reservation> = sqlx::query_as(
        r#"
        SELECT id, restaurant_id, table_id, customer_id, customer_name,
               COALESCE(customer_phone, '') AS customer_phone,
               guest_count, reservation_time, status::text AS status, special_requests,
               created_at, created_at AS updated_at
        FROM reservations
        WHERE customer_phone = $1
          AND restaurant_id = $2
          AND created_at > NOW() - INTERVAL '5 seconds'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&clean_phone)
    .bind(req.restaurant_id)
    .fetch_optional(&pool)
    .await?;

    if let Some(existing) = recent_reservation {
        tracing::warn!(
            "PentAGI: Blocked duplicate reservation submission within 5s window for reservation {}",
            existing.id
        );
        return Ok(Json(ApiResponse::success(existing)));
    }

    let create_req = crate::models::customer::CreateReservationRequest {
        table_id: None,
        customer_id: None,
        customer_name: req.customer_name.trim().to_string(),
        customer_phone: clean_phone,
        guest_count: req.guest_count,
        reservation_time: req.reservation_time,
        special_requests: req.special_requests.map(|s| s.trim().to_string()),
    };

    let reservation =
        CustomerRepository::create_reservation(&pool, req.restaurant_id, create_req).await?;

    crate::ws::broadcast_new_reservation(&reservation);

    Ok(Json(ApiResponse::success(reservation)))
}

// ─── Handler 6: Public Feedback ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PublicFeedbackRequest {
    pub restaurant_id: Uuid,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub rating: i32,
    pub comments: Option<String>,
    pub honeypot: Option<String>,
}

pub async fn create_public_feedback(
    State(pool): State<PgPool>,
    Json(req): Json<PublicFeedbackRequest>,
) -> Result<Json<ApiResponse<crate::models::feedback::CustomerFeedback>>, AppError> {
    // PentAGI Honeypot anti-bot check
    if req
        .honeypot
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(AppError::BadRequest(
            "Invalid submission request".to_string(),
        ));
    }

    if req.rating < 1 || req.rating > 5 {
        return Err(AppError::BadRequest(
            "Rating must be between 1 and 5 stars".to_string(),
        ));
    }

    let clean_phone = req
        .customer_phone
        .map(|p| p.chars().filter(|c| c.is_ascii_digit()).collect::<String>());

    // PentAGI Rapid Double-Click Defense:
    if let Some(ref phone) = clean_phone {
        let recent_feedback: Option<crate::models::feedback::CustomerFeedback> = sqlx::query_as(
            r#"
            SELECT id, restaurant_id, order_id, customer_name, customer_phone,
                   rating, comments, resolution_note, is_resolved,
                   COALESCE(is_public, FALSE) as is_public,
                   created_at, updated_at
            FROM customer_feedback
            WHERE customer_phone = $1
              AND restaurant_id = $2
              AND created_at > NOW() - INTERVAL '5 seconds'
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(phone)
        .bind(req.restaurant_id)
        .fetch_optional(&pool)
        .await?;

        if let Some(existing) = recent_feedback {
            tracing::warn!(
                "PentAGI: Blocked duplicate feedback submission within 5s window for feedback {}",
                existing.id
            );
            return Ok(Json(ApiResponse::success(existing)));
        }
    }

    let create_req = crate::models::feedback::CreateFeedbackRequest {
        order_id: None,
        customer_name: req.customer_name.map(|s| s.trim().to_string()),
        customer_phone: clean_phone,
        rating: req.rating,
        comments: req.comments.map(|s| s.trim().to_string()),
    };

    let feedback =
        FeedbackRepository::create_feedback(&pool, req.restaurant_id, create_req).await?;

    Ok(Json(ApiResponse::success(feedback)))
}

pub async fn get_public_feedback(
    State(pool): State<PgPool>,
    Query(q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<Vec<crate::models::feedback::CustomerFeedback>>>, AppError> {
    let list = FeedbackRepository::list_public_feedback(&pool, q.rid).await?;
    Ok(Json(ApiResponse::success(list)))
}

// ─── Handler 7: Public Active Offers/Coupons ─────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PublicCouponsQuery {
    pub rid: Uuid,
    pub phone: Option<String>,
}

pub async fn get_public_coupons(
    State(pool): State<PgPool>,
    Query(q): Query<PublicCouponsQuery>,
) -> Result<Json<ApiResponse<Vec<crate::models::coupon::Coupon>>>, AppError> {
    let clean_phone = q
        .phone
        .as_deref()
        .map(|p| p.chars().filter(|c| c.is_ascii_digit()).collect::<String>())
        .filter(|p| p.len() >= 10);

    let Some(phone_num) = clean_phone else {
        // Without a valid linked customer phone, return no coupons (only customer-held coupons are shown)
        return Ok(Json(ApiResponse::success(vec![])));
    };

    // Query coupons specifically assigned to this customer via coupon_assignments
    let coupons = sqlx::query_as::<_, crate::models::coupon::Coupon>(
        r#"
        SELECT c.id, c.restaurant_id, c.code, c.description,
               c.discount_type::text AS discount_type,
               c.discount_value::float8 AS discount_value,
               c.min_order_amount_paise, c.max_discount_amount_paise, c.one_time_per_customer,
               c.is_active, c.start_date, c.end_date, c.created_at, c.updated_at
        FROM coupons c
        INNER JOIN coupon_assignments ca ON ca.coupon_id = c.id
        INNER JOIN customers cust ON cust.id = ca.customer_id
        WHERE c.restaurant_id = $1
          AND c.is_active = true
          AND (
            cust.phone = $2
            OR cust.phone_e164 = $2
            OR RIGHT(cust.phone, 10) = RIGHT($2, 10)
          )
        ORDER BY c.created_at DESC
        "#,
    )
    .bind(q.rid)
    .bind(&phone_num)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    Ok(Json(ApiResponse::success(coupons)))
}

// ─── Handler 8: Public Restaurant Info & Metadata ────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicRestaurantInfo {
    pub id: Uuid,
    pub name: String,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub currency_symbol: String,
    pub gst_rate: f64,
    pub service_charge_rate: f64,
    #[sqlx(default)]
    pub google_review_url: Option<String>,
    #[sqlx(default)]
    pub is_pos_online: bool,
    #[sqlx(default)]
    pub restaurant_status: String,
}

pub async fn get_public_restaurant_info(
    State(pool): State<PgPool>,
    Query(q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<PublicRestaurantInfo>>, AppError> {
    let mut info = sqlx::query_as::<_, PublicRestaurantInfo>(
        r#"
        SELECT id, name, tagline, description, phone, email, address, city, state,
               currency_symbol,
               COALESCE(gst_rate, 5.0)::float8 AS gst_rate,
               COALESCE(service_charge_rate, 0.0)::float8 AS service_charge_rate,
               google_review_url,
               false AS is_pos_online,
               'ONLINE'::text AS restaurant_status
        FROM restaurants
        WHERE id = $1
        "#,
    )
    .bind(q.rid)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Restaurant not found".to_string()))?;

    let is_online = crate::gateway::GatewayHeartbeatClient::is_restaurant_online(&pool, q.rid)
        .await
        || crate::ws::has_active_crm_clients();

    info.is_pos_online = is_online;
    info.restaurant_status = if is_online {
        "ONLINE".to_string()
    } else {
        "OFFLINE".to_string()
    };

    Ok(Json(ApiResponse::success(info)))
}

// ─── Handler 9: Public Tables List ───────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicTableSummary {
    pub id: Uuid,
    pub number: String,
    pub table_number: Option<String>,
    pub section: String,
    pub capacity: i32,
    pub status: String,
    pub ordering_enabled: bool,
    pub token: String,
}

pub async fn list_public_tables(
    State(pool): State<PgPool>,
    Query(q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<Vec<PublicTableSummary>>>, AppError> {
    let tables = sqlx::query_as::<_, PublicTableSummary>(
        r#"
        SELECT id, number, table_number, section, capacity,
               status::text AS status, ordering_enabled,
               COALESCE(qr_code_identifier, qr_token, number) AS token
        FROM tables
        WHERE restaurant_id = $1
        ORDER BY number ASC
        "#,
    )
    .bind(q.rid)
    .fetch_all(&pool)
    .await?;

    Ok(Json(ApiResponse::success(tables)))
}

// ─── Handler 10: Public Loyalty Milestone Policy & Customer Loyalty Progress ──

#[derive(Debug, Deserialize)]
pub struct CustomerLoyaltyQuery {
    pub rid: Uuid,
    pub phone: String,
}

#[derive(Debug, Serialize)]
pub struct PublicLoyaltyMilestoneConfig {
    pub target_visits: i32,
    pub reward_type: String,
    pub discount_percent: Option<f64>,
    pub max_discount_paise: Option<i64>,
    pub flat_discount_paise: Option<i64>,
    pub coupon_code: String,
    pub title: String,
    pub description: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct PublicCustomerLoyaltyResponse {
    pub phone: String,
    pub name: Option<String>,
    pub visit_count: i32,
    pub loyalty_tier: String,
    pub target_visits: i32,
    pub milestone_unlocked: bool,
    pub eligible_coupon_code: String,
    pub reward_title: String,
    pub reward_description: String,
    pub discount_percent: Option<f64>,
    pub max_discount_paise: Option<i64>,
}

pub async fn get_public_loyalty_config(
    State(_pool): State<PgPool>,
    Query(_q): Query<RestaurantIdQuery>,
) -> Result<Json<ApiResponse<PublicLoyaltyMilestoneConfig>>, AppError> {
    Ok(Json(ApiResponse::success(PublicLoyaltyMilestoneConfig {
        target_visits: 7,
        reward_type: "PERCENT_DISCOUNT".to_string(),
        discount_percent: Some(50.0),
        max_discount_paise: Some(50000),
        flat_discount_paise: Some(30000),
        coupon_code: "VISIT7FREE".to_string(),
        title: "7th Visit Celebration Reward".to_string(),
        description:
            "Enjoy 50% OFF your bill (up to ₹500) as a special thank-you on your 7th dining visit."
                .to_string(),
        is_active: true,
    })))
}

pub async fn get_public_customer_loyalty(
    State(pool): State<PgPool>,
    Query(q): Query<CustomerLoyaltyQuery>,
) -> Result<Json<ApiResponse<PublicCustomerLoyaltyResponse>>, AppError> {
    let clean_phone: String = q.phone.chars().filter(|c| c.is_ascii_digit()).collect();

    #[derive(sqlx::FromRow)]
    struct CustomerLoyaltyRow {
        name: Option<String>,
        visit_count: Option<i32>,
        loyalty_tier: Option<String>,
    }

    // Query customer from database by phone or phone_e164
    let row = sqlx::query_as::<_, CustomerLoyaltyRow>(
        r#"
        SELECT name,
               COALESCE(total_orders, visit_count, 0) AS visit_count,
               COALESCE(loyalty_tier::text, 'BRONZE') AS loyalty_tier
        FROM customers
        WHERE restaurant_id = $1
          AND (
            phone = $2
            OR phone_e164 = $2
            OR phone = $3
            OR phone_e164 = $3
            OR RIGHT(phone, 10) = RIGHT($2, 10)
          )
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(q.rid)
    .bind(&clean_phone)
    .bind(format!("+91{}", clean_phone.trim_start_matches("91")))
    .fetch_optional(&pool)
    .await?;

    let target_visits = 7;
    let (mut name, mut visits, tier) = match row {
        Some(r) => (
            r.name.filter(|n| !n.trim().is_empty()),
            r.visit_count.unwrap_or(0),
            r.loyalty_tier.unwrap_or_else(|| "BRONZE".to_string()),
        ),
        None => (None, 0, "BRONZE".to_string()),
    };

    // Fallback: If customer record did not have a name, look for recent order under this phone
    if name.is_none() {
        if let Ok(Some(order_name)) = sqlx::query_scalar::<_, String>(
            r#"
            SELECT customer_name
            FROM orders
            WHERE restaurant_id = $1
              AND (
                customer_phone = $2
                OR customer_phone_e164 = $2
                OR RIGHT(customer_phone, 10) = RIGHT($2, 10)
              )
              AND customer_name IS NOT NULL
              AND TRIM(customer_name) != ''
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(q.rid)
        .bind(&clean_phone)
        .fetch_optional(&pool)
        .await
        {
            name = Some(order_name);
        }
    }

    // Fallback: If visit_count is 0, count orders from orders table
    if visits == 0 {
        if let Ok(Some(cnt)) = sqlx::query_scalar::<_, i32>(
            r#"
            SELECT COUNT(*)::int
            FROM orders
            WHERE restaurant_id = $1
              AND (
                customer_phone = $2
                OR customer_phone_e164 = $2
                OR RIGHT(customer_phone, 10) = RIGHT($2, 10)
              )
            "#,
        )
        .bind(q.rid)
        .bind(&clean_phone)
        .fetch_optional(&pool)
        .await
        {
            if cnt > 0 {
                visits = cnt;
            }
        }
    }

    let milestone_unlocked = visits >= target_visits;

    Ok(Json(ApiResponse::success(PublicCustomerLoyaltyResponse {
        phone: clean_phone,
        name,
        visit_count: visits,
        loyalty_tier: tier,
        target_visits,
        milestone_unlocked,
        eligible_coupon_code: "VISIT7FREE".to_string(),
        reward_title: "7th Visit Celebration Reward".to_string(),
        reward_description:
            "Enjoy 50% OFF your bill (up to ₹500) as a special thank-you on your 7th dining visit."
                .to_string(),
        discount_percent: Some(50.0),
        max_discount_paise: Some(50000),
    })))
}

// ─── Handler 11: Public Customer Profile Update ──────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateCustomerProfileRequest {
    pub restaurant_id: Uuid,
    pub phone: String,
    pub name: String,
}

pub async fn update_public_customer_profile(
    State(pool): State<PgPool>,
    Json(req): Json<UpdateCustomerProfileRequest>,
) -> Result<Json<ApiResponse<PublicCustomerLoyaltyResponse>>, AppError> {
    let clean_phone: String = req.phone.chars().filter(|c| c.is_ascii_digit()).collect();
    let trimmed_name = req.name.trim().to_string();

    if clean_phone.len() < 10 {
        return Err(AppError::BadRequest(
            "Valid 10-digit mobile number required".to_string(),
        ));
    }
    if trimmed_name.is_empty() {
        return Err(AppError::BadRequest("Name cannot be empty".to_string()));
    }

    let e164 = if clean_phone.starts_with("91") && clean_phone.len() == 12 {
        format!("+{}", clean_phone)
    } else {
        format!("+91{}", clean_phone.trim_start_matches("91"))
    };

    // Upsert customer name
    sqlx::query(
        r#"
        INSERT INTO customers (restaurant_id, name, phone, phone_e164, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (restaurant_id, phone) DO UPDATE
        SET name = EXCLUDED.name,
            phone_e164 = COALESCE(EXCLUDED.phone_e164, customers.phone_e164),
            updated_at = NOW()
        "#,
    )
    .bind(req.restaurant_id)
    .bind(&trimmed_name)
    .bind(&clean_phone)
    .bind(&e164)
    .execute(&pool)
    .await?;

    // Also update any orders under this phone that had no name or older name
    let _ = sqlx::query(
        r#"
        UPDATE orders
        SET customer_name = $1
        WHERE restaurant_id = $2
          AND (customer_phone = $3 OR customer_phone_e164 = $3 OR RIGHT(customer_phone, 10) = RIGHT($3, 10))
          AND (customer_name IS NULL OR customer_name = '' OR customer_name = 'Guest')
        "#,
    )
    .bind(&trimmed_name)
    .bind(req.restaurant_id)
    .bind(&clean_phone)
    .execute(&pool)
    .await;

    // Return the updated loyalty response
    get_public_customer_loyalty(
        State(pool),
        Query(CustomerLoyaltyQuery {
            rid: req.restaurant_id,
            phone: clean_phone,
        }),
    )
    .await
}
