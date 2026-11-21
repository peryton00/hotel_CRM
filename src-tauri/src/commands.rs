use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub api_online: bool,
    pub api_url: String,
    pub local_db_healthy: bool,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn check_system_status() -> Result<SystemStatus, String> {
    let start = std::time::Instant::now();
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(e.to_string()),
    };

    match client.get("http://127.0.0.1:3000/api/v1/health").send().await {
        Ok(res) if res.status().is_success() => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(SystemStatus {
                api_online: true,
                api_url: "http://127.0.0.1:3000/api/v1".to_string(),
                local_db_healthy: true,
                latency_ms: latency,
            })
        }
        Ok(_) => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(SystemStatus {
                api_online: true,
                api_url: "http://127.0.0.1:3000/api/v1".to_string(),
                local_db_healthy: false,
                latency_ms: latency,
            })
        }
        Err(_) => Ok(SystemStatus {
            api_online: false,
            api_url: "http://127.0.0.1:3000/api/v1".to_string(),
            local_db_healthy: false,
            latency_ms: 0,
        }),
    }
}

#[tauri::command]
pub async fn print_receipt(
    receipt_text: String,
    printer_name: Option<String>,
) -> Result<PrintResult, String> {
    log::info!("ESC/POS Print Request received (len: {})", receipt_text.len());
    let bytes = receipt_text.into_bytes();
    let name = printer_name.unwrap_or_else(|| "POS-80".to_string());
    match hotel_crm_api::printer::print_raw_windows(&name, &bytes) {
        Ok(written) => Ok(PrintResult {
            success: true,
            message: format!("Printed {} bytes to {}", written, name),
        }),
        Err(e) => {
            log::warn!("Windows print error: {}. Falling back to success acknowledgment.", e);
            Ok(PrintResult {
                success: false,
                message: e,
            })
        }
    }
}

#[tauri::command]
pub async fn print_escpos_raw(
    target: Option<String>,
    printer_name: Option<String>,
    network_address: Option<String>,
    raw_bytes: Vec<u8>,
) -> Result<PrintResult, String> {
    let mode = target.unwrap_or_else(|| "WINDOWS".to_string()).to_uppercase();
    if mode == "NETWORK" {
        let addr = network_address.unwrap_or_else(|| "127.0.0.1:9100".to_string());
        match hotel_crm_api::printer::print_raw_network(&addr, &raw_bytes) {
            Ok(written) => Ok(PrintResult {
                success: true,
                message: format!("Printed {} bytes to network printer {}", written, addr),
            }),
            Err(e) => Err(e),
        }
    } else {
        let name = printer_name.unwrap_or_else(|| "POS-80".to_string());
        match hotel_crm_api::printer::print_raw_windows(&name, &raw_bytes) {
            Ok(written) => Ok(PrintResult {
                success: true,
                message: format!("Printed {} bytes to {}", written, name),
            }),
            Err(e) => Err(e),
        }
    }
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<bool, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") && !trimmed.starts_with("whatsapp://") {
        return Err("Invalid URL protocol".to_string());
    }

    if trimmed.chars().any(|c| c.is_control() || matches!(c, '&' | '|' | ';' | '`' | '$' | '"' | '<' | '>')) {
        return Err("URL contains invalid characters".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(trimmed).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(trimmed).spawn();
    }

    Ok(true)
}
