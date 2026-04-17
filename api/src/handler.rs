use std::sync::Arc;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use k256::ecdsa::SigningKey;
use sha3::{Digest, Keccak256};
use tower_http::cors::{AllowOrigin, CorsLayer};
use types::{
    AssetId, CancelOrderRequest, DepositRequest, MarketId, PostOrderRequest,
    Request, Response as EngineResponse, UserId, WithdrawalRequest, PRICE_DECIMALS, QUANTITY_DECIMALS,
};
use crate::{
    AppState,
    auth::{cancel_signing_message, eth_message_hash, order_signing_message, verify_matches_async, withdrawal_signing_message},
    types::{
        ApiResponse, BalanceResponse, BookLevel, BookResponse, CancelOrderBody,
        DepositBody, MarketResponse, PostOrderBody, WithdrawBody, format_amount,
    },
    ws::handle_ws,
};

#[derive(serde::Deserialize)]
struct WithdrawalSignatureRequest {
    user: String,
    asset: String,
    amount: String,
    nonce: u64,
}

#[derive(serde::Serialize)]
struct WithdrawalSignatureData {
    signature: String,
    user: String,
    asset: String,
    amount_wei: String,
    nonce: u64,
}

fn parse_eth_amount_wei(s: &str) -> Option<u128> {
    let s = s.trim();
    let (integer_part, frac_part) = match s.find('.') {
        Some(pos) => (&s[..pos], &s[pos + 1..]),
        None => (s, ""),
    };
    let integer_val: u128 = integer_part.parse().ok()?;
    let mut frac_str = frac_part.to_string();
    while frac_str.len() < 18 {
        frac_str.push('0');
    }
    frac_str.truncate(18);
    let frac_val: u128 = frac_str.parse().ok()?;
    integer_val.checked_mul(1_000_000_000_000_000_000u128)?.checked_add(frac_val)
}

fn asset_address_for(asset: &str) -> Option<[u8; 20]> {
    if asset.eq_ignore_ascii_case("ETH") {
        Some([0u8; 20])
    } else {
        None
    }
}

fn sign_withdrawal_op(
    operator_key_hex: String,
    user_bytes: [u8; 20],
    asset_addr: [u8; 20],
    amount_wei: u128,
    nonce: u64,
) -> Result<String, String> {
    let key_hex = operator_key_hex.strip_prefix("0x").unwrap_or(&operator_key_hex).to_string();
    let key_bytes = hex::decode(&key_hex).map_err(|_| "invalid operator key".to_string())?;
    let signing_key = SigningKey::from_slice(&key_bytes).map_err(|e| e.to_string())?;

    const CHAIN_ID: u64 = 11155111;
    let mut packed: Vec<u8> = Vec::with_capacity(136);
    packed.extend_from_slice(&user_bytes);
    packed.extend_from_slice(&asset_addr);

    let mut amount_bytes = [0u8; 32];
    amount_bytes[16..].copy_from_slice(&amount_wei.to_be_bytes());
    packed.extend_from_slice(&amount_bytes);

    let mut nonce_bytes = [0u8; 32];
    nonce_bytes[24..].copy_from_slice(&nonce.to_be_bytes());
    packed.extend_from_slice(&nonce_bytes);

    let mut chain_id_bytes = [0u8; 32];
    chain_id_bytes[24..].copy_from_slice(&CHAIN_ID.to_be_bytes());
    packed.extend_from_slice(&chain_id_bytes);

    let inner_hash: [u8; 32] = {
        let mut h = Keccak256::new();
        h.update(&packed);
        h.finalize().into()
    };

    let final_hash = eth_message_hash(&inner_hash);

    let (sig, recid) = signing_key
        .sign_prehash_recoverable(&final_hash)
        .map_err(|e| e.to_string())?;

    let mut eth_sig = Vec::with_capacity(65);
    eth_sig.extend_from_slice(sig.to_bytes().as_ref());
    eth_sig.push(recid.to_byte() + 27);

    Ok(format!("0x{}", hex::encode(&eth_sig)))
}

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
        .route("/withdrawal-signature", post(withdrawal_signature_handler))
        .route("/deposit", post(deposit_handler))
        .route("/ws", get(ws_handler))
        .route("/admin/state", get(admin_state_handler))
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
    if !state.order_limiter.check(&body.address) {
        return (StatusCode::TOO_MANY_REQUESTS, Json(ApiResponse::<()>::err("Rate limit exceeded. Please slow down."))).into_response();
    }

    if !body.address.starts_with("0x") || body.address.len() != 42 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Invalid wallet address format"))).into_response();
    }

    let user = match UserId::from_hex(&body.address) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Invalid wallet address format"))).into_response(),
    };

    if body.price == 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Price must be greater than 0"))).into_response();
    }
    if body.quantity == 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Quantity must be greater than 0"))).into_response();
    }
    if body.price >= u64::MAX / 2 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Price exceeds maximum allowed value"))).into_response();
    }
    if body.quantity >= u64::MAX / 2 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Quantity exceeds maximum allowed value"))).into_response();
    }

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

    let market_id = req.market.clone();
    let responses = {
        let mut engine = state.engine.lock().await;
        if !engine.markets.contains_key(&market_id) {
            return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Market not found."))).into_response();
        }
        engine.process(Request::PostOrder(req), ts)
    };

    state.feeds.lock().await.dispatch_response_batch(&user, &responses);

    if let Some(msg) = first_engine_error(&responses) {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(msg))).into_response();
    }

    (StatusCode::OK, Json(ApiResponse::ok(responses))).into_response()
}

async fn cancel_order(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CancelOrderBody>,
) -> impl IntoResponse {
    if !state.order_limiter.check(&body.address) {
        return (StatusCode::TOO_MANY_REQUESTS, Json(ApiResponse::<()>::err("Rate limit exceeded. Please slow down."))).into_response();
    }

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

    if let Some(msg) = first_engine_error(&responses) {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(msg))).into_response();
    }

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

    if let Some(msg) = first_engine_error(&responses) {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(msg))).into_response();
    }

    (StatusCode::OK, Json(ApiResponse::ok(responses))).into_response()
}

async fn deposit_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DepositBody>,
) -> impl IntoResponse {
    if !state.deposit_limiter.check(&body.user) {
        return (StatusCode::TOO_MANY_REQUESTS, Json(ApiResponse::<()>::err("Rate limit exceeded. Please slow down."))).into_response();
    }

    if !body.user.starts_with("0x") || body.user.len() != 42 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Invalid wallet address format"))).into_response();
    }

    let user = match UserId::from_hex(&body.user) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Invalid wallet address format"))).into_response(),
    };

    if !KNOWN_ASSETS.iter().any(|&a| a.eq_ignore_ascii_case(&body.asset)) {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Invalid asset. Supported: ETH, USDC, BTC, SOL, AVAX, MATIC, LINK, UNI, ARB, OP, AAVE, DOGE"))).into_response();
    }

    let amount = match parse_decimal_amount(&body.amount) {
        Some(a) => a,
        None => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid amount"))).into_response(),
    };

    if amount == 0 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Amount must be greater than 0"))).into_response();
    }

    if amount > 1_000_000_000_000u64 {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("Amount exceeds maximum deposit limit of 1,000,000"))).into_response();
    }

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

    if let Some(msg) = first_engine_error(&responses) {
        return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err(msg))).into_response();
    }

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

async fn withdrawal_signature_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<WithdrawalSignatureRequest>,
) -> impl IntoResponse {
    if !state.deposit_limiter.check(&body.user) {
        return (StatusCode::TOO_MANY_REQUESTS, Json(ApiResponse::<()>::err("Rate limit exceeded. Please slow down."))).into_response();
    }

    let operator_key = match std::env::var("OPERATOR_PRIVATE_KEY") {
        Ok(k) => k,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("Operator key not configured"))).into_response(),
    };

    let user_id = match UserId::from_hex(&body.user) {
        Ok(u) => u,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid address"))).into_response(),
    };

    let asset_addr = match asset_address_for(&body.asset) {
        Some(a) => a,
        None => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("unsupported asset"))).into_response(),
    };

    let amount_wei = match parse_eth_amount_wei(&body.amount) {
        Some(a) => a,
        None => return (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::err("invalid amount"))).into_response(),
    };

    let user_bytes = user_id.0;
    let user_hex = format!("0x{}", hex::encode(user_bytes));
    let asset_hex = format!("0x{}", hex::encode(asset_addr));
    let amount_wei_str = amount_wei.to_string();
    let nonce = body.nonce;

    let signature = match tokio::task::spawn_blocking(move || {
        sign_withdrawal_op(operator_key, user_bytes, asset_addr, amount_wei, nonce)
    })
    .await
    {
        Ok(Ok(sig)) => sig,
        Ok(Err(e)) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err(e))).into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::err("signing failed"))).into_response(),
    };

    (StatusCode::OK, Json(ApiResponse::ok(WithdrawalSignatureData {
        signature,
        user: user_hex,
        asset: asset_hex,
        amount_wei: amount_wei_str,
        nonce,
    }))).into_response()
}

async fn admin_state_handler(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let expected = std::env::var("ADMIN_TOKEN").unwrap_or_else(|_| "vela-admin-2026".to_string());
    let provided = headers
        .get("x-admin-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if provided != expected {
        return (StatusCode::UNAUTHORIZED, Json(ApiResponse::<()>::err("unauthorized"))).into_response();
    }

    let engine = state.engine.lock().await;

    let markets: Vec<serde_json::Value> = engine.markets.values().map(|m| {
        let book = engine.order_books.get(&m.id);
        serde_json::json!({
            "id": m.id.0,
            "base": m.base.0,
            "quote": m.quote.0,
            "best_bid": book.and_then(|b| b.best_bid()).map(|p| format_amount(p, PRICE_DECIMALS)),
            "best_ask": book.and_then(|b| b.best_ask()).map(|p| format_amount(p, PRICE_DECIMALS)),
        })
    }).collect();

    let total_users = engine.metadata.len();

    let total_deposits: Vec<serde_json::Value> = engine.balances.iter().map(|((user, asset), bal)| {
        serde_json::json!({
            "user": format!("0x{}", hex::encode(user.0)),
            "asset": asset.0,
            "amount": format_amount(bal.total(), 8),
        })
    }).collect();

    let total_open_orders: usize = engine.metadata.values()
        .map(|m| m.open_order_ids.len())
        .sum();

    let snapshot_path = {
        let dir = std::env::var("SNAPSHOT_DIR").unwrap_or_else(|_| "/data".to_string());
        format!("{dir}/engine_snapshot.json")
    };
    let snapshot_exists = std::path::Path::new(&snapshot_path).exists();

    let uptime_secs = state.start_time.elapsed().as_secs();

    (StatusCode::OK, Json(ApiResponse::ok(serde_json::json!({
        "markets": markets,
        "total_users": total_users,
        "total_deposits": total_deposits,
        "total_open_orders": total_open_orders,
        "snapshot_exists": snapshot_exists,
        "uptime_secs": uptime_secs,
    })))).into_response()
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

const KNOWN_ASSETS: &[&str] = &["ETH", "USDC", "BTC", "SOL", "AVAX", "MATIC", "LINK", "UNI", "ARB", "OP", "AAVE", "DOGE"];

fn engine_error_to_message(err: &str) -> String {
    if err.contains("insufficient") || err.contains("balance") {
        "Insufficient balance. Please deposit funds before trading.".to_string()
    } else if err.contains("nonce") {
        "Duplicate order. Please try again.".to_string()
    } else if err.contains("signature") || err.contains("verify") {
        "Invalid signature. Please reconnect your wallet and try again.".to_string()
    } else if err.contains("market") || err.contains("not found") {
        "Market not found.".to_string()
    } else if err.contains("credit") {
        "Credit limit exceeded. Reduce your open orders or deposit more funds.".to_string()
    } else if err.contains("post_only") || err.contains("would match") {
        "Post-only order would have matched immediately. Order rejected.".to_string()
    } else {
        "Order rejected. Please check your parameters and try again.".to_string()
    }
}

fn first_engine_error(responses: &[EngineResponse]) -> Option<String> {
    responses.iter().find_map(|r| {
        if let EngineResponse::Error(e) = r {
            Some(engine_error_to_message(&e.message))
        } else {
            None
        }
    })
}
