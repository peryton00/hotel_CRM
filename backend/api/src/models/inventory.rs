use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InventoryItem {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub name: String,
    pub sku: Option<String>,
    pub category: String,
    pub unit_of_measure: String,
    pub current_stock: f64,
    pub reserved_stock: f64,
    pub reorder_level: f64,
    pub cost_per_unit_paise: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl InventoryItem {
    /// Available To Promise (ATP) = Current Stock - Reserved Stock
    pub fn available_to_promise(&self) -> f64 {
        (self.current_stock - self.reserved_stock).max(0.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Recipe {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub menu_item_id: Uuid,
    pub yield_quantity: f64,
    pub preparation_notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RecipeIngredient {
    pub id: Uuid,
    pub recipe_id: Uuid,
    pub inventory_item_id: Uuid,
    pub quantity: f64,
    pub unit_of_measure: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockMovement {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub inventory_item_id: Uuid,
    pub movement_type: String, // 'purchase' | 'consumption' | 'reservation' | 'reservation_release' | 'wastage' | 'adjustment'
    pub quantity_change: f64,
    pub balance_after: f64,
    pub unit_cost_paise: Option<i64>,
    pub reference_order_id: Option<Uuid>,
    pub reference_wastage_id: Option<Uuid>,
    pub idempotency_key: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WastageRecord {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub inventory_item_id: Uuid,
    pub quantity: f64,
    pub unit_of_measure: String,
    pub cost_impact_paise: i64,
    pub reason: String,
    pub reported_by_staff_id: Option<Uuid>,
    pub idempotency_key: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInventoryItemRequest {
    pub name: String,
    pub sku: Option<String>,
    pub category: String,
    pub unit_of_measure: String,
    pub initial_stock: Option<f64>,
    pub reorder_level: Option<f64>,
    pub cost_per_unit_paise: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecordWastageRequest {
    pub inventory_item_id: Uuid,
    pub quantity: f64,
    pub unit_of_measure: String,
    pub reason: String,
    pub idempotency_key: Option<String>,
}
