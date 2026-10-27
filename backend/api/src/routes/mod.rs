pub mod auth_routes;
pub mod billing_routes;
pub mod coupon_routes;
pub mod customer_routes;
pub mod health;
pub mod inventory_routes;
pub mod menu_routes;
pub mod order_routes;
pub mod reports_routes;
pub mod restaurant_routes;
pub mod table_routes;

use axum::{
    routing::{get, post, put},
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
        // Restaurant & staff
        .route(
            "/restaurants",
            get(restaurant_routes::get_current_restaurant),
        )
        .route(
            "/restaurants/staff",
            get(restaurant_routes::list_staff_members),
        )
        // Tables
        .route("/tables", get(table_routes::list_tables))
        .route("/tables/:id/status", put(table_routes::update_table_status))
        .route("/tables/transfer", post(table_routes::transfer_table))
        // Menu
        .route("/menu/categories", get(menu_routes::list_categories))
        .route(
            "/menu/items",
            get(menu_routes::list_items).post(menu_routes::create_item),
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
        .route("/inventory/wastage", post(inventory_routes::record_wastage))
        .route(
            "/inventory/movements",
            get(inventory_routes::list_movements),
        )
        // Coupons
        .route("/coupons", get(coupon_routes::list_coupons))
        .route("/coupons/validate", post(coupon_routes::validate_coupon))
        .route("/coupons/redeem", post(coupon_routes::redeem_coupon))
        // Customers & Reservations
        .route(
            "/customers",
            get(customer_routes::list_customers).post(customer_routes::create_customer),
        )
        .route(
            "/reservations",
            get(customer_routes::list_reservations).post(customer_routes::create_reservation),
        )
        .route(
            "/reservations/:id/status",
            put(customer_routes::update_reservation_status),
        )
        // Reports & Dashboard
        .route("/reports/period", get(reports_routes::get_period_report))
        .route(
            "/dashboard/summary",
            get(reports_routes::get_dashboard_summary),
        );

    Router::new()
        // Health check routes
        .route("/health/live", get(health::liveness))
        .route("/health/ready", get(health::readiness))
        // API v1 prefix
        .nest("/api/v1", api_v1)
        .layer(cors)
        .with_state(state)
}
