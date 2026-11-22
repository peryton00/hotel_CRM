use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use std::convert::Infallible;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_stream::StreamExt as _;
use uuid::Uuid;

static WS_CLIENTS: OnceLock<Arc<Mutex<Vec<mpsc::UnboundedSender<String>>>>> = OnceLock::new();

fn clients() -> &'static Arc<Mutex<Vec<mpsc::UnboundedSender<String>>>> {
    WS_CLIENTS.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}

/// Checks if any CRM / POS terminal or client is actively connected over WebSocket or SSE
pub fn has_active_crm_clients() -> bool {
    let mut list = clients().lock().unwrap();
    list.retain(|tx| !tx.is_closed());
    !list.is_empty()
}

/// Serialize `order` to JSON and broadcast to all connected WebSocket & SSE clients.
/// Dead senders are pruned automatically.
pub fn broadcast_new_order(order: &impl serde::Serialize) {
    if let Ok(json) = serde_json::to_string(order) {
        broadcast_str(&json);
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TableStatusBroadcast {
    pub event: &'static str,
    pub table_id: Uuid,
    pub table_number: String,
    pub status: String,
    pub ordering_enabled: bool,
    pub seating_session_id: Option<Uuid>,
}

/// Broadcast real-time table status transition to all connected CRM POS terminals & customer phone tabs.
/// Normalizes `status` to UPPERCASE ("OCCUPIED", "AVAILABLE") so clients match consistently.
pub fn broadcast_table_status(
    table_id: Uuid,
    table_number: &str,
    status: &str,
    ordering_enabled: bool,
    seating_session_id: Option<Uuid>,
) {
    let payload = TableStatusBroadcast {
        event: "TABLE_STATUS_CHANGED",
        table_id,
        table_number: table_number.to_string(),
        status: status.to_uppercase(),
        ordering_enabled,
        seating_session_id,
    };
    if let Ok(json) = serde_json::to_string(&payload) {
        broadcast_str(&json);
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReservationBroadcast {
    pub event: &'static str,
    pub reservation: crate::models::customer::Reservation,
}

/// Broadcast new customer table reservation to connected POS & CRM terminals.
pub fn broadcast_new_reservation(reservation: &crate::models::customer::Reservation) {
    let payload = ReservationBroadcast {
        event: "RESERVATION_CREATED",
        reservation: reservation.clone(),
    };
    if let Ok(json) = serde_json::to_string(&payload) {
        broadcast_str(&json);
    }
}

fn broadcast_str(order_json: &str) {
    let mut list = clients().lock().unwrap();
    list.retain(|tx| tx.send(order_json.to_string()).is_ok());
}

pub async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    clients().lock().unwrap().push(tx);

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Some(text) => {
                        if socket.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(_)) => {} // ignore client messages (pings, etc.)
                    _ => break,       // disconnect or error
                }
            }
        }
    }
}

/// SSE handler allowing clients or browsers with `EventSource` to receive live events
pub async fn sse_handler() -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::unbounded_channel::<String>();
    clients().lock().unwrap().push(tx);

    let stream = UnboundedReceiverStream::new(rx).map(|msg| Ok(Event::default().data(msg)));

    Sse::new(stream).keep_alive(KeepAlive::default())
}
