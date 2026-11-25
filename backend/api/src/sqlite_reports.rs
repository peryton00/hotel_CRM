use super::{bad, ok, record, Response};
use crate::{
    error::AppError,
    models::reports::PeriodReportQuery,
    services::financial_service::FinancialCalculator,
    sqlite_staff::{identity, StaffState},
};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};
async fn period(
    s: &StaffState,
    rid: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Value, AppError> {
    if start > end {
        return Err(bad("Start date must precede end date"));
    }
    let mut tx = s.pool.begin().await?;
    let a = start.to_rfc3339();
    let b = end.to_rfc3339();
    let mut sales=record(sqlx::query("SELECT coalesce(sum(subtotal_paise),0) AS gross_sales_paise,coalesce(sum(total_amount_paise),0) AS net_sales_paise,coalesce(sum(discount_paise),0) AS total_discount_paise,coalesce(sum(tax_paise),0) AS total_tax_paise,count(*) AS order_count FROM orders WHERE restaurant_id=? AND status!='CANCELLED' AND legacy_unknown_timestamp=0 AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)").bind(rid).bind(&a).bind(&b).fetch_one(&mut *tx).await?)?;
    let net = sales["net_sales_paise"].as_i64().unwrap_or(0);
    sales["average_order_value_paise"] =
        json!(net / sales["order_count"].as_i64().unwrap_or(0).max(1));
    let collections=record(sqlx::query("SELECT coalesce(sum(amount_paise),0) AS total_collections_paise,coalesce(sum(amount_paise) FILTER(WHERE payment_method='CASH'),0) AS cash_collections_paise,coalesce(sum(amount_paise) FILTER(WHERE payment_method='UPI'),0) AS upi_collections_paise,coalesce(sum(amount_paise) FILTER(WHERE payment_method NOT IN ('UPI','CASH')),0) AS other_collections_paise,count(*) AS transaction_count FROM payments WHERE restaurant_id=? AND status='COMPLETED' AND legacy_unknown_timestamp=0 AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)").bind(rid).bind(&a).bind(&b).fetch_one(&mut *tx).await?)?;
    let refunds=record(sqlx::query("SELECT coalesce(sum(refund_amount_paise) FILTER(WHERE status='completed'),0) AS total_refunds_paise,count(*) FILTER(WHERE status='completed') AS completed_refund_count,count(*) FILTER(WHERE status='requested') AS pending_refund_count,count(*) FILTER(WHERE status='cancelled') AS cancelled_refund_count FROM refunds WHERE restaurant_id=? AND julianday(coalesce(completed_at,cancelled_at,requested_at)) BETWEEN julianday(?) AND julianday(?)").bind(rid).bind(&a).bind(&b).fetch_one(&mut *tx).await?)?;
    let receivables=record(sqlx::query("SELECT coalesce(sum(max(o.total_amount_paise-coalesce((SELECT sum(amount_paise) FROM payments p WHERE p.order_id=o.id AND p.status='COMPLETED'),0),0)),0) AS total_receivables_paise,count(*) FILTER(WHERE is_split=0) AS unpaid_orders_count,coalesce(sum((SELECT count(*) FROM split_bills sb WHERE sb.order_id=o.id AND sb.payment_status='unpaid')),0) AS unpaid_split_bills_count FROM orders o WHERE restaurant_id=? AND o.status!='CANCELLED' AND o.payment_status IN ('UNPAID','PARTIAL')").bind(rid).fetch_one(&mut *tx).await?)?;
    let wastage:i64=sqlx::query_scalar("SELECT coalesce(sum(cost_impact_paise),0) FROM wastage_records WHERE restaurant_id=? AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)").bind(rid).bind(&a).bind(&b).fetch_one(&mut *tx).await?;
    let (count,amount):(i64,i64)=sqlx::query_as("SELECT count(*),coalesce(sum(total_amount_paise),0) FROM orders WHERE restaurant_id=? AND legacy_unknown_timestamp=1").bind(rid).fetch_one(&mut *tx).await?;
    let cogs = (net as f64 * 0.35).round() as i64;
    let (profit, margin) = FinancialCalculator::calculate_gross_margin(net, cogs);
    let collected = collections["total_collections_paise"].as_i64().unwrap_or(0)
        - refunds["total_refunds_paise"].as_i64().unwrap_or(0);
    Ok(
        json!({"start_date":start,"end_date":end,"sales":sales,"collections":collections,"refunds":refunds,"net_collections_paise":collected,"receivables":receivables,"inventory":{"cogs_paise":cogs,"wastage_cost_paise":wastage,"gross_profit_paise":profit,"gross_margin_percent":margin},"legacy_disclosure":FinancialCalculator::default_legacy_disclosure(count,amount)}),
    )
}
pub(super) async fn report(
    State(s): State<StaffState>,
    h: HeaderMap,
    Query(q): Query<PeriodReportQuery>,
) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    let end = q.end_date.unwrap_or_else(Utc::now);
    let start = q.start_date.unwrap_or(end - Duration::days(30));
    ok(period(&s, &rid, start, end).await?)
}
pub(super) async fn dashboard(State(s): State<StaffState>, h: HeaderMap) -> Response {
    let (_, _, _, rid) = identity(&s, &h).await?;
    // The till stores this single Indian restaurant's business day in Asia/Kolkata.
    let offset = Duration::minutes(330);
    let end = Utc::now();
    let date = (end + offset).date_naive();
    let start = date.and_hms_opt(0, 0, 0).unwrap().and_utc() - offset;
    let mut data=record(sqlx::query("SELECT (SELECT count(*) FROM orders WHERE restaurant_id=?1 AND status NOT IN ('COMPLETED','CANCELLED')) AS active_orders_count,(SELECT count(*) FROM tables WHERE restaurant_id=?1 AND status='OCCUPIED') AS occupied_tables_count,(SELECT count(*) FROM tables WHERE restaurant_id=?1) AS total_tables_count,(SELECT count(*) FROM inventory_items WHERE restaurant_id=?1 AND current_stock<=reorder_level) AS low_stock_items_count").bind(&rid).fetch_one(&s.pool).await?)?;
    data["today"] = period(&s, &rid, start, end).await?;
    ok(data)
}
