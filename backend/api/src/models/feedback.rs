use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomerFeedback {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub order_id: Option<Uuid>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub rating: i32,
    pub comments: Option<String>,
    pub resolution_note: Option<String>,
    pub is_resolved: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateFeedbackRequest {
    pub order_id: Option<Uuid>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub rating: i32,
    pub comments: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReplyFeedbackRequest {
    pub resolution_note: String,
}
