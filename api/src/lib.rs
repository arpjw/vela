pub mod auth;
pub mod da;
pub mod feeds;
pub mod handler;
pub mod mm;
pub mod rate_limit;
pub mod snapshot;
pub mod types;
pub mod ws;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use engine::MatchingEngine;
use feeds::FeedManager;
use rate_limit::RateLimiter;
use crate::types::{StoredFill, StoredOrder};

pub struct OrderChannelItem {
    pub req: ::types::PostOrderRequest,
    pub ts: u64,
    pub response_tx: tokio::sync::oneshot::Sender<Vec<::types::Response>>,
}

pub struct AppState {
    pub engine: Arc<Mutex<MatchingEngine>>,
    pub feeds: Arc<Mutex<FeedManager>>,
    pub order_limiter: Arc<RateLimiter>,
    pub deposit_limiter: Arc<RateLimiter>,
    pub general_limiter: Arc<RateLimiter>,
    pub start_time: std::time::Instant,
    pub fills: Arc<Mutex<Vec<StoredFill>>>,
    pub stored_orders: Arc<Mutex<HashMap<u64, StoredOrder>>>,
    pub order_tx: tokio::sync::mpsc::Sender<OrderChannelItem>,
    pub da: Arc<da::DaSubmitter>,
}

impl AppState {
    pub fn new(engine: MatchingEngine) -> Arc<Self> {
        let (order_tx, order_rx) = tokio::sync::mpsc::channel::<OrderChannelItem>(1024);
        let engine_arc = Arc::new(Mutex::new(engine));

        let da_dir = std::env::var("DA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/data/da"));

        let state = Arc::new(AppState {
            engine: Arc::clone(&engine_arc),
            feeds: Arc::new(Mutex::new(FeedManager::new())),
            order_limiter: Arc::new(RateLimiter::new(20, 60)),
            deposit_limiter: Arc::new(RateLimiter::new(5, 60)),
            general_limiter: Arc::new(RateLimiter::new(100, 60)),
            start_time: std::time::Instant::now(),
            fills: Arc::new(Mutex::new(Vec::new())),
            stored_orders: Arc::new(Mutex::new(HashMap::new())),
            order_tx,
            da: Arc::new(da::DaSubmitter::new(Arc::new(da::LocalDaClient::new(da_dir)))),
        });

        tokio::spawn(engine_order_task(order_rx, engine_arc));

        state
    }
}

pub async fn engine_order_task(
    mut rx: tokio::sync::mpsc::Receiver<OrderChannelItem>,
    engine: Arc<Mutex<MatchingEngine>>,
) {
    use tokio::time::{timeout_at, Instant};
    use std::time::Duration;
    use ::types::Request;

    loop {
        let first = match rx.recv().await {
            Some(item) => item,
            None => break,
        };

        let mut batch = vec![first];
        let deadline = Instant::now() + Duration::from_millis(1);

        loop {
            if batch.len() >= 50 {
                break;
            }
            match timeout_at(deadline, rx.recv()).await {
                Ok(Some(item)) => batch.push(item),
                _ => break,
            }
        }

        let mut eng = engine.lock().await;
        for item in batch {
            let responses = eng.process(Request::PostOrder(item.req), item.ts);
            let _ = item.response_tx.send(responses);
        }
    }
}

pub use handler::build_router;
