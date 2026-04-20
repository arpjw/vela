use engine::{CreditSystem, MatchingEngine};
use types::{
    AssetId, CancelOrderRequest, DepositRequest, ErrorCode, FeeConfig, Market,
    MarketId, NonceWindow, OrderSide, OrderStatus, OrderType, PostOrderRequest, Request,
    Response, UserMetadata, UserId, PRICE_SCALE, QUANTITY_SCALE,
};

fn btc_usdc() -> MarketId { MarketId::new("BTC", "USDC") }
fn usdc() -> AssetId { AssetId("USDC".into()) }
fn btc() -> AssetId { AssetId("BTC".into()) }
fn user(i: u8) -> UserId { let mut a = [0u8; 20]; a[19] = i; UserId(a) }

fn default_market() -> Market {
    Market {
        id: btc_usdc(),
        base: btc(),
        quote: usdc(),
        max_orders: 10_000,
        min_order_size: 1,
        price_tick: 1,
        quantity_tick: 1,
    }
}

fn engine() -> MatchingEngine {
    let mut e = MatchingEngine::new(FeeConfig::default(), 5.0);
    e.add_market(default_market());
    e
}

fn deposit(user: UserId, asset: AssetId, amount: u64) -> Request {
    Request::Deposit(DepositRequest { user, asset, amount, l1_tx_hash: [0u8; 32] })
}

fn post_bid(user: UserId, price: u64, qty: u64, nonce: u64) -> Request {
    Request::PostOrder(PostOrderRequest {
        user,
        market: btc_usdc(),
        side: OrderSide::Bid,
        order_type: OrderType::GoodTillCanceled,
        price: price * PRICE_SCALE,
        quantity: qty * QUANTITY_SCALE,
        nonce,
        client_order_id: None,
        signature: vec![0u8; 65],
    })
}

fn post_ask(user: UserId, price: u64, qty: u64, nonce: u64) -> Request {
    Request::PostOrder(PostOrderRequest {
        user,
        market: btc_usdc(),
        side: OrderSide::Ask,
        order_type: OrderType::GoodTillCanceled,
        price: price * PRICE_SCALE,
        quantity: qty * QUANTITY_SCALE,
        nonce,
        client_order_id: None,
        signature: vec![0u8; 65],
    })
}

fn post_ioc_bid(user: UserId, price: u64, qty: u64, nonce: u64) -> Request {
    Request::PostOrder(PostOrderRequest {
        user,
        market: btc_usdc(),
        side: OrderSide::Bid,
        order_type: OrderType::ImmediateOrCancel,
        price: price * PRICE_SCALE,
        quantity: qty * QUANTITY_SCALE,
        nonce,
        client_order_id: None,
        signature: vec![0u8; 65],
    })
}

fn post_fok_bid(user: UserId, price: u64, qty: u64, nonce: u64) -> Request {
    Request::PostOrder(PostOrderRequest {
        user,
        market: btc_usdc(),
        side: OrderSide::Bid,
        order_type: OrderType::FillOrKill,
        price: price * PRICE_SCALE,
        quantity: qty * QUANTITY_SCALE,
        nonce,
        client_order_id: None,
        signature: vec![0u8; 65],
    })
}

#[test]
fn test_deposit() {
    let mut e = engine();
    let u = user(1);
    let responses = e.process(deposit(u.clone(), usdc(), 1000 * PRICE_SCALE), 1);
    assert!(matches!(responses[0], Response::BalanceUpdated(_)));
    let bal = e.balances.get(&(u, usdc())).unwrap();
    assert_eq!(bal.available, 1000 * PRICE_SCALE);
}

#[test]
fn test_resting_bid_no_match() {
    let mut e = engine();
    let maker = user(1);
    e.process(deposit(maker.clone(), usdc(), 50_100 * PRICE_SCALE), 1);
    let responses = e.process(post_bid(maker.clone(), 50_000, 1, 1), 2);
    let posted = responses.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(posted.status, OrderStatus::Open);
    let bal = e.balances.get(&(maker, usdc())).unwrap();
    assert_eq!(bal.locked, 50_000 * PRICE_SCALE);
}

#[test]
fn test_full_match_bid_against_ask() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 50_100 * PRICE_SCALE), 2);

    let ask_responses = e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);
    let posted = ask_responses.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(posted.status, OrderStatus::Open);
    assert!(e.order_books.get(&btc_usdc()).unwrap().best_ask().is_some());

    let bid_responses = e.process(post_bid(taker.clone(), 50_000, 1, 1), 4);
    let fill = bid_responses.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None }).unwrap();
    assert_eq!(fill.quantity, QUANTITY_SCALE);
    assert_eq!(fill.price, 50_000 * PRICE_SCALE);
    assert_eq!(fill.maker, maker);
    assert_eq!(fill.taker, taker);

    assert!(e.order_books.get(&btc_usdc()).unwrap().best_ask().is_none());

    let taker_btc = e.balances.get(&(taker.clone(), btc())).unwrap();
    assert_eq!(taker_btc.available, QUANTITY_SCALE);

    let maker_usdc = e.balances.get(&(maker.clone(), usdc())).unwrap();
    assert!(maker_usdc.available > 0);
}

#[test]
fn test_partial_fill() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 2 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 100_000 * PRICE_SCALE), 2);

    e.process(post_ask(maker.clone(), 50_000, 2, 1), 3);
    let bid_responses = e.process(post_bid(taker.clone(), 50_000, 1, 1), 4);

    let fill = bid_responses.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None }).unwrap();
    assert_eq!(fill.quantity, QUANTITY_SCALE);

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_ask().is_some());
    let ask = book.depth_asks(1);
    assert_eq!(ask[0].1, QUANTITY_SCALE);
}

#[test]
fn test_ioc_no_fill_canceled() {
    let mut e = engine();
    let taker = user(1);
    e.process(deposit(taker.clone(), usdc(), 100_000 * PRICE_SCALE), 1);
    let responses = e.process(post_ioc_bid(taker.clone(), 50_000, 1, 1), 2);
    let posted = responses.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(posted.status, OrderStatus::Canceled);
    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_bid().is_none());
}

#[test]
fn test_fok_not_fully_fillable_rejected() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 100_000 * PRICE_SCALE), 2);
    e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);

    let responses = e.process(post_fok_bid(taker.clone(), 50_000, 2, 1), 4);
    let err = responses.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::FokNotFilled);

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_ask().is_some());
}

#[test]
fn test_cancel_resting_order() {
    let mut e = engine();
    let maker = user(1);
    e.process(deposit(maker.clone(), usdc(), 50_100 * PRICE_SCALE), 1);
    let responses = e.process(post_bid(maker.clone(), 50_000, 1, 1), 2);
    let order_id = responses.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p.order_id) } else { None }).unwrap();

    let cancel = Request::CancelOrder(CancelOrderRequest {
        user: maker.clone(),
        order_id: Some(order_id),
        client_order_id: None,
        nonce: 2,
        signature: vec![0u8; 65],
    });
    let cancel_responses = e.process(cancel, 3);
    assert!(matches!(cancel_responses[0], Response::OrderCanceled(_)));

    let bal = e.balances.get(&(maker, usdc())).unwrap();
    assert_eq!(bal.locked, 0);
    assert_eq!(bal.available, 50_100 * PRICE_SCALE);
}

#[test]
fn test_invalid_nonce_replay() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 100_000 * PRICE_SCALE), 1);
    e.process(post_bid(u.clone(), 50_000, 1, 5), 2);
    let responses = e.process(post_bid(u.clone(), 50_000, 1, 5), 3);
    let err = responses.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InvalidNonce);
}

#[test]
fn test_no_self_match() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 100_000 * PRICE_SCALE), 1);
    e.process(deposit(u.clone(), btc(), 1 * QUANTITY_SCALE), 2);
    e.process(post_ask(u.clone(), 50_000, 1, 1), 3);
    let responses = e.process(post_bid(u.clone(), 50_000, 1, 2), 4);
    let fill = responses.iter().find(|r| matches!(r, Response::OrderFilled(_)));
    assert!(fill.is_none(), "self-match should not produce a fill");
}

#[test]
fn test_price_time_priority() {
    let mut e = engine();
    let maker1 = user(1);
    let maker2 = user(2);
    let taker = user(3);

    e.process(deposit(maker1.clone(), btc(), 2 * QUANTITY_SCALE), 1);
    e.process(deposit(maker2.clone(), btc(), 2 * QUANTITY_SCALE), 2);
    e.process(deposit(taker.clone(), usdc(), 200_000 * PRICE_SCALE), 3);

    e.process(post_ask(maker1.clone(), 49_000, 1, 1), 4);
    e.process(post_ask(maker2.clone(), 50_000, 1, 1), 5);

    let responses = e.process(post_bid(taker.clone(), 50_000, 1, 1), 6);
    let fill = responses.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None }).unwrap();

    assert_eq!(fill.maker, maker1, "lower ask price should fill first");
    assert_eq!(fill.price, 49_000 * PRICE_SCALE);
}

#[test]
fn test_insufficient_balance_rejected() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 100 * PRICE_SCALE), 1);
    let responses = e.process(post_bid(u.clone(), 50_000, 1, 1), 2);
    let err = responses.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InsufficientBalance);
}

#[test]
fn test_multi_level_fill() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 3 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 200_000 * PRICE_SCALE), 2);

    e.process(post_ask(maker.clone(), 49_000, 1, 1), 3);
    e.process(post_ask(maker.clone(), 50_000, 1, 2), 4);

    let responses = e.process(post_bid(taker.clone(), 50_000, 2, 1), 5);
    let fills: Vec<_> = responses.iter().filter_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None }).collect();
    assert_eq!(fills.len(), 2);
    assert_eq!(fills[0].price, 49_000 * PRICE_SCALE);
    assert_eq!(fills[1].price, 50_000 * PRICE_SCALE);

    let taker_btc = e.balances.get(&(taker, btc())).unwrap();
    assert_eq!(taker_btc.available, 2 * QUANTITY_SCALE);
}

// ─── VEL-14: Credit system tests ──────────────────────────────────────────────

fn credit_engine(default_ratio: f64) -> MatchingEngine {
    let mut e = MatchingEngine::new(FeeConfig::default(), default_ratio);
    e.add_market(default_market());
    e
}

/// A maker with ratio 3.0 and 100 USDC can cumulatively quote up to 300 USDC notional,
/// even when individual orders exhaust available balance (credit fills the gap).
/// Note: per-order floor still applies — each order's notional must fit within total deposited.
#[test]
fn test_credit_allows_quoting_beyond_available() {
    let mut e = credit_engine(3.0);
    let maker = user(1);
    // Deposit 100 USDC
    e.process(deposit(maker.clone(), usdc(), 100 * PRICE_SCALE), 1);

    // First bid: 1 BTC @ 60 USDC → notional 60. available=100≥60, no credit needed.
    // Locks 60. available=40, locked=60.
    let r1 = e.process(post_bid(maker.clone(), 60, 1, 1), 2);
    let p1 = r1.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(p1.status, OrderStatus::Open, "first bid should rest");

    // Second bid: 1 BTC @ 60 USDC → notional 60. available=40 < 60 → CREDIT used.
    // total_quoted would be 60+60=120 ≤ 100*3=300. Credit allows it.
    let r2 = e.process(post_bid(maker.clone(), 60, 1, 2), 3);
    let p2 = r2.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(p2.status, OrderStatus::Open, "second bid using credit should rest");

    // Third bid: 1 BTC @ 60 USDC → notional 60. available=0 < 60 → CREDIT used.
    // total_quoted=180 ≤ 300. Still within credit limit.
    let r3 = e.process(post_bid(maker.clone(), 60, 1, 3), 4);
    let p3 = r3.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(p3.status, OrderStatus::Open, "third bid using credit should rest");

    let meta = e.metadata.get(&maker).unwrap();
    assert_eq!(meta.open_order_ids.len(), 3);
    let expected_notional = CreditSystem::compute_notional(60 * PRICE_SCALE, QUANTITY_SCALE) * 3;
    assert_eq!(meta.total_quoted_notional, expected_notional,
        "total_quoted_notional should track all three bids");
    // Maker quoted 3×60=180 USDC with only 100 deposited — credit enabled the extra 80.
    assert!(180 * PRICE_SCALE <= 100 * PRICE_SCALE * 3, "sanity: 180 ≤ 300 (ratio 3.0)");
}

/// A single order whose notional exceeds the maker's total deposited is rejected
/// even with a high credit ratio — the 1:1 per-order floor still applies.
#[test]
fn test_single_order_bounded_by_deposited() {
    let mut e = credit_engine(10.0);
    let maker = user(1);
    e.process(deposit(maker.clone(), usdc(), 100 * PRICE_SCALE), 1);

    // Try to post a bid for 1 BTC @ 200 USDC — notional 200 > deposited 100
    let responses = e.process(post_bid(maker.clone(), 200, 1, 1), 2);
    let err = responses.iter()
        .find_map(|r| if let Response::Error(e) = r { Some(e) } else { None })
        .unwrap();
    assert_eq!(err.code, ErrorCode::InsufficientBalance,
        "order notional > total deposited must be rejected regardless of credit ratio");
}

/// After a fill reduces the maker's actual collateral, if total_quoted_notional exceeds
/// actual_collateral * ratio the engine must atomically cancel the maker's open orders.
///
/// Setup: ratio=1.5, maker deposits 100 USDC → max_quoted = 150.
///   Bid X: 1 BTC @ 70 USDC → notional 70. available=100≥70, rests. available=30.
///   Bid Y: 1 BTC @ 70 USDC → notional 70. available=30<70 → credit (70+70=140≤150). Rests.
///   actual_collateral = 100 USDC.
///
/// Taker IOC ask at 70, qty=1 → fills X (time priority).
///   actual_collateral = 100 - 70 = 30. total_quoted = 70. max = 30*1.5 = 45. 70 > 45 → BREACH.
///   Engine auto-cancels Y to restore ratio.
#[test]
fn test_fill_triggers_auto_cancel_when_ratio_breached() {
    let mut e = credit_engine(1.5);
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), usdc(), 100 * PRICE_SCALE), 1);
    e.process(deposit(taker.clone(), btc(), 1 * QUANTITY_SCALE), 2);

    // Bid X at 70: within deposited (100), uses available. Rests.
    let r_x = e.process(post_bid(maker.clone(), 70, 1, 1), 3);
    let oid_x = r_x.iter()
        .find_map(|r| if let Response::OrderPosted(p) = r { Some(p.order_id) } else { None })
        .unwrap();
    assert!(r_x.iter().any(|r| matches!(r, Response::OrderPosted(p) if p.status == OrderStatus::Open)));

    // Bid Y at 70: available=30 < 70 → credit used (140 ≤ 150). Rests.
    let r_y = e.process(post_bid(maker.clone(), 70, 1, 2), 4);
    let oid_y = r_y.iter()
        .find_map(|r| if let Response::OrderPosted(p) = r { Some(p.order_id) } else { None })
        .unwrap();
    assert!(r_y.iter().any(|r| matches!(r, Response::OrderPosted(p) if p.status == OrderStatus::Open)));

    {
        let meta = e.metadata.get(&maker).unwrap();
        assert_eq!(meta.open_order_ids.len(), 2);
        assert_eq!(meta.actual_collateral, 100 * PRICE_SCALE, "actual_collateral must equal deposit");
    }

    // Taker IOC ask @ 70, qty=1: hits best bid (70), fills X first (FIFO).
    let taker_resp = e.process(
        Request::PostOrder(PostOrderRequest {
            user: taker.clone(),
            market: btc_usdc(),
            side: OrderSide::Ask,
            order_type: OrderType::ImmediateOrCancel,
            price: 70 * PRICE_SCALE,
            quantity: 1 * QUANTITY_SCALE,
            nonce: 1,
            client_order_id: None,
            signature: vec![0u8; 65],
        }),
        5,
    );

    // Fill must have occurred (X filled)
    let fills: Vec<_> = taker_resp.iter()
        .filter(|r| matches!(r, Response::OrderFilled(_)))
        .collect();
    assert!(!fills.is_empty(), "taker ask should fill bid X");

    // Auto-cancel must have fired for Y (breach: 70 > 30*1.5=45)
    let canceled_ids: Vec<_> = taker_resp.iter()
        .filter_map(|r| if let Response::OrderCanceled(c) = r { Some(c.order_id) } else { None })
        .collect();
    assert!(!canceled_ids.is_empty(), "credit breach must trigger auto-cancel");
    assert!(canceled_ids.contains(&oid_y), "bid Y must be auto-canceled to restore ratio");
    assert!(!canceled_ids.contains(&oid_x), "bid X was filled, not auto-canceled");

    // Book should be empty: X filled, Y auto-canceled.
    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_bid().is_none(), "all maker bids should be gone");

    // Maker received 1 BTC from filling X.
    let maker_btc = e.balances.get(&(maker.clone(), btc())).map(|b| b.total()).unwrap_or(0);
    assert_eq!(maker_btc, 1 * QUANTITY_SCALE, "maker should have received 1 BTC");

    // actual_collateral should have dropped by fill_notional.
    let meta = e.metadata.get(&maker).unwrap();
    assert_eq!(meta.actual_collateral, 30 * PRICE_SCALE,
        "actual_collateral = 100 - 70 (fill) = 30 USDC");
}

/// 1:1 asset backing: after fills, the total of each asset across all users
/// must not exceed the total deposited (exchange never creates value from nothing).
/// Uses non-credit orders to avoid ghost balance effects (credit is tested separately).
#[test]
fn test_asset_backing_invariant_holds() {
    let mut e = credit_engine(2.0);
    let maker = user(1);
    let taker = user(2);

    // Maker deposits 100 USDC. Taker deposits 1 BTC.
    e.process(deposit(maker.clone(), usdc(), 100 * PRICE_SCALE), 1);
    e.process(deposit(taker.clone(), btc(), 1 * QUANTITY_SCALE), 2);

    // Maker places a single non-credit bid: 1 BTC @ 50 USDC.
    // Notional = 50 ≤ deposited = 100. available=100≥50. No credit.
    e.process(post_bid(maker.clone(), 50, 1, 1), 3);

    // Also place a second resting bid that won't be filled (for locked USDC coverage).
    e.process(post_bid(maker.clone(), 40, 1, 2), 4);

    // Taker sells 1 BTC at 50 → fills maker's 50 bid.
    e.process(
        Request::PostOrder(PostOrderRequest {
            user: taker.clone(),
            market: btc_usdc(),
            side: OrderSide::Ask,
            order_type: OrderType::ImmediateOrCancel,
            price: 50 * PRICE_SCALE,
            quantity: 1 * QUANTITY_SCALE,
            nonce: 1,
            client_order_id: None,
            signature: vec![0u8; 65],
        }),
        5,
    );

    let maker_usdc = e.balances.get(&(maker.clone(), usdc())).map(|b| b.total()).unwrap_or(0);
    let maker_btc  = e.balances.get(&(maker.clone(), btc())).map(|b| b.total()).unwrap_or(0);
    let taker_usdc = e.balances.get(&(taker.clone(), usdc())).map(|b| b.total()).unwrap_or(0);

    // Taker received USDC from fill.
    assert!(taker_usdc > 0, "taker should have received USDC from fill");

    // Maker received 1 BTC and still holds USDC for remaining resting bid (40 locked).
    assert_eq!(maker_btc, 1 * QUANTITY_SCALE, "maker received 1 BTC");
    assert!(maker_usdc > 0, "maker should have remaining USDC for resting bid");

    // 1:1 USDC backing invariant: total USDC in system ≤ 100 USDC deposited by maker.
    // USDC flows from maker's locked balance to taker; fees are net-consumed by exchange.
    // (taker pays 7bps, maker gets 2bps rebate → exchange earns 5bps net → USDC decreases)
    assert!(
        maker_usdc + taker_usdc <= 100 * PRICE_SCALE,
        "total USDC must not exceed deposit: {} + {} = {} > {}",
        maker_usdc, taker_usdc, maker_usdc + taker_usdc, 100 * PRICE_SCALE
    );
}

/// set_credit_ratio persists and is reflected in subsequent check_credit calls.
#[test]
fn test_set_ratio_per_user() {
    let mut e = credit_engine(1.0); // default: no credit
    let maker = user(1);

    e.process(deposit(maker.clone(), usdc(), 100 * PRICE_SCALE), 1);

    // With ratio 1.0 (default) trying to over-quote should fail
    // (order notional = 50, available = 100 — this is within available, so it rests)
    e.process(post_bid(maker.clone(), 50, 1, 1), 2); // locks 50, available = 50
    let fail = e.process(post_bid(maker.clone(), 80, 1, 2), 3); // notional 80 > available 50, credit limit 100
    // 50 + 80 = 130 > 100 * 1.0 → CreditLimitExceeded
    let err = fail.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::CreditLimitExceeded);

    // Upgrade maker's ratio to 2.0 → max = 200
    e.set_credit_ratio(maker.clone(), 2.0);

    // Now the same order should succeed (50 + 80 = 130 ≤ 200)
    let ok = e.process(post_bid(maker.clone(), 80, 1, 3), 4);
    let posted = ok.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(posted.status, OrderStatus::Open);
}

// ─── VEL-P2-04: CoW delta buffer correctness tests ────────────────────────────

#[test]
fn test_cow_fok_full_fill_commits() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 100_000 * PRICE_SCALE), 2);
    e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);

    let responses = e.process(post_fok_bid(taker.clone(), 50_000, 1, 1), 4);
    let fill = responses.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None });
    assert!(fill.is_some(), "FOK should produce a fill when fully fillable");

    let taker_btc = e.balances.get(&(taker, btc())).unwrap();
    assert_eq!(taker_btc.available, QUANTITY_SCALE, "taker should have received BTC");

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_ask().is_none(), "maker ask consumed by FOK fill");
}

#[test]
fn test_cow_fok_partial_fail_no_state_change() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 200_000 * PRICE_SCALE), 2);
    e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);

    let taker_usdc_before = e.balances.get(&(taker.clone(), usdc())).unwrap().available;

    let responses = e.process(post_fok_bid(taker.clone(), 50_000, 2, 1), 4);
    let err = responses.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::FokNotFilled);

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_ask().is_some(), "maker ask must still exist after FOK rollback");

    let taker_usdc_after = e.balances.get(&(taker.clone(), usdc())).unwrap().available;
    assert_eq!(taker_usdc_before, taker_usdc_after, "taker balance unchanged after FOK failure");

    let taker_btc = e.balances.get(&(taker, btc())).map(|b| b.available).unwrap_or(0);
    assert_eq!(taker_btc, 0, "taker receives no BTC after failed FOK");
}

#[test]
fn test_cow_ioc_partial_fill_commits_filled_portion() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 200_000 * PRICE_SCALE), 2);
    e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);

    let responses = e.process(post_ioc_bid(taker.clone(), 50_000, 2, 1), 4);
    let fill = responses.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None }).unwrap();
    assert_eq!(fill.quantity, QUANTITY_SCALE, "only available 1 BTC should be filled");

    let taker_btc = e.balances.get(&(taker, btc())).unwrap().available;
    assert_eq!(taker_btc, QUANTITY_SCALE, "taker receives exactly the filled quantity");

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_ask().is_none(), "maker ask fully consumed");
    assert!(book.best_bid().is_none(), "IOC remainder does not rest on book");
}

#[test]
fn test_cow_ioc_no_fill_leaves_state_clean() {
    let mut e = engine();
    let taker = user(1);
    e.process(deposit(taker.clone(), usdc(), 100_000 * PRICE_SCALE), 1);

    let available_before = e.balances.get(&(taker.clone(), usdc())).unwrap().available;

    let responses = e.process(post_ioc_bid(taker.clone(), 50_000, 1, 1), 2);
    let posted = responses.iter().find_map(|r| if let Response::OrderPosted(p) = r { Some(p) } else { None }).unwrap();
    assert_eq!(posted.status, OrderStatus::Canceled);

    let available_after = e.balances.get(&(taker.clone(), usdc())).unwrap().available;
    assert_eq!(available_before, available_after, "no balance change when IOC finds nothing");

    let book = e.order_books.get(&btc_usdc()).unwrap();
    assert!(book.best_bid().is_none(), "IOC must not rest on book");
}

#[test]
fn test_cow_validation_failure_leaves_state_clean() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 100 * PRICE_SCALE), 1);

    e.process(post_bid(u.clone(), 50, 1, 1), 2);
    let locked_after_first = e.balances.get(&(u.clone(), usdc())).unwrap().locked;

    let responses = e.process(post_bid(u.clone(), 50_000, 1, 2), 3);
    let err = responses.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InsufficientBalance);

    let locked_after_fail = e.balances.get(&(u.clone(), usdc())).unwrap().locked;
    assert_eq!(locked_after_first, locked_after_fail, "failed order must not mutate locked balance");
}

#[test]
fn test_cow_failed_order_does_not_corrupt_subsequent_order() {
    let mut e = engine();
    let maker = user(1);
    let taker = user(2);

    e.process(deposit(maker.clone(), btc(), 1 * QUANTITY_SCALE), 1);
    e.process(deposit(taker.clone(), usdc(), 200_000 * PRICE_SCALE), 2);
    e.process(post_ask(maker.clone(), 50_000, 1, 1), 3);

    let fail_resp = e.process(post_fok_bid(taker.clone(), 50_000, 2, 1), 4);
    assert!(fail_resp.iter().any(|r| matches!(r, Response::Error(_))), "first FOK should fail");

    let ok_resp = e.process(post_bid(taker.clone(), 50_000, 1, 2), 5);
    let fill = ok_resp.iter().find_map(|r| if let Response::OrderFilled(f) = r { Some(f) } else { None });
    assert!(fill.is_some(), "subsequent GTC bid should still fill against maker");

    let taker_btc = e.balances.get(&(taker, btc())).unwrap().available;
    assert_eq!(taker_btc, QUANTITY_SCALE, "taker receives BTC from the successful GTC fill");
}

// ─── VEL-P2-02: Rolling 20-window nonce tests ─────────────────────────────────

/// 20 concurrent bids with non-sequential nonces all accepted — no strict ordering required.
#[test]
fn test_nonce_window_20_concurrent_non_sequential() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 10_000_000 * PRICE_SCALE), 1);

    let nonces: [u64; 20] = [100, 5, 999, 3, 42, 77, 200, 1, 50, 88,
                              300, 6, 400, 17, 501, 23, 600, 11, 700, 99];
    for &n in &nonces {
        let resp = e.process(post_bid(u.clone(), 1, 1, n), 2);
        assert!(
            resp.iter().any(|r| matches!(r, Response::OrderPosted(_))),
            "nonce {} should be accepted",
            n
        );
    }
    let meta = e.metadata.get(&u).unwrap();
    assert_eq!(meta.open_order_ids.len(), 20, "all 20 orders must be resting");
}

/// 21st order with nonce at or below the window minimum is rejected.
#[test]
fn test_nonce_window_21st_below_minimum_rejected() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 10_000_000 * PRICE_SCALE), 1);

    for n in 1u64..=20 {
        e.process(post_bid(u.clone(), 1, 1, n), 2);
    }
    // min=1, window full — nonce == min is rejected
    let resp = e.process(post_bid(u.clone(), 1, 1, 1), 3);
    let err = resp.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InvalidNonce, "nonce equal to min must be rejected");

    // nonce 0 is below min — also rejected
    let resp2 = e.process(post_bid(u.clone(), 1, 1, 0), 3);
    let err2 = resp2.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err2.code, ErrorCode::InvalidNonce, "nonce below min must be rejected");
}

/// Duplicate nonce is rejected even when the window is full (replay protection).
#[test]
fn test_nonce_window_duplicate_rejected_when_full() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 10_000_000 * PRICE_SCALE), 1);

    for n in 1u64..=20 {
        e.process(post_bid(u.clone(), 1, 1, n), 2);
    }
    // nonce 15 is still in the window (> min=1) but already used
    let resp = e.process(post_bid(u.clone(), 1, 1, 15), 3);
    let err = resp.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InvalidNonce, "duplicate nonce must be rejected");

    // The rejected replay must not have evicted the minimum — window still has 20 entries
    let meta = e.metadata.get(&u).unwrap();
    assert_eq!(meta.open_order_ids.len(), 20, "window size must not shrink on replay attempt");
}

/// After the window slides forward, nonces that fell below the new minimum are permanently rejected.
#[test]
fn test_nonce_window_evicted_nonce_below_new_min_rejected() {
    let mut e = engine();
    let u = user(1);
    e.process(deposit(u.clone(), usdc(), 10_000_000 * PRICE_SCALE), 1);

    // Fill window with nonces 1..=20 (min=1)
    for n in 1u64..=20 {
        e.process(post_bid(u.clone(), 1, 1, n), 2);
    }
    // Submit nonce 21 — evicts min=1, window becomes {2..=21}, min=2
    let resp = e.process(post_bid(u.clone(), 1, 1, 21), 3);
    assert!(resp.iter().any(|r| matches!(r, Response::OrderPosted(_))), "nonce 21 must be accepted");

    // Nonce 1 is now below the new min=2 — must be rejected even though it's no longer in the set
    let resp2 = e.process(post_bid(u.clone(), 1, 1, 1), 3);
    let err = resp2.iter().find_map(|r| if let Response::Error(e) = r { Some(e) } else { None }).unwrap();
    assert_eq!(err.code, ErrorCode::InvalidNonce, "evicted nonce below new minimum must be rejected");
}

/// NonceWindow serializes and deserializes correctly — nonce state survives a snapshot/restore cycle.
#[test]
fn test_nonce_window_snapshot_restore() {
    let mut window = NonceWindow::new();
    for &n in &[1u64, 5, 10, 99, 200] {
        assert!(window.accept(n));
    }

    let meta = UserMetadata {
        user: user(1),
        nonce_window: window,
        open_order_ids: vec![],
        credit_ratio: 1.0,
        total_quoted_notional: 0,
        actual_collateral: 0,
    };

    let json = serde_json::to_string(&meta).unwrap();
    let restored: UserMetadata = serde_json::from_str(&json).unwrap();
    let mut w = restored.nonce_window;

    // Previously accepted nonces are still in the restored window — rejected
    assert!(!w.accept(1), "nonce 1 must be rejected after restore");
    assert!(!w.accept(5), "nonce 5 must be rejected after restore");
    assert!(!w.accept(200), "nonce 200 must be rejected after restore");
    // A fresh nonce above the window contents is accepted
    assert!(w.accept(300), "new nonce 300 must be accepted after restore");
}
