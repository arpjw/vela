use std::sync::Arc;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    http::{HeaderValue, Method, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use sha3::{Digest, Keccak256};
use tower_http::cors::{AllowOrigin, CorsLayer};
use types::{
    AssetId, CancelOrderRequest, DepositRequest, MarketId, PostOrderRequest,
    Request, UserId, WithdrawalRequest, PRICE_DECIMALS, QUANTITY_DECIMALS,
};
use crate::{
    AppState,
    auth::{cancel_signing_message, order_signing_message, verify_matches_async, withdrawal_signing_message},
    types::{
        ApiResponse, BalanceResponse, BookLevel, BookResponse, CancelOrderBody,
        DepositBody, MarketResponse, PostOrderBody, WithdrawBody, format_amount,
    },
    ws::handle_ws,
};

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list([
            "https://vela.monolithsystematic.com".parse::<HeaderValue>().unwrap(),
            "https://vela-vert.vercel.app".parse::<HeaderValue>().unwrap(),
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
        ]))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any);

    Router::new()
        .route("/health", get(health))
        .route("/markets", get(list_markets))
        .route("/markets/:market/book", get(get_book))
        .route("/account/:address/balances", get(get_balances))
        .route("/account/:address/orders", get(get_open_orders))
        .route("/orders", post(post_order))
        .route("/orders/cancel", post(cancel_order))
        .route("/withdrawals", post(initiate_withdrawal))
        .route("/deposit", post(deposit_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
        .layer(cors)
}

async fn health() -> &'static str {
    "ok"
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn list_markets(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let engine = state.engine.lock().await;
    let markets: Vec<MarketResponse> = engine.markets.values().map(|m| {
        let book = engine.order_books.get(&m.id);
        MarketResponse {
            id: m.id.0.clone(),
            base: m.base.0.clone(),
            quote: m.quote.0.clone(),
            best_bid: book.and_then(|b| b.best_bid()).map(|p| format_amount(p, PRICE_DECIMALS)),
            best_ask: book.and_then(|b| b.best_ask()).map(|p| format_amount(p, PRICE_DECIMALS)),
            spread: book.and_then(|b| b.spread()).map(|s| format_amount(s, PRICE_DECIMALS)),
        }
    }).collect();
    Json(ApiResponse::ok(markets))
}

async fn get_book(
    Path(market): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let engine = state.engine.lock().await;
    let market_id = MarketId(market.clone());
    match engine.order_books.get(&market_id) {
        Some(book) => {
            let bids = book.depth_bids(50).iter().map(|(p, q)| BookLevel {
                price: format_amount(*p, PRICE_DECIMALS),
                quantity: format_amount(*q, QUANTITY_DECIMALS),
            }).collect();
            let asks = book.depth_asks(50).iter().map(|(p, q)| BookLevel {
                price: format_amount(*p, PRICE_DECIMALS),
                quantity: format_amount(*q, QUANTITY_DECIMALS),
            }).collect();
            (StatusCode::OK, Json(ApiResponse::ok(BookResponse { market, bids, asks }))).into_response()
        }
        None => (StatusCode::NOT_FOUND, Json(ApiResponse::<()>::err("market not found"))).into_response(),
    }
}

async fn get_balances(
    Path(address): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };
    let engine = state.engine.lock().await;
    let balances: Vec<BalanceResponse> = engine.balances.iter()
        .filter(|((u, _), _)| u == &user)
        .map(|((_, asset), bal)| BalanceResponse {
            asset: asset.0.clone(),
            available: format_amount(bal.available, 8),
            locked: format_amount(bal.locked, 8),
            total: format_amount(bal.total(), 8),
        })
        .collect();
    (StatusCode::OK, Json(ApiResponse::ok(balances))).into_response()
}

async fn get_open_orders(
    Path(address): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };
    let engine = state.engine.lock().await;
    let meta = engine.metadata.get(&user);
    let open_order_ids = meta.map(|m| m.open_order_ids.clone()).unwrap_or_default();
    let orders: Vec<serde_json::Value> = engine.order_books.values()
        .flat_map(|book| {
            open_order_ids.iter().filter_map(|&id| {
                book.get_order(id).map(|o| serde_json::json!({
                    "id": o.id,
                    "market": o.market.0,
                    "side": format!("{:?}", o.side).to_lowercase(),
                    "order_type": format!("{:?}", o.order_type).to_lowercase(),
                    "price": format_amount(o.price, PRICE_DECIMALS),
                    "quantity": format_amount(o.quantity, QUANTITY_DECIMALS),
                    "filled_quantity": format_amount(o.filled_quantity, QUANTITY_DECIMALS),
                    "status": format!("{:?}", o.status).to_lowercase(),
                    "nonce": o.nonce,
                    "client_order_id": o.client_order_id,
                    "timestamp": o.timestamp,
                }))
            })
        })
        .collect();
    (StatusCode::OK, Json(ApiResponse::ok(orders))).into_response()
}

async fn post_order(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PostOrderBody>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&body.address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };

    let side_str = format!("{:?}", body.side).to_lowercase();
    let msg = order_signing_message(&body.market, &side_str, body.price, body.quantity, body.nonce);
    if verify_matches_async(msg, body.signature.clone(), body.address.clone()).await.is_err() {
        return (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err("invalid signature"))).into_response();
    }

    let req = PostOrderRequest {
        user: user.clone(),
        market: MarketId(body.market),
        side: body.side,
        order_type: body.order_type,
        price: body.price,
        quantity: body.quantity,
        nonce: body.nonce,
        client_order_id: body.client_order_id,
        signature: vec![],
    };

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;

    let responses = {
        let mut engine = state.engine.lock().await;
        engine.process(Request::PostOrder(req), ts)
    };

    state.feeds.lock().await.dispatch_response_batch(&user, &responses);

    (StatusCode::OK, Json(ApiResponse::ok(responses))).into_response()
}

async fn cancel_order(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CancelOrderBody>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&body.address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };

    let msg = cancel_signing_message(
        body.order_id,
        body.client_order_id.as_deref(),
        body.nonce,
    );
    if verify_matches_async(msg, body.signature.clone(), body.address.clone()).await.is_err() {
        return (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err("invalid signature"))).into_response();
    }

    let req = CancelOrderRequest {
        user: user.clone(),
        order_id: body.order_id,
        client_order_id: body.client_order_id,
        nonce: body.nonce,
        signature: vec![],
    };

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;

    let responses = {
        let mut engine = state.engine.lock().await;
        engine.process(Request::CancelOrder(req), ts)
    };

    state.feeds.lock().await.dispatch_response_batch(&user, &responses);

    (StatusCode::OK, Json(ApiResponse::ok(responses))).into_response()
}

async fn initiate_withdrawal(
    State(state): State<Arc<AppState>>,
    Json(body): Json<WithdrawBody>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&body.address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };

    let msg = withdrawal_signing_message(&body.asset, body.amount, body.nonce);
    if verify_matches_async(msg, body.signature.clone(), body.address.clone()).await.is_err() {
        return (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err("invalid signature"))).into_response();
    }

    let req = WithdrawalRequest {
        user: user.clone(),
        asset: AssetId(body.asset),
        amount: body.amount,
        nonce: body.nonce,
        signature: vec![],
    };

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;

    let responses = {
        let mut engine = state.engine.lock().await;
        engine.process(Request::Withdrawal(req), ts)
    };

    state.feeds.lock().await.dispatch_response_batch(&user, &responses);

    (StatusCode::OK, Json(ApiResponse::ok(responses))).into_response()
}

async fn deposit_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DepositBody>,
) -> impl IntoResponse {
    let user = match UserId::from_hex(&body.user) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };

    let amount = match parse_decimal_amount(&body.amount) {
        Some(a) => a,
        None => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid amount"))).into_response(),
    };

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;

    let mut hasher = Keccak256::new();
    hasher.update(ts.to_le_bytes());
    hasher.update(body.user.as_bytes());
    hasher.update(body.asset.as_bytes());
    let hash_result = hasher.finalize();
    let mut l1_tx_hash = [0u8; 32];
    l1_tx_hash.copy_from_slice(&hash_result);

    let req = DepositRequest {
        user: user.clone(),
        asset: AssetId(body.asset),
        amount,
        l1_tx_hash,
    };

    let responses = {
        let mut engine = state.engine.lock().await;
        engine.process(Request::Deposit(req), ts)
    };

    state.feeds.lock().await.dispatch_response_batch(&user, &responses);

    let engine = state.engine.lock().await;
    let balances: Vec<BalanceResponse> = engine.balances.iter()
        .filter(|((u, _), _)| u == &user)
        .map(|((_, asset), bal)| BalanceResponse {
            asset: asset.0.clone(),
            available: format_amount(bal.available, 8),
            locked: format_amount(bal.locked, 8),
            total: format_amount(bal.total(), 8),
        })
        .collect();

    (StatusCode::OK, Json(ApiResponse::ok(balances))).into_response()
}

fn parse_decimal_amount(s: &str) -> Option<u64> {
    let s = s.trim();
    let (integer_part, frac_part) = match s.find('.') {
        Some(pos) => (&s[..pos], &s[pos + 1..]),
        None => (s, ""),
    };
    let integer_val: u64 = integer_part.parse().ok()?;
    let mut frac_str = frac_part.to_string();
    while frac_str.len() < 6 {
        frac_str.push('0');
    }
    let frac_val: u64 = frac_str[..6].parse().ok()?;
    integer_val.checked_mul(1_000_000)?.checked_add(frac_val)
}
