use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct PeriodReportQuery {
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesMetrics {
    pub gross_sales_paise: i64,
    pub net_sales_paise: i64,
    pub total_discount_paise: i64,
    pub total_tax_paise: i64,
    pub order_count: i64,
    pub average_order_value_paise: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionsMetrics {
    pub total_collections_paise: i64,
    pub cash_collections_paise: i64,
    pub upi_collections_paise: i64,
    pub other_collections_paise: i64,
    pub transaction_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefundMetrics {
    pub total_refunds_paise: i64,
    pub completed_refund_count: i64,
    pub pending_refund_count: i64,
    pub cancelled_refund_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceivablesMetrics {
    pub total_receivables_paise: i64,
    pub unpaid_orders_count: i64,
    pub unpaid_split_bills_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryCostMetrics {
    pub cogs_paise: i64,
    pub wastage_cost_paise: i64,
    pub gross_profit_paise: i64,
    pub gross_margin_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyDisclosure {
    pub has_legacy_records: bool,
    pub unverified_records_count: i64,
    pub unverified_amount_paise: i64,
    pub disclaimer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodReport {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
    pub sales: SalesMetrics,
    pub collections: CollectionsMetrics,
    pub refunds: RefundMetrics,
    pub net_collections_paise: i64, // Signed: collections - completed refunds (NEVER clamped to zero)
    pub receivables: ReceivablesMetrics,
    pub inventory: InventoryCostMetrics,
    pub legacy_disclosure: LegacyDisclosure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub today: PeriodReport,
    pub active_orders_count: i64,
    pub occupied_tables_count: i64,
    pub total_tables_count: i64,
    pub low_stock_items_count: i64,
}
