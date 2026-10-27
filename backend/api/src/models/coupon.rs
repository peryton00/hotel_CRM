use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Coupon {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub code: String,
    pub description: Option<String>,
    pub discount_type: String, // 'percentage' | 'fixed'
    pub discount_value: f64,
    pub min_order_amount_paise: i64,
    pub max_discount_amount_paise: Option<i64>,
    pub one_time_per_customer: bool,
    pub is_active: bool,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CouponRedemption {
    pub id: Uuid,
    pub coupon_id: Uuid,
    pub restaurant_id: Uuid,
    pub order_id: Uuid,
    pub customer_id: Option<Uuid>,
    pub customer_phone: Option<String>,
    pub discount_applied_paise: i64,
    pub redeemed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ValidateCouponRequest {
    pub code: String,
    pub order_amount_paise: i64,
    pub customer_phone: Option<String>,
    pub customer_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateCouponResponse {
    pub is_valid: bool,
    pub discount_paise: i64,
    pub message: Option<String>,
    pub coupon: Option<Coupon>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedeemCouponRequest {
    pub code: String,
    pub order_id: Uuid,
    pub order_amount_paise: i64,
    pub customer_phone: Option<String>,
    pub customer_id: Option<Uuid>,
}
