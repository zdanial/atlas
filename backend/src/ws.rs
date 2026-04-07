use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

// ---------------------------------------------------------------------------
// Event types pushed over WebSocket
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsEvent {
    #[serde(rename = "node.created")]
    NodeCreated { node_id: String, project_id: String },
    #[serde(rename = "node.updated")]
    NodeUpdated { node_id: String, project_id: String },
    #[serde(rename = "node.deleted")]
    NodeDeleted { node_id: String, project_id: String },
    #[serde(rename = "edge.created")]
    EdgeCreated {
        edge_id: String,
        source_id: String,
        target_id: String,
    },
    #[serde(rename = "edge.deleted")]
    EdgeDeleted { edge_id: String },
}

// ---------------------------------------------------------------------------
// Shared broadcast channel
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct WsBroadcast {
    tx: broadcast::Sender<WsEvent>,
}

impl WsBroadcast {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /// Publish an event to all connected WebSocket clients.
    pub fn publish(&self, event: WsEvent) {
        // Ignore send errors (no receivers connected).
        let _ = self.tx.send(event);
    }

    /// Subscribe to the broadcast channel.
    pub fn subscribe(&self) -> broadcast::Receiver<WsEvent> {
        self.tx.subscribe()
    }
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

/// GET /ws — upgrades to WebSocket and streams node change events.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(broadcast): State<Arc<WsBroadcast>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, broadcast))
}

async fn handle_socket(mut socket: WebSocket, broadcast: Arc<WsBroadcast>) {
    let mut rx = broadcast.subscribe();

    loop {
        tokio::select! {
            // Forward broadcast events to the client
            result = rx.recv() => {
                match result {
                    Ok(event) => {
                        let json = match serde_json::to_string(&event) {
                            Ok(j) => j,
                            Err(_) => continue,
                        };
                        if socket.send(Message::Text(json.into())).await.is_err() {
                            break; // Client disconnected
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("WebSocket client lagged, skipped {n} events");
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            // Handle incoming messages from client (ping/pong, close)
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {} // Ignore other messages
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
