use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TableStatus {
    Available,
    Occupied,
    Billed,
    Reserved,
    Cleaning,
}

impl std::fmt::Display for TableStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TableStatus::Available => write!(f, "available"),
            TableStatus::Occupied => write!(f, "occupied"),
            TableStatus::Billed => write!(f, "billed"),
            TableStatus::Reserved => write!(f, "reserved"),
            TableStatus::Cleaning => write!(f, "cleaning"),
        }
    }
}

impl From<String> for TableStatus {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "occupied" => TableStatus::Occupied,
            "billed" => TableStatus::Billed,
            "reserved" => TableStatus::Reserved,
            "cleaning" => TableStatus::Cleaning,
            _ => TableStatus::Available,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RestaurantTable {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub table_number: String,
    pub capacity: i32,
    pub section: String,
    pub status: String,
    pub qr_code_identifier: Option<String>,
    pub active_order_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTableStatusRequest {
    pub status: String,
    pub active_order_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TransferTableRequest {
    pub from_table_id: Uuid,
    pub to_table_id: Uuid,
    pub reason: Option<String>,
}
