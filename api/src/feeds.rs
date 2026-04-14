use std::collections::HashMap;
use tokio::sync::broadcast;
use types::{MarketId, Response, UserId};
use crate::types::WsServerMessage;

const CHANNEL_CAPACITY: usize = 1024;

pub struct FeedManager {
    public_tx: broadcast::Sender<WsServerMessage>,
    private_txs: HashMap<[u8; 20], broadcast::Sender<WsServerMessage>>,
}

impl FeedManager {
    pub fn new() -> Self {
        let (public_tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        FeedManager {
            public_tx,
            private_txs: HashMap::new(),
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
        let _ = self.public_tx.send(msg);
    }

    pub fn publish_private(&self, user: &UserId, msg: WsServerMessage) {
        if let Some(tx) = self.private_txs.get(&user.0) {
            let _ = tx.send(msg);
        }
    }

    pub fn dispatch_responses(&self, user: &UserId, responses: &[Response]) {
        self.dispatch_response_batch(user, responses);
    }

    pub fn dispatch_response_batch(&self, user: &UserId, responses: &[Response]) {
        let mut private_msgs: Vec<([u8; 20], WsServerMessage)> = vec![];

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
                    private_msgs.push((fill.maker.0, msg.clone()));
                    private_msgs.push((fill.taker.0, msg));
                }
                Response::OrderPosted(posted) => {
                    private_msgs.push((user.0, WsServerMessage::OrderUpdate {
                        order_id: posted.order_id,
                        status: format!("{:?}", posted.status).to_lowercase(),
                        filled_quantity: "0".to_string(),
                    }));
                }
                Response::OrderCanceled(canceled) => {
                    private_msgs.push((user.0, WsServerMessage::OrderUpdate {
                        order_id: canceled.order_id,
                        status: "canceled".to_string(),
                        filled_quantity: "0".to_string(),
                    }));
                }
                Response::BalanceUpdated(update) => {
                    private_msgs.push((user.0, WsServerMessage::BalanceUpdate {
                        asset: update.asset.0.clone(),
                        available: update.available.to_string(),
                        locked: update.locked.to_string(),
                    }));
                }
                Response::Error(_) => {}
            }
        }

        for (addr, msg) in private_msgs {
            if let Some(tx) = self.private_txs.get(&addr) {
                let _ = tx.send(msg);
            }
        }
    }
}

impl Default for FeedManager {
    fn default() -> Self {
        Self::new()
    }
}
