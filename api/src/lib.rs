pub mod auth;
pub mod feeds;
pub mod handler;
pub mod types;
pub mod ws;

use std::sync::Arc;
use tokio::sync::Mutex;
use engine::MatchingEngine;
use feeds::FeedManager;

pub struct AppState {
    pub engine: Arc<Mutex<MatchingEngine>>,
    pub feeds: Arc<Mutex<FeedManager>>,
}

impl AppState {
    pub fn new(engine: MatchingEngine) -> Arc<Self> {
        Arc::new(AppState {
            engine: Arc::new(Mutex::new(engine)),
            feeds: Arc::new(Mutex::new(FeedManager::new())),
        })
    }
}

pub use handler::build_router;
