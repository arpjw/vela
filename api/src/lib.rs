pub mod auth;
pub mod feeds;
pub mod handler;
pub mod mm;
pub mod rate_limit;
pub mod snapshot;
pub mod types;
pub mod ws;

use std::sync::Arc;
use tokio::sync::Mutex;
use engine::MatchingEngine;
use feeds::FeedManager;
use rate_limit::RateLimiter;

pub struct AppState {
    pub engine: Arc<Mutex<MatchingEngine>>,
    pub feeds: Arc<Mutex<FeedManager>>,
    pub order_limiter: Arc<RateLimiter>,
    pub deposit_limiter: Arc<RateLimiter>,
    pub general_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub fn new(engine: MatchingEngine) -> Arc<Self> {
        Arc::new(AppState {
            engine: Arc::new(Mutex::new(engine)),
            feeds: Arc::new(Mutex::new(FeedManager::new())),
            order_limiter: Arc::new(RateLimiter::new(20, 60)),
            deposit_limiter: Arc::new(RateLimiter::new(5, 60)),
            general_limiter: Arc::new(RateLimiter::new(100, 60)),
        })
    }
}

pub use handler::build_router;
