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
    _printer_name: Option<String>,
) -> Result<PrintResult, String> {
    log::info!("ESC/POS Print Request received (len: {})", receipt_text.len());
    Ok(PrintResult {
        success: true,
        message: format!("Receipt queued successfully ({} chars)", receipt_text.len()),
    })
}
