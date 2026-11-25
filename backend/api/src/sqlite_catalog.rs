use super::{bad, ok, record, Response};
use crate::{
    error::AppError,
    models::{menu::*, table::CreateTableRequest},
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use uuid::Uuid;

pub(super) async fn manager(s: &StaffState, h: &HeaderMap) -> Result<String, AppError> {
    let (_, _, role, rid) = identity(s, h).await?;
    if !matches!(role.as_str(), "ADMIN" | "MANAGER") {
        return Err(AppError::Forbidden("Manager access required".into()));
    }
    Ok(rid)
}
pub(super) async fn category(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateMenuCategoryRequest>,
) -> Response {
    let rid = manager(&s, &h).await?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(bad("Category name required"));
    }
    let slug = req.slug.unwrap_or_else(|| {
        name.to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-")
    });
    let row=sqlx::query("INSERT INTO menu_categories(id,restaurant_id,name,slug,display_order,sort_order) VALUES(?,?,?,?,?5,?5) RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(name).bind(slug).bind(req.display_order.unwrap_or(0)).fetch_one(&s.pool).await?;
    ok(record(row)?)
}
pub(super) async fn edit_category(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateMenuCategoryRequest>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if req.name.as_ref().is_some_and(|n| n.trim().is_empty()) {
        return Err(bad("Category name required"));
    }
    let row=sqlx::query("UPDATE menu_categories SET name=coalesce(?1,name),slug=coalesce(?2,slug),display_order=coalesce(?3,display_order),sort_order=coalesce(?3,sort_order),is_active=coalesce(?4,is_active),updated_at=CURRENT_TIMESTAMP WHERE id=?5 AND restaurant_id=?6 RETURNING *").bind(req.name).bind(req.slug).bind(req.display_order).bind(req.is_active).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown category"))?;
    ok(record(row)?)
}
pub(super) async fn remove_category(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if sqlx::query("DELETE FROM menu_categories WHERE id=? AND restaurant_id=? AND NOT EXISTS(SELECT 1 FROM menu_items WHERE category_id=menu_categories.id)").bind(id).bind(rid).execute(&s.pool).await?.rows_affected()==0{return Err(bad("Remove or reassign the category's items first"));}
    ok(serde_json::Value::Null)
}
pub(super) async fn item(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateMenuItemRequest>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if req.name.trim().is_empty() || req.base_price_paise < 0 {
        return Err(bad("Provide a name and a nonnegative price"));
    }
    let veg = req.is_veg.unwrap_or(true);
    let row=sqlx::query("INSERT INTO menu_items(id,restaurant_id,category_id,name,description,price_paise,base_price_paise,tax_rate_percent,is_veg,dietary,is_available,image_url,preparation_time_minutes,display_order) SELECT ?1,?2,c.id,?4,?5,?6,?6,?7,?8,?9,?10,?11,?12,?13 FROM menu_categories c WHERE c.id=?3 AND c.restaurant_id=?2 RETURNING *")
 .bind(Uuid::new_v4().to_string()).bind(rid).bind(req.category_id.map(|v|v.to_string())).bind(req.name.trim()).bind(req.description).bind(req.base_price_paise).bind(req.tax_rate_percent.unwrap_or(5.0)).bind(veg).bind(if veg{"VEG"}else{"NON_VEG"}).bind(req.is_available.unwrap_or(true)).bind(req.image_url).bind(req.preparation_time_minutes.unwrap_or(15)).bind(req.display_order.unwrap_or(0)).fetch_optional(&s.pool).await?.ok_or_else(||bad("Choose an existing category"))?;
    ok(record(row)?)
}
pub(super) async fn edit_item(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateMenuItemRequest>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if req.base_price_paise.is_some_and(|v| v < 0)
        || req.name.as_ref().is_some_and(|n| n.trim().is_empty())
    {
        return Err(bad("Invalid name or price"));
    }
    let row=sqlx::query("UPDATE menu_items SET category_id=coalesce(?1,category_id),name=coalesce(?2,name),description=coalesce(?3,description),price_paise=coalesce(?4,price_paise),base_price_paise=coalesce(?4,base_price_paise),tax_rate_percent=coalesce(?5,tax_rate_percent),is_veg=coalesce(?6,is_veg),dietary=CASE ?6 WHEN 1 THEN 'VEG' WHEN 0 THEN 'NON_VEG' ELSE dietary END,is_available=coalesce(?7,is_available),image_url=coalesce(?8,image_url),preparation_time_minutes=coalesce(?9,preparation_time_minutes),display_order=coalesce(?10,display_order),updated_at=CURRENT_TIMESTAMP WHERE id=?11 AND restaurant_id=?12 AND (?1 IS NULL OR EXISTS(SELECT 1 FROM menu_categories WHERE id=?1 AND restaurant_id=?12)) RETURNING *")
 .bind(req.category_id.map(|v|v.to_string())).bind(req.name).bind(req.description).bind(req.base_price_paise).bind(req.tax_rate_percent).bind(req.is_veg).bind(req.is_available).bind(req.image_url).bind(req.preparation_time_minutes).bind(req.display_order).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown item or category"))?;
    ok(record(row)?)
}
pub(super) async fn availability(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateItemAvailabilityRequest>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let row=sqlx::query("UPDATE menu_items SET is_available=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=? RETURNING *").bind(req.is_available).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown item"))?;
    ok(record(row)?)
}
pub(super) async fn remove_item(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if sqlx::query("DELETE FROM menu_items WHERE id=? AND restaurant_id=? AND NOT EXISTS(SELECT 1 FROM order_items WHERE menu_item_id=menu_items.id)").bind(id).bind(rid).execute(&s.pool).await?.rows_affected()==0{return Err(bad("Historical menu items can be marked unavailable"));}
    ok(serde_json::Value::Null)
}
pub(super) async fn table(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateTableRequest>,
) -> Response {
    let rid = manager(&s, &h).await?;
    if req.table_number.trim().is_empty() || req.capacity.unwrap_or(4) < 1 {
        return Err(bad("Provide a table number and positive capacity"));
    }
    let row=sqlx::query("INSERT INTO tables(id,restaurant_id,number,table_number,capacity,section,qr_token,qr_code_identifier) VALUES(?1,?2,?3,?3,?4,?5,?6,?6) RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(req.table_number.trim()).bind(req.capacity.unwrap_or(4)).bind(req.section.unwrap_or_else(||"Main Hall".into())).bind(req.qr_code_identifier.unwrap_or_else(||Uuid::new_v4().to_string())).fetch_one(&s.pool).await?;
    ok(record(row)?)
}
