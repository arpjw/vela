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

    for ticker in &[
        "ETH", "BTC", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE", "DOGE",
    ] {
        engine.add_market(Market {
            id: MarketId(format!("{ticker}-USDC")),
            base: AssetId(ticker.to_string()),
            quote: AssetId("USDC".into()),
            max_orders: 10_000,
            min_order_size: 1,
            price_tick: 1,
            quantity_tick: 1,
        });
    }

    let test_user = UserId([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);

    for (i, asset) in [
        "ETH", "BTC", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE", "DOGE", "USDC",
    ]
    .iter()
    .enumerate()
    {
        let mut hash = [0u8; 32];
        hash[31] = i as u8;

        engine.process(
            types::Request::Deposit(DepositRequest {
                user: test_user.clone(),
                asset: AssetId(asset.to_string()),
                amount: 1_000_000_000_000,
                l1_tx_hash: hash,
            }),
            0,
        );
    }

    let state = api::AppState::new(engine);
    let router = api::build_router(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("listening on {addr}");
    axum::serve(listener, router).await.unwrap();
}
