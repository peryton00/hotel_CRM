use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SplitBill {
    pub id: Uuid,
    pub order_id: Uuid,
    pub split_number: i32,
    #[sqlx(default)]
    pub split_total_count: Option<i32>,
    pub split_type: String, // 'equal' | 'item' | 'percentage'
    pub amount_paise: i64,
    pub payment_status: String,
    pub settled_at: Option<DateTime<Utc>>,
    pub payment_id: Option<Uuid>,
    #[sqlx(default)]
    pub payment_method: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Joined from orders (only populated by get_split_bills, not RETURNING clauses)
    #[sqlx(default)]
    pub order_number: Option<String>,
    #[sqlx(default)]
    pub order_type: Option<String>,
    #[sqlx(default)]
    pub customer_name: Option<String>,
    #[sqlx(default)]
    pub pickup_reference: Option<String>,
    // Proportional financial values (computed in get_split_bills)
    #[sqlx(default)]
    pub subtotal_paise: Option<i64>,
    #[sqlx(default)]
    pub discount_paise: Option<i64>,
    #[sqlx(default)]
    pub tax_paise: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SplitBillItem {
    pub id: Uuid,
    pub split_bill_id: Uuid,
    pub order_item_id: Uuid,
    pub quantity: i32,
    pub amount_paise: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Payment {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub order_id: Uuid,
    pub split_bill_id: Option<Uuid>,
    pub amount_paise: i64,
    pub payment_method: String, // 'cash' | 'upi' | 'card' | 'other'
    pub status: String,         // 'pending' | 'completed' | 'failed' | 'refunded'
    pub upi_transaction_ref: Option<String>,
    pub idempotency_key: Option<String>,
    pub settled_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub legacy_unknown_timestamp: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Refund {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub order_id: Uuid,
    pub payment_id: Option<Uuid>,
    pub refund_amount_paise: i64,
    pub reason: String,
    pub status: String, // 'requested' | 'completed' | 'cancelled'
    pub requested_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub refund_method: Option<String>,
    pub processed_by_staff_id: Option<Uuid>,
    pub idempotency_key: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub legacy_unknown_timestamp: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Invoice {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub order_id: Uuid,
    pub invoice_number: String,
    pub subtotal_paise: i64,
    pub discount_paise: i64,
    pub tax_paise: i64,
    pub service_charge_paise: i64,
    pub round_off_paise: i64,
    pub final_amount_paise: i64,
    pub payment_method: Option<String>,
    pub invoice_date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePaymentRequest {
    pub order_id: Uuid,
    pub amount_paise: i64,
    pub payment_method: String,
    pub split_bill_id: Option<Uuid>,
    pub upi_transaction_ref: Option<String>,
    pub idempotency_key: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SettleOrderRequest {
    pub payment_method: String,
    pub amount_paise: i64,
    pub upi_transaction_ref: Option<String>,
    pub idempotency_key: Option<String>,
    pub notes: Option<String>,
    pub discount_paise: Option<i64>,
    pub applied_coupon_code: Option<String>,
}

fn default_split_type() -> String {
    "equal".to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct SplitOrderRequest {
    #[serde(default = "default_split_type")]
    pub split_type: String, // "equal" or "item"
    #[serde(alias = "split_count")]
    pub ways: Option<usize>, // for equal split
    pub item_allocations: Option<Vec<SplitItemAllocationInput>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SplitItemAllocationInput {
    pub split_number: i32,
    pub order_item_id: Uuid,
    pub quantity: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateRefundRequest {
    pub payment_id: Option<Uuid>,
    pub refund_amount_paise: i64,
    pub reason: String,
    pub refund_method: Option<String>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRefundStatusRequest {
    pub status: String, // 'completed' | 'cancelled'
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptData {
    pub restaurant_name: String,
    pub gstin: Option<String>,
    pub fssai_license: Option<String>,
    pub address: Option<String>,
    pub order_number: String,
    pub order_type: String,
    pub table_number: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub date: DateTime<Utc>,
    pub items: Vec<ReceiptItemData>,
    pub subtotal_paise: i64,
    pub discount_paise: i64,
    pub tax_paise: i64,
    pub round_off_paise: i64,
    pub final_amount_paise: i64,
    pub payment_status: String,
    pub payment_method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptItemData {
    pub name: String,
    pub quantity: i32,
    pub unit_price_paise: i64,
    pub total_paise: i64,
}
