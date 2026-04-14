use api::AppState;
use axum_test::TestServer;
use engine::MatchingEngine;
use serde_json::{json, Value};
use types::{AssetId, DepositRequest, FeeConfig, Market, MarketId, Request, PRICE_SCALE, QUANTITY_SCALE};

fn user_addr() -> String {
    "0x0000000000000000000000000000000000000001".to_string()
}

fn engine_with_market() -> MatchingEngine {
    let mut e = MatchingEngine::new(FeeConfig::default(), 5.0);
    e.add_market(Market {
        id: MarketId::new("BTC", "USDC"),
        base: AssetId("BTC".into()),
        quote: AssetId("USDC".into()),
        max_orders: 10_000,
        min_order_size: 1,
        price_tick: 1,
        quantity_tick: 1,
    });
    e
}

fn funded_engine() -> EngineWithUser {
    let mut e = engine_with_market();
    let user = types::UserId::from_hex(&user_addr()).unwrap();
    e.process(Request::Deposit(DepositRequest {
        user: user.clone(),
        asset: AssetId("USDC".into()),
        amount: 100_000 * PRICE_SCALE,
        l1_tx_hash: [0u8; 32],
    }), 1);
    e.process(Request::Deposit(DepositRequest {
        user: user.clone(),
        asset: AssetId("BTC".into()),
        amount: 2 * QUANTITY_SCALE,
        l1_tx_hash: [1u8; 32],
    }), 2);
    EngineWithUser { engine: e, user }
}

struct EngineWithUser {
    engine: EngineWithUser2,
    user: types::UserId,
}

type EngineWithUser2 = MatchingEngine;

fn test_server(engine: MatchingEngine) -> TestServer {
    let state = AppState::new(engine);
    let router = api::build_router(state);
    TestServer::new(router).unwrap()
}

#[tokio::test]
async fn test_health() {
    let server = test_server(engine_with_market());
    let resp = server.get("/health").await;
    resp.assert_status_ok();
    resp.assert_text("ok");
}

#[tokio::test]
async fn test_list_markets() {
    let server = test_server(engine_with_market());
    let resp = server.get("/markets").await;
    resp.assert_status_ok();
    let body: Value = resp.json();
    assert_eq!(body["ok"], true);
    let markets = body["data"].as_array().unwrap();
    assert_eq!(markets.len(), 1);
    assert_eq!(markets[0]["id"], "BTC-USDC");
}

#[tokio::test]
async fn test_get_book_empty() {
    let server = test_server(engine_with_market());
    let resp = server.get("/markets/BTC-USDC/book").await;
    resp.assert_status_ok();
    let body: Value = resp.json();
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["market"], "BTC-USDC");
    assert!(body["data"]["bids"].as_array().unwrap().is_empty());
    assert!(body["data"]["asks"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn test_get_book_not_found() {
    let server = test_server(engine_with_market());
    let resp = server.get("/markets/ETH-USDC/book").await;
    resp.assert_status(axum::http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_get_balances_empty() {
    let server = test_server(engine_with_market());
    let resp = server.get(&format!("/account/{}/balances", user_addr())).await;
    resp.assert_status_ok();
    let body: Value = resp.json();
    assert_eq!(body["ok"], true);
    assert!(body["data"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn test_get_balances_after_deposit() {
    let mut e = engine_with_market();
    let user = types::UserId::from_hex(&user_addr()).unwrap();
    e.process(Request::Deposit(DepositRequest {
        user: user.clone(),
        asset: AssetId("USDC".into()),
        amount: 50_000 * PRICE_SCALE,
        l1_tx_hash: [0u8; 32],
    }), 1);

    let server = test_server(e);
    let resp = server.get(&format!("/account/{}/balances", user_addr())).await;
    resp.assert_status_ok();
    let body: Value = resp.json();
    let balances = body["data"].as_array().unwrap();
    assert_eq!(balances.len(), 1);
    assert_eq!(balances[0]["asset"], "USDC");
    assert_eq!(balances[0]["available"], "50000");
}

#[tokio::test]
async fn test_invalid_address_returns_400() {
    let server = test_server(engine_with_market());
    let resp = server.get("/account/notanaddress/balances").await;
    resp.assert_status(axum::http::StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_post_order_invalid_sig_returns_401() {
    let server = test_server(engine_with_market());
    let body = json!({
        "market": "BTC-USDC",
        "side": "Bid",
        "order_type": "GoodTillCanceled",
        "price": 50_000u64 * PRICE_SCALE,
        "quantity": QUANTITY_SCALE,
        "nonce": 1,
        "address": user_addr(),
        "signature": format!("0x{}", "00".repeat(65)),
    });
    let resp = server.post("/orders").json(&body).await;
    resp.assert_status(axum::http::StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_format_amount() {
    use api::types::format_amount;
    assert_eq!(format_amount(100_000_000, 8), "1");
    assert_eq!(format_amount(50_000 * 100_000_000, 8), "50000");
    assert_eq!(format_amount(150_000_000, 8), "1.5");
    assert_eq!(format_amount(0, 8), "0");
    assert_eq!(format_amount(1, 8), "0.00000001");
}
