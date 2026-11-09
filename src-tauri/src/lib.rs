pub mod commands;

use std::sync::Mutex;
use tauri::Manager;

struct AppShutdownState {
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::check_system_status,
            commands::print_receipt
        ])
        .setup(|app| {
            log::info!("HOTEL CRM Tauri 2 desktop shell initializing with embedded backend engine...");

            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
            app.manage(AppShutdownState {
                shutdown_tx: Mutex::new(Some(shutdown_tx)),
            });

            // Spawn the embedded Axum backend engine in the background
            tauri::async_runtime::spawn(async move {
                log::info!("Initializing embedded Axum API engine...");
                let config = hotel_crm_api::config::AppConfig::from_env();
                if let Err(e) = hotel_crm_api::server::start_server(config, Some(shutdown_rx)).await {
                    log::warn!("Embedded API engine notice: {}", e);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppShutdownState>() {
                    if let Ok(mut lock) = state.shutdown_tx.lock() {
                        if let Some(tx) = lock.take() {
                            let _ = tx.send(());
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running HOTEL CRM tauri application");
}
