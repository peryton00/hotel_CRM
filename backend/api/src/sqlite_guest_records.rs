use super::{bad, ok, record, Response};
use crate::{
    models::{customer::*, feedback::*},
    routes::customer_routes::{CustomerSearchQuery, ReservationQuery},
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post, put},
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;

pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .route("/api/v1/customers", get(customers).post(customer))
        .route("/api/v1/customers/:id/points", post(points))
        .route("/api/v1/reservations", get(reservations).post(reserve))
        .route("/api/v1/reservations/:id/status", put(reservation_status))
        .route("/api/v1/feedback", get(feedback).post(submit))
        .route("/api/v1/feedback/:id/reply", put(reply))
        .route("/api/v1/feedback/:id/visibility", put(visibility))
}
async fn customers(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<CustomerSearchQuery>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows=sqlx::query("SELECT * FROM customers WHERE restaurant_id=?1 AND (?2 IS NULL OR instr(lower(name),lower(?2))>0 OR instr(phone,?2)>0) ORDER BY name").bind(rid).bind(q.search).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn customer(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateCustomerRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    if req.name.trim().is_empty() || req.phone.trim().is_empty() {
        return Err(bad("Name and phone required"));
    }
    let row=sqlx::query("INSERT INTO customers(id,restaurant_id,name,phone,email,address,notes) VALUES(?,?,?,?,?,?,?) RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(req.name.trim()).bind(req.phone.trim()).bind(req.email).bind(req.address).bind(req.notes).fetch_one(&s.pool).await?;
    ok(record(row)?)
}
async fn points(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AwardPointsRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let row=sqlx::query("UPDATE customers SET loyalty_points=loyalty_points+?1,updated_at=CURRENT_TIMESTAMP WHERE restaurant_id=?2 AND id=?3 AND loyalty_points+?1>=0 RETURNING *").bind(req.points).bind(rid).bind(id).fetch_optional(&s.pool).await?.ok_or_else(||bad("Invalid customer or points balance"))?;
    ok(record(row)?)
}
async fn reservations(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<ReservationQuery>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows=sqlx::query("SELECT * FROM reservations WHERE restaurant_id=?1 AND (?2 IS NULL OR julianday(reservation_time)>=julianday(?2)) ORDER BY reservation_time").bind(rid).bind(q.from_time.map(|v|v.to_rfc3339())).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn reserve(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateReservationRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    if req.guest_count <= 0 || req.customer_name.trim().is_empty() {
        return Err(bad("Provide the guest name and party size"));
    }
    let row=sqlx::query("INSERT INTO reservations(id,restaurant_id,table_id,customer_id,customer_name,customer_phone,guest_count,reservation_time,special_requests) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE (?3 IS NULL OR EXISTS(SELECT 1 FROM tables WHERE restaurant_id=?2 AND id=?3)) AND (?4 IS NULL OR EXISTS(SELECT 1 FROM customers WHERE restaurant_id=?2 AND id=?4)) RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(req.table_id.map(|v|v.to_string())).bind(req.customer_id.map(|v|v.to_string())).bind(req.customer_name).bind(req.customer_phone).bind(req.guest_count).bind(req.reservation_time.to_rfc3339()).bind(req.special_requests).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown table or customer"))?;
    ok(record(row)?)
}
async fn reservation_status(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateReservationStatusRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let status = req.status.map(|s| s.to_ascii_lowercase());
    if status.as_deref().is_some_and(|v| {
        !matches!(
            v,
            "pending" | "confirmed" | "seated" | "cancelled" | "no_show" | "completed"
        )
    }) {
        return Err(bad("Invalid reservation status"));
    }
    let row=sqlx::query("UPDATE reservations SET status=coalesce(?1,status),table_id=coalesce(?2,table_id),updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND restaurant_id=?4 AND (?2 IS NULL OR EXISTS(SELECT 1 FROM tables WHERE restaurant_id=?4 AND id=?2)) RETURNING *").bind(status).bind(req.table_id.map(|v|v.to_string())).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown reservation or table"))?;
    ok(record(row)?)
}
async fn feedback(State(s): State<StaffState>, h: HeaderMap) -> Response {
    super::catalog(
        s,
        h,
        "SELECT * FROM feedback WHERE restaurant_id=? ORDER BY created_at DESC",
    )
    .await
}
async fn submit(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateFeedbackRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    if !(1..=5).contains(&req.rating) {
        return Err(bad("Rating must be from 1 to 5"));
    }
    let row=sqlx::query("INSERT INTO feedback(id,restaurant_id,order_id,customer_name,customer_phone,rating,comments) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE ?3 IS NULL OR EXISTS(SELECT 1 FROM orders WHERE restaurant_id=?2 AND id=?3) RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(req.order_id.map(|v|v.to_string())).bind(req.customer_name).bind(req.customer_phone).bind(req.rating).bind(req.comments).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown order"))?;
    ok(record(row)?)
}
async fn reply(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ReplyFeedbackRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let row=sqlx::query("UPDATE feedback SET resolution_note=?,is_resolved=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? RETURNING *").bind(req.resolution_note).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown feedback"))?;
    ok(record(row)?)
}
async fn visibility(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<ToggleFeedbackVisibilityRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let row=sqlx::query("UPDATE feedback SET is_public=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? RETURNING *").bind(req.is_public).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown feedback"))?;
    ok(record(row)?)
}
