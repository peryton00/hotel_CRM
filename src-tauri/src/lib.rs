pub mod commands;

use std::sync::Mutex;
use tauri::Manager;

struct AppShutdownState {
    bridge: Mutex<Option<std::process::Child>>,
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

fn start_bridge(data_dir: &std::path::Path) -> std::io::Result<std::process::Child> {
    let mut cmd = if cfg!(debug_assertions) {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../whatsapp-bridge");
        let mut cmd = std::process::Command::new("node");
        cmd.arg(dir.join("index.js")).current_dir(dir);
        cmd
    } else {
        let exe = std::env::current_exe()?;
        let dir = exe.with_file_name("whatsapp-bridge");
        let mut cmd = std::process::Command::new(dir.join("node.exe"));
        cmd.arg(dir.join("index.js"))
            .current_dir(dir)
            .env("HOTEL_CRM_WHATSAPP_DATA", data_dir.join("whatsapp"))
            .env("WHATSAPP_PORT", "3001");
        cmd
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.spawn()
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
            let config = hotel_crm_api::config::AppConfig::from_env();
            let data_directory = app.path().app_local_data_dir()?;
            let bridge = start_bridge(&data_directory)
                .map_err(|err| {
                    log::error!("WhatsApp bridge could not start: {err}");
                })
                .ok();
            app.manage(AppShutdownState {
                bridge: Mutex::new(bridge),
                shutdown_tx: Mutex::new(Some(shutdown_tx)),
            });
            tauri::async_runtime::spawn(async move {
                if config.is_offline_first {
                    if let Err(error) =
                        hotel_crm_api::server::start_server(config, Some(shutdown_rx)).await
                    {
                        log::error!("Local PostgreSQL API stopped: {error}");
                    }
                } else {
                    log::info!("Starting local SQLite API in {}", data_directory.display());
                    if let Err(error) =
                        hotel_crm_api::local_database::serve(&data_directory, shutdown_rx).await
                    {
                        log::error!("Local SQLite API stopped: {error}");
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppShutdownState>() {
                    if let Ok(mut bridge) = state.bridge.lock() {
                        if let Some(mut child) = bridge.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
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
