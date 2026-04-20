use std::sync::Arc;
use engine::MatchingEngine;
use types::{
    AssetId, DepositRequest, FeeConfig, Market, MarketId, OrderSide, OrderType, PostOrderRequest,
    Request, UserId,
};

fn seed_markets(engine: &mut MatchingEngine) {
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
            maker_fee_bps: -1,
            taker_fee_bps: 5,
        });
    }

    let test_user = UserId([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

    for (i, asset) in [
        "ETH", "BTC", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE", "DOGE", "USDC",
    ]
    .iter()
    .enumerate()
    {
        let mut hash = [0u8; 32];
        hash[31] = i as u8;

        engine.process(
            Request::Deposit(DepositRequest {
                user: test_user.clone(),
                asset: AssetId(asset.to_string()),
                amount: 1_000_000_000_000,
                l1_tx_hash: hash,
            }),
            0,
        );
    }
}

fn seed_order_books(engine: &mut MatchingEngine) {
    let seed_user = UserId([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

    let make_hash = |a: u8, b: u8| -> [u8; 32] {
        let mut h = [0u8; 32];
        h[0] = 2;
        h[30] = a;
        h[31] = b;
        h
    };

    engine.process(
        Request::Deposit(DepositRequest {
            user: seed_user.clone(),
            asset: AssetId("USDC".into()),
            amount: 10_000_000_000_000_000,
            l1_tx_hash: make_hash(0, 0),
        }),
        0,
    );

    for (i, asset) in [
        "BTC", "ETH", "SOL", "AVAX", "MATIC", "LINK", "UNI", "ARB", "OP", "AAVE", "DOGE",
    ]
    .iter()
    .enumerate()
    {
        engine.process(
            Request::Deposit(DepositRequest {
                user: seed_user.clone(),
                asset: AssetId(asset.to_string()),
                amount: 100_000_000_000_000,
                l1_tx_hash: make_hash(1, i as u8),
            }),
            0,
        );
    }

    let markets: &[(&str, u64, u64)] = &[
        ("BTC-USDC", 94_000 * 100_000_000, 100_000),
        ("ETH-USDC", 3_200 * 100_000_000, 500_000),
        ("SOL-USDC", 145 * 100_000_000, 10_000_000),
        ("AVAX-USDC", 35 * 100_000_000, 5_000_000),
        ("MATIC-USDC", 850_000, 1_000_000_000),
        ("LINK-USDC", 14 * 100_000_000, 50_000_000),
        ("UNI-USDC", 9 * 100_000_000, 50_000_000),
        ("ARB-USDC", 1_100_000, 500_000_000),
        ("OP-USDC", 2_400_000, 200_000_000),
        ("AAVE-USDC", 280 * 100_000_000, 1_000_000),
        ("DOGE-USDC", 180_000, 10_000_000_000),
    ];

    let mut nonce: u64 = 1000;

    for &(market_name, mid, base_size) in markets {
        let half_spread = mid * 5 / 10_000;
        let best_bid = mid - half_spread;
        let best_ask = mid + half_spread;

        let mut bid_price = best_bid;
        for i in 0u64..20 {
            let quantity = ((i % 5) + 3) * base_size;
            engine.process(
                Request::PostOrder(PostOrderRequest {
                    user: seed_user.clone(),
                    market: MarketId(market_name.to_string()),
                    side: OrderSide::Bid,
                    order_type: OrderType::GoodTillCanceled,
                    price: bid_price,
                    quantity,
                    nonce,
                    client_order_id: None,
                    signature: vec![],
                }),
                0,
            );
            nonce += 1;
            bid_price = bid_price * 9_995 / 10_000;
        }

        let mut ask_price = best_ask;
        for i in 0u64..20 {
            let quantity = ((i % 5) + 3) * base_size;
            engine.process(
                Request::PostOrder(PostOrderRequest {
                    user: seed_user.clone(),
                    market: MarketId(market_name.to_string()),
                    side: OrderSide::Ask,
                    order_type: OrderType::GoodTillCanceled,
                    price: ask_price,
                    quantity,
                    nonce,
                    client_order_id: None,
                    signature: vec![],
                }),
                0,
            );
            nonce += 1;
            ask_price = ask_price * 10_005 / 10_000;
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3001);

    let mut engine = MatchingEngine::new(FeeConfig::default(), 5.0);

    match api::snapshot::load_snapshot().await {
        Ok(Some(snapshot)) => {
            match api::snapshot::restore_engine_from_snapshot(&mut engine, snapshot) {
                Ok(()) => println!("Restored from snapshot"),
                Err(e) => {
                    eprintln!("Snapshot restore failed: {e} — starting fresh");
                    engine = MatchingEngine::new(FeeConfig::default(), 5.0);
                    seed_markets(&mut engine);
                    seed_order_books(&mut engine);
                }
            }
        }
        Ok(None) => {
            seed_markets(&mut engine);
            seed_order_books(&mut engine);
            println!("Fresh start — seeded markets");
        }
        Err(e) => {
            eprintln!("Snapshot load failed: {e} — starting fresh");
            seed_markets(&mut engine);
            seed_order_books(&mut engine);
        }
    }

    let state = api::AppState::new(engine);

    let engine_arc = Arc::clone(&state.engine);
    tokio::spawn(async move {
        api::mm::run_mm_bot(engine_arc).await;
    });

    let snapshot_engine = Arc::clone(&state.engine);
    tokio::spawn(async move {
        api::snapshot::run_snapshot_task(snapshot_engine).await;
    });
    // Note: engine_order_task (P2-01 batch pipeline) is spawned inside AppState::new

    let router = api::build_router(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("listening on {addr}");
    axum::serve(listener, router).await.unwrap();
}
