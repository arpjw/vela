use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use engine::MatchingEngine;
use types::{
    AssetId, CancelOrderRequest, DepositRequest, FeeConfig, Market, MarketId,
    OrderSide, OrderType, PostOrderRequest, Request, UserId, PRICE_SCALE, QUANTITY_SCALE,
};

fn make_engine() -> MatchingEngine {
    let mut engine = MatchingEngine::new(FeeConfig::default(), 5.0);
    for i in 0..10u8 {
        let base = format!("ASSET{}", i);
        let market = Market {
            id: MarketId::new(&base, "USDC"),
            base: AssetId(base.clone()),
            quote: AssetId("USDC".into()),
            max_orders: 10_000,
            min_order_size: QUANTITY_SCALE / 100,
            price_tick: 1,
            quantity_tick: 1,
        };
        engine.add_market(market);
    }
    engine
}

fn make_user(i: u8) -> UserId {
    let mut addr = [0u8; 20];
    addr[19] = i;
    UserId(addr)
}

fn bench_post_order(c: &mut Criterion) {
    let mut engine = make_engine();
    let user = make_user(1);
    let market = MarketId::new("ASSET0", "USDC");

    engine.process(
        Request::Deposit(DepositRequest {
            user: user.clone(),
            asset: AssetId("USDC".into()),
            amount: 1_000_000 * PRICE_SCALE,
            l1_tx_hash: [0u8; 32],
        }),
        0,
    );

    let mut nonce = 1u64;

    c.bench_function("post_order_limit", |b| {
        b.iter(|| {
            let req = PostOrderRequest {
                user: user.clone(),
                market: market.clone(),
                side: OrderSide::Bid,
                order_type: OrderType::GoodTillCanceled,
                price: 50_000 * PRICE_SCALE,
                quantity: QUANTITY_SCALE,
                nonce,
                client_order_id: None,
                signature: vec![0u8; 65],
            };
            nonce += 1;
            black_box(engine.process(Request::PostOrder(req), nonce))
        })
    });
}

fn bench_cancel_order(c: &mut Criterion) {
    let mut engine = make_engine();
    let user = make_user(2);
    let market = MarketId::new("ASSET0", "USDC");

    engine.process(
        Request::Deposit(DepositRequest {
            user: user.clone(),
            asset: AssetId("USDC".into()),
            amount: 1_000_000 * PRICE_SCALE,
            l1_tx_hash: [0u8; 32],
        }),
        0,
    );

    let mut nonce = 1u64;
    let mut order_id = 1u64;

    c.bench_function("cancel_order", |b| {
        b.iter(|| {
            let post = PostOrderRequest {
                user: user.clone(),
                market: market.clone(),
                side: OrderSide::Bid,
                order_type: OrderType::GoodTillCanceled,
                price: 49_000 * PRICE_SCALE,
                quantity: QUANTITY_SCALE,
                nonce,
                client_order_id: None,
                signature: vec![0u8; 65],
            };
            nonce += 1;
            engine.process(Request::PostOrder(post), nonce);

            let cancel = CancelOrderRequest {
                user: user.clone(),
                order_id: Some(order_id),
                client_order_id: None,
                nonce,
                signature: vec![0u8; 65],
            };
            nonce += 1;
            order_id += 1;
            black_box(engine.process(Request::CancelOrder(cancel), nonce))
        })
    });
}

criterion_group!(benches, bench_post_order, bench_cancel_order);
criterion_main!(benches);
