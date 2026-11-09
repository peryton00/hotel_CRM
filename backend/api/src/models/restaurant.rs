use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Restaurant {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub gstin: Option<String>,
    pub fssai_license: Option<String>,
    pub currency: String,
    pub timezone: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestaurantSettings {
    pub tax_rate_percent: f64,
    pub service_charge_percent: f64,
    pub round_off_enabled: bool,
    pub upi_qr_vpa: Option<String>,
    pub upi_merchant_name: Option<String>,
    pub invoice_prefix: String,
    pub default_notes: Option<String>,
}

impl Default for RestaurantSettings {
    fn default() -> Self {
        Self {
            tax_rate_percent: 5.0,
            service_charge_percent: 0.0,
            round_off_enabled: true,
            upi_qr_vpa: Some("hotelcrm@upi".to_string()),
            upi_merchant_name: Some("Hotel CRM Restaurant".to_string()),
            invoice_prefix: "INV".to_string(),
            default_notes: Some("Thank you for dining with us!".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StaffMember {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub auth_user_id: Option<Uuid>,
    pub name: String,
    pub role: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub is_active: bool,
    #[serde(default)]
    pub shift: Option<String>,
    #[serde(default)]
    pub assigned_section: Option<String>,
    #[serde(default)]
    pub login_id: Option<String>,
    #[serde(default)]
    pub monthly_salary_paise: Option<i64>,
    #[serde(default)]
    pub payroll_cycle_start_day: Option<i32>,
    #[serde(default)]
    pub permissions: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StaffAttendance {
    pub id: Uuid,
    pub restaurant_id: Uuid,
    pub staff_id: Uuid,
    pub attendance_date: chrono::NaiveDate,
    pub status: String,
    pub check_in_time: Option<DateTime<Utc>>,
    pub check_out_time: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaffPerformanceSummary {
    pub staff_id: Uuid,
    pub staff_name: String,
    pub role: String,
    pub shift: Option<String>,
    pub monthly_salary_paise: i64,
    pub total_days_in_month: i64,
    pub present_days: f64,
    pub half_days: i64,
    pub absent_days: i64,
    pub leave_days: i64,
    pub effective_working_days: f64,
    pub calculated_salary_paise: i64,
    pub orders_served_count: i64,
    pub orders_served_total_paise: i64,
    #[serde(default)]
    pub payroll_cycle_start_day: Option<i32>,
    #[serde(default)]
    pub cycle_start_date: Option<String>,
    #[serde(default)]
    pub cycle_end_date: Option<String>,
}
