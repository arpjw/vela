use engine::MatchingEngine;
use types::{
    AssetId, CancelOrderRequest, DepositRequest, ErrorCode, FeeConfig, Market,
    MarketId, OrderSide, OrderStatus, OrderType, PostOrderRequest, Request,
    Response, UserId, PRICE_SCALE, QUANTITY_SCALE,
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
