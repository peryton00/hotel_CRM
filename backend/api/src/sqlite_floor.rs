use super::{bad, ok, record, snapshot, Response};
use crate::{
    error::AppError,
    models::table::{AssignTableStaffRequest, TransferTableRequest},
    routes::order_routes::AssignOrderServerRequest,
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::{IntoResponse, Response as HttpResponse},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::json;
pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .route("/api/v1/tables/:id", delete(remove))
        .route("/api/v1/tables/:id/assign", put(assign))
        .route("/api/v1/tables/transfer", post(transfer))
        .route("/api/v1/orders/:id/server", put(server))
        .route("/api/v1/restaurants/heartbeat", post(heartbeat))
        .route("/api/v1/printer/list", get(printers))
        .route("/api/v1/printer/print", post(print))
        .route("/api/v1/system/open-external", post(external))
}
async fn heartbeat(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    ok(json!({"status":"online","restaurant_id":rid}))
}
async fn printers(State(s): State<StaffState>, h: HeaderMap) -> Result<HttpResponse, AppError> {
    identity(&s, &h).await?;
    Ok(Json(crate::printer::list_system_printers().await).into_response())
}
async fn print(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<crate::printer::PrintEscposRequest>,
) -> Result<HttpResponse, AppError> {
    identity(&s, &h).await?;
    Ok(crate::printer::print_request(req).await.into_response())
}
async fn external(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<crate::routes::OpenExternalRequest>,
) -> Result<HttpResponse, AppError> {
    identity(&s, &h).await?;
    Ok(crate::routes::open_external_request(req)
        .await
        .into_response())
}
async fn remove(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    if sqlx::query("DELETE FROM tables WHERE id=? AND restaurant_id=? AND status='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM orders WHERE table_id=tables.id) AND NOT EXISTS(SELECT 1 FROM reservations WHERE table_id=tables.id)").bind(&id).bind(rid).execute(&s.pool).await?.rows_affected()==0{return Err(bad("Table is in use or has history"));}
    ok(json!({"deleted":true}))
}
async fn assign(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AssignTableStaffRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let row=sqlx::query("UPDATE tables SET assigned_staff_id=?1 WHERE id=?2 AND restaurant_id=?3 AND (?1 IS NULL OR EXISTS(SELECT 1 FROM users WHERE id=?1 AND restaurant_id=?3 AND is_active=1)) RETURNING *").bind(req.assigned_staff_id.map(|v|v.to_string())).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown table or staff member"))?;
    ok(record(row)?)
}
async fn transfer(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<TransferTableRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let from = req.from_table_id.to_string();
    let to = req.to_table_id.to_string();
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let source = record(
        sqlx::query("SELECT * FROM tables WHERE id=? AND restaurant_id=? AND status='OCCUPIED'")
            .bind(&from)
            .bind(&rid)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| bad("Source table must be occupied"))?,
    )?;
    if sqlx::query("UPDATE tables SET status='OCCUPIED',active_order_id=?,current_seating_session_id=?,assigned_staff_id=?,ordering_enabled=? WHERE id=? AND restaurant_id=? AND status='AVAILABLE'").bind(source["active_order_id"].as_str()).bind(source["current_seating_session_id"].as_str()).bind(source["assigned_staff_id"].as_str()).bind(source["ordering_enabled"].as_bool().unwrap_or(true)).bind(&to).bind(&rid).execute(&mut *tx).await?.rows_affected()!=1{return Err(bad("Destination must be available"));}
    sqlx::query("UPDATE orders SET table_id=? WHERE table_id=? AND restaurant_id=? AND payment_status IN ('UNPAID','PARTIAL') AND status!='CANCELLED'").bind(&to).bind(&from).bind(&rid).execute(&mut *tx).await?;
    sqlx::query("UPDATE tables SET status='AVAILABLE',active_order_id=NULL,current_seating_session_id=NULL,assigned_staff_id=NULL WHERE id=?").bind(from).execute(&mut *tx).await?;
    tx.commit().await?;
    ok(json!({"transferred":true}))
}
async fn server(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<AssignOrderServerRequest>,
) -> Response {
    let (_, _, role, rid) = identity(&s, &h).await?;
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let o = snapshot(&mut tx, &rid, &id).await?;
    if o["status"] == "COMPLETED" && role != "ADMIN" {
        let hash:Option<String>=sqlx::query_scalar("SELECT pin_hash FROM users WHERE restaurant_id=? AND role='ADMIN' AND is_active=1 LIMIT 1").bind(&rid).fetch_optional(&mut *tx).await?;
        if !hash.is_some_and(|v| {
            crate::routes::auth_routes::verify_password(
                &v,
                req.admin_password.as_deref().unwrap_or(""),
            )
        }) {
            return Err(AppError::Forbidden(
                "Administrator approval required".into(),
            ));
        }
    }
    if sqlx::query("UPDATE orders SET server_staff_id=?1 WHERE id=?2 AND (?1 IS NULL OR EXISTS(SELECT 1 FROM users WHERE id=?1 AND restaurant_id=?3 AND is_active=1))").bind(req.server_staff_id.map(|v|v.to_string())).bind(&id).bind(&rid).execute(&mut *tx).await?.rows_affected()==0{return Err(bad("Unknown staff member"));}
    let o = snapshot(&mut tx, &rid, &id).await?;
    tx.commit().await?;
    ok(o)
}
