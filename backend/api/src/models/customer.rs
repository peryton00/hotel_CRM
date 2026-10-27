use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub name: String,
    pub phone: String,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub visit_count: i32,
    pub total_spend_paise: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Reservation {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub table_id: Option<Uuid>,
    pub customer_id: Option<Uuid>,
    pub customer_name: String,
    pub customer_phone: String,
    pub guest_count: i32,
    pub reservation_time: DateTime<Utc>,
    pub status: String, // 'confirmed' | 'seated' | 'cancelled' | 'no_show'
    pub special_requests: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCustomerRequest {
    pub name: String,
    pub phone: String,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateReservationRequest {
    pub table_id: Option<Uuid>,
    pub customer_id: Option<Uuid>,
    pub customer_name: String,
    pub customer_phone: String,
    pub guest_count: i32,
    pub reservation_time: DateTime<Utc>,
    pub special_requests: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReservationStatusRequest {
    pub status: String,
}
