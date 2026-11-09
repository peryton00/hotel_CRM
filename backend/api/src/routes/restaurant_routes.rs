use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{
        common::ApiResponse,
        restaurant::{StaffAttendance, StaffMember, StaffPerformanceSummary},
    },
    repositories::RestaurantRepository,
};

#[derive(Debug, Deserialize)]
pub struct CreateStaffPayload {
    pub name: String,
    pub role: String,
    pub login_id: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub password: String, // Secret password created by admin
    pub shift: Option<String>,
    pub assigned_section: Option<String>,
    pub monthly_salary_paise: Option<i64>,
    pub payroll_cycle_start_day: Option<i32>,
    pub permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStaffPayload {
    pub name: Option<String>,
    pub role: Option<String>,
    pub login_id: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub password: Option<String>, // If provided, secretly updates password in Supabase
    pub shift: Option<String>,
    pub assigned_section: Option<String>,
    pub is_active: Option<bool>,
    pub monthly_salary_paise: Option<i64>,
    pub payroll_cycle_start_day: Option<i32>,
    pub permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct MarkAttendancePayload {
    pub staff_id: Uuid,
    pub attendance_date: String, // YYYY-MM-DD
    pub status: String,          // PRESENT, HALF_DAY, ABSENT, PAID_LEAVE
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceQuery {
    pub staff_id: Option<Uuid>,
    pub month: Option<String>, // e.g. 2026-11
    pub date: Option<String>,  // e.g. 2026-11-07
}

pub async fn get_current_restaurant(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let restaurant = RestaurantRepository::get_by_id(&pool, tenant.restaurant_id).await?;
    match restaurant {
        Some(r) => Ok(Json(ApiResponse::success(r))),
        None => Err(AppError::NotFound(
            "Restaurant profile not found".to_string(),
        )),
    }
}

pub async fn list_staff_members(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let staff = RestaurantRepository::list_staff(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(staff)))
}

pub async fn create_staff_member(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(payload): Json<CreateStaffPayload>,
) -> Result<impl IntoResponse, AppError> {
    if tenant.staff_role.to_uppercase() != "ADMIN" {
        return Err(AppError::Forbidden(
            "Access Denied: Only Admin can create staff accounts and credentials".to_string(),
        ));
    }

    if payload.name.trim().is_empty() || payload.password.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Staff name and secret password are required".to_string(),
        ));
    }

    let id = Uuid::new_v4();
    let name = payload.name.trim().to_string();
    let login_id = payload
        .login_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            payload
                .email
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| name.to_lowercase().replace(' ', "."))
        });
    let phone = payload.phone.filter(|s| !s.trim().is_empty());
    let phone_e164 = phone.clone().unwrap_or_else(|| "+919000000000".to_string());
    let role = payload.role.trim().to_uppercase();
    let shift = payload
        .shift
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "General Shift".to_string());
    let assigned_section = payload
        .assigned_section
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Main Dining Floor".to_string());
    let secret_password = payload.password.trim().to_string();
    let monthly_salary = payload.monthly_salary_paise.unwrap_or(1500000);
    let cycle_start_day = payload.payroll_cycle_start_day.unwrap_or(1).clamp(1, 28);
    let perms_val = if role.to_uppercase() == "ADMIN" {
        serde_json::json!(["*"])
    } else {
        serde_json::json!(payload.permissions.unwrap_or_else(|| vec![
            "pos:orders:create".to_string(),
            "pos:bills:settle".to_string(),
        ]))
    };

    sqlx::query(
        r#"
        INSERT INTO staff_members (
            id, restaurant_id, name, role, email, phone, phone_e164,
            pin_hash, is_active, shift, assigned_section, login_id, monthly_salary_paise, payroll_cycle_start_day, permissions, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13, $14, NOW()
        )
        "#,
    )
    .bind(id)
    .bind(tenant.restaurant_id)
    .bind(&name)
    .bind(&role)
    .bind(&payload.email)
    .bind(&phone)
    .bind(&phone_e164)
    .bind(&secret_password)
    .bind(&shift)
    .bind(&assigned_section)
    .bind(&login_id)
    .bind(monthly_salary)
    .bind(cycle_start_day)
    .bind(&perms_val)
    .execute(&pool)
    .await?;

    let created = StaffMember {
        id,
        restaurant_id: tenant.restaurant_id,
        auth_user_id: None,
        name,
        role,
        email: payload.email,
        phone,
        is_active: true,
        shift: Some(shift),
        assigned_section: Some(assigned_section),
        login_id: Some(login_id),
        monthly_salary_paise: Some(monthly_salary),
        payroll_cycle_start_day: Some(cycle_start_day),
        permissions: Some(perms_val),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    Ok(Json(ApiResponse::success(created)))
}

pub async fn update_staff_member(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    tenant: TenantContext,
    Json(payload): Json<UpdateStaffPayload>,
) -> Result<impl IntoResponse, AppError> {
    if tenant.staff_role.to_uppercase() != "ADMIN" {
        return Err(AppError::Forbidden(
            "Access Denied: Only Admin can update staff accounts and reset passwords".to_string(),
        ));
    }

    if let Some(ref pwd) = payload.password {
        let trimmed_pwd = pwd.trim();
        if !trimmed_pwd.is_empty() {
            sqlx::query(
                "UPDATE staff_members SET pin_hash = $1, updated_at = NOW() WHERE id = $2 AND restaurant_id = $3",
            )
            .bind(trimmed_pwd)
            .bind(id)
            .bind(tenant.restaurant_id)
            .execute(&pool)
            .await?;
        }
    }

    sqlx::query(
        r#"
        UPDATE staff_members
        SET name = COALESCE($1, name),
            role = COALESCE($2, role),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            shift = COALESCE($5, shift),
            assigned_section = COALESCE($6, assigned_section),
            login_id = COALESCE($7, login_id),
            is_active = COALESCE($8, is_active),
            monthly_salary_paise = COALESCE($9, monthly_salary_paise),
            payroll_cycle_start_day = COALESCE($10, payroll_cycle_start_day),
            updated_at = NOW()
        WHERE id = $11 AND restaurant_id = $12
        "#,
    )
    .bind(&payload.name)
    .bind(&payload.role)
    .bind(&payload.email)
    .bind(&payload.phone)
    .bind(&payload.shift)
    .bind(&payload.assigned_section)
    .bind(&payload.login_id)
    .bind(payload.is_active)
    .bind(payload.monthly_salary_paise)
    .bind(payload.payroll_cycle_start_day)
    .bind(id)
    .bind(tenant.restaurant_id)
    .execute(&pool)
    .await?;

    if let Some(ref perms) = payload.permissions {
        let perms_val = serde_json::json!(perms);
        sqlx::query(
            "UPDATE staff_members SET permissions = $1, updated_at = NOW() WHERE id = $2 AND restaurant_id = $3",
        )
        .bind(perms_val)
        .bind(id)
        .bind(tenant.restaurant_id)
        .execute(&pool)
        .await?;
    }

    let staff = RestaurantRepository::get_staff_by_id(&pool, id, tenant.restaurant_id).await?;
    match staff {
        Some(s) => Ok(Json(ApiResponse::success(s))),
        None => Err(AppError::NotFound("Staff member not found".to_string())),
    }
}

pub async fn delete_staff_member(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    if tenant.staff_role.to_uppercase() != "ADMIN" {
        return Err(AppError::Forbidden(
            "Access Denied: Only Admin can deactivate staff accounts".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE staff_members SET is_active = false, updated_at = NOW() WHERE id = $1 AND restaurant_id = $2",
    )
    .bind(id)
    .bind(tenant.restaurant_id)
    .execute(&pool)
    .await?;

    Ok(Json(ApiResponse::success(json!({ "deleted": true }))))
}

pub async fn mark_staff_attendance(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Json(payload): Json<MarkAttendancePayload>,
) -> Result<impl IntoResponse, AppError> {
    let date = chrono::NaiveDate::parse_from_str(payload.attendance_date.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid date format, expected YYYY-MM-DD".to_string()))?;
    let status = payload.status.trim().to_uppercase();

    let record = sqlx::query_as::<_, StaffAttendance>(
        r#"
        INSERT INTO staff_attendance (
            restaurant_id, staff_id, attendance_date, status, notes, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (restaurant_id, staff_id, attendance_date)
        DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
        RETURNING id, restaurant_id, staff_id, attendance_date, status, check_in_time, check_out_time, notes, created_at, updated_at
        "#,
    )
    .bind(tenant.restaurant_id)
    .bind(payload.staff_id)
    .bind(date)
    .bind(&status)
    .bind(payload.notes)
    .fetch_one(&pool)
    .await?;

    Ok(Json(ApiResponse::success(record)))
}

pub async fn list_staff_attendance(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    axum::extract::Query(query): axum::extract::Query<AttendanceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let records = sqlx::query_as::<_, StaffAttendance>(
        r#"
        SELECT id, restaurant_id, staff_id, attendance_date, status, check_in_time, check_out_time, notes, created_at, updated_at
        FROM staff_attendance
        WHERE restaurant_id = $1
          AND ($2::uuid IS NULL OR staff_id = $2)
          AND ($3::text IS NULL OR to_char(attendance_date, 'YYYY-MM') = $3)
          AND ($4::date IS NULL OR attendance_date = $4)
        ORDER BY attendance_date DESC, staff_id ASC
        "#,
    )
    .bind(tenant.restaurant_id)
    .bind(query.staff_id)
    .bind(query.month)
    .bind(query.date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()))
    .fetch_all(&pool)
    .await?;

    Ok(Json(ApiResponse::success(records)))
}

pub async fn get_staff_performance(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    axum::extract::Query(query): axum::extract::Query<AttendanceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let month_str = query.month.unwrap_or_else(|| {
        chrono::Utc::now().format("%Y-%m").to_string()
    });

    let (year, month): (i32, u32) = if let Some((y, m)) = month_str.split_once('-') {
        (y.parse().unwrap_or(2026), m.parse().unwrap_or(11))
    } else {
        (2026, 11)
    };

    let (next_year, next_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let start_bound = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap());
    let end_bound = chrono::NaiveDate::from_ymd_opt(next_year, next_month, 28)
        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(2026, 12, 31).unwrap());

    let staff_members = RestaurantRepository::list_staff(&pool, tenant.restaurant_id).await?;

    let attendance_rows = sqlx::query_as::<_, StaffAttendance>(
        r#"
        SELECT id, restaurant_id, staff_id, attendance_date, status, check_in_time, check_out_time, notes, created_at, updated_at
        FROM staff_attendance
        WHERE restaurant_id = $1
          AND attendance_date >= $2 AND attendance_date <= $3
        "#,
    )
    .bind(tenant.restaurant_id)
    .bind(start_bound)
    .bind(end_bound)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let order_stats = sqlx::query_as::<_, (Uuid, i64, chrono::DateTime<chrono::Utc>)>(
        r#"
        SELECT server_staff_id, total_amount_paise, created_at
        FROM orders
        WHERE restaurant_id = $1
          AND server_staff_id IS NOT NULL
          AND status != 'cancelled'
          AND created_at >= $2::timestamptz
          AND created_at <= ($3::timestamptz + INTERVAL '1 day')
        "#,
    )
    .bind(tenant.restaurant_id)
    .bind(start_bound.and_hms_opt(0, 0, 0).unwrap().and_utc())
    .bind(end_bound.and_hms_opt(23, 59, 59).unwrap().and_utc())
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let mut att_map: std::collections::HashMap<Uuid, Vec<StaffAttendance>> = std::collections::HashMap::new();
    for att in attendance_rows {
        att_map.entry(att.staff_id).or_default().push(att);
    }

    let mut order_list_map: std::collections::HashMap<Uuid, Vec<(i64, chrono::DateTime<chrono::Utc>)>> = std::collections::HashMap::new();
    for (sid, total, dt) in order_stats {
        order_list_map.entry(sid).or_default().push((total, dt));
    }

    let total_days_in_month = 30i64;

    let mut performance_list = Vec::new();
    for member in staff_members {
        let cycle_start_day = member.payroll_cycle_start_day.unwrap_or(1).clamp(1, 28);

        let (cycle_start, cycle_end) = if cycle_start_day == 1 {
            let s = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
            let e = chrono::NaiveDate::from_ymd_opt(next_year, next_month, 1)
                .unwrap()
                .pred_opt()
                .unwrap_or(s);
            (s, e)
        } else {
            let s = chrono::NaiveDate::from_ymd_opt(year, month, cycle_start_day as u32).unwrap();
            let e = chrono::NaiveDate::from_ymd_opt(next_year, next_month, (cycle_start_day - 1) as u32).unwrap();
            (s, e)
        };

        let atts = att_map.remove(&member.id).unwrap_or_default();
        let mut present = 0.0;
        let mut half = 0;
        let mut absent = 0;
        let mut leave = 0;

        for a in atts {
            if a.attendance_date >= cycle_start && a.attendance_date <= cycle_end {
                match a.status.to_uppercase().as_str() {
                    "PRESENT" => present += 1.0,
                    "HALF_DAY" => {
                        present += 0.5;
                        half += 1;
                    }
                    "PAID_LEAVE" | "LEAVE" => {
                        present += 1.0;
                        leave += 1;
                    }
                    "ABSENT" => absent += 1,
                    _ => {}
                }
            }
        }

        let salary_paise = member.monthly_salary_paise.unwrap_or(1500000);
        let effective_working_days = present;
        let per_day_paise = salary_paise as f64 / total_days_in_month as f64;
        let calculated_salary_paise = (per_day_paise * effective_working_days).round() as i64;

        let staff_orders = order_list_map.remove(&member.id).unwrap_or_default();
        let mut orders_count = 0i64;
        let mut orders_tot = 0i64;
        for (amt, dt) in staff_orders {
            let o_date = dt.date_naive();
            if o_date >= cycle_start && o_date <= cycle_end {
                orders_count += 1;
                orders_tot += amt;
            }
        }

        performance_list.push(StaffPerformanceSummary {
            staff_id: member.id,
            staff_name: member.name,
            role: member.role,
            shift: member.shift,
            monthly_salary_paise: salary_paise,
            total_days_in_month,
            present_days: present,
            half_days: half,
            absent_days: absent,
            leave_days: leave,
            effective_working_days,
            calculated_salary_paise,
            orders_served_count: orders_count,
            orders_served_total_paise: orders_tot,
            payroll_cycle_start_day: Some(cycle_start_day),
            cycle_start_date: Some(cycle_start.to_string()),
            cycle_end_date: Some(cycle_end.to_string()),
        });
    }

    Ok(Json(ApiResponse::success(performance_list)))
}
