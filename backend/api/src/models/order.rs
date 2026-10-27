use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OrderType {
    DineIn,
    Takeaway,
    Delivery,
}

impl std::fmt::Display for OrderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderType::DineIn => write!(f, "dine_in"),
            OrderType::Takeaway => write!(f, "takeaway"),
            OrderType::Delivery => write!(f, "delivery"),
        }
    }
}

impl From<String> for OrderType {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "takeaway" => OrderType::Takeaway,
            "delivery" => OrderType::Delivery,
            _ => OrderType::DineIn,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OrderStatus {
    Draft,
    Confirmed,
    InPreparation,
    Ready,
    Served,
    Completed,
    Cancelled,
}

impl std::fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderStatus::Draft => write!(f, "draft"),
            OrderStatus::Confirmed => write!(f, "confirmed"),
            OrderStatus::InPreparation => write!(f, "in_preparation"),
            OrderStatus::Ready => write!(f, "ready"),
            OrderStatus::Served => write!(f, "served"),
            OrderStatus::Completed => write!(f, "completed"),
            OrderStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl From<String> for OrderStatus {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "confirmed" => OrderStatus::Confirmed,
            "in_preparation" => OrderStatus::InPreparation,
            "ready" => OrderStatus::Ready,
            "served" => OrderStatus::Served,
            "completed" => OrderStatus::Completed,
            "cancelled" => OrderStatus::Cancelled,
            _ => OrderStatus::Draft,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PaymentStatus {
    Pending,
    Partial,
    Paid,
    Refunded,
    Failed,
}

impl std::fmt::Display for PaymentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PaymentStatus::Pending => write!(f, "pending"),
            PaymentStatus::Partial => write!(f, "partial"),
            PaymentStatus::Paid => write!(f, "paid"),
            PaymentStatus::Refunded => write!(f, "refunded"),
            PaymentStatus::Failed => write!(f, "failed"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Order {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub order_number: String,
    pub order_type: String,
    pub status: String,
    pub payment_status: String,
    pub table_id: Option<Uuid>,
    pub customer_id: Option<Uuid>,
    pub subtotal_paise: i64,
    pub discount_paise: i64,
    pub tax_paise: i64,
    pub service_charge_paise: i64,
    pub round_off_paise: i64,
    pub total_amount_paise: i64,
    pub notes: Option<String>,
    pub server_staff_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub settled_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub legacy_unknown_timestamp: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderItem {
    pub id: Uuid,
    pub order_id: Uuid,
    pub menu_item_id: Option<Uuid>,
    pub item_name: String,
    pub quantity: i32,
    pub unit_price_paise: i64,
    pub subtotal_paise: i64,
    pub tax_paise: i64,
    pub discount_paise: i64,
    pub total_paise: i64,
    pub notes: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderWithItems {
    #[serde(flatten)]
    pub order: Order,
    pub items: Vec<OrderItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateOrderItemInput {
    pub menu_item_id: Option<Uuid>,
    pub item_name: String,
    pub quantity: i32,
    pub unit_price_paise: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateOrderRequest {
    pub order_type: String,
    pub table_id: Option<Uuid>,
    pub customer_id: Option<Uuid>,
    pub items: Vec<CreateOrderItemInput>,
    pub notes: Option<String>,
    pub discount_paise: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateOrderStatusRequest {
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderTimelineEvent {
    pub id: Uuid,
    pub order_id: Uuid,
    pub from_status: Option<String>,
    pub to_status: String,
    pub notes: Option<String>,
    pub performed_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}
