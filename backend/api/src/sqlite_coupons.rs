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
        .route("/api/v1/wallet", get(wallet).post(grant))
        .route("/api/v1/wallet/:id/revoke", post(revoke))
        .route("/api/v1/reward-policy", get(read_policy).put(policy))
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
    let coupon = c["id"].as_str();
    let targeted: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM reward_wallet WHERE coupon_id=?1) OR EXISTS(SELECT 1 FROM reward_policy WHERE restaurant_id=?2 AND upper(?3) IN (upper(json_extract(config,'$.pointsCouponCode')), upper(json_extract(config,'$.couponCode'))))")
        .bind(coupon).bind(rid).bind(code).fetch_one(&mut *db).await?;
    if targeted {
        let digits: String = phone
            .unwrap_or("")
            .chars()
            .filter(char::is_ascii_digit)
            .collect();
        let remaining: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM reward_wallet w JOIN customer_phone_lookup u ON u.id=w.customer_id WHERE w.coupon_id=?1 AND w.status='ACTIVE' AND (u.digits=?2 OR u.digits='91'||?2 OR ?2='91'||u.digits) AND w.max_redemptions>(SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=w.coupon_id AND r.order_id IS NOT ?3 AND substr(r.customer_phone,-10)=substr(u.digits,-10)))")
            .bind(coupon).bind(digits).bind(order).fetch_one(&mut *db).await?;
        if !remaining {
            return Err(bad("No available coupon for this customer"));
        }
    } else if c["one_time_per_customer"] == true || c["one_time_per_customer"] == 1 {
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

async fn wallet(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let rows =
        sqlx::query("SELECT * FROM wallet_details WHERE restaurantId=? ORDER BY assignedAt DESC")
            .bind(rid)
            .fetch_all(&s.pool)
            .await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
#[derive(serde::Deserialize)]
struct Grant {
    customer_id: Uuid,
    coupon_id: Uuid,
    uses: i32,
    notes: String,
}
async fn grant(State(s): State<StaffState>, h: HeaderMap, Json(input): Json<Grant>) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let (_, label, _, _) = identity(&s, &h).await?;
    if !(1..=1000).contains(&input.uses) {
        return Err(bad("Invalid redemption count"));
    }
    let mut tx = s.pool.begin().await?;
    let id:String=sqlx::query_scalar("INSERT INTO reward_wallet(id,restaurant_id,coupon_id,customer_id,max_redemptions,assigned_by,notes) SELECT ?,c.restaurant_id,c.id,u.id,?,?,? FROM coupons c JOIN customers u ON u.restaurant_id=c.restaurant_id WHERE c.id=? AND u.id=? AND c.restaurant_id=? AND c.is_active=1 ON CONFLICT(coupon_id,customer_id) DO UPDATE SET max_redemptions=max_redemptions+excluded.max_redemptions,status='ACTIVE',assigned_by=excluded.assigned_by,notes=excluded.notes RETURNING id")
 .bind(Uuid::new_v4().to_string()).bind(input.uses).bind(label).bind(input.notes).bind(input.coupon_id.to_string()).bind(input.customer_id.to_string()).bind(rid).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Unknown coupon or customer"))?;
    let row = sqlx::query("SELECT * FROM wallet_details WHERE id=?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    ok(record(row)?)
}
async fn revoke(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    sqlx::query("UPDATE reward_wallet SET status='REVOKED' WHERE id=? AND restaurant_id=?")
        .bind(id)
        .bind(rid)
        .execute(&s.pool)
        .await?;
    ok(Value::Null)
}
async fn read_policy(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let config: Option<String> =
        sqlx::query_scalar("SELECT config FROM reward_policy WHERE restaurant_id=?")
            .bind(rid)
            .fetch_optional(&s.pool)
            .await?;
    ok(config
        .map(|c| serde_json::from_str(&c))
        .transpose()
        .map_err(|_| bad("Invalid stored reward policy"))?
        .unwrap_or(Value::Null))
}
async fn policy(State(s): State<StaffState>, h: HeaderMap, Json(config): Json<Value>) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    if !config["targetVisits"]
        .as_i64()
        .is_some_and(|v| (1..=1000).contains(&v))
    {
        return Err(bad("Invalid visit threshold"));
    }
    let mut tx = s.pool.begin().await?;
    sqlx::query("INSERT INTO reward_policy VALUES(?,?) ON CONFLICT(restaurant_id) DO UPDATE SET config=excluded.config").bind(&rid).bind(config.to_string()).execute(&mut *tx).await?;
    let coupons:Vec<String>=sqlx::query_scalar("SELECT json_object('restaurant_id', restaurant_id,'code',code,'title',title,'discount_type',discount_type,'discount_value',discount_value,'min',min_order_amount_paise,'cap',max_discount_paise,'start',start_date,'end',end_date,'active',is_active) FROM coupons WHERE restaurant_id=? AND upper(code) IN (upper(?),upper(?))")
        .bind(&rid).bind(config["couponCode"].as_str()).bind(config["pointsCouponCode"].as_str()).fetch_all(&mut *tx).await?;
    let definitions = coupons
        .iter()
        .map(|row| serde_json::from_str::<Value>(row))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| bad("Invalid coupon definition"))?;
    super::queue(
        &mut tx,
        "policy",
        &Uuid::new_v4().to_string(),
        "POLICY_UPDATED",
        &json!({"restaurant_id":rid,"config":config,"coupons":definitions}),
    )
    .await?;
    tx.commit().await?;
    ok(config)
}
