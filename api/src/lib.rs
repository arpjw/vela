pub mod auth;
pub mod feeds;
pub mod handler;
pub mod mm;
pub mod rate_limit;
pub mod snapshot;
pub mod types;
pub mod ws;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use engine::MatchingEngine;
use feeds::FeedManager;
use rate_limit::RateLimiter;
use crate::types::{StoredFill, StoredOrder};

pub struct AppState {
    pub engine: Arc<Mutex<MatchingEngine>>,
    pub feeds: Arc<Mutex<FeedManager>>,
    pub order_limiter: Arc<RateLimiter>,
    pub deposit_limiter: Arc<RateLimiter>,
    pub general_limiter: Arc<RateLimiter>,
    pub start_time: std::time::Instant,
    pub fills: Arc<Mutex<Vec<StoredFill>>>,
    pub stored_orders: Arc<Mutex<HashMap<u64, StoredOrder>>>,
}

impl AppState {
    pub fn new(engine: MatchingEngine) -> Arc<Self> {
        Arc::new(AppState {
            engine: Arc::new(Mutex::new(engine)),
            feeds: Arc::new(Mutex::new(FeedManager::new())),
            order_limiter: Arc::new(RateLimiter::new(20, 60)),
            deposit_limiter: Arc::new(RateLimiter::new(5, 60)),
            general_limiter: Arc::new(RateLimiter::new(100, 60)),
            start_time: std::time::Instant::now(),
            fills: Arc::new(Mutex::new(Vec::new())),
            stored_orders: Arc::new(Mutex::new(HashMap::new())),
        })
    }
}

pub use handler::build_router;
