use std::sync::Arc;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use types::{MarketId, PRICE_DECIMALS, QUANTITY_DECIMALS};
use crate::AppState;
use crate::auth::auth_signing_message;
use crate::types::{WsClientMessage, WsServerMessage, format_amount};

pub async fn handle_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut authenticated_user: Option<types::UserId> = None;
    let mut public_rx = state.feeds.lock().await.subscribe_public();
    let mut private_rx: Option<broadcast::Receiver<WsServerMessage>> = None;

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<WsClientMessage>(&text) {
                            Ok(client_msg) => {
                                let response = handle_client_message(
                                    client_msg,
                                    &state,
                                    &mut authenticated_user,
                                    &mut private_rx,
                                ).await;
                                if let Some(resp) = response {
                                    let json = serde_json::to_string(&resp).unwrap_or_default();
                                    if sender.send(Message::Text(json.into())).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Err(_) => {
                                let err = WsServerMessage::Error {
                                    code: "INVALID_MESSAGE".to_string(),
                                    message: "could not parse message".to_string(),
                                };
                                let json = serde_json::to_string(&err).unwrap_or_default();
                                let _ = sender.send(Message::Text(json.into())).await;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }

            Ok(msg) = public_rx.recv() => {
                let json = serde_json::to_string(&msg).unwrap_or_default();
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }

            Some(Ok(msg)) = async {
                if let Some(rx) = private_rx.as_mut() {
                    Some(rx.recv().await)
                } else {
                    None
                }
            } => {
                let json = serde_json::to_string(&msg).unwrap_or_default();
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn handle_client_message(
    msg: WsClientMessage,
    state: &Arc<AppState>,
    authenticated_user: &mut Option<types::UserId>,
    private_rx: &mut Option<broadcast::Receiver<WsServerMessage>>,
) -> Option<WsServerMessage> {
    match msg {
        WsClientMessage::Ping => Some(WsServerMessage::Pong),

        WsClientMessage::Auth { address, signature, nonce } => {
            let message = auth_signing_message(&nonce);
            match crate::auth::verify_matches(&message, &signature, &address) {
                Ok(user) => {
                    let rx = state.feeds.lock().await.subscribe_private(&user);
                    *private_rx = Some(rx);
                    *authenticated_user = Some(user);
                    Some(WsServerMessage::Authenticated { address })
                }
                Err(_) => Some(WsServerMessage::Error {
                    code: "AUTH_FAILED".to_string(),
                    message: "invalid signature".to_string(),
                }),
            }
        }

        WsClientMessage::Subscribe { channels } => {
            let engine = state.engine.lock().await;
            let mut book_snapshots: Vec<WsServerMessage> = vec![];

            for channel in &channels {
                if let Some(market_str) = channel.strip_prefix("book.") {
                    let market = MarketId(market_str.to_string());
                    if let Some(book) = engine.order_books.get(&market) {
                        let bids = book.depth_bids(20)
                            .iter()
                            .map(|(p, q)| [format_amount(*p, PRICE_DECIMALS), format_amount(*q, QUANTITY_DECIMALS)])
                            .collect();
                        let asks = book.depth_asks(20)
                            .iter()
                            .map(|(p, q)| [format_amount(*p, PRICE_DECIMALS), format_amount(*q, QUANTITY_DECIMALS)])
                            .collect();
                        book_snapshots.push(WsServerMessage::BookSnapshot {
                            market: market_str.to_string(),
                            bids,
                            asks,
                        });
                    }
                }
            }

            Some(WsServerMessage::Subscribed { channels })
        }

        WsClientMessage::Unsubscribe { channels } => {
            Some(WsServerMessage::Subscribed { channels: vec![] })
        }
    }
}
