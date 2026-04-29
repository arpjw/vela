use std::sync::Arc;
use engine::MatchingEngine;
use types::{
    AssetId, DepositRequest, FeeConfig, Market, MarketId, OrderSide, OrderType, PostOrderRequest,
    Request, UserId,
};
use api::types::Incident;

fn seed_markets(engine: &mut MatchingEngine) {
    for ticker in &[
        "ETH", "BTC", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE", "DOGE",
        "PEPE", "WIF", "JUP", "PENDLE", "EIGEN",
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
        "ETH", "BTC", "SOL", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI", "AAVE", "DOGE",
        "PEPE", "WIF", "JUP", "PENDLE", "EIGEN", "USDC",
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
        "PEPE", "WIF", "JUP", "PENDLE", "EIGEN",
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
        ("PEPE-USDC", 8, 50_000_000_000_000),
        ("WIF-USDC", 1_200_000, 500_000_000),
        ("JUP-USDC", 500_000, 1_000_000_000),
        ("PENDLE-USDC", 3_500_000, 100_000_000),
        ("EIGEN-USDC", 2_000_000, 200_000_000),
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

    let mut loaded_incidents: Vec<Incident> = Vec::new();
    let mut loaded_decisions: Vec<api::types::Decision> = Vec::new();
    let mut loaded_mms: Vec<api::types::RegisteredMM> = Vec::new();
    let mut loaded_proofs: std::collections::HashMap<u64, zkvm::BatchProof> = std::collections::HashMap::new();
    let mut need_restart_incident = false;

    match api::snapshot::load_snapshot().await {
        Ok(Some(snapshot)) => {
            if !snapshot.clean_shutdown {
                need_restart_incident = true;
            }
            loaded_incidents = snapshot.incidents.clone();
            loaded_decisions = snapshot.decisions.clone();
            loaded_mms = snapshot.registered_mms.clone();
            loaded_proofs = api::snapshot::extract_proofs_from_snapshot(&snapshot);
            match api::snapshot::restore_engine_from_snapshot(&mut engine, snapshot) {
                Ok(()) => println!("Restored from snapshot"),
                Err(e) => {
                    eprintln!("Snapshot restore failed: {e} — starting fresh");
                    engine = MatchingEngine::new(FeeConfig::default(), 5.0);
                    seed_markets(&mut engine);
                    seed_order_books(&mut engine);
                    loaded_incidents.clear();
                    loaded_decisions.clear();
                    loaded_mms.clear();
                    loaded_proofs.clear();
                    need_restart_incident = false;
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

    {
        *state.incidents.lock().await = loaded_incidents;
        *state.decisions.lock().await = loaded_decisions;
        *state.registered_mms.lock().await = loaded_mms;
        *state.proofs.lock().await = loaded_proofs;
    }

    if need_restart_incident {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut incidents = state.incidents.lock().await;
        let next_id = incidents.iter().map(|i| i.id).max().unwrap_or(0) + 1;
        incidents.push(Incident {
            id: next_id,
            incident_type: "RESTART".to_string(),
            started_at: now_ms.saturating_sub(1000),
            resolved_at: Some(now_ms),
            description: "Engine restarted. State restored from snapshot.".to_string(),
            impact: "Brief interruption. All state preserved.".to_string(),
        });
    }

    if let Some((anchors, count)) = api::anchor::load_anchors().await {
        let last = anchors.last().map(|a| (a.tx_hash.clone(), a.timestamp));
        *state.anchors.lock().await = anchors;
        state.anchor_count.store(count, std::sync::atomic::Ordering::Relaxed);
        if let Some((tx, ts)) = last {
            *state.last_anchor_tx.lock().await = Some(tx);
            state.last_anchor_time.store(ts, std::sync::atomic::Ordering::Relaxed);
        }
    }

    let alchemy_url = std::env::var("ALCHEMY_API_URL")
        .unwrap_or_else(|_| "https://eth-sepolia.g.alchemy.com/v2/demo".to_string());
    let operator_key = std::env::var("OPERATOR_PRIVATE_KEY").unwrap_or_default();

    if !operator_key.is_empty() {
        let anchor_state = Arc::clone(&state);
        tokio::spawn(async move {
            api::anchor::anchor_task(anchor_state, alchemy_url, operator_key).await;
        });
    } else {
        tracing::warn!("OPERATOR_PRIVATE_KEY not set — anchor task disabled");
    }

    let engine_arc = Arc::clone(&state.engine);
    tokio::spawn(async move {
        api::mm::run_mm_bot(engine_arc).await;
    });

    let snapshot_state = Arc::clone(&state);
    tokio::spawn(async move {
        api::snapshot::run_snapshot_task(snapshot_state).await;
    });
    // Note: engine_order_task (P2-01 batch pipeline) is spawned inside AppState::new

    let router = api::build_router(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("listening on {addr}");
    axum::serve(listener, router).await.unwrap();
}
