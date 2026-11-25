use super::{bad, ok, record, Response};
use crate::{
    error::AppError,
    models::restaurant::UpdateRestaurantPayload,
    routes::{
        auth_routes::hash_password,
        restaurant_routes::{
            AttendanceQuery, CreateStaffPayload, MarkAttendancePayload, UpdateStaffPayload,
        },
    },
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, put},
    Json, Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

pub(super) fn routes() -> Router<StaffState> {
    Router::new()
        .route("/api/v1/restaurants/staff/performance", get(performance))
        .route("/api/v1/restaurants/settings", put(settings))
        .route("/api/v1/restaurants/staff", get(staff).post(create))
        .route("/api/v1/restaurants/staff/:id", put(update).delete(remove))
        .route(
            "/api/v1/restaurants/staff/attendance",
            get(attendance).post(mark),
        )
}
async fn admin(s: &StaffState, h: &HeaderMap) -> Result<String, AppError> {
    let (_, _, role, rid) = identity(s, h).await?;
    if role != "ADMIN" {
        return Err(AppError::Forbidden("Administrator access required".into()));
    }
    Ok(rid)
}
const COLUMNS:&str="id,restaurant_id,name,role,email,login_id,phone,shift,assigned_section,monthly_salary_paise,payroll_cycle_start_day,is_active,permissions,created_at,updated_at";
fn safe(row: sqlx::sqlite::SqliteRow) -> Result<Value, AppError> {
    let mut data = record(row)?;
    data["permissions"] = serde_json::from_str(data["permissions"].as_str().unwrap_or("[]"))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(data)
}
async fn staff(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let rows = sqlx::query(&format!(
        "SELECT {COLUMNS} FROM users WHERE restaurant_id=? AND login_id IS NOT NULL ORDER BY name"
    ))
    .bind(rid)
    .fetch_all(&s.pool)
    .await?;
    ok(json!(rows
        .into_iter()
        .map(safe)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn create(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<CreateStaffPayload>,
) -> Response {
    let rid = admin(&s, &h).await?;
    let id = Uuid::new_v4().to_string();
    let login = req
        .login_id
        .or(req.email.clone())
        .unwrap_or_else(|| req.name.to_lowercase().replace(' ', "."));
    if req.name.trim().is_empty() || login.trim().is_empty() || req.password.trim().is_empty() {
        return Err(bad("Name, login ID and password required"));
    }
    let hash = hash_password(req.password.trim()).map_err(AppError::Internal)?;
    let row=sqlx::query(&format!("INSERT INTO users(id,restaurant_id,name,role,email,login_id,pin_hash,phone,shift,assigned_section,monthly_salary_paise,payroll_cycle_start_day,permissions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING {COLUMNS}")).bind(&id).bind(rid).bind(req.name.trim()).bind(req.role.to_uppercase()).bind(req.email.unwrap_or_else(||format!("{id}@localhost"))).bind(login.trim()).bind(hash).bind(req.phone).bind(req.shift).bind(req.assigned_section).bind(req.monthly_salary_paise.unwrap_or(0)).bind(req.payroll_cycle_start_day.unwrap_or(1)).bind(json!(req.permissions.unwrap_or_default()).to_string()).fetch_one(&s.pool).await?;
    ok(safe(row)?)
}
async fn update(
    State(s): State<StaffState>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateStaffPayload>,
) -> Response {
    let rid = admin(&s, &h).await?;
    let hash = req
        .password
        .filter(|v| !v.trim().is_empty())
        .map(|v| hash_password(v.trim()))
        .transpose()
        .map_err(AppError::Internal)?;
    let row=sqlx::query(&format!("UPDATE users SET name=coalesce(?1,name),role=coalesce(?2,role),login_id=coalesce(?3,login_id),email=coalesce(?4,email),phone=coalesce(?5,phone),pin_hash=coalesce(?6,pin_hash),shift=coalesce(?7,shift),assigned_section=coalesce(?8,assigned_section),is_active=coalesce(?9,is_active),monthly_salary_paise=coalesce(?10,monthly_salary_paise),payroll_cycle_start_day=coalesce(?11,payroll_cycle_start_day),permissions=coalesce(?12,permissions),updated_at=CURRENT_TIMESTAMP WHERE id=?13 AND restaurant_id=?14 AND (role!='ADMIN' OR is_active=0 OR (coalesce(?2,role)='ADMIN' AND coalesce(?9,is_active)=1) OR EXISTS(SELECT 1 FROM users u WHERE u.restaurant_id=?14 AND u.id!=?13 AND u.role='ADMIN' AND u.is_active=1)) RETURNING {COLUMNS}"))
 .bind(req.name).bind(req.role.map(|r|r.to_uppercase())).bind(req.login_id).bind(req.email).bind(req.phone).bind(hash).bind(req.shift).bind(req.assigned_section).bind(req.is_active).bind(req.monthly_salary_paise).bind(req.payroll_cycle_start_day).bind(req.permissions.map(|v|json!(v).to_string())).bind(id).bind(rid).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown staff account or last active administrator"))?;
    ok(safe(row)?)
}
async fn remove(State(s): State<StaffState>, h: HeaderMap, Path(id): Path<String>) -> Response {
    let rid = admin(&s, &h).await?;
    if sqlx::query("UPDATE users SET is_active=0 WHERE id=?1 AND restaurant_id=?2 AND (role!='ADMIN' OR EXISTS(SELECT 1 FROM users u WHERE u.restaurant_id=?2 AND u.id!=?1 AND u.role='ADMIN' AND u.is_active=1))").bind(id).bind(rid).execute(&s.pool).await?.rows_affected()!=1{return Err(bad("Unknown staff account or last active administrator"));}
    ok(Value::Null)
}
async fn attendance(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<AttendanceQuery>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let rows=sqlx::query("SELECT a.*,u.name AS staff_name FROM staff_attendance a JOIN users u ON u.id=a.staff_id WHERE a.restaurant_id=?1 AND (?2 IS NULL OR a.staff_id=?2) AND (?3 IS NULL OR substr(attendance_date,1,7)=?3) AND (?4 IS NULL OR attendance_date=?4) ORDER BY attendance_date DESC,u.name").bind(rid).bind(q.staff_id.map(|v|v.to_string())).bind(q.month).bind(q.date).fetch_all(&s.pool).await?;
    ok(json!(rows
        .into_iter()
        .map(record)
        .collect::<Result<Vec<_>, _>>()?))
}
async fn mark(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<MarkAttendancePayload>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let status = req.status.to_uppercase();
    if !matches!(
        status.as_str(),
        "PRESENT" | "HALF_DAY" | "ABSENT" | "PAID_LEAVE"
    ) || chrono::NaiveDate::parse_from_str(&req.attendance_date, "%Y-%m-%d").is_err()
    {
        return Err(bad("Invalid attendance date or status"));
    }
    let row=sqlx::query("INSERT INTO staff_attendance(id,restaurant_id,staff_id,attendance_date,status,notes) SELECT ?1,?2,?3,?4,?5,?6 WHERE EXISTS(SELECT 1 FROM users WHERE id=?3 AND restaurant_id=?2) ON CONFLICT(staff_id,attendance_date) DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP RETURNING *").bind(Uuid::new_v4().to_string()).bind(rid).bind(req.staff_id.to_string()).bind(req.attendance_date).bind(status).bind(req.notes).fetch_optional(&s.pool).await?.ok_or_else(||bad("Unknown staff member"))?;
    ok(record(row)?)
}
pub(super) async fn settings(
    State(s): State<StaffState>,
    h: HeaderMap,
    Json(req): Json<UpdateRestaurantPayload>,
) -> Response {
    let rid = admin(&s, &h).await?;
    if [
        req.gst_rate,
        req.cgst_rate,
        req.sgst_rate,
        req.service_charge_rate,
    ]
    .into_iter()
    .flatten()
    .any(|n| !(0.0..=100.0).contains(&n))
    {
        return Err(bad("Rates must be between zero and 100"));
    }
    let row=sqlx::query("UPDATE restaurants SET name=coalesce(?,name),tagline=coalesce(?,tagline),description=coalesce(?,description),phone=coalesce(?,phone),email=coalesce(?,email),address=coalesce(?,address),city=coalesce(?,city),state=coalesce(?,state),postal_code=coalesce(?,postal_code),gstin=coalesce(?,gstin),fssai_license=coalesce(?,fssai_license),gst_rate=coalesce(?,gst_rate),cgst_rate=coalesce(?,cgst_rate),sgst_rate=coalesce(?,sgst_rate),service_charge_rate=coalesce(?,service_charge_rate),google_review_url=coalesce(?,google_review_url),whatsapp_templates=coalesce(?,whatsapp_templates),updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *")
 .bind(req.name).bind(req.tagline).bind(req.description).bind(req.phone).bind(req.email).bind(req.address).bind(req.city).bind(req.state).bind(req.postal_code).bind(req.gstin).bind(req.fssai_license).bind(req.gst_rate).bind(req.cgst_rate).bind(req.sgst_rate).bind(req.service_charge_rate).bind(req.google_review_url).bind(req.whatsapp_templates.map(|v|v.to_string())).bind(rid).fetch_one(&s.pool).await?;
    ok(record(row)?)
}
async fn performance(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<AttendanceQuery>,
) -> Response {
    let rid = super::catalog_admin::manager(&s, &h).await?;
    let month = q.month.unwrap_or_else(|| {
        (chrono::Utc::now() + chrono::Duration::minutes(330))
            .format("%Y-%m")
            .to_string()
    });
    let first = chrono::NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| bad("Use YYYY-MM for the payroll month"))?;
    let following = first
        .checked_add_months(chrono::Months::new(1))
        .ok_or_else(|| bad("Invalid month"))?;
    let days = (following - first).num_days();
    let mut tx = s.pool.begin().await?;
    let staff=sqlx::query("SELECT id AS staff_id,name AS staff_name,role,shift,monthly_salary_paise,payroll_cycle_start_day FROM users WHERE restaurant_id=? AND login_id IS NOT NULL ORDER BY name").bind(&rid).fetch_all(&mut *tx).await?;
    let mut summaries = Vec::new();
    for row in staff {
        let mut member = record(row)?;
        let offset = chrono::Duration::days(
            member["payroll_cycle_start_day"]
                .as_i64()
                .unwrap_or(1)
                .clamp(1, 28)
                - 1,
        );
        let start = (first + offset).to_string();
        let end = (following + offset - chrono::Duration::days(1)).to_string();
        let (present,half,absent,leave):(i64,i64,i64,i64)=sqlx::query_as("SELECT count(*) FILTER(WHERE status='PRESENT'),count(*) FILTER(WHERE status='HALF_DAY'),count(*) FILTER(WHERE status='ABSENT'),count(*) FILTER(WHERE status='PAID_LEAVE') FROM staff_attendance WHERE restaurant_id=? AND staff_id=? AND attendance_date BETWEEN ? AND ?").bind(&rid).bind(member["staff_id"].as_str()).bind(&start).bind(&end).fetch_one(&mut *tx).await?;
        let (count,total):(i64,i64)=sqlx::query_as("SELECT count(*),coalesce(sum(total_amount_paise),0) FROM orders WHERE restaurant_id=? AND server_staff_id=? AND status!='CANCELLED' AND date(created_at,'+330 minutes') BETWEEN ? AND ?").bind(&rid).bind(member["staff_id"].as_str()).bind(&start).bind(&end).fetch_one(&mut *tx).await?;
        let worked = (present + leave) as f64 + half as f64 / 2.;
        let salary = (member["monthly_salary_paise"].as_i64().unwrap_or(0) as f64 * worked
            / days as f64)
            .round() as i64;
        let fields = json!({"cycle_start_date":start,"cycle_end_date":end,"total_days_in_month":days,"present_days":worked,"half_days":half,"absent_days":absent,"leave_days":leave,"effective_working_days":worked,"calculated_salary_paise":salary,"orders_served_count":count,"orders_served_total_paise":total});
        if let (Some(target), Value::Object(fields)) = (member.as_object_mut(), fields) {
            target.extend(fields);
        }
        summaries.push(member);
    }
    ok(json!(summaries))
}
