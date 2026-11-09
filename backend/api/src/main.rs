use hotel_crm_api::config::AppConfig;
use hotel_crm_api::server;
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

    // 3. Start unified server engine
    if let Err(e) = server::start_server(config, None).await {
        tracing::error!("Server startup failure: {:?}", e);
        std::process::exit(1);
    }

    Ok(())
}
