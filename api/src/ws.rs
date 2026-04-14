use std::sync::Arc;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use types::{MarketId, PRICE_DECIMALS, QUANTITY_DECIMALS};
use crate::AppState;
use crate::auth::{auth_signing_message, generate_nonce, verify_matches_async};
use crate::types::{WsClientMessage, WsServerMessage, format_amount};

pub async fn handle_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut authenticated_user: Option<types::UserId> = None;
    let mut public_rx = state.feeds.lock().await.subscribe_public();
    let mut private_rx: Option<broadcast::Receiver<WsServerMessage>> = None;
    // Server-issued challenge nonce. Must be set via RequestChallenge before Auth is accepted.
    let mut pending_nonce: Option<String> = None;

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
                                    &mut pending_nonce,
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

            // Public market-data feed: skip lagged frames and carry on.
            msg = async {
                loop {
                    match public_rx.recv().await {
                        Ok(m) => break Some(m),
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break None,
                    }
                }
            } => {
                match msg {
                    Some(m) => {
                        let json = serde_json::to_string(&m).unwrap_or_default();
                        if sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }

            // Private L3 feed: only active after successful Auth.
            // Uses std::future::pending() when unauthenticated so the branch never
            // spuriously fires, and handles Lagged by skipping to the next message.
            msg = async {
                match private_rx.as_mut() {
                    None => std::future::pending::<Option<WsServerMessage>>().await,
                    Some(rx) => loop {
                        match rx.recv().await {
                            Ok(m) => break Some(m),
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break None,
                        }
                    },
                }
            } => {
                match msg {
                    Some(m) => {
                        let json = serde_json::to_string(&m).unwrap_or_default();
                        if sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
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
    pending_nonce: &mut Option<String>,
) -> Option<WsServerMessage> {
    match msg {
        WsClientMessage::Ping => Some(WsServerMessage::Pong),

        // Step 1 of auth: client requests a server-issued challenge nonce.
        // The nonce is stored in session state and must be presented — signed — in the
        // subsequent Auth message.  Using a server-issued nonce prevents replay attacks.
        WsClientMessage::RequestChallenge => {
            let nonce = generate_nonce();
            *pending_nonce = Some(nonce.clone());
            Some(WsServerMessage::Challenge { nonce })
        }

        // Step 2 of auth: client proves ownership of `address` by signing the nonce
        // we issued in step 1.  We reject auth if no challenge was requested first, if
        // the nonce doesn't match, or if the signature is invalid.
        WsClientMessage::Auth { address, signature, nonce } => {
            match pending_nonce.take() {
                None => Some(WsServerMessage::Error {
                    code: "NO_CHALLENGE".to_string(),
                    message: "request a challenge before authenticating".to_string(),
                }),
                Some(expected) if expected != nonce => Some(WsServerMessage::Error {
                    code: "INVALID_NONCE".to_string(),
                    message: "nonce does not match server challenge".to_string(),
                }),
                Some(_) => {
                    let message = auth_signing_message(&nonce);
                    match verify_matches_async(message, signature, address.clone()).await {
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

        WsClientMessage::Unsubscribe { channels: _ } => {
            Some(WsServerMessage::Subscribed { channels: vec![] })
        }
    }
}
