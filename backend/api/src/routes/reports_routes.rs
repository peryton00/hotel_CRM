use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Utc};
use sqlx::PgPool;

use crate::{
    auth::TenantContext,
    error::AppError,
    models::{common::ApiResponse, reports::PeriodReportQuery},
    repositories::ReportsRepository,
};

pub async fn get_period_report(
    State(pool): State<PgPool>,
    tenant: TenantContext,
    Query(query): Query<PeriodReportQuery>,
) -> Result<impl IntoResponse, AppError> {
    let now = Utc::now();
    let end_date = query.end_date.unwrap_or(now);
    let start_date = query
        .start_date
        .unwrap_or_else(|| end_date - Duration::days(30));

    let report =
        ReportsRepository::get_period_report(&pool, tenant.restaurant_id, start_date, end_date)
            .await?;

    Ok(Json(ApiResponse::success(report)))
}

pub async fn get_dashboard_summary(
    State(pool): State<PgPool>,
    tenant: TenantContext,
) -> Result<impl IntoResponse, AppError> {
    let summary = ReportsRepository::get_dashboard_summary(&pool, tenant.restaurant_id).await?;
    Ok(Json(ApiResponse::success(summary)))
}
