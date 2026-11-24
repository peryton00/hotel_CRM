use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub struct WhatsAppService;

impl WhatsAppService {
    /// Dispatches a raw text message to the local Baileys WhatsApp Bridge asynchronously.
    /// Runs fire-and-forget in a background tokio task; never blocks API latency or database transactions.
    pub fn dispatch(phone: String, message: String) {
        tokio::spawn(async move {
            if let Err(err) = Self::send_internal(&phone, &message).await {
                tracing::warn!(
                    "[WhatsAppService] Could not deliver message to {}: {}",
                    phone,
                    err
                );
            }
        });
    }

    async fn send_internal(phone: &str, message: &str) -> Result<(), String> {
        let clean_digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
        if clean_digits.len() < 10 {
            return Err("Phone number has fewer than 10 digits".to_string());
        }

        // WhatsApp Bridge URL parse (default: 127.0.0.1:3001)
        let bridge_addr =
            std::env::var("WHATSAPP_BRIDGE_ADDR").unwrap_or_else(|_| "127.0.0.1:3001".to_string());

        let payload = serde_json::json!({
            "phone": clean_digits,
            "message": message,
        });
        let body = payload.to_string();

        let request = format!(
            "POST /send HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            bridge_addr,
            body.len(),
            body
        );

        let stream_future = TcpStream::connect(&bridge_addr);
        let mut stream = tokio::time::timeout(Duration::from_secs(3), stream_future)
            .await
            .map_err(|_| format!("Connection timeout to WhatsApp Bridge ({})", bridge_addr))?
            .map_err(|e| {
                format!(
                    "Failed to connect to WhatsApp Bridge ({}): {}",
                    bridge_addr, e
                )
            })?;

        stream
            .write_all(request.as_bytes())
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        let mut response = Vec::with_capacity(512);
        let read_future = stream.read_to_end(&mut response);
        let _ = tokio::time::timeout(Duration::from_secs(3), read_future).await;

        let res_str = String::from_utf8_lossy(&response);
        if res_str.contains(" 200 OK") {
            tracing::info!(
                "[WhatsAppService] Successfully dispatched message to {}",
                clean_digits
            );
            Ok(())
        } else if res_str.contains("503") || res_str.contains("not connected") {
            Err("WhatsApp socket is not connected or QR not scanned".to_string())
        } else {
            Err(format!(
                "Bridge response: {}",
                res_str.lines().next().unwrap_or("Unknown error")
            ))
        }
    }

    fn interpolate(template: &str, replacements: &[(&str, &str)]) -> String {
        let mut result = template.to_string();
        for (placeholder, val) in replacements {
            result = result.replace(placeholder, val);
        }
        result
    }

    /// Template 1: Sent to customer upon submitting reservation request from their device
    #[allow(clippy::too_many_arguments)]
    pub fn notify_reservation_pending(
        restaurant_name: &str,
        customer_name: &str,
        customer_phone: &str,
        date_str: &str,
        time_str: &str,
        guests: i32,
        special_requests: Option<&str>,
        custom_template: Option<&str>,
    ) {
        let guests_str = guests.to_string();
        let requests_str = special_requests.unwrap_or("None");

        let message = if let Some(tpl) = custom_template.filter(|t| !t.trim().is_empty()) {
            Self::interpolate(
                tpl,
                &[
                    ("{customer_name}", customer_name.trim()),
                    ("{restaurant_name}", restaurant_name.trim()),
                    ("{date}", date_str),
                    ("{time}", time_str),
                    ("{guests}", &guests_str),
                    ("{special_requests}", requests_str),
                ],
            )
        } else {
            let note_line = match special_requests {
                Some(req) if !req.trim().is_empty() => format!("\n📝 *Note:* {}", req.trim()),
                _ => String::new(),
            };

            format!(
                "🍽️ *Reservation Request Received*\n\n\
                Dear {},\n\
                Thank you for choosing *{}*!\n\n\
                We have received your reservation request:\n\
                📅 *Date:* {}\n\
                ⏰ *Time:* {}\n\
                👥 *Guests:* {}{}\n\n\
                ⏳ *Status:* *Pending Approval*\n\
                Our floor manager is reviewing table availability. You will receive a confirmation message shortly once your table has been allocated.",
                customer_name.trim(),
                restaurant_name.trim(),
                date_str,
                time_str,
                guests,
                note_line
            )
        };

        Self::dispatch(customer_phone.to_string(), message);
    }

    /// Template 2: Sent to customer when Admin CRM confirms & allocates a table
    #[allow(clippy::too_many_arguments)]
    pub fn notify_reservation_confirmed(
        restaurant_name: &str,
        customer_name: &str,
        customer_phone: &str,
        date_str: &str,
        time_str: &str,
        guests: i32,
        table_number: &str,
        section: Option<&str>,
        custom_template: Option<&str>,
    ) {
        let guests_str = guests.to_string();
        let sec_display = section.unwrap_or("Main Dining Floor");

        let message = if let Some(tpl) = custom_template.filter(|t| !t.trim().is_empty()) {
            Self::interpolate(
                tpl,
                &[
                    ("{customer_name}", customer_name.trim()),
                    ("{restaurant_name}", restaurant_name.trim()),
                    ("{date}", date_str),
                    ("{time}", time_str),
                    ("{guests}", &guests_str),
                    ("{table_number}", table_number.trim()),
                    ("{section}", sec_display),
                ],
            )
        } else {
            let sec_str = section
                .filter(|s| !s.trim().is_empty())
                .map(|s| format!(" ({})", s.trim()))
                .unwrap_or_default();

            format!(
                "🎉 *Reservation Confirmed!*\n\n\
                Dear {},\n\
                Your table reservation at *{}* is officially confirmed!\n\n\
                📋 *Booking Details:*\n\
                📅 *Date:* {}\n\
                ⏰ *Time:* {}\n\
                👥 *Guests:* {}\n\
                🪑 *Allocated Table:* *Table {}{}*\n\n\
                We are excited to host you! If you need to make changes or have questions, feel free to reply or contact us directly.",
                customer_name.trim(),
                restaurant_name.trim(),
                date_str,
                time_str,
                guests,
                table_number.trim(),
                sec_str
            )
        };

        Self::dispatch(customer_phone.to_string(), message);
    }

    /// Template 3: Sent to customer if Admin CRM cancels/declines the reservation
    pub fn notify_reservation_cancelled(
        restaurant_name: &str,
        customer_name: &str,
        customer_phone: &str,
        date_str: &str,
        time_str: &str,
        custom_template: Option<&str>,
    ) {
        let message = if let Some(tpl) = custom_template.filter(|t| !t.trim().is_empty()) {
            Self::interpolate(
                tpl,
                &[
                    ("{customer_name}", customer_name.trim()),
                    ("{restaurant_name}", restaurant_name.trim()),
                    ("{date}", date_str),
                    ("{time}", time_str),
                ],
            )
        } else {
            format!(
                "❌ *Reservation Update*\n\n\
                Dear {},\n\
                We regret to inform you that we are currently unable to accommodate your reservation request for *{}* at *{}* at *{}* as our tables are fully committed for this time slot.\n\n\
                We sincerely apologize for the inconvenience and look forward to welcoming you at another time!",
                customer_name.trim(),
                date_str,
                time_str,
                restaurant_name.trim()
            )
        };

        Self::dispatch(customer_phone.to_string(), message);
    }
}
