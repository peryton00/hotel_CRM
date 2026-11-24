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
            commands::print_receipt,
            commands::print_escpos_raw,
            commands::open_external_url
        ])
        .setup(|app| {
            log::info!(
                "HOTEL CRM Tauri 2 desktop shell initializing with embedded backend engine..."
            );

            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
            app.manage(AppShutdownState {
                shutdown_tx: Mutex::new(Some(shutdown_tx)),
            });

            // Spawn the embedded Axum backend engine in the background
            tauri::async_runtime::spawn(async move {
                log::info!("Initializing embedded Axum API engine (attendance timezone sync + double-click defense + google reviews)...");
                let config = hotel_crm_api::config::AppConfig::from_env();
                if let Err(e) = hotel_crm_api::server::start_server(config, Some(shutdown_rx)).await
                {
                    log::warn!("Embedded API engine notice: {}", e);
                }
            });

            // Spawn the WhatsApp Baileys background gateway bridge
            tauri::async_runtime::spawn(async move {
                log::info!("Initializing WhatsApp Baileys background gateway service on port 3001...");
                
                // Locate whatsapp-bridge in current directory or parent directory
                let candidate_paths = [
                    std::path::PathBuf::from("whatsapp-bridge"),
                    std::path::PathBuf::from("../whatsapp-bridge"),
                    std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|d| d.join("whatsapp-bridge")))
                        .unwrap_or_default(),
                ];

                for bridge_dir in candidate_paths {
                    let script = bridge_dir.join("index.js");
                    if script.exists() {
                        let mut cmd = std::process::Command::new("node");
                        cmd.arg(&script);
                        cmd.current_dir(&bridge_dir);
                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            cmd.creation_flags(CREATE_NO_WINDOW);
                        }
                        match cmd.spawn() {
                            Ok(_) => {
                                log::info!("WhatsApp bridge started successfully from {:?}", bridge_dir);
                                break;
                            }
                            Err(e) => {
                                log::warn!("Failed to spawn WhatsApp bridge from {:?}: {}", bridge_dir, e);
                            }
                        }
                    }
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
