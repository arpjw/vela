use std::collections::HashMap;
use tokio::sync::broadcast;
use types::{Fill, MarketId, Response, UserId};
use crate::types::WsServerMessage;

const CHANNEL_CAPACITY: usize = 1024;

pub struct FeedManager {
    public_tx: broadcast::Sender<WsServerMessage>,
    private_txs: HashMap<[u8; 20], broadcast::Sender<WsServerMessage>>,
    trade_history: HashMap<MarketId, Vec<WsServerMessage>>,
}

impl FeedManager {
    pub fn new() -> Self {
        let (public_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        FeedManager {
            public_tx,
            private_txs: HashMap::new(),
            trade_history: HashMap::new(),
        }
    }

    pub fn subscribe_public(&self) -> broadcast::Receiver<WsServerMessage> {
        self.public_tx.subscribe()
    }

    pub fn subscribe_private(&mut self, user: &UserId) -> broadcast::Receiver<WsServerMessage> {
        self.private_txs
            .entry(user.0)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    pub fn publish_public(&self, msg: WsServerMessage) {
        if let WsServerMessage::Trade { .. } = &msg {
            let _ = self.public_tx.send(msg);
        } else {
            let _ = self.public_tx.send(msg);
        }
    }

    pub fn publish_private(&self, user: &UserId, msg: WsServerMessage) {
        if let Some(tx) = self.private_txs.get(&user.0) {
            let _ = tx.send(msg);
        }
    }

    pub fn dispatch_responses(&self, user: &UserId, responses: &[Response]) {
        for response in responses {
            match response {
                Response::OrderFilled(fill) => {
                    let msg = WsServerMessage::Fill {
                        maker_order_id: fill.maker_order_id,
                        taker_order_id: fill.taker_order_id,
                        price: fill.price.to_string(),
                        quantity: fill.quantity.to_string(),
                        side: format!("{:?}", fill.side).to_lowercase(),
                        maker_fee: fill.maker_fee.to_string(),
                        taker_fee: fill.taker_fee.to_string(),
                        timestamp: fill.timestamp,
                    };
                    self.publish_private(&fill.maker, msg.clone());
                    self.publish_private(&fill.taker, msg);
                }
                Response::OrderPosted(posted) => {
                    let msg = WsServerMessage::OrderUpdate {
                        order_id: posted.order_id,
                        status: format!("{:?}", posted.status).to_lowercase(),
                        filled_quantity: "0".to_string(),
                    };
                    self.publish_private(user, msg);
                }
                Response::OrderCanceled(canceled) => {
                    let msg = WsServerMessage::OrderUpdate {
                        order_id: canceled.order_id,
                        status: "canceled".to_string(),
                        filled_quantity: "0".to_string(),
                    };
                    self.publish_private(user, msg);
                }
                Response::BalanceUpdated(update) => {
                    let msg = WsServerMessage::BalanceUpdate {
                        asset: update.asset.0.clone(),
                        available: update.available.to_string(),
                        locked: update.locked.to_string(),
                    };
                    self.publish_private(user, msg);
                }
                Response::Error(_) => {}
            }
        }
    }
}

impl Default for FeedManager {
    fn default() -> Self {
        Self::new()
    }
}
