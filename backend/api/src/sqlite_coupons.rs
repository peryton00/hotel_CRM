use super::{bad, ok, record, Response};
use crate::{
    error::AppError,
    models::coupon::*,
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post, put},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::SqliteConnection;
use uuid::Uuid;
const SELECT: &str = "SELECT *,max_discount_paise AS max_discount_amount_paise FROM coupons";
pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .route("/api/v1/coupons", get(list).post(create))
        .route(
            "/api/v1/coupons/:id",
            put(update).patch(update).delete(remove),
        )
        .route("/api/v1/coupons/:id/status", put(status))
        .route("/api/v1/coupons/validate", post(validate))
        .route("/api/v1/coupons/redeem", post(redeem))
}
async fn list(State(s): State<StaffState>, h: HeaderMap) -> Response {
    super::catalog(
        s,
        h,
        &format!("{SELECT} WHERE restaurant_id=? ORDER BY code"),
    )
    .await
}
fn amount_valid(kind: &str, value: f64) -> bool {
    value > 0.
        && match kind {
            "percentage" => value <= 100.,
            "fixed" => true,
            _ => false,
        }
}
async fn create(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateCouponRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let kind = req
        .discount_type
        .unwrap_or_else(|| "percentage".into())
        .to_lowercase();
    let code = req.code.trim().to_uppercase();
    if code.is_empty()
        || !amount_valid(&kind, req.discount_value)
        || req.min_order_amount_paise.unwrap_or(0) < 0
        || req.max_discount_amount_paise.unwrap_or(0) < 0
    {
        return Err(bad("Invalid coupon terms"));
    }
    let row=sqlx::query("INSERT INTO coupons(id,restaurant_id,code,title,description,discount_type,discount_value,min_order_amount_paise,max_discount_paise,one_time_per_customer) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *,max_discount_paise AS max_discount_amount_paise").bind(Uuid::new_v4().to_string()).bind(rid).bind(&code).bind(req.title.unwrap_or(code.clone())).bind(req.description).bind(kind).bind(req.discount_value).bind(req.min_order_amount_paise.unwrap_or(0)).bind(req.max_discount_amount_paise).bind(req.one_time_per_customer.unwrap_or(false)).fetch_one(&s.pool).await?;
    ok(record(row)?)
}
async fn update(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateCouponRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let row=sqlx::query("UPDATE coupons SET title=coalesce(?,title),description=coalesce(?,description),discount_type=coalesce(?,discount_type),discount_value=coalesce(?,discount_value),min_order_amount_paise=coalesce(?,min_order_amount_paise),max_discount_paise=coalesce(?,max_discount_paise),one_time_per_customer=coalesce(?,one_time_per_customer),is_active=coalesce(?,is_active),updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? RETURNING *,max_discount_paise AS max_discount_amount_paise").bind(req.title).bind(req.description).bind(req.discount_type.map(|s|s.to_lowercase())).bind(req.discount_value).bind(req.min_order_amount_paise).bind(req.max_discount_amount_paise).bind(req.one_time_per_customer).bind(req.is_active).bind(id).bind(rid).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Unknown coupon"))?;
    let data = record(row)?;
    if !amount_valid(
        &data["discount_type"].as_str().unwrap_or("").to_lowercase(),
        data["discount_value"].as_f64().unwrap_or(0.),
    ) || data["min_order_amount_paise"].as_i64().unwrap_or(0) < 0
        || data["max_discount_paise"].as_i64().unwrap_or(0) < 0
    {
        return Err(bad("Invalid coupon terms"));
    }
    tx.commit().await?;
    ok(data)
}
async fn status(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateCouponStatusRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    ok(record(
        sqlx::query("UPDATE coupons SET is_active=? WHERE id=? AND restaurant_id=? RETURNING *")
            .bind(req.is_active)
            .bind(id)
            .bind(rid)
            .fetch_optional(&s.pool)
            .await?
            .ok_or_else(|| bad("Unknown coupon"))?,
    )?)
}
async fn remove(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    if sqlx::query("DELETE FROM coupons WHERE id=? AND restaurant_id=? AND NOT EXISTS(SELECT 1 FROM coupon_redemptions WHERE coupon_id=coupons.id)").bind(id).bind(rid).execute(&s.pool).await?.rows_affected()==0{return Err(bad("Redeemed coupons can be deactivated"));}
    ok(Value::Null)
}
pub(super) async fn quote(
    db: &mut SqliteConnection,
    rid: &str,
    code: &str,
    subtotal: i64,
    phone: Option<&str>,
    order: Option<&str>,
) -> Result<(Value, i64), AppError> {
    let row=sqlx::query(&format!("{SELECT} WHERE restaurant_id=? AND code=? AND is_active=1 AND julianday('now') BETWEEN julianday(start_date) AND julianday(end_date)")).bind(rid).bind(code.trim().to_uppercase()).fetch_optional(&mut *db).await?.ok_or_else(||bad("Coupon unavailable"))?;
    let c = record(row)?;
    if subtotal < c["min_order_amount_paise"].as_i64().unwrap_or(0) {
        return Err(bad("Order below minimum"));
    }
    if c["one_time_per_customer"] == true || c["one_time_per_customer"] == 1 {
        let customer = phone
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| bad("Customer phone required for this coupon"))?;
        let used:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND customer_phone=? AND order_id IS NOT ?)").bind(c["id"].as_str()).bind(customer).bind(order).fetch_one(db).await?;
        if used {
            return Err(bad("Coupon already used by this customer"));
        }
    }
    let value = c["discount_value"]
        .as_f64()
        .ok_or_else(|| bad("Invalid discount"))?;
    let discount = if c["discount_type"]
        .as_str()
        .unwrap_or("")
        .eq_ignore_ascii_case("percentage")
    {
        crate::models::paise::Paise(subtotal).percentage(value).0
    } else {
        (value * 100.).round() as i64
    };
    let cap = c["max_discount_paise"].as_i64().unwrap_or(subtotal);
    Ok((c, discount.min(cap).min(subtotal)))
}
pub(super) async fn save(
    db: &mut SqliteConnection,
    c: &Value,
    id: &str,
    phone: Option<&str>,
    amount: i64,
) -> Result<Value, AppError> {
    let row=sqlx::query("INSERT INTO coupon_redemptions(id,coupon_id,order_id,customer_phone,discount_applied_paise) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET coupon_id=excluded.coupon_id,customer_phone=excluded.customer_phone,discount_applied_paise=excluded.discount_applied_paise RETURNING *").bind(Uuid::new_v4().to_string()).bind(c["id"].as_str()).bind(id).bind(phone).bind(amount).fetch_one(db).await?;
    record(row)
}
async fn validate(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<ValidateCouponRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let mut conn = s.pool.acquire().await?;
    match quote(
        &mut conn,
        &rid,
        &req.code,
        req.order_amount_paise,
        req.customer_phone.as_deref(),
        None,
    )
    .await
    {
        Ok((c, d)) => ok(json!({"is_valid":true,"discount_paise":d,"coupon":c})),
        Err(AppError::BadRequest(msg)) => {
            ok(json!({"is_valid":false,"discount_paise":0,"message":msg}))
        }
        Err(e) => Err(e),
    }
}
async fn redeem(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<RedeemCouponRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let row=sqlx::query("SELECT cr.* FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id WHERE cr.order_id=? AND c.restaurant_id=? AND c.code=?").bind(req.order_id.to_string()).bind(rid).bind(req.code.trim().to_uppercase()).fetch_optional(&s.pool).await?.ok_or_else(||bad("Apply the coupon when creating or settling this order"))?;
    ok(record(row)?)
}
