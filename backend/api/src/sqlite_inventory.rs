use super::{bad, ok, record, Response};
use crate::{
    models::inventory::*,
    services::inventory_service::InventoryService,
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post, put},
    Json, Router,
};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;
pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .route("/api/v1/inventory/items", get(list).post(create))
        .route("/api/v1/inventory/items/:id", put(update))
        .route("/api/v1/inventory/wastage", post(waste))
        .route("/api/v1/inventory/movements", get(movements))
}
async fn list(State(s): State<StaffState>, h: HeaderMap) -> Response {
    super::catalog(
        s,
        h,
        "SELECT * FROM inventory_items WHERE restaurant_id=? ORDER BY name",
    )
    .await
}
async fn create(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateInventoryItemRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    if req.name.trim().is_empty()
        || req.initial_stock.unwrap_or(0.) < 0.
        || req.cost_per_unit_paise < 0
    {
        return Err(bad("Invalid inventory item"));
    }
    let mut tx = s.pool.begin().await?;
    let id = Uuid::new_v4().to_string();
    let initial = req.initial_stock.unwrap_or(0.);
    let row=sqlx::query("INSERT INTO inventory_items(id,restaurant_id,name,sku,category,unit_of_measure,current_stock,reorder_level,cost_per_unit_paise) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *").bind(&id).bind(&rid).bind(req.name).bind(req.sku).bind(req.category).bind(req.unit_of_measure).bind(initial).bind(req.reorder_level.unwrap_or(0.)).bind(req.cost_per_unit_paise).fetch_one(&mut *tx).await?;
    if initial > 0. {
        movement(&mut tx, &rid, &id, "purchase", initial, initial, None).await?;
    }
    tx.commit().await?;
    ok(record(row)?)
}
async fn movement(
    db: &mut sqlx::SqliteConnection,
    rid: &str,
    item: &str,
    kind: &str,
    delta: f64,
    balance: f64,
    waste: Option<&str>,
) -> Result<(), crate::error::AppError> {
    sqlx::query("INSERT INTO stock_movements(id,restaurant_id,inventory_item_id,movement_type,quantity,balance_after,reference_wastage_id) VALUES(?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(rid).bind(item).bind(kind).bind(delta).bind(balance).bind(waste).execute(db).await?;
    Ok(())
}
async fn update(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateInventoryItemRequest>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    if req.current_stock.is_some_and(|v| v < 0.) || req.cost_per_unit_paise.is_some_and(|v| v < 0) {
        return Err(bad("Invalid stock or cost"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    let old: f64 = sqlx::query_scalar(
        "SELECT current_stock FROM inventory_items WHERE restaurant_id=? AND id=?",
    )
    .bind(&rid)
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| bad("Unknown inventory item"))?;
    let row=sqlx::query("UPDATE inventory_items SET name=coalesce(?,name),sku=coalesce(?,sku),category=coalesce(?,category),unit_of_measure=coalesce(?,unit_of_measure),current_stock=coalesce(?,current_stock),reorder_level=coalesce(?,reorder_level),cost_per_unit_paise=coalesce(?,cost_per_unit_paise),updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *").bind(req.name).bind(req.sku).bind(req.category).bind(req.unit_of_measure).bind(req.current_stock).bind(req.reorder_level).bind(req.cost_per_unit_paise).bind(&id).fetch_one(&mut *tx).await?;
    if let Some(stock) = req.current_stock.filter(|v| *v != old) {
        movement(&mut tx, &rid, &id, "adjustment", stock - old, stock, None).await?;
    }
    tx.commit().await?;
    ok(record(row)?)
}
async fn waste(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<RecordWastageRequest>,
) -> Response {
    let (staff, _, _, rid) = identity(&s, &h).await?;
    let item = req.inventory_item_id.to_string();
    if req.quantity <= 0. || req.reason.trim().is_empty() {
        return Err(bad("Provide a positive wastage quantity and reason"));
    }
    let mut tx = s.pool.begin_with("BEGIN IMMEDIATE").await?;
    if let Some(k) = &req.idempotency_key {
        if let Some(row) =
            sqlx::query("SELECT * FROM wastage_records WHERE restaurant_id=? AND idempotency_key=?")
                .bind(&rid)
                .bind(k)
                .fetch_optional(&mut *tx)
                .await?
        {
            let saved = record(row)?;
            if saved["inventory_item_id"] != item
                || saved["quantity"] != req.quantity
                || saved["unit_of_measure"] != req.unit_of_measure
            {
                return Err(bad("Wastage request key already used"));
            }
            return ok(saved);
        }
    }
    let (stock,unit,cost):(f64,String,i64)=sqlx::query_as("SELECT current_stock,unit_of_measure,cost_per_unit_paise FROM inventory_items WHERE restaurant_id=? AND id=?").bind(&rid).bind(&item).fetch_optional(&mut *tx).await?.ok_or_else(||bad("Unknown inventory item"))?;
    let used = InventoryService::convert_quantity(req.quantity, &req.unit_of_measure, &unit)?;
    if used > stock {
        return Err(bad("Wastage exceeds available stock"));
    }
    let balance = stock - used;
    let id = Uuid::new_v4().to_string();
    let row=sqlx::query("INSERT INTO wastage_records(id,restaurant_id,inventory_item_id,quantity,unit_of_measure,cost_impact_paise,reason,reported_by_staff_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *").bind(&id).bind(&rid).bind(&item).bind(req.quantity).bind(req.unit_of_measure).bind(InventoryService::calculate_wastage_cost(used,cost)).bind(req.reason).bind(staff).bind(req.idempotency_key).fetch_one(&mut *tx).await?;
    sqlx::query(
        "UPDATE inventory_items SET current_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
    .bind(balance)
    .bind(&item)
    .execute(&mut *tx)
    .await?;
    movement(&mut tx, &rid, &item, "wastage", -used, balance, Some(&id)).await?;
    tx.commit().await?;
    ok(record(row)?)
}
async fn movements(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows=sqlx::query("SELECT *,quantity AS quantity_change FROM stock_movements WHERE restaurant_id=?1 AND (?2 IS NULL OR inventory_item_id=?2) ORDER BY created_at DESC,rowid DESC").bind(rid).bind(q.get("item_id")).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
