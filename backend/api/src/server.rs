use std::net::SocketAddr;
use std::str::FromStr;
use std::time::Duration;

use crate::config::{AppConfig, AppState};
use crate::gateway::GatewayHeartbeatClient;
use crate::routes;
use crate::sync::SyncWorker;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use tokio::net::TcpListener;

pub async fn start_server(
    config: AppConfig,
    mut shutdown_rx: Option<tokio::sync::oneshot::Receiver<()>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing::info!(
        "Starting HOTEL_CRM API engine in {} mode...",
        config.environment
    );

    // 1. Configure Primary (Local/Operational) PostgreSQL connection pool
    let max_conns = if config.is_offline_first { 20 } else { 5 };
    let mut connect_options = PgConnectOptions::from_str(&config.database_url)?;
    if !config.is_offline_first || config.database_url.contains("pooler") {
        connect_options = connect_options.statement_cache_capacity(0);
    }

    let pool = PgPoolOptions::new()
        .max_connections(max_conns)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(15))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect_lazy_with(connect_options);

    if config.is_offline_first {
        crate::migrations::LOCAL.run(&pool).await?;
    } else {
        crate::migrations::verify_cloud(&pool).await?;
    }

    let restaurant_id = uuid::Uuid::from_u128(1);
    if config.is_offline_first {
        GatewayHeartbeatClient::new(pool.clone(), restaurant_id).spawn();
        if let Some(url) = &config.device_sync_url {
            let client = crate::sync::device::DeviceClient::new(
                url,
                config
                    .device_sync_token
                    .clone()
                    .ok_or("Set DEVICE_SYNC_TOKEN for device synchronization")?,
            )?;
            SyncWorker::new(pool.clone(), client).spawn(restaurant_id);
        }
    }
    let app_state = AppState {
        pool: pool.clone(),
        config: config.clone(),
    };
    let mut app = routes::create_router(app_state);
    if !config.is_offline_first {
        if let Some(token) = &config.device_sync_token {
            if token.len() < 32 {
                return Err("DEVICE_SYNC_TOKEN requires at least 32 characters".into());
            }
            app = app.merge(crate::sync::device::router(pool, token.clone()));
        }
    }
    // 5. Bind HTTP listener
    let addr = SocketAddr::from((
        if config.is_offline_first {
            [127, 0, 0, 1]
        } else {
            [0, 0, 0, 0]
        },
        config.port,
    ));
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => {
            tracing::info!("HOTEL_CRM API successfully listening on http://{}", addr);
            l
        }
        Err(e) => {
            tracing::warn!(
                "Could not bind to http://{} (maybe an instance is already running?): {}",
                addr,
                e
            );
            return Err(Box::new(e));
        }
    };

    // 6. Serve with graceful shutdown
    if let Some(rx) = shutdown_rx.take() {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                tokio::select! {
                    _ = rx => {
                        tracing::info!("Received shutdown signal from host process.");
                    },
                    _ = tokio::signal::ctrl_c() => {
                        tracing::info!("Received Ctrl+C interrupt.");
                    }
                }
            })
            .await?;
    } else {
        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await?;
    }

    tracing::info!("HOTEL_CRM API server stopped gracefully.");
    Ok(())
}

pub async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
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
