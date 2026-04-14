use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};

use std::sync::Arc;
use tokio::sync::Mutex;
use types::{PostOrderRequest, CancelOrderRequest, Request, Response};
use engine::MatchingEngine;
use crate::feeds::FeedManager;

pub struct AppState {
    pub engine: Arc<Mutex<MatchingEngine>>,
    pub feeds: Arc<Mutex<FeedManager>>,
}

pub struct ApiHandler;

impl ApiHandler {
    pub fn router(state: Arc<AppState>) -> Router {
        Router::new()
            .route("/health", get(health))
            .route("/orders", post(post_order))
            .route("/orders/cancel", post(cancel_order))
            .with_state(state)
    }
}

async fn health() -> &'static str {
    "ok"
}

async fn post_order(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PostOrderRequest>,
) -> (StatusCode, Json<Vec<Response>>) {
    let mut engine = state.engine.lock().await;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;
    let responses = engine.process(Request::PostOrder(req), ts);
    (StatusCode::OK, Json(responses))
}

async fn cancel_order(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CancelOrderRequest>,
) -> (StatusCode, Json<Vec<Response>>) {
    let mut engine = state.engine.lock().await;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;
    let responses = engine.process(Request::CancelOrder(req), ts);
    (StatusCode::OK, Json(responses))
}
