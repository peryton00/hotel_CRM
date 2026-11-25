// Hardware / Thermal ESC/POS Receipt Printing Module

use axum::{http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
    pub port_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PrintEscposRequest {
    pub target: Option<String>,           // "WINDOWS" | "NETWORK"
    pub printer_name: Option<String>,     // Windows printer name or None for default
    pub network_address: Option<String>,  // e.g. "192.168.1.100:9100"
    pub raw_bytes: Option<Vec<u8>>,       // Raw binary bytes array
    pub raw_bytes_base64: Option<String>, // Or Base64 encoded ESC/POS string
}

#[derive(Debug, Serialize)]
pub struct PrintResponse {
    pub success: bool,
    pub message: String,
    pub bytes_written: usize,
}

#[cfg(target_os = "windows")]
#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterA(
        p_printer_name: *const u8,
        ph_printer: *mut *mut std::ffi::c_void,
        p_default: *const std::ffi::c_void,
    ) -> i32;
    fn ClosePrinter(h_printer: *mut std::ffi::c_void) -> i32;
    fn StartDocPrinterA(
        h_printer: *mut std::ffi::c_void,
        level: u32,
        p_doc_info: *const DocInfo1A,
    ) -> u32;
    fn EndDocPrinter(h_printer: *mut std::ffi::c_void) -> i32;
    fn StartPagePrinter(h_printer: *mut std::ffi::c_void) -> i32;
    fn EndPagePrinter(h_printer: *mut std::ffi::c_void) -> i32;
    fn WritePrinter(
        h_printer: *mut std::ffi::c_void,
        p_buf: *const u8,
        cb_buf: u32,
        pc_written: *mut u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct DocInfo1A {
    p_doc_name: *const u8,
    p_output_file: *const u8,
    p_datatype: *const u8,
}

/// Print raw bytes to a Windows printer spooler via winspool RAW datatype
#[cfg(target_os = "windows")]
pub fn print_raw_windows(printer_name: &str, data: &[u8]) -> Result<usize, String> {
    let name_c = std::ffi::CString::new(printer_name).map_err(|e| e.to_string())?;
    let doc_name_c = std::ffi::CString::new("Thermal ESC/POS Receipt").unwrap();
    let raw_c = std::ffi::CString::new("RAW").unwrap();

    let mut h_printer: *mut std::ffi::c_void = std::ptr::null_mut();
    unsafe {
        if OpenPrinterA(
            name_c.as_ptr() as *const u8,
            &mut h_printer,
            std::ptr::null(),
        ) == 0
        {
            return Err(format!("Could not open printer '{}'", printer_name));
        }

        let doc_info = DocInfo1A {
            p_doc_name: doc_name_c.as_ptr() as *const u8,
            p_output_file: std::ptr::null(),
            p_datatype: raw_c.as_ptr() as *const u8,
        };

        let job_id = StartDocPrinterA(h_printer, 1, &doc_info);
        if job_id == 0 {
            ClosePrinter(h_printer);
            return Err("Failed to start document on printer spooler".to_string());
        }

        if StartPagePrinter(h_printer) == 0 {
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
            return Err("Failed to start page on printer spooler".to_string());
        }

        let mut written: u32 = 0;
        let res = WritePrinter(h_printer, data.as_ptr(), data.len() as u32, &mut written);

        EndPagePrinter(h_printer);
        EndDocPrinter(h_printer);
        ClosePrinter(h_printer);

        if res == 0 {
            return Err("Failed to write raw bytes to printer spooler".to_string());
        }

        Ok(written as usize)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn print_raw_windows(_printer_name: &str, _data: &[u8]) -> Result<usize, String> {
    Err("Windows raw printer printing is only supported on Windows OS".to_string())
}

/// Print raw bytes to a Network ESC/POS thermal printer via TCP socket (port 9100)
pub fn print_raw_network(address: &str, data: &[u8]) -> Result<usize, String> {
    use std::io::Write;
    use std::net::{TcpStream, ToSocketAddrs};

    let target = if !address.contains(':') {
        format!("{}:9100", address)
    } else {
        address.to_string()
    };

    let socket_addr = target
        .to_socket_addrs()
        .map_err(|e| format!("Invalid network printer address '{}': {}", target, e))?
        .next()
        .ok_or_else(|| format!("Could not resolve address '{}'", target))?;

    let mut stream =
        TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3)).map_err(|e| {
            format!(
                "Connection to network printer '{}' timed out: {}",
                target, e
            )
        })?;

    stream
        .write_all(data)
        .map_err(|e| format!("Failed to send data to printer: {}", e))?;

    stream
        .flush()
        .map_err(|e| format!("Failed to flush printer socket: {}", e))?;

    Ok(data.len())
}

/// List printers installed on the Windows system using PowerShell / WMI
pub async fn list_system_printers() -> Vec<PrinterInfo> {
    #[cfg(target_os = "windows")]
    {
        let output = tokio::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName | ConvertTo-Json -Compress",
            ])
            .output()
            .await;

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(text.trim()) {
                if let Some(arr) = val.as_array() {
                    return arr
                        .iter()
                        .filter_map(|item| {
                            let name = item.get("Name")?.as_str()?.to_string();
                            let is_default = item
                                .get("Default")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            let port_name = item
                                .get("PortName")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            Some(PrinterInfo {
                                name,
                                is_default,
                                port_name,
                            })
                        })
                        .collect();
                } else if let Some(obj) = val.as_object() {
                    if let Some(name) = obj.get("Name").and_then(|v| v.as_str()) {
                        let is_default = obj
                            .get("Default")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let port_name = obj
                            .get("PortName")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        return vec![PrinterInfo {
                            name: name.to_string(),
                            is_default,
                            port_name,
                        }];
                    }
                }
            }
        }
    }

    vec![]
}

// Axum Route Handlers

pub async fn list_printers_route(_staff: crate::auth::TenantContext) -> Json<Vec<PrinterInfo>> {
    let printers = list_system_printers().await;
    Json(printers)
}

pub async fn print_escpos_route(
    _staff: crate::auth::TenantContext,
    Json(payload): Json<PrintEscposRequest>,
) -> Result<Json<PrintResponse>, (StatusCode, Json<serde_json::Value>)> {
    print_request(payload).await
}

pub(crate) async fn print_request(
    payload: PrintEscposRequest,
) -> Result<Json<PrintResponse>, (StatusCode, Json<serde_json::Value>)> {
    let bytes = if let Some(raw) = payload.raw_bytes {
        raw
    } else if let Some(b64) = payload.raw_bytes_base64 {
        // Fallback or simple base64
        // In case base64 string is passed, try standard decode
        match base64_decode_simple(&b64) {
            Ok(b) => b,
            Err(e) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": format!("Invalid base64: {}", e) })),
                ))
            }
        }
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": "No print data provided (raw_bytes or raw_bytes_base64 required)" }),
            ),
        ));
    };

    if bytes.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Print data is empty" })),
        ));
    }

    let target = payload
        .target
        .unwrap_or_else(|| "WINDOWS".to_string())
        .to_uppercase();

    if target == "NETWORK" {
        let addr = payload
            .network_address
            .unwrap_or_else(|| "127.0.0.1:9100".to_string());
        match print_raw_network(&addr, &bytes) {
            Ok(written) => {
                info!(
                    "Printed {} ESC/POS bytes to network printer {}",
                    written, addr
                );
                Ok(Json(PrintResponse {
                    success: true,
                    message: format!(
                        "Successfully sent {} bytes to network printer {}",
                        written, addr
                    ),
                    bytes_written: written,
                }))
            }
            Err(e) => {
                error!("Network printer error: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": e })),
                ))
            }
        }
    } else {
        // Windows printer spooler
        let printer_name = if let Some(name) = payload.printer_name {
            name
        } else {
            // Find default printer
            let list = list_system_printers().await;
            list.into_iter()
                .find(|p| p.is_default)
                .map(|p| p.name)
                .unwrap_or_else(|| "POS-80".to_string())
        };

        match print_raw_windows(&printer_name, &bytes) {
            Ok(written) => {
                info!(
                    "Printed {} ESC/POS bytes to Windows printer {}",
                    written, printer_name
                );
                Ok(Json(PrintResponse {
                    success: true,
                    message: format!("Successfully printed {} bytes to {}", written, printer_name),
                    bytes_written: written,
                }))
            }
            Err(e) => {
                error!("Windows printer error: {}", e);
                Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": e })),
                ))
            }
        }
    }
}

fn base64_decode_simple(input: &str) -> Result<Vec<u8>, String> {
    // Simple stdlib base64 decoder
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &b in input.as_bytes() {
        if b == b'=' || b.is_ascii_whitespace() {
            continue;
        }
        let val = match TABLE.iter().position(|&x| x == b) {
            Some(idx) => idx as u32,
            None => return Err(format!("Invalid character '{}' in base64", b as char)),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }

    Ok(out)
}
