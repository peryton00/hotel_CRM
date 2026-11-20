pub mod auth_routes;
pub mod public_routes;
pub mod ws_routes;
pub mod billing_routes;
pub mod coupon_routes;
pub mod customer_routes;
pub mod feedback_routes;
pub mod health;
pub mod inventory_routes;
pub mod menu_routes;
pub mod order_routes;
pub mod reports_routes;
pub mod restaurant_routes;
pub mod table_routes;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::config::AppState;

pub fn create_router(state: AppState) -> Router {
    // Configure CORS with allowed origins
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_v1 = Router::new()
        // Auth
        .route("/auth/me", get(auth_routes::get_me))
        .route("/auth/login", post(auth_routes::login))
        .route(
            "/auth/verify-admin-password",
            post(auth_routes::verify_admin_password),
        )
        // Restaurant & staff
        .route(
            "/restaurants",
            get(restaurant_routes::get_current_restaurant)
                .put(restaurant_routes::update_current_restaurant),
        )
        .route(
            "/restaurants/settings",
            put(restaurant_routes::update_current_restaurant),
        )
        .route(
            "/restaurants/staff",
            get(restaurant_routes::list_staff_members)
                .post(restaurant_routes::create_staff_member),
        )
        .route(
            "/restaurants/staff/attendance",
            get(restaurant_routes::list_staff_attendance)
                .post(restaurant_routes::mark_staff_attendance),
        )
        .route(
            "/restaurants/staff/performance",
            get(restaurant_routes::get_staff_performance),
        )
        .route(
            "/restaurants/staff/:id",
            put(restaurant_routes::update_staff_member)
                .delete(restaurant_routes::delete_staff_member),
        )
        // Tables
        .route(
            "/tables",
            get(table_routes::list_tables).post(table_routes::create_table),
        )
        .route("/tables/:id", delete(table_routes::delete_table))
        .route("/tables/:id/status", put(table_routes::update_table_status))
        .route("/tables/:id/assign", put(table_routes::assign_table_staff))
        .route("/tables/transfer", post(table_routes::transfer_table))
        // Menu
        .route(
            "/menu/categories",
            get(menu_routes::list_categories).post(menu_routes::create_category),
        )
        .route(
            "/menu/categories/:id",
            delete(menu_routes::delete_category),
        )
        .route(
            "/menu/items",
            get(menu_routes::list_items).post(menu_routes::create_item),
        )
        .route(
            "/menu/items/:id",
            put(menu_routes::update_item).delete(menu_routes::delete_item),
        )
        .route(
            "/menu/items/:id/availability",
            put(menu_routes::update_availability),
        )
        // Orders
        .route(
            "/orders",
            get(order_routes::list_orders).post(order_routes::create_order),
        )
        .route("/orders/:id", get(order_routes::get_order))
        .route("/orders/:id/status", put(order_routes::update_order_status))
        .route("/orders/:id/server", put(order_routes::assign_order_server))
        // Billing & payments
        .route("/orders/:id/settle", post(billing_routes::settle_order))
        .route("/orders/:id/split", post(billing_routes::split_order))
        .route("/orders/:id/refund", post(billing_routes::create_refund))
        .route(
            "/refunds/:id/status",
            put(billing_routes::update_refund_status),
        )
        .route("/orders/:id/receipt", get(billing_routes::get_receipt))
        // Inventory
        .route(
            "/inventory/items",
            get(inventory_routes::list_items).post(inventory_routes::create_item),
        )
        .route(
            "/inventory/items/:id",
            put(inventory_routes::update_item),
        )
        .route("/inventory/wastage", post(inventory_routes::record_wastage))
        .route(
            "/inventory/movements",
            get(inventory_routes::list_movements),
        )
        // Coupons
        .route(
            "/coupons",
            get(coupon_routes::list_coupons).post(coupon_routes::create_coupon),
        )
        .route("/coupons/:id", delete(coupon_routes::delete_coupon))
        .route(
            "/coupons/:id/status",
            put(coupon_routes::update_coupon_status),
        )
        .route("/coupons/validate", post(coupon_routes::validate_coupon))
        .route("/coupons/redeem", post(coupon_routes::redeem_coupon))
        // Customers & Reservations
        .route(
            "/customers",
            get(customer_routes::list_customers).post(customer_routes::create_customer),
        )
        .route("/customers/:id/points", post(customer_routes::award_points))
        .route(
            "/reservations",
            get(customer_routes::list_reservations).post(customer_routes::create_reservation),
        )
        .route(
            "/reservations/:id/status",
            put(customer_routes::update_reservation_status),
        )
        // Feedback
        .route(
            "/feedback",
            get(feedback_routes::list_feedback).post(feedback_routes::create_feedback),
        )
        .route(
            "/feedback/:id/reply",
            put(feedback_routes::reply_feedback),
        )
        // Reports & Dashboard
        .route("/reports/period", get(reports_routes::get_period_report))
        .route(
            "/dashboard/summary",
            get(reports_routes::get_dashboard_summary),
        )
        // System utilities
        .route("/system/open-external", post(system_open_external))
        // Hardware / Thermal Printer
        .route("/printer/list", get(crate::printer::list_printers_route))
        .route("/printer/print", post(crate::printer::print_escpos_route));

    Router::new()
        // Health check routes
        .route("/health/live", get(health::liveness))
        .route("/health/ready", get(health::readiness))
        .route("/api/v1/health/live", get(health::liveness))
        .route("/api/v1/health/ready", get(health::readiness))
        .route(
            "/health/restaurant/:id",
            get(health::check_restaurant_availability),
        )
        // Public unauthenticated routes
        .route("/public/tables/:token", get(public_routes::get_public_table))
        .route("/public/menu", get(public_routes::get_public_menu))
        .route(
            "/public/restaurant-status",
            get(public_routes::get_public_restaurant_status),
        )
        .route(
            "/public/orders",
            post(public_routes::create_public_order).get(public_routes::get_customer_orders),
        )
        // WebSocket
        .route("/ws/orders", get(ws_routes::ws_handler))
        // API v1 prefix
        .nest("/api/v1", api_v1)
        .route(
            "/api/v1/health/restaurant/:id",
            get(health::check_restaurant_availability),
        )
        .layer(cors)
        .with_state(state)
}

#[derive(serde::Deserialize)]
pub struct OpenExternalRequest {
    pub url: String,
}

pub async fn system_open_external(
    axum::Json(payload): axum::Json<OpenExternalRequest>,
) -> Result<axum::Json<serde_json::Value>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let url = payload.url.trim().to_string();
    if !url.starts_with("https://") && !url.starts_with("http://") && !url.starts_with("whatsapp://") {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Invalid URL protocol. Only http, https, and whatsapp URLs allowed." })),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let escaped = url.replace('\'', "''");
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &format!("Start-Process '{}'", escaped)])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }

    Ok(axum::Json(serde_json::json!({ "success": true })))
}
