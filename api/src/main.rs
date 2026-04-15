use engine::MatchingEngine;
use types::{AssetId, DepositRequest, FeeConfig, Market, MarketId, UserId};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3001);

    let mut engine = MatchingEngine::new(FeeConfig::default(), 5.0);

    engine.add_market(Market {
        id: MarketId("ETH-USDC".into()),
        base: AssetId("ETH".into()),
        quote: AssetId("USDC".into()),
        max_orders: 10_000,
        min_order_size: 1,
        price_tick: 1,
        quantity_tick: 1,
    });

    let test_user = UserId([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);

    engine.process(
        types::Request::Deposit(DepositRequest {
            user: test_user.clone(),
            asset: AssetId("ETH".into()),
            amount: 1_000_000_000_000,
            l1_tx_hash: [0u8; 32],
        }),
        0,
    );

    engine.process(
        types::Request::Deposit(DepositRequest {
            user: test_user.clone(),
            asset: AssetId("USDC".into()),
            amount: 1_000_000_000_000,
            l1_tx_hash: [1u8; 32],
        }),
        0,
    );

    let state = api::AppState::new(engine);
    let router = api::build_router(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("listening on {addr}");
    axum::serve(listener, router).await.unwrap();
}
