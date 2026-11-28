use super::{bad, missing, ok, queue, record, Response};
use crate::{
    error::AppError,
    models::billing::{CreateRefundRequest, SplitOrderRequest, UpdateRefundStatusRequest},
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub(super) struct RefundInput {
    #[serde(flatten)]
    request: CreateRefundRequest,
    split_bill_id: Option<Uuid>,
}
pub(super) async fn refund(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(order): Path<String>,
    Json(input): Json<RefundInput>,
) -> Response {
    let req = input.request;
    let (staff, _, _, rid) = identity(&s, &h).await?;
    if req.reason.trim().is_empty() || req.refund_amount_paise <= 0 {
        return Err(bad("Provide the refund amount and reason"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let payment = if let Some(split) = input.split_bill_id {
        let paid:String=sqlx::query_scalar("SELECT p.id FROM payments p JOIN split_bills b ON b.payment_id=p.id WHERE b.id=? AND b.order_id=? AND p.restaurant_id=?").bind(split.to_string()).bind(&order).bind(&rid).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Split payment unavailable"))?;
        Some(paid)
    } else {
        req.payment_id.map(|id| id.to_string())
    };
    let key = req.idempotency_key;
    if let Some(k) = &key {
        if let Some(row) =
            sqlx::query("SELECT * FROM refunds WHERE restaurant_id=? AND idempotency_key=?")
                .bind(&rid)
                .bind(k)
                .fetch_optional(&mut *tx)
                .await?
        {
            let existing = record(row)?;
            if existing["order_id"] != order
                || existing["refund_amount_paise"] != req.refund_amount_paise
                || existing["payment_id"] != json!(payment)
            {
                return Err(bad("Refund key already used"));
            }
            return ok(existing);
        }
    }
    let (collected,reserved):(i64,i64)=sqlx::query_as("SELECT (SELECT COALESCE(sum(amount_paise),0) FROM payments WHERE restaurant_id=?1 AND order_id=?2 AND status='COMPLETED'),(SELECT COALESCE(sum(refund_amount_paise),0) FROM refunds WHERE restaurant_id=?1 AND order_id=?2 AND status!='cancelled')").bind(&rid).bind(&order).fetch_one(&mut *tx).await?;
    if req.refund_amount_paise > collected - reserved {
        return Err(bad("Refund exceeds the remaining collected balance"));
    }
    if let Some(p) = &payment {
        let balance:Option<i64>=sqlx::query_scalar("SELECT amount_paise-(SELECT COALESCE(sum(refund_amount_paise),0) FROM refunds WHERE payment_id=payments.id AND status!='cancelled') FROM payments WHERE id=? AND order_id=? AND restaurant_id=? AND status='COMPLETED'").bind(p).bind(&order).bind(&rid).fetch_optional(&mut *tx).await?;
        if req.refund_amount_paise > balance.unwrap_or(0) {
            return Err(bad("Refund exceeds this payment's balance"));
        }
    }
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let row=sqlx::query("INSERT INTO refunds(id,restaurant_id,order_id,payment_id,refund_amount_paise,reason,status,requested_at,refund_method,processed_by_staff_id,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,'requested',?,?,?,?,?,?) RETURNING *").bind(&id).bind(rid).bind(order).bind(payment).bind(req.refund_amount_paise).bind(req.reason.trim()).bind(&now).bind(req.refund_method).bind(staff).bind(key).bind(&now).bind(&now).fetch_one(&mut *tx).await?;
    let result = record(row)?;
    queue(&mut tx, "refund", &id, "REFUND_REQUESTED", &result).await?;
    tx.commit().await?;
    ok(result)
}

pub(super) async fn decide(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateRefundStatusRequest>,
) -> Response {
    let (_, _, role, rid) = identity(&s, &h).await?;
    if !matches!(role.as_str(), "ADMIN" | "MANAGER") {
        return Err(AppError::Forbidden("Manager approval required".into()));
    }
    let status = req.status.to_lowercase();
    if !matches!(status.as_str(), "completed" | "cancelled") {
        return Err(bad("Unknown refund decision"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let previous = record(
        sqlx::query("SELECT * FROM refunds WHERE id=? AND restaurant_id=?")
            .bind(&id)
            .bind(&rid)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| bad("Unknown refund"))?,
    )?;
    if previous["status"] == status {
        return ok(previous);
    }
    if previous["status"] != "requested" {
        return Err(bad("Refund already decided"));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let result=record(sqlx::query("UPDATE refunds SET status=?1,updated_at=?2,completed_at=CASE WHEN ?1='completed' THEN ?2 END,cancelled_at=CASE WHEN ?1='cancelled' THEN ?2 END WHERE id=?3 RETURNING *").bind(status).bind(now).bind(&id).fetch_one(&mut *tx).await?)?;
    sqlx::query("UPDATE orders SET payment_status='REFUNDED' WHERE id=? AND payment_status='PAID' AND total_amount_paise<=(SELECT sum(refund_amount_paise) FROM refunds WHERE refunds.order_id=orders.id AND status='completed')").bind(result["order_id"].as_str()).execute(&mut *tx).await?;
    queue(&mut tx, "refund", &id, "REFUND_STATUS_UPDATED", &result).await?;
    tx.commit().await?;
    ok(result)
}

pub(super) async fn splits(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows=sqlx::query("SELECT b.*,o.order_number,o.order_type,o.customer_name,o.pickup_reference FROM split_bills b JOIN orders o ON o.id=b.order_id WHERE o.restaurant_id=? AND (? IS NULL OR o.id=?) ORDER BY o.created_at,b.split_number").bind(rid).bind(q.get("order_id")).bind(q.get("order_id")).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
pub(super) async fn order_splits(
    s: State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    splits(s, h, Query(HashMap::from([("order_id".into(), id)]))).await
}
pub(super) async fn split(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SplitOrderRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let rows = split_round(&mut tx, &rid, &id, req).await?;
    tx.commit().await?;
    ok(json!(rows))
}

async fn split_round(
    db: &mut sqlx::SqliteConnection,
    rid: &str,
    id: &str,
    req: SplitOrderRequest,
) -> Result<Vec<serde_json::Value>, AppError> {
    let kind = req.split_type.to_lowercase();
    let allocations = req.item_allocations.unwrap_or_default();
    let ways = req.ways.unwrap_or_else(|| {
        allocations
            .iter()
            .map(|a| a.split_number.max(0) as usize)
            .max()
            .unwrap_or(0)
    });
    if !matches!(kind.as_str(), "equal" | "item")
        || !(2..=100).contains(&ways)
        || (kind == "equal" && !allocations.is_empty())
    {
        return Err(bad("Choose between 2 and 100 equal shares"));
    }
    let (total,status,payment):(i64,String,String)=sqlx::query_as("SELECT total_amount_paise,status,payment_status FROM orders WHERE restaurant_id=? AND id=?").bind(&rid).bind(&id).fetch_optional(&mut *db).await?.ok_or_else(missing)?;
    if total < ways as i64 || status == "CANCELLED" || payment != "UNPAID" {
        return Err(bad("This order cannot be split"));
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM split_bills WHERE order_id=?")
        .bind(&id)
        .fetch_one(&mut *db)
        .await?;
    if count != 0 && count != ways as i64 {
        return Err(bad("Order already split"));
    }
    let mut shares: Vec<i64> = (0..ways as i64)
        .map(|i| total / ways as i64 + i64::from(i < total % ways as i64))
        .collect();
    let mut by_share = std::collections::BTreeMap::<(usize, String), i64>::new();
    if kind == "item" {
        let lines: Vec<(String, i64, i64)> =
            sqlx::query_as("SELECT id,quantity,unit_price_paise FROM order_items WHERE order_id=?")
                .bind(&id)
                .fetch_all(&mut *db)
                .await?;
        let mut available: HashMap<String, (i64, i64)> =
            lines.into_iter().map(|(id, q, p)| (id, (q, p))).collect();
        let mut weights = vec![0i64; ways];
        for allocation in allocations {
            if allocation.quantity <= 0
                || allocation.split_number <= 0
                || allocation.split_number as usize > ways
            {
                return Err(bad("Invalid item allocation"));
            }
            let key = allocation.order_item_id.to_string();
            let share = (allocation.split_number - 1) as usize;
            let (left, price) = available
                .get_mut(&key)
                .ok_or_else(|| bad("Item belongs to another order"))?;
            let qty = i64::from(allocation.quantity);
            if qty > *left {
                return Err(bad("Item allocated more than once"));
            }
            *left -= qty;
            weights[share] += qty * *price;
            *by_share.entry((share, key)).or_default() += qty;
        }
        if available.values().any(|(remaining, _)| *remaining != 0) || weights.contains(&0) {
            return Err(bad(
                "Allocate every item and give each share a positive value",
            ));
        }
        let weight: i128 = weights.iter().map(|x| i128::from(*x)).sum();
        let mut cumulative = 0i128;
        let mut previous = 0;
        for (i, part) in weights.into_iter().enumerate() {
            cumulative += i128::from(part);
            let end = (i128::from(total) * cumulative / weight) as i64;
            shares[i] = end - previous;
            previous = end;
        }
        if shares.contains(&0) {
            return Err(bad("Bill too small for these allocations"));
        }
    }
    if count > 0 {
        let existing:Vec<(String,i64)>=sqlx::query_as("SELECT split_type,amount_paise FROM split_bills WHERE order_id=? ORDER BY split_number").bind(&id).fetch_all(&mut *db).await?;
        let existing_lines:Vec<(i32,String,i64)>=sqlx::query_as("SELECT b.split_number,a.order_item_id,a.quantity FROM split_item_allocations a JOIN split_bills b ON b.id=a.split_bill_id WHERE b.order_id=?").bind(&id).fetch_all(&mut *db).await?;
        if existing
            .iter()
            .zip(&shares)
            .any(|((k, amt), want)| k != &kind || amt != want)
            || existing_lines.len() != by_share.len()
            || existing_lines
                .iter()
                .any(|(n, i, q)| by_share.get(&((*n - 1) as usize, i.clone())) != Some(q))
        {
            return Err(bad("This order already has different allocations"));
        }
    }
    if count == 0 {
        for (i, amount) in shares.into_iter().enumerate() {
            let sid = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO split_bills(id,order_id,split_number,split_total_count,split_type,amount_paise) VALUES(?,?,?,?,?,?)").bind(&sid).bind(&id).bind((i+1) as i64).bind(ways as i64).bind(&kind).bind(amount).execute(&mut *db).await?;
            for ((_, item), quantity) in by_share.iter().filter(|((index, _), _)| *index == i) {
                sqlx::query("INSERT INTO split_item_allocations(split_bill_id,order_item_id,quantity) VALUES(?,?,?)").bind(&sid).bind(item).bind(quantity).execute(&mut *db).await?;
            }
        }
        sqlx::query("UPDATE orders SET is_split=1,split_count=? WHERE id=?")
            .bind(ways as i64)
            .bind(&id)
            .execute(&mut *db)
            .await?;
    }
    let rows = sqlx::query("SELECT * FROM split_bills WHERE order_id=? ORDER BY split_number")
        .bind(id)
        .fetch_all(&mut *db)
        .await?;
    Ok(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?)
}
pub(super) async fn list_refunds(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows=sqlx::query("SELECT r.*,o.order_number,o.customer_name,p.split_bill_id,u.name AS staff_name FROM refunds r JOIN orders o ON o.id=r.order_id LEFT JOIN payments p ON p.id=r.payment_id LEFT JOIN users u ON u.id=r.processed_by_staff_id WHERE r.restaurant_id=? ORDER BY r.created_at DESC,r.id").bind(rid).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}

#[derive(serde::Deserialize)]
pub(super) struct SessionSplit {
    order_ids: Vec<Uuid>,
    ways: usize,
    discount_paise: Option<i64>,
    coupon_code: Option<String>,
}
pub(super) async fn session_split(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<SessionSplit>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    if req.order_ids.is_empty() || req.order_ids.len() > 200 || !(2..=100).contains(&req.ways) {
        return Err(bad("Invalid rounds or shares"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut rounds = Vec::new();
    let mut subtotal = 0;
    let mut visit = None;
    let mut seen = std::collections::HashSet::new();
    for key in &req.order_ids {
        if !seen.insert(key) {
            return Err(bad("Duplicate round"));
        }
        let id = key.to_string();
        let row = super::snapshot(&mut tx, &rid, &id).await?;
        let session = row["seating_session_id"].as_str().map(str::to_owned);
        if req.order_ids.len() > 1
            && (session.is_none() || (!rounds.is_empty() && session != visit))
        {
            return Err(bad("Rounds must belong to the same visit"));
        }
        if !matches!(
            row["status"].as_str(),
            Some("PREPARING" | "IN_PREPARATION" | "READY" | "DISPATCHED" | "SERVED")
        ) || row["payment_status"] != "UNPAID"
        {
            return Err(bad("Send all rounds to the kitchen before splitting"));
        }
        visit = session;
        subtotal += row["subtotal_paise"].as_i64().unwrap_or(0);
        rounds.push((id, row));
    }
    if let Some(session) = &visit {
        let active:i64=sqlx::query_scalar("SELECT count(*) FROM orders WHERE restaurant_id=? AND seating_session_id=? AND payment_status IN ('UNPAID','PARTIAL') AND status<>'CANCELLED'").bind(&rid).bind(session).fetch_one(&mut *tx).await?;
        if active != rounds.len() as i64 {
            return Err(bad(
                "The visit changed. Refresh its rounds before splitting.",
            ));
        }
    }
    let (first, primary) = &rounds[0];
    let phone = primary["customer_phone_e164"].as_str();
    let discount = if let Some(code) = req.coupon_code.as_deref() {
        let (coupon, amount) =
            super::coupons::quote(&mut tx, &rid, code, subtotal, phone, Some(first)).await?;
        super::coupons::save(&mut tx, &coupon, first, phone, amount).await?;
        Some(amount)
    } else {
        req.discount_paise
    };
    if subtotal <= 0 || discount.is_some_and(|v| v < 0 || v > subtotal) {
        return Err(bad("Invalid session discount"));
    }
    let (tax, service): (f64, f64) =
        sqlx::query_as("SELECT gst_rate,service_charge_rate FROM restaurants WHERE id=?")
            .bind(&rid)
            .fetch_one(&mut *tx)
            .await?;
    let mut cumulative = 0i128;
    let mut allocated = 0i64;
    let mut result = Vec::new();
    for (id, row) in rounds {
        let sub = row["subtotal_paise"].as_i64().unwrap_or(0);
        if let Some(amount) = discount {
            cumulative += i128::from(sub);
            let end = (i128::from(amount) * cumulative / i128::from(subtotal)) as i64;
            let part = end - allocated;
            allocated = end;
            if (row["is_split"] == 1 || row["is_split"] == true)
                && (row["discount_paise"].as_i64() != Some(part)
                    || row["applied_coupon_code"].as_str() != req.coupon_code.as_deref())
            {
                return Err(bad("Cannot change the discount on an issued split bill"));
            }
            let bill = crate::services::order_service::OrderService::calculate_bill(
                sub, part, tax, service, true,
            );
            sqlx::query("UPDATE orders SET discount_paise=?,tax_paise=?,service_charge_paise=?,round_off_paise=?,total_amount_paise=?,applied_coupon_code=? WHERE id=?")
              .bind(part).bind(bill.tax_paise).bind(bill.service_charge_paise).bind(bill.round_off_paise).bind(bill.final_amount_paise).bind(&req.coupon_code).bind(&id).execute(&mut *tx).await?;
        }
        let shares = split_round(
            &mut tx,
            &rid,
            &id,
            SplitOrderRequest {
                split_type: "equal".into(),
                ways: Some(req.ways),
                item_allocations: None,
            },
        )
        .await?;
        result.push(json!({"order":super::snapshot(&mut tx,&rid,&id).await?, "shares":shares}));
    }
    tx.commit().await?;
    ok(json!(result))
}
