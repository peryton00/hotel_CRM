use std::net::SocketAddr;
use std::time::Duration;

use hotel_crm_api::config::{AppConfig, AppState};
use hotel_crm_api::routes;
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tokio::signal;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hotel_crm_api=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Load configuration
    let config = AppConfig::from_env();
    tracing::info!("Starting HOTEL_CRM API in {} mode...", config.environment);

    // 3. Configure PostgreSQL connection pool
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(600))
        .connect_lazy(&config.database_url)?;

    let app_state = AppState {
        pool,
        config: config.clone(),
    };

    // 4. Build application router
    let app = routes::create_router(app_state);

    // 5. Bind HTTP listener
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("HOTEL_CRM API successfully listening on http://{}", addr);

    // 6. Serve with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("HOTEL_CRM API server stopped gracefully.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C interrupt, initiating shutdown...");
        },
        _ = terminate => {
            tracing::info!("Received SIGTERM terminate, initiating shutdown...");
        },
    }
}
