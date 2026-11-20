use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;

static WS_CLIENTS: OnceLock<Arc<Mutex<Vec<mpsc::UnboundedSender<String>>>>> = OnceLock::new();

fn clients() -> &'static Arc<Mutex<Vec<mpsc::UnboundedSender<String>>>> {
    WS_CLIENTS.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}

/// Checks if any CRM / POS terminal is actively connected over WebSocket
pub fn has_active_crm_clients() -> bool {
    let mut list = clients().lock().unwrap();
    // Prune closed channels during check
    list.retain(|tx| !tx.is_closed());
    !list.is_empty()
}

/// Serialize `order` to JSON and broadcast to all connected CRM WebSocket clients.
/// Dead senders are pruned automatically.
pub fn broadcast_new_order(order: &impl serde::Serialize) {
    if let Ok(json) = serde_json::to_string(order) {
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
                        if socket.send(Message::Text(text.into())).await.is_err() {
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
    // sender dropped here → pruned on next broadcast
}
