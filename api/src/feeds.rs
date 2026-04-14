use std::collections::HashMap;
use tokio::sync::broadcast;
use types::{Response, UserId};

const FEED_CAPACITY: usize = 1024;

pub struct FeedSubscription {
    pub user: Option<UserId>,
    pub receiver: broadcast::Receiver<Response>,
}

pub struct FeedManager {
    public_tx: broadcast::Sender<Response>,
    private_txs: HashMap<UserId, broadcast::Sender<Response>>,
}

impl FeedManager {
    pub fn new() -> Self {
        let (public_tx, _) = broadcast::channel(FEED_CAPACITY);
        FeedManager {
            public_tx,
            private_txs: HashMap::new(),
        }
    }

    pub fn subscribe_public(&self) -> broadcast::Receiver<Response> {
        self.public_tx.subscribe()
    }

    pub fn subscribe_private(&mut self, user: UserId) -> broadcast::Receiver<Response> {
        self.private_txs
            .entry(user)
            .or_insert_with(|| broadcast::channel(FEED_CAPACITY).0)
            .subscribe()
    }

    pub fn publish_public(&self, response: Response) {
        let _ = self.public_tx.send(response);
    }

    pub fn publish_private(&self, user: &UserId, response: Response) {
        if let Some(tx) = self.private_txs.get(user) {
            let _ = tx.send(response);
        }
    }

    pub fn route_response(&self, user: &UserId, response: Response) {
        match &response {
            Response::OrderFilled(_) | Response::OrderPosted(_) | Response::OrderCanceled(_) => {
                self.publish_private(user, response);
            }
            _ => {
                self.publish_public(response);
            }
        }
    }
}

impl Default for FeedManager {
    fn default() -> Self {
        Self::new()
    }
}
