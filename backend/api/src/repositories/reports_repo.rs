use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::reports::{
        CollectionsMetrics, DashboardSummary, InventoryCostMetrics, PeriodReport,
        ReceivablesMetrics, RefundMetrics, SalesMetrics,
    },
    services::financial_service::FinancialCalculator,
};

pub struct ReportsRepository;

impl ReportsRepository {
    pub async fn get_period_report(
        pool: &PgPool,
        restaurant_id: Uuid,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<PeriodReport, AppError> {
        // 1. Sales metrics: attributed to order.created_at
        let sales_row: (Option<i64>, Option<i64>, Option<i64>, Option<i64>, i64) = sqlx::query_as(
            r#"
            SELECT
                COALESCE(SUM(subtotal_paise), 0)::bigint,
                COALESCE(SUM(total_amount_paise), 0)::bigint,
                COALESCE(SUM(discount_paise), 0)::bigint,
                COALESCE(SUM(tax_paise), 0)::bigint,
                COUNT(*)
            FROM orders
            WHERE restaurant_id = $1
              AND created_at >= $2
              AND created_at <= $3
              AND status != 'cancelled'
              AND legacy_unknown_timestamp = false
            "#,
        )
        .bind(restaurant_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool)
        .await?;

        let gross_sales_paise = sales_row.0.unwrap_or(0);
        let net_sales_paise = sales_row.1.unwrap_or(0);
        let total_discount_paise = sales_row.2.unwrap_or(0);
        let total_tax_paise = sales_row.3.unwrap_or(0);
        let order_count = sales_row.4;
        let average_order_value_paise = if order_count > 0 {
            net_sales_paise / order_count
        } else {
            0
        };

        let sales = SalesMetrics {
            gross_sales_paise,
            net_sales_paise,
            total_discount_paise,
            total_tax_paise,
            order_count,
            average_order_value_paise,
        };

        // 2. Collections metrics: attributed to payment.settled_at (or created_at)
        let collections_row: (Option<i64>, Option<i64>, Option<i64>, Option<i64>, i64) = sqlx::query_as(
            r#"
            SELECT
                COALESCE(SUM(amount_paise), 0)::bigint,
                COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_paise ELSE 0 END), 0)::bigint,
                COALESCE(SUM(CASE WHEN payment_method = 'upi' THEN amount_paise ELSE 0 END), 0)::bigint,
                COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash', 'upi') THEN amount_paise ELSE 0 END), 0)::bigint,
                COUNT(*)
            FROM payments
            WHERE restaurant_id = $1
              AND status = 'completed'
              AND COALESCE(settled_at, created_at) >= $2
              AND COALESCE(settled_at, created_at) <= $3
              AND legacy_unknown_timestamp = false
            "#,
        )
        .bind(restaurant_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool)
        .await?;

        let total_collections_paise = collections_row.0.unwrap_or(0);
        let cash_collections_paise = collections_row.1.unwrap_or(0);
        let upi_collections_paise = collections_row.2.unwrap_or(0);
        let other_collections_paise = collections_row.3.unwrap_or(0);
        let transaction_count = collections_row.4;

        let collections = CollectionsMetrics {
            total_collections_paise,
            cash_collections_paise,
            upi_collections_paise,
            other_collections_paise,
            transaction_count,
        };

        // 3. Refund metrics: attributed to completed_at
        let refund_row: (Option<i64>, i64, i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN refund_amount_paise ELSE 0 END), 0)::bigint,
                COUNT(CASE WHEN status = 'completed' THEN 1 END),
                COUNT(CASE WHEN status = 'requested' THEN 1 END),
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END)
            FROM refunds
            WHERE restaurant_id = $1
              AND (CASE status WHEN 'completed' THEN completed_at WHEN 'cancelled' THEN cancelled_at ELSE requested_at END) BETWEEN $2 AND $3
              AND legacy_unknown_timestamp = false
            "#,
        )
        .bind(restaurant_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool)
        .await?;

        let total_refunds_paise = refund_row.0.unwrap_or(0);
        let completed_refund_count = refund_row.1;
        let pending_refund_count = refund_row.2;
        let cancelled_refund_count = refund_row.3;

        let refunds = RefundMetrics {
            total_refunds_paise,
            completed_refund_count,
            pending_refund_count,
            cancelled_refund_count,
        };

        // 4. Net Collections: signed and unclamped
        let net_collections_paise = FinancialCalculator::calculate_net_collections(
            total_collections_paise,
            total_refunds_paise,
        );

        // 5. Receivables metrics:
        // Exclude parent orders that have child split bills!
        let unpaid_unsplit_orders_row: (Option<i64>, i64) = sqlx::query_as(
            r#"
            SELECT COALESCE(SUM(GREATEST(o.total_amount_paise - COALESCE((SELECT SUM(p.amount_paise) FROM payments p WHERE p.order_id=o.id AND p.status='completed'),0),0)),0)::bigint, COUNT(o.id)
            FROM orders o
            WHERE o.restaurant_id = $1
              AND o.payment_status IN ('pending', 'partial', 'partially_paid')
              AND o.status != 'cancelled'
              AND NOT EXISTS (SELECT 1 FROM split_bills sb WHERE sb.order_id = o.id)
            "#,
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let unpaid_splits_row: (Option<i64>, i64) = sqlx::query_as(
            r#"
            SELECT COALESCE(SUM(sb.amount_paise), 0)::bigint, COUNT(sb.id)
            FROM split_bills sb
            JOIN orders o ON o.id = sb.order_id
            WHERE o.restaurant_id = $1
              AND sb.payment_status = 'pending'
              AND o.status != 'cancelled'
            "#,
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let total_receivables_paise =
            unpaid_unsplit_orders_row.0.unwrap_or(0) + unpaid_splits_row.0.unwrap_or(0);
        let receivables = ReceivablesMetrics {
            total_receivables_paise,
            unpaid_orders_count: unpaid_unsplit_orders_row.1,
            unpaid_split_bills_count: unpaid_splits_row.1,
        };

        // 6. Inventory costs & Wastage in period
        let wastage_row: (Option<i64>,) = sqlx::query_as(
            r#"
            SELECT COALESCE(SUM(cost_impact_paise), 0)::bigint
            FROM wastage_records
            WHERE restaurant_id = $1
              AND created_at >= $2
              AND created_at <= $3
            "#,
        )
        .bind(restaurant_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool)
        .await?;
        let wastage_cost_paise = wastage_row.0.unwrap_or(0);

        // Estimated COGS (approx 35% of food sales or inventory consumption)
        let cogs_paise = (net_sales_paise as f64 * 0.35).round() as i64;
        let (gross_profit_paise, gross_margin_percent) =
            FinancialCalculator::calculate_gross_margin(net_sales_paise, cogs_paise);

        let inventory = InventoryCostMetrics {
            cogs_paise,
            wastage_cost_paise,
            gross_profit_paise,
            gross_margin_percent,
        };

        // 7. Legacy unknown timestamp disclosure
        let legacy_row: (i64, Option<i64>) = sqlx::query_as(
            r#"
            SELECT COUNT(*), COALESCE(SUM(total_amount_paise), 0)::bigint
            FROM orders
            WHERE restaurant_id = $1 AND legacy_unknown_timestamp = true
            "#,
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let legacy_disclosure =
            FinancialCalculator::default_legacy_disclosure(legacy_row.0, legacy_row.1.unwrap_or(0));

        Ok(PeriodReport {
            start_date,
            end_date,
            sales,
            collections,
            refunds,
            net_collections_paise,
            receivables,
            inventory,
            legacy_disclosure,
        })
    }

    pub async fn get_dashboard_summary(
        pool: &PgPool,
        restaurant_id: Uuid,
    ) -> Result<DashboardSummary, AppError> {
        let (start_of_today, end_of_today): (DateTime<Utc>, DateTime<Utc>) = sqlx::query_as(
            "SELECT date_trunc('day', now() AT TIME ZONE timezone) AT TIME ZONE timezone,
            ((date_trunc('day', now() AT TIME ZONE timezone) + interval '1 day') AT TIME ZONE timezone) - interval '1 microsecond'
            FROM restaurants WHERE id=$1"
        ).bind(restaurant_id).fetch_one(pool).await?;

        let today_report =
            Self::get_period_report(pool, restaurant_id, start_of_today, end_of_today).await?;

        let active_orders_row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM orders WHERE restaurant_id = $1 AND status IN ('confirmed', 'in_preparation', 'ready', 'served')"
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let occupied_tables_row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM tables WHERE restaurant_id = $1 AND status = 'OCCUPIED'::table_status",
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        let total_tables_row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM tables WHERE restaurant_id = $1")
                .bind(restaurant_id)
                .fetch_one(pool)
                .await?;

        let low_stock_row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM inventory_items WHERE restaurant_id = $1 AND current_stock <= reorder_level"
        )
        .bind(restaurant_id)
        .fetch_one(pool)
        .await?;

        Ok(DashboardSummary {
            today: today_report,
            active_orders_count: active_orders_row.0,
            occupied_tables_count: occupied_tables_row.0,
            total_tables_count: total_tables_row.0,
            low_stock_items_count: low_stock_row.0,
        })
    }
}
