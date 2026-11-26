#[path = "sqlite_billing.rs"]
mod billing;
#[path = "sqlite_catalog.rs"]
mod catalog_admin;
#[path = "sqlite_coupons.rs"]
mod coupons;
#[path = "sqlite_floor.rs"]
mod floor;
#[path = "sqlite_guest_records.rs"]
mod guest_records;
#[path = "sqlite_inventory.rs"]
mod inventory;
#[path = "sqlite_reports.rs"]
mod reports;
#[path = "sqlite_team.rs"]
mod team;
use crate::{
    error::AppError,
    models::{billing::SettleOrderRequest, common::PaginatedResponse, order::CreateOrderRequest},
    services::order_service::OrderService,
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteRow, Column, Row, SqliteConnection, TypeInfo, ValueRef};
use std::collections::HashMap;
use uuid::Uuid;

type Response = Result<Json<Value>, AppError>;
fn ok(data: Value) -> Response {
    Ok(Json(json!({"success":true,"data":data})))
}
fn bad(msg: &str) -> AppError {
    AppError::BadRequest(msg.into())
}
fn missing() -> AppError {
    AppError::NotFound("Order unavailable".into())
}
pub(crate) fn record(row: SqliteRow) -> Result<Value, AppError> {
    let mut obj = serde_json::Map::new();
    for (i, c) in row.columns().iter().enumerate() {
        let v = row.try_get_raw(i)?;
        let val = if v.is_null() {
            Value::Null
        } else {
            match v.type_info().name() {
                "INTEGER" if c.name().starts_with("is_") || c.name() == "ordering_enabled" => {
                    json!(row.try_get::<bool, _>(i)?)
                }
                "INTEGER" => json!(row.try_get::<i64, _>(i)?),
                "REAL" => json!(row.try_get::<f64, _>(i)?),
                _ => json!(row.try_get::<String, _>(i)?),
            }
        };
        obj.insert(c.name().into(), val);
    }
    Ok(Value::Object(obj))
}
pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .merge(guest_records::routes())
        .merge(team::routes())
        .route("/api/v1/activity-history", get(activity_history))
        .merge(floor::routes())
        .merge(inventory::routes())
        .merge(coupons::routes())
        .route("/api/v1/dashboard/summary", get(reports::dashboard))
        .route("/api/v1/reports/period", get(reports::report))
        .route(
            "/api/v1/menu/categories/:id",
            axum::routing::put(catalog_admin::edit_category).delete(catalog_admin::remove_category),
        )
        .route(
            "/api/v1/menu/items/:id",
            axum::routing::put(catalog_admin::edit_item).delete(catalog_admin::remove_item),
        )
        .route(
            "/api/v1/menu/items/:id/availability",
            axum::routing::put(catalog_admin::availability),
        )
        .route("/api/v1/orders", post(create).get(list))
        .route("/api/v1/orders/:id", get(detail))
        .route("/api/v1/orders/:id/items", axum::routing::put(edit_lines))
        .route(
            "/api/v1/orders/:id/status",
            axum::routing::put(order_status),
        )
        .route("/api/v1/orders/:id/settle", post(settle))
        .route(
            "/api/v1/orders/:id/split",
            post(billing::split).get(billing::order_splits),
        )
        .route("/api/v1/split-bills", get(billing::splits))
        .route("/api/v1/payments", post(pay))
        .route("/api/v1/refunds", get(billing::list_refunds))
        .route("/api/v1/orders/:id/refund", post(billing::refund))
        .route(
            "/api/v1/refunds/:id/status",
            axum::routing::put(billing::decide),
        )
        .route("/api/v1/orders/:id/receipt", get(receipt))
        .route("/api/v1/restaurants", get(restaurant).put(team::settings))
        .route("/api/v1/menu/items", get(menu).post(catalog_admin::item))
        .route(
            "/api/v1/menu/categories",
            get(categories).post(catalog_admin::category),
        )
        .route("/api/v1/tables", get(tables).post(catalog_admin::table))
        .route(
            "/api/v1/tables/:id/status",
            axum::routing::put(table_status),
        )
        .route("/api/v1/sync/status", get(sync_status))
}
pub(crate) async fn snapshot(
    db: &mut SqliteConnection,
    rid: &str,
    id: &str,
) -> Result<Value, AppError> {
    let order = sqlx::query("SELECT * FROM orders WHERE restaurant_id=? AND id=?")
        .bind(rid)
        .bind(id)
        .fetch_optional(&mut *db)
        .await?
        .ok_or_else(missing)?;
    let items =
        sqlx::query("SELECT *,name AS item_name FROM order_items WHERE order_id=? ORDER BY rowid")
            .bind(id)
            .fetch_all(db)
            .await?
            .into_iter()
            .map(record)
            .collect::<Result<Vec<_>, _>>()?;
    let mut value = record(order)?;
    value["items"] = json!(items);
    Ok(value)
}
async fn detail(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let mut tx = s.pool.begin().await?;
    ok(snapshot(&mut tx, &rid, &id).await?)
}
async fn list(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let limit = q
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(100)
        .clamp(1, 500);
    let page = q
        .get("page")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1)
        .max(1);
    let status = q.get("status");
    let days = q.get("days").and_then(|v| v.parse::<i32>().ok());
    let mut tx = s.pool.begin().await?;
    let filter=" FROM orders WHERE restaurant_id=? AND (? IS NULL OR upper(status)=upper(?)) AND (? IS NULL OR julianday(created_at)>=julianday('now')-?)";
    let total: i64 = sqlx::query_scalar(&format!("SELECT count(*){filter}"))
        .bind(&rid)
        .bind(status)
        .bind(status)
        .bind(days)
        .bind(days)
        .fetch_one(&mut *tx)
        .await?;
    let ids: Vec<String> = sqlx::query_scalar(&format!(
        "SELECT id{filter} ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?"
    ))
    .bind(&rid)
    .bind(status)
    .bind(status)
    .bind(days)
    .bind(days)
    .bind(limit)
    .bind((page - 1).saturating_mul(limit))
    .fetch_all(&mut *tx)
    .await?;
    let mut items = Vec::new();
    for id in ids {
        items.push(snapshot(&mut tx, &rid, &id).await?);
    }
    ok(json!(PaginatedResponse::new(items, total, page, limit)))
}
async fn create(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateOrderRequest>,
) -> Response {
    let (staff, _, _, rid) = identity(&s, &h).await?;
    let id = req.id.unwrap_or_else(Uuid::new_v4).to_string();
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    if sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM orders WHERE id=? AND restaurant_id=?)",
    )
    .bind(&id)
    .bind(&rid)
    .fetch_one(&mut *tx)
    .await?
    {
        return ok(snapshot(&mut tx, &rid, &id).await?);
    }
    let (subtotal, lines) = price_lines(&mut tx, &rid, req.items).await?;
    let (tax, service): (f64, f64) =
        sqlx::query_as("SELECT gst_rate,service_charge_rate FROM restaurants WHERE id=?")
            .bind(&rid)
            .fetch_one(&mut *tx)
            .await?;
    let phone = req.customer_phone.clone();
    let coupon = if let Some(code) = req.applied_coupon_code.as_deref() {
        Some(coupons::quote(&mut tx, &rid, code, subtotal, phone.as_deref(), Some(&id)).await?)
    } else {
        None
    };
    let discount = coupon
        .as_ref()
        .map(|(_, amount)| *amount)
        .unwrap_or(req.discount_paise.unwrap_or(0));
    if discount < 0 || discount > subtotal {
        return Err(bad("Invalid discount"));
    }
    let b = OrderService::calculate_bill(subtotal, discount, tax, service, true);
    let table = req.table_id.map(|u| u.to_string());
    // The persisted table owns the visit. A client may still have the previous
    // seating ID cached after the final tender closes the table.
    let session = if let Some(t) = &table {
        Some(sqlx::query_scalar::<_, String>(
            "UPDATE tables SET status='OCCUPIED',current_seating_session_id=COALESCE(CASE WHEN status='OCCUPIED' THEN current_seating_session_id END,?),active_order_id=? WHERE id=? AND restaurant_id=? RETURNING current_seating_session_id",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&id)
        .bind(t)
        .bind(&rid)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| bad("Unknown table"))?)
    } else {
        req.seating_session_id.map(|u| u.to_string())
    };
    sqlx::query("INSERT INTO orders(id,restaurant_id,table_id,order_type,order_number,pickup_reference,customer_name,customer_phone_e164,status,subtotal_paise,tax_paise,service_charge_paise,round_off_paise,total_amount_paise,server_staff_id,seating_session_id,notes) VALUES(?,?,?,?,?,?,?,?,'ACCEPTED',?,?,?,?,?,?,?,?)").bind(&id).bind(&rid).bind(table).bind(req.order_type.to_uppercase()).bind(format!("ORD-{id}")).bind(req.pickup_reference).bind(req.customer_name).bind(req.customer_phone).bind(subtotal).bind(b.tax_paise).bind(b.service_charge_paise).bind(b.round_off_paise).bind(b.final_amount_paise).bind(staff).bind(session).bind(req.notes).execute(&mut *tx).await?;
    sqlx::query("UPDATE orders SET discount_paise=?,applied_coupon_code=? WHERE id=?")
        .bind(discount)
        .bind(req.applied_coupon_code.as_deref())
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    if let Some((c, d)) = coupon {
        coupons::save(&mut tx, &c, &id, phone.as_deref(), d).await?;
    }
    insert_lines(&mut tx, &id, lines).await?;
    let data = snapshot(&mut tx, &rid, &id).await?;
    let mut event = data.clone();
    event["items"] = data["items"].clone();
    event["order_type"] = json!(req.order_type.to_lowercase());
    event["status"] = json!("confirmed");
    event["payment_status"] = json!("pending");
    queue(&mut tx, "order", &id, "ORDER_CREATED", &event).await?;
    tx.commit().await?;
    crate::ws::broadcast_new_order(&data);
    ok(data)
}
async fn settle(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SettleOrderRequest>,
) -> Response {
    settle_payment(s, h, id, req, None).await
}
async fn pay(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<crate::models::billing::CreatePaymentRequest>,
) -> Response {
    let order = req.order_id.to_string();
    let split = req.split_bill_id.map(|u| u.to_string());
    settle_payment(
        s,
        h,
        order,
        SettleOrderRequest {
            payment_method: req.payment_method,
            amount_paise: req.amount_paise,
            upi_transaction_ref: req.upi_transaction_ref,
            idempotency_key: req.idempotency_key,
            notes: req.notes,
            discount_paise: None,
            applied_coupon_code: None,
        },
        split,
    )
    .await
}
async fn settle_payment(
    s: StaffState,
    h: HeaderMap,
    id: String,
    req: SettleOrderRequest,
    split: Option<String>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let method = req.payment_method.to_uppercase();
    if !matches!(method.as_str(), "CASH" | "UPI" | "CARD") || req.discount_paise.unwrap_or(0) < 0 {
        return Err(bad("Unsupported settlement terms"));
    }
    let key = req
        .idempotency_key
        .unwrap_or_else(|| format!("settle-{}", split.as_ref().unwrap_or(&id)));
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some(row) =
        sqlx::query("SELECT * FROM payments WHERE restaurant_id=? AND idempotency_key=?")
            .bind(&rid)
            .bind(&key)
            .fetch_optional(&mut *tx)
            .await?
    {
        let data = record(row)?;
        if data["split_bill_id"] != json!(split)
            || data["order_id"] != id
            || data["amount_paise"] != req.amount_paise
            || data["payment_method"] != method
        {
            return Err(bad("Payment request already used"));
        }
        return ok(data);
    }
    if req.discount_paise.is_some() || req.applied_coupon_code.is_some() {
        let (subtotal,tax,service,already_split):(i64,f64,f64,bool)=sqlx::query_as("SELECT o.subtotal_paise,r.gst_rate,r.service_charge_rate,o.is_split FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=? AND r.id=? AND payment_status='UNPAID'").bind(&id).bind(&rid).fetch_optional(&mut *tx).await?.ok_or_else(missing)?;
        let customer_phone: Option<String> =
            sqlx::query_scalar("SELECT customer_phone_e164 FROM orders WHERE id=?")
                .bind(&id)
                .fetch_one(&mut *tx)
                .await?;
        let discount = if let Some(code) = req.applied_coupon_code.as_deref() {
            let (c, d) = coupons::quote(
                &mut tx,
                &rid,
                code,
                subtotal,
                customer_phone.as_deref(),
                Some(&id),
            )
            .await?;
            coupons::save(&mut tx, &c, &id, customer_phone.as_deref(), d).await?;
            d
        } else {
            sqlx::query("DELETE FROM coupon_redemptions WHERE order_id=?")
                .bind(&id)
                .execute(&mut *tx)
                .await?;
            req.discount_paise.unwrap_or(0)
        };
        sqlx::query("UPDATE orders SET applied_coupon_code=? WHERE id=?")
            .bind(req.applied_coupon_code.as_deref())
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        if discount > subtotal || already_split {
            return Err(bad("Invalid discount"));
        }
        let bill = OrderService::calculate_bill(subtotal, discount, tax, service, true);
        sqlx::query("UPDATE orders SET discount_paise=?,tax_paise=?,round_off_paise=?,service_charge_paise=?,total_amount_paise=? WHERE id=?").bind(discount).bind(bill.tax_paise).bind(bill.round_off_paise).bind(bill.service_charge_paise).bind(bill.final_amount_paise).bind(&id).execute(&mut *tx).await?;
    }
    let data = snapshot(&mut tx, &rid, &id).await?;
    let o = &data;
    if o["status"] == "CANCELLED"
        || !(o["payment_status"] == "UNPAID" || o["payment_status"] == "PARTIAL")
    {
        return Err(bad("Order is closed"));
    }
    let expected = if let Some(sid) = &split {
        sqlx::query_scalar::<_,i64>("SELECT amount_paise FROM split_bills WHERE id=? AND order_id=? AND payment_status='unpaid'").bind(sid).bind(&id).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Split is unavailable"))?
    } else {
        if o["is_split"] == true {
            return Err(bad("Select a split to pay"));
        }
        o["total_amount_paise"]
            .as_i64()
            .ok_or_else(|| bad("Missing total"))?
    };
    if expected != req.amount_paise || expected <= 0 {
        return Err(bad("Order balance changed"));
    }
    let pay = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO payments(id,restaurant_id,order_id,amount_paise,payment_method,idempotency_key,upi_transaction_ref) VALUES(?,?,?,?,?,?,?)").bind(&pay).bind(&rid).bind(&id).bind(req.amount_paise).bind(&method).bind(key).bind(req.upi_transaction_ref).execute(&mut *tx).await?;
    let now = chrono::Utc::now().to_rfc3339();
    if let Some(sid) = &split {
        sqlx::query("UPDATE payments SET split_bill_id=? WHERE id=?")
            .bind(sid)
            .bind(&pay)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE split_bills SET payment_status='paid',payment_method=?,payment_id=?,settled_at=?,updated_at=? WHERE id=?").bind(&method).bind(&pay).bind(&now).bind(&now).bind(sid).execute(&mut *tx).await?;
    }
    let remaining: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM split_bills WHERE order_id=? AND payment_status='unpaid')",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;
    let payment = record(
        sqlx::query("SELECT * FROM payments WHERE id=?")
            .bind(&pay)
            .fetch_one(&mut *tx)
            .await?,
    )?;
    let mut event = payment.clone();
    event["settled_at"] = json!(now);
    event["status"] = json!("completed");
    event["partial"] = json!(remaining);
    event["bill"] = json!({"discount_paise":o["discount_paise"],"tax_paise":o["tax_paise"],"total_amount_paise":o["total_amount_paise"],"service_charge_paise":o["service_charge_paise"],"round_off_paise":o["round_off_paise"],"applied_coupon_code":o["applied_coupon_code"]});
    queue(&mut tx, "payment", &pay, "PAYMENT_SETTLED", &event).await?;
    if remaining {
        sqlx::query("UPDATE orders SET payment_status='PARTIAL',updated_at=? WHERE id=?")
            .bind(&now)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return ok(payment);
    }
    let method = if split.is_some() {
        "SPLIT".to_string()
    } else {
        method
    };
    sqlx::query("UPDATE orders SET status='COMPLETED',payment_status='PAID',payment_method=?,settled_at=?,updated_at=? WHERE id=?").bind(&method).bind(&now).bind(&now).bind(&id).execute(&mut *tx).await?;
    let restaurant = record(
        sqlx::query("SELECT name,gstin,fssai_license,address FROM restaurants WHERE id=?")
            .bind(&rid)
            .fetch_one(&mut *tx)
            .await?,
    )?;
    let table = o["table_id"].as_str();
    let number: Option<String> = sqlx::query_scalar("SELECT number FROM tables WHERE id=?")
        .bind(table)
        .fetch_optional(&mut *tx)
        .await?;
    let receipt = json!({"restaurant_name":restaurant["name"],"gstin":restaurant["gstin"],"fssai_license":restaurant["fssai_license"],"address":restaurant["address"],"order_number":o["order_number"],"order_type":o["order_type"],"table_number":number,"customer_name":o["customer_name"],"customer_phone":o["customer_phone_e164"],"date":now,"items":data["items"],"subtotal_paise":o["subtotal_paise"],"discount_paise":o["discount_paise"],"tax_paise":o["tax_paise"],"service_charge_paise":o["service_charge_paise"],"round_off_paise":o["round_off_paise"],"final_amount_paise":o["total_amount_paise"],"payment_status":"PAID","payment_method":method});
    sqlx::query("INSERT INTO invoices(id,restaurant_id,order_id,invoice_number,subtotal_paise,tax_paise,discount_paise,round_off_paise,total_paise,receipt_json) SELECT ?,restaurant_id,id,order_number,subtotal_paise,tax_paise,discount_paise,round_off_paise,total_amount_paise,? FROM orders WHERE id=?").bind(Uuid::new_v4().to_string()).bind(receipt.to_string()).bind(&id).execute(&mut *tx).await?;
    sqlx::query("UPDATE tables SET active_order_id=NULL,current_seating_session_id=NULL,status='AVAILABLE' WHERE id=?1 AND current_seating_session_id IS ?2 AND NOT EXISTS(SELECT 1 FROM orders WHERE table_id=?1 AND seating_session_id IS ?2 AND payment_status IN ('UNPAID','PARTIAL') AND status!='CANCELLED')").bind(table).bind(o["seating_session_id"].as_str()).execute(&mut *tx).await?;
    tx.commit().await?;
    crate::sync::sqlite::table_committed();
    ok(payment)
}
async fn receipt(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let data:String=sqlx::query_scalar("SELECT receipt_json FROM invoices WHERE restaurant_id=? AND order_id=? AND receipt_json IS NOT NULL").bind(rid).bind(id).fetch_optional(&s.pool).await?.ok_or_else(missing)?;
    ok(serde_json::from_str(&data).map_err(|e| AppError::Internal(e.to_string()))?)
}
async fn restaurant(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    ok(record(
        sqlx::query("SELECT * FROM restaurants WHERE id=?")
            .bind(rid)
            .fetch_one(&s.pool)
            .await?,
    )?)
}
async fn catalog(s: StaffState, h: HeaderMap, sql: &str) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    ok(json!(sqlx::query(sql)
        .bind(rid)
        .fetch_all(&s.pool)
        .await?
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn menu(State(s): State<StaffState>, h: HeaderMap) -> Response {
    catalog(
        s,
        h,
        "SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY display_order,name",
    )
    .await
}
async fn categories(State(s): State<StaffState>, h: HeaderMap) -> Response {
    catalog(
        s,
        h,
        "SELECT * FROM menu_categories WHERE restaurant_id=? ORDER BY sort_order,name",
    )
    .await
}
async fn tables(State(s): State<StaffState>, h: HeaderMap) -> Response {
    catalog(
        s,
        h,
        "SELECT * FROM tables WHERE restaurant_id=? ORDER BY number",
    )
    .await
}

async fn queue(
    db: &mut SqliteConnection,
    aggregate: &str,
    id: &str,
    kind: &str,
    data: &Value,
) -> Result<(), AppError> {
    sqlx::query("INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) VALUES(?,?,?,?,?,?)")
        .bind(Uuid::new_v4().to_string()).bind(aggregate).bind(id).bind(kind).bind(data.to_string()).bind(format!("{kind}-{id}")).execute(db).await?;
    Ok(())
}
async fn table_status(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<crate::models::table::UpdateTableStatusRequest>,
) -> Response {
    let (actor, label, role, rid) = identity(&s, &h).await?;
    let status = req.status.map(|v| v.to_uppercase());
    if status
        .as_ref()
        .is_some_and(|v| !matches!(v.as_str(), "AVAILABLE" | "OCCUPIED" | "DIRTY" | "RESERVED"))
    {
        return Err(bad("Invalid table status"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let before: (String, bool) =
        sqlx::query_as("SELECT status,ordering_enabled FROM tables WHERE id=? AND restaurant_id=?")
            .bind(&id)
            .bind(&rid)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| bad("Unknown table"))?;
    let row=sqlx::query("UPDATE tables SET status=COALESCE(?1,status),ordering_enabled=COALESCE(?2,ordering_enabled),current_seating_session_id=CASE WHEN ?1='OCCUPIED' THEN COALESCE(CASE WHEN status='OCCUPIED' THEN current_seating_session_id END,?3) WHEN ?1='AVAILABLE' THEN NULL ELSE current_seating_session_id END,active_order_id=CASE WHEN ?1='AVAILABLE' THEN NULL ELSE COALESCE(?4,active_order_id) END WHERE id=?5 AND restaurant_id=?6 RETURNING *")
        .bind(status).bind(req.ordering_enabled).bind(Uuid::new_v4().to_string()).bind(req.active_order_id.map(|v|v.to_string())).bind(&id).bind(&rid).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Unknown table"))?;
    let updated = record(row)?;
    let after = updated["status"].as_str().unwrap_or_default();
    let enabled = updated["ordering_enabled"].as_bool().unwrap_or_default();
    if before.0 != after || before.1 != enabled {
        let notes = format!(
            "Table {}: {} to {}; ordering enabled {} to {}",
            updated["number"], before.0, after, before.1, enabled
        );
        sqlx::query("INSERT INTO activity_history(restaurant_id,action,entity_type,entity_id,notes,actor_id,actor_role,actor_label) VALUES(?,'TABLE_UPDATED','TABLE',?,?,?,?,?)")
            .bind(&rid).bind(&id).bind(notes).bind(actor).bind(role).bind(label).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    crate::sync::sqlite::table_committed();
    ok(updated)
}
async fn activity_history(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, role, rid) = identity(&s, &h).await?;
    if !matches!(role.to_uppercase().as_str(), "ADMIN" | "MANAGER") {
        return Err(AppError::Forbidden("Manager access required".into()));
    }
    let rows = sqlx::query("SELECT 'sqlite-' || id AS id, restaurant_id AS restaurantId, action,entity_type AS entityType,entity_id AS entityId,notes,actor_id AS actorId,actor_role AS actorRole,actor_label AS actorLabel,timestamp FROM activity_history WHERE restaurant_id=? ORDER BY id DESC LIMIT 200")
        .bind(rid).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn sync_status(State(s): State<StaffState>, h: HeaderMap) -> Response {
    identity(&s, &h).await?;
    let row=sqlx::query("SELECT (SELECT last_synced_timestamp FROM sync_checkpoints WHERE id='device_gateway') AS last_success, (SELECT count(*) FROM sync_outbox WHERE status='PENDING') AS pending, (SELECT min(created_at) FROM sync_outbox WHERE status='PENDING') AS oldest_pending, EXISTS(SELECT 1 FROM sync_checkpoints WHERE id='device_gateway' AND last_synced_timestamp>=datetime('now','-35 seconds')) AS connected").fetch_one(&s.pool).await?;
    let mut status = record(row)?;
    status["online"] = json!(status["connected"] == 1);
    Ok(Json(
        json!({"configured":std::env::var("DEVICE_SYNC_URL").is_ok() && std::env::var("DEVICE_SYNC_TOKEN").is_ok(),"sync":status}),
    ))
}

async fn order_status(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<crate::models::order::UpdateOrderStatusRequest>,
) -> Response {
    let (_, _, role, rid) = identity(&s, &h).await?;
    let status = req.status.to_uppercase();
    if !matches!(
        status.as_str(),
        "CONFIRMED"
            | "ACCEPTED"
            | "PREPARING"
            | "IN_PREPARATION"
            | "READY"
            | "DISPATCHED"
            | "SERVED"
            | "CANCELLED"
    ) {
        return Err(bad("Unsupported kitchen status"));
    }
    if status == "CANCELLED" && !matches!(role.as_str(), "ADMIN" | "MANAGER") {
        return Err(AppError::Forbidden(
            "Manager required to cancel an order".into(),
        ));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let current: String =
        sqlx::query_scalar("SELECT status FROM orders WHERE id=? AND restaurant_id=?")
            .bind(&id)
            .bind(&rid)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(missing)?;
    if current.eq_ignore_ascii_case(&status) {
        return ok(snapshot(&mut tx, &rid, &id).await?);
    }
    OrderService::validate_status_transition(&current, &status)?;
    let changed=sqlx::query("UPDATE orders SET status=?,updated_at=datetime('now') WHERE restaurant_id=? AND id=? AND payment_status='UNPAID' AND status!='CANCELLED'")
        .bind(&status).bind(&rid).bind(&id).execute(&mut *tx).await?;
    if changed.rows_affected() != 1 {
        return Err(bad("Order cannot change status"));
    }
    let event = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) VALUES(?,'order',?,'ORDER_STATUS_UPDATED',?,?)").bind(&event).bind(&id).bind(json!({"to_status":status.to_lowercase()}).to_string()).bind(&event).execute(&mut *tx).await?;
    let order = snapshot(&mut tx, &rid, &id).await?;
    tx.commit().await?;
    ok(order)
}

type PricedLine = (String, String, i64, i32, i64, Option<String>);
async fn price_lines(
    db: &mut SqliteConnection,
    rid: &str,
    items: Vec<crate::models::order::CreateOrderItemInput>,
) -> Result<(i64, Vec<PricedLine>), AppError> {
    if items.is_empty() {
        return Err(bad("Order must contain at least one item"));
    }
    let mut subtotal = 0i64;
    let mut lines = Vec::new();
    for item in items {
        let mid = item
            .menu_item_id
            .ok_or_else(|| bad("Select a catalog item"))?
            .to_string();
        let (name,price):(String,i64)=sqlx::query_as("SELECT name,price_paise FROM menu_items WHERE id=? AND restaurant_id=? AND is_available=1").bind(&mid).bind(rid).fetch_optional(&mut *db).await?.ok_or_else(||bad("Item unavailable"))?;
        if item.quantity <= 0 || price < 0 {
            return Err(bad("Invalid quantity or price"));
        }
        let amount = price
            .checked_mul(item.quantity.into())
            .ok_or_else(|| bad("Amount overflow"))?;
        subtotal = subtotal
            .checked_add(amount)
            .filter(|n| *n <= 100_000_000_000)
            .ok_or_else(|| bad("Order too large"))?;
        lines.push((mid, name, price, item.quantity, amount, item.notes));
    }
    Ok((subtotal, lines))
}
async fn insert_lines(
    db: &mut SqliteConnection,
    id: &str,
    lines: Vec<PricedLine>,
) -> Result<(), AppError> {
    for (mid, name, price, qty, amount, notes) in lines {
        sqlx::query("INSERT INTO order_items(id,order_id,menu_item_id,name,unit_price_paise,quantity,item_total_paise,subtotal_paise,total_paise,notes) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(id).bind(mid).bind(name).bind(price).bind(qty).bind(amount).bind(amount).bind(amount).bind(notes).execute(&mut *db).await?;
    }
    Ok(())
}

async fn edit_lines(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<crate::models::order::UpdateOrderItemsRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let old = snapshot(&mut tx, &rid, &id).await?;
    if old["is_split"] == true || old["payment_status"] != "UNPAID" || old["status"] == "CANCELLED"
    {
        return Err(bad("Order is closed or split"));
    }
    if req
        .table_id
        .as_ref()
        .is_some_and(|t| old["table_id"] != t.to_string())
    {
        return Err(bad("Use the table transfer action to move an open ticket"));
    }
    let (subtotal, lines) = price_lines(&mut tx, &rid, req.items).await?;
    let phone = req
        .customer_phone
        .as_deref()
        .or(old["customer_phone_e164"].as_str());
    let discount = if let Some(code) = old["applied_coupon_code"].as_str() {
        let (c, d) = coupons::quote(&mut tx, &rid, code, subtotal, phone, Some(&id)).await?;
        coupons::save(&mut tx, &c, &id, phone, d).await?;
        d
    } else {
        old["discount_paise"].as_i64().unwrap_or(0).min(subtotal)
    };
    let (tax, service): (f64, f64) =
        sqlx::query_as("SELECT gst_rate,service_charge_rate FROM restaurants WHERE id=?")
            .bind(&rid)
            .fetch_one(&mut *tx)
            .await?;
    let b = OrderService::calculate_bill(subtotal, discount, tax, service, true);
    sqlx::query("UPDATE orders SET subtotal_paise=?,discount_paise=?,tax_paise=?,round_off_paise=?,service_charge_paise=?,total_amount_paise=?,notes=coalesce(?,notes),customer_name=coalesce(?,customer_name),customer_phone_e164=coalesce(?,customer_phone_e164),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(subtotal).bind(discount).bind(b.tax_paise).bind(b.round_off_paise).bind(b.service_charge_paise).bind(b.final_amount_paise).bind(req.notes).bind(req.customer_name).bind(phone).bind(&id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM order_items WHERE order_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    insert_lines(&mut tx, &id, lines).await?;
    let o = snapshot(&mut tx, &rid, &id).await?;
    let event = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) VALUES(?1,'order',?2,'ORDER_LINES_UPDATED',?3,?1)").bind(event).bind(&id).bind(o.to_string()).execute(&mut *tx).await?;
    tx.commit().await?;
    ok(o)
}

#[cfg(test)]
mod sale_tests {
    use super::*;
    use crate::sqlite_staff::routes;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    async fn call(
        app: &Router,
        method: &str,
        path: &str,
        body: Value,
        token: &str,
    ) -> (u16, Value) {
        let req = Request::builder()
            .method(method)
            .uri(format!("/api/v1/{path}"))
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status().as_u16();
        let bytes = to_bytes(res.into_body(), 1000000).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn item_split_covers_every_unit_and_preserves_rounding() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations_sqlite")
            .run(&pool)
            .await
            .unwrap();
        let app = routes(pool);
        let (_, auth) = call(
            &app,
            "POST",
            "auth/setup",
            json!({"login_id":"admin","password":"test-password-only"}),
            "",
        )
        .await;
        let token = auth["data"]["token"].as_str().unwrap();
        let (status,o)=call(&app,"POST","orders",json!({"order_type":"takeaway","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":3}]}),token).await;
        assert_eq!(status, 200, "{o}");
        let path = format!("orders/{}/split", o["data"]["id"].as_str().unwrap());
        let item = &o["data"]["items"][0]["id"];
        let allocations = |second| json!({"split_type":"item","ways":2,"item_allocations":[{"split_number":1,"order_item_id":item,"quantity":1},{"split_number":2,"order_item_id":item,"quantity":second}]});
        assert_eq!(
            call(&app, "POST", &path, allocations(1), token).await.0,
            400
        );
        let (status, split) = call(&app, "POST", &path, allocations(2), token).await;
        assert_eq!(status, 200, "{split}");
        let bills = split["data"].as_array().unwrap();
        assert_eq!(bills[0]["split_type"], "item");
        let total = o["data"]["total_amount_paise"].as_i64().unwrap();
        assert_eq!(bills[0]["amount_paise"], total / 3);
        assert_eq!(bills[1]["amount_paise"], total - total / 3);
        assert_eq!(
            call(&app, "POST", &path, allocations(2), token).await,
            (200, split)
        );
    }
    #[tokio::test]
    async fn admin_shift_records_are_visible_in_reports() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations_sqlite")
            .run(&pool)
            .await
            .unwrap();
        let app = routes(pool);
        let (_, auth) = call(
            &app,
            "POST",
            "auth/setup",
            json!({"login_id":"admin","password":"test-password-only"}),
            "",
        )
        .await;
        let token = auth["data"]["token"].as_str().unwrap();
        let (status,inventory)=call(&app,"POST","inventory/items",json!({"name":"Rice","category":"Dry","unit_of_measure":"kg","initial_stock":5.0,"cost_per_unit_paise":4000}),token).await;
        assert_eq!(status, 200, "{inventory}");
        let waste = json!({"inventory_item_id":inventory["data"]["id"],"quantity":1.0,"unit_of_measure":"kg","reason":"Spilled","idempotency_key":"shift-waste"});
        let (status, w) = call(&app, "POST", "inventory/wastage", waste.clone(), token).await;
        assert_eq!(status, 200, "{w}");
        assert_eq!(
            call(&app, "POST", "inventory/wastage", waste, token).await,
            (200, w)
        );
        let (status,employee)=call(&app,"POST","restaurants/staff",json!({"name":"Ravi","login_id":"ravi","role":"CASHIER","password":"cashier-password","monthly_salary_paise":3100000}),token).await;
        assert_eq!(status, 200, "{employee}");
        assert_eq!(call(&app,"POST","restaurants/staff/attendance",json!({"staff_id":employee["data"]["id"],"attendance_date":"2026-12-01","status":"PRESENT"}),token).await.0,200);
        let (status, payroll) = call(
            &app,
            "GET",
            "restaurants/staff/performance?month=2026-12",
            Value::Null,
            token,
        )
        .await;
        assert_eq!(status, 200, "{payroll}");
        assert!(payroll["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["staff_name"] == "Ravi" && row["calculated_salary_paise"] == 100000));
        let (status, c) = call(
            &app,
            "POST",
            "customers",
            json!({"name":"Guest","phone":"9876543210"}),
            token,
        )
        .await;
        assert_eq!(status, 200, "{c}");
        assert_eq!(call(&app,"POST","reservations",json!({"customer_id":c["data"]["id"],"customer_name":"Guest","customer_phone":"9876543210","guest_count":2,"reservation_time":"2026-12-01T12:00:00Z"}),token).await.0,200);
        assert_eq!(
            call(
                &app,
                "POST",
                "feedback",
                json!({"rating":5,"comments":"Tea was good"}),
                token
            )
            .await
            .0,
            200
        );
        assert_eq!(call(&app,"POST","coupons",json!({"code":"TEN","discount_value":10,"discount_type":"percentage","one_time_per_customer":true}),token).await.0,200);
        let order = json!({"order_type":"takeaway","customer_phone":"9876543210","applied_coupon_code":"TEN","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1}]});
        let (status, o) = call(&app, "POST", "orders", order.clone(), token).await;
        assert_eq!(status, 200, "{o}");
        assert_eq!(o["data"]["discount_paise"], 2800);
        assert_eq!(call(&app, "POST", "orders", order, token).await.0, 400);
        let (status, d) = call(&app, "GET", "dashboard/summary", Value::Null, token).await;
        assert_eq!(status, 200, "{d}");
        assert_eq!(d["data"]["today"]["sales"]["total_discount_paise"], 2800);
        assert_eq!(d["data"]["today"]["inventory"]["wastage_cost_paise"], 4000);
    }
    #[tokio::test]
    async fn split_payments_and_refunds_preserve_the_balance() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations_sqlite")
            .run(&pool)
            .await
            .unwrap();
        let app = routes(pool.clone());
        let (_, auth) = call(
            &app,
            "POST",
            "auth/setup",
            json!({"login_id":"admin","password":"test-password-only"}),
            "",
        )
        .await;
        let token = auth["data"]["token"].as_str().unwrap();
        let (status, c) = call(
            &app,
            "POST",
            "menu/categories",
            json!({"name":"Tea drinks"}),
            token,
        )
        .await;
        assert_eq!(status, 200, "{c}");
        let (status, item) = call(
            &app,
            "POST",
            "menu/items",
            json!({"category_id":c["data"]["id"],"name":"Tea","base_price_paise":10000}),
            token,
        )
        .await;
        assert_eq!(status, 200, "{item}");
        let table = "11111111-0000-0000-0000-000000000001";
        let mut ticket = json!({"order_type":"dine_in","table_id":table,"items":[{"menu_item_id":item["data"]["id"],"quantity":1}]});
        let (status, o) = call(&app, "POST", "orders", ticket.clone(), token).await;
        assert_eq!(status, 200, "{o}");
        let id = o["data"]["id"].as_str().unwrap();
        let path = format!("orders/{id}");
        let (status, shares) = call(
            &app,
            "POST",
            &format!("{path}/split"),
            json!({"ways":2}),
            token,
        )
        .await;
        assert_eq!(status, 200, "{shares}");
        for (i, share) in shares["data"].as_array().unwrap().iter().enumerate() {
            let payload = json!({"order_id":id,"split_bill_id":share["id"],"payment_method":"cash","amount_paise":share["amount_paise"]});
            let (status, p) = call(&app, "POST", "payments", payload.clone(), token).await;
            assert_eq!(status, 200, "{p}");
            assert_eq!(
                call(&app, "POST", "payments", payload, token).await,
                (200, p)
            );
            let (status, r) =
                call(&app, "GET", &format!("{path}/receipt"), Value::Null, token).await;
            if i == 0 {
                assert_eq!(status, 404);
            } else {
                assert_eq!(status, 200);
                assert_eq!(
                    r["data"]["final_amount_paise"],
                    o["data"]["total_amount_paise"]
                );
            }
        }
        let previous_session = o["data"]["seating_session_id"].as_str().unwrap();
        ticket["seating_session_id"] = json!(previous_session);
        let (status, next) = call(&app, "POST", "orders", ticket.clone(), token).await;
        assert_eq!(status, 200, "{next}");
        let next_session = next["data"]["seating_session_id"].as_str().unwrap();
        assert_ne!(next_session, previous_session);
        let (status, round) = call(&app, "POST", "orders", ticket, token).await;
        assert_eq!(status, 200, "{round}");
        assert_eq!(round["data"]["seating_session_id"], next_session);
        let amount = o["data"]["total_amount_paise"].clone();
        let request =
            json!({"refund_amount_paise":amount,"reason":"Returned","idempotency_key":"refund-1"});
        let (status, r) = call(
            &app,
            "POST",
            &format!("{path}/refund"),
            request.clone(),
            token,
        )
        .await;
        assert_eq!(status, 200, "{r}");
        assert_eq!(
            call(&app, "POST", &format!("{path}/refund"), request, token).await,
            (200, r.clone())
        );
        assert_eq!(
            call(
                &app,
                "POST",
                &format!("{path}/refund"),
                json!({"refund_amount_paise":1,"reason":"duplicate"}),
                token
            )
            .await
            .0,
            400
        );
        let url = format!("refunds/{}/status", r["data"]["id"].as_str().unwrap());
        assert_eq!(
            call(&app, "PUT", &url, json!({"status":"completed"}), token)
                .await
                .0,
            200
        );
        assert_eq!(
            call(&app, "GET", &path, Value::Null, token).await.1["data"]["payment_status"],
            "REFUNDED"
        );
        let counts:(i64,i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM payments),(SELECT count(*) FROM invoices),(SELECT count(*) FROM refunds)").fetch_one(&pool).await.unwrap();
        assert_eq!(counts, (2, 1, 1));
    }

    #[tokio::test]
    async fn sale_and_retry_across_restart() {
        let dir = std::env::temp_dir().join(format!("sqlite-sale-{}", Uuid::new_v4()));
        let pool = crate::local_database::open(&dir).await.unwrap();
        let app = routes(pool.clone());
        let credentials = json!({"login_id":"admin","password":"test-password-only"});
        let (status, auth) = call(&app, "POST", "auth/setup", credentials.clone(), "").await;
        assert_eq!(status, 200, "{auth}");
        let token = auth["data"]["token"].as_str().unwrap();
        let id = Uuid::new_v4().to_string();
        let order = json!({"id":id,"order_type":"dine_in","table_id":"11111111-0000-0000-0000-000000000001","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","item_name":"Dish","quantity":1,"unit_price_paise":1}]});
        let (status, o) = call(&app, "POST", "orders", order, token).await;
        assert_eq!(status, 200, "{o}");
        assert_eq!(o["data"]["subtotal_paise"], 28000);
        let total = &o["data"]["total_amount_paise"];
        let payment = json!({"amount_paise":total,"payment_method":"cash","idempotency_key":"one"});
        let path = format!("orders/{id}/settle");
        let (status, p) = call(&app, "POST", &path, payment.clone(), token).await;
        assert_eq!(status, 200, "{p}");
        drop(app);
        pool.close().await;
        let pool = crate::local_database::open(&dir).await.unwrap();
        let app = routes(pool.clone());
        let (_, auth) = call(&app, "POST", "auth/login", credentials, "").await;
        let token = auth["data"]["token"].as_str().unwrap();
        assert_eq!(call(&app, "POST", &path, payment, token).await, (200, p));
        let (status, r) = call(
            &app,
            "GET",
            &format!("orders/{id}/receipt"),
            Value::Null,
            token,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(&r["data"]["final_amount_paise"], total);
        let counts:(i64,i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM payments),(SELECT count(*) FROM invoices),(SELECT count(*) FROM sync_outbox)").fetch_one(&pool).await.unwrap();
        assert_eq!(counts, (1, 1, 2));
        drop(app);
        pool.close().await;
        crate::local_database::remove_test_database(&dir).await;
    }
}
