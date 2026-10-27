use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MenuCategory {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub display_order: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MenuItem {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub category_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub base_price_paise: i64,
    pub tax_rate_percent: f64,
    pub is_veg: bool,
    pub is_available: bool,
    pub image_url: Option<String>,
    pub preparation_time_minutes: Option<i32>,
    pub display_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMenuItemRequest {
    pub category_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub base_price_paise: i64,
    pub tax_rate_percent: Option<f64>,
    pub is_veg: Option<bool>,
    pub is_available: Option<bool>,
    pub image_url: Option<String>,
    pub preparation_time_minutes: Option<i32>,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateItemAvailabilityRequest {
    pub is_available: bool,
}
