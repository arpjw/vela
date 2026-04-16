use std::collections::{HashMap, HashSet};
use types::{
    AssetId, Balance, CancelOrderRequest, DepositRequest, ErrorCode, ErrorResponse, FeeConfig,
    Fill, Market, MarketId, Order, OrderCanceledResponse, OrderId, OrderPostedResponse, OrderSide,
    OrderStatus, OrderType, PostOrderRequest, Request, Response, Timestamp, UserId, UserMetadata,
    VelaError, WithdrawalRequest,
};
use crate::{CowCache, CreditSystem, OrderBook};

pub struct MatchingEngine {
    pub order_books: HashMap<MarketId, OrderBook>,
    pub balances: HashMap<(UserId, AssetId), Balance>,
    pub metadata: HashMap<UserId, UserMetadata>,
    pub markets: HashMap<MarketId, Market>,
    pub fee_config: FeeConfig,
    pub credit_system: CreditSystem,
    pub timestamp: Timestamp,
    next_order_id: OrderId,
}

impl MatchingEngine {
    pub fn new(fee_config: FeeConfig, default_credit_ratio: f64) -> Self {
        MatchingEngine {
            order_books: HashMap::new(),
            balances: HashMap::new(),
            metadata: HashMap::new(),
            markets: HashMap::new(),
            fee_config,
            credit_system: CreditSystem::new(default_credit_ratio),
            timestamp: 0,
            next_order_id: 1,
        }
    }

    pub fn set_credit_ratio(&mut self, user: UserId, ratio: f64) {
        self.credit_system.set_ratio(user, ratio);
    }

    pub fn add_market(&mut self, market: Market) {
        let book = OrderBook::new(market.id.clone(), market.max_orders);
        self.order_books.insert(market.id.clone(), book);
        self.markets.insert(market.id.clone(), market);
    }

    pub fn process(&mut self, request: Request, ts: Timestamp) -> Vec<Response> {
        self.timestamp = ts;
        match request {
            Request::PostOrder(req) => self.process_post_order(req),
            Request::CancelOrder(req) => self.process_cancel_order(req),
            Request::Deposit(req) => self.process_deposit(req),
            Request::Withdrawal(req) => self.process_withdrawal(req),
        }
    }

    fn alloc_order_id(&mut self) -> OrderId {
        let id = self.next_order_id;
        self.next_order_id += 1;
        id
    }

    fn get_balance(&self, user: &UserId, asset: &AssetId) -> Balance {
        self.balances
            .get(&(user.clone(), asset.clone()))
            .cloned()
            .unwrap_or_else(|| Balance { user: user.clone(), asset: asset.clone(), available: 0, locked: 0 })
    }

    fn get_metadata(&self, user: &UserId) -> UserMetadata {
        self.metadata.get(user).cloned().unwrap_or_else(|| UserMetadata {
            user: user.clone(),
            nonce_window: types::NonceWindow::new(),
            open_order_ids: vec![],
            credit_ratio: 1.0,
            total_quoted_notional: 0,
            actual_collateral: 0,
        })
    }

    fn process_post_order(&mut self, req: PostOrderRequest) -> Vec<Response> {
        let order_id = self.alloc_order_id();
        let mut cow = CowCache::new();
        match self.try_post_order(req, order_id, &mut cow) {
            Ok(responses) => {
                cow.commit(&mut self.balances, &mut self.metadata, &mut self.order_books);
                responses
            }
            Err(e) => {
                cow.rollback();
                vec![Response::Error(e.into())]
            }
        }
    }

    fn try_post_order(
        &self,
        req: PostOrderRequest,
        order_id: OrderId,
        cow: &mut CowCache,
    ) -> Result<Vec<Response>, VelaError> {
        let market = self
            .markets
            .get(&req.market)
            .ok_or_else(|| VelaError::MarketNotFound(req.market.to_string()))?;

        let book = self
            .order_books
            .get(&req.market)
            .ok_or_else(|| VelaError::MarketNotFound(req.market.to_string()))?;

        let mut meta = cow.get_metadata(&req.user, &self.metadata);
        if !meta.nonce_window.accept(req.nonce) {
            return Err(VelaError::InvalidNonce);
        }

        let (spend_asset, receive_asset) = match req.side {
            OrderSide::Bid => (market.quote.clone(), market.base.clone()),
            OrderSide::Ask => (market.base.clone(), market.quote.clone()),
        };

        let spend_balance = cow.get_balance(&req.user, &spend_asset, &self.balances);

        let order_notional = match req.side {
            OrderSide::Bid => CreditSystem::compute_notional(req.price, req.quantity),
            OrderSide::Ask => req.quantity,
        };

        let deposited = spend_balance.total();
        if order_notional > deposited {
            return Err(VelaError::InsufficientBalance);
        }
        if spend_balance.available < order_notional {
            self.credit_system.check_credit(
                &req.user,
                deposited,
                meta.total_quoted_notional,
                order_notional,
            )?;
        }

        if req.order_type == OrderType::PostOnly && book.would_match(req.side, req.price) {
            return Err(VelaError::PostOnlyWouldMatch);
        }

        let mut order = Order {
            id: order_id,
            user: req.user.clone(),
            market: req.market.clone(),
            side: req.side,
            order_type: req.order_type,
            price: req.price,
            quantity: req.quantity,
            filled_quantity: 0,
            nonce: req.nonce,
            client_order_id: req.client_order_id.clone(),
            timestamp: self.timestamp,
            status: OrderStatus::Open,
        };

        let (fills, auto_canceled) = self.match_order(&order, market, cow)?;

        let total_filled: u64 = fills.iter().map(|f| f.quantity).sum();
        order.filled_quantity = total_filled;

        if req.order_type == OrderType::FillOrKill && total_filled < req.quantity {
            return Err(VelaError::FokNotFilled);
        }

        let remaining = req.quantity.saturating_sub(total_filled);
        let will_rest = remaining > 0
            && matches!(req.order_type, OrderType::GoodTillCanceled | OrderType::PostOnly);

        if will_rest {
            if book.is_full() {
                return Err(VelaError::OrderBookFull);
            }
            let resting_spend = match req.side {
                OrderSide::Bid => CreditSystem::compute_notional(req.price, remaining),
                OrderSide::Ask => remaining,
            };
            cow.lock_available(&req.user, &spend_asset, resting_spend, &self.balances);
            order.status = if total_filled > 0 { OrderStatus::PartiallyFilled } else { OrderStatus::Open };
            meta.open_order_ids.push(order.id);
            meta.total_quoted_notional += CreditSystem::compute_notional(req.price, remaining);
            cow.set_metadata(meta);
            cow.record_insert(req.market.clone(), order.clone());
        } else {
            order.status = if total_filled >= req.quantity { OrderStatus::Filled } else { OrderStatus::Canceled };
            cow.set_metadata(meta);
        }

        let mut responses: Vec<Response> = fills.into_iter().map(Response::OrderFilled).collect();
        for canceled in auto_canceled {
            responses.push(Response::OrderCanceled(canceled));
        }
        responses.push(Response::OrderPosted(OrderPostedResponse {
            order_id: order.id,
            client_order_id: order.client_order_id,
            status: order.status,
        }));

        Ok(responses)
    }

    fn match_order(
        &self,
        order: &Order,
        market: &Market,
        cow: &mut CowCache,
    ) -> Result<(Vec<Fill>, Vec<OrderCanceledResponse>), VelaError> {
        let book = match self.order_books.get(&order.market) {
            Some(b) => b,
            None => return Ok((vec![], vec![])),
        };

        let mut fills: Vec<Fill> = vec![];
        let mut taker_remaining = order.quantity;
        let mut locally_consumed: HashMap<OrderId, u64> = HashMap::new();
        let mut affected_makers: HashSet<UserId> = HashSet::new();

        let matchable: Vec<(u64, Vec<Order>)> = match order.side {
            OrderSide::Bid => book.matchable_asks(order.price),
            OrderSide::Ask => book.matchable_bids(order.price),
        };

        'outer: for (fill_price, level_orders) in matchable {
            for resting in &level_orders {
                if taker_remaining == 0 { break 'outer; }
                if resting.user == order.user { continue; }

                let consumed = locally_consumed.get(&resting.id).copied().unwrap_or(0);
                let resting_remaining = resting.remaining_quantity().saturating_sub(consumed);
                if resting_remaining == 0 { continue; }

                let fill_qty = taker_remaining.min(resting_remaining);
                let fill_notional = CreditSystem::compute_notional(fill_price, fill_qty);

                let taker_fee = (fill_notional as i64 * self.fee_config.taker_fee_bps as i64) / 10_000;
                let maker_fee = (fill_notional as i64 * self.fee_config.maker_fee_bps as i64) / 10_000;

                let fill = Fill {
                    maker_order_id: resting.id,
                    taker_order_id: order.id,
                    maker: resting.user.clone(),
                    taker: order.user.clone(),
                    market: order.market.clone(),
                    side: order.side,
                    price: fill_price,
                    quantity: fill_qty,
                    maker_fee,
                    taker_fee,
                    timestamp: self.timestamp,
                };

                self.apply_fill_balances(&fill, market, cow);

                let new_consumed = consumed + fill_qty;
                locally_consumed.insert(resting.id, new_consumed);

                let fully_consumed = new_consumed >= resting.quantity;
                // For bid makers (resting.side == Bid), fills consume their real quote collateral.
                // Decrement actual_collateral so the post-fill credit check uses the true amount.
                let is_bid_maker = resting.side == OrderSide::Bid;
                if fully_consumed {
                    cow.record_remove(order.market.clone(), resting.id);
                    let mut maker_meta = cow.get_metadata(&resting.user, &self.metadata);
                    maker_meta.open_order_ids.retain(|&id| id != resting.id);
                    let resting_notional = CreditSystem::compute_notional(resting.price, resting.remaining_quantity());
                    maker_meta.total_quoted_notional =
                        maker_meta.total_quoted_notional.saturating_sub(resting_notional);
                    if is_bid_maker {
                        maker_meta.actual_collateral =
                            maker_meta.actual_collateral.saturating_sub(fill_notional);
                    }
                    cow.set_metadata(maker_meta);
                } else {
                    cow.record_partial_fill(order.market.clone(), resting.id, fill_qty);
                    let mut maker_meta = cow.get_metadata(&resting.user, &self.metadata);
                    maker_meta.total_quoted_notional = maker_meta.total_quoted_notional
                        .saturating_sub(CreditSystem::compute_notional(resting.price, fill_qty));
                    if is_bid_maker {
                        maker_meta.actual_collateral =
                            maker_meta.actual_collateral.saturating_sub(fill_notional);
                    }
                    cow.set_metadata(maker_meta);
                }

                affected_makers.insert(resting.user.clone());
                taker_remaining -= fill_qty;
                fills.push(fill);
            }
        }

        // Credit auto-cancel: only applies to bid makers (taker is Ask, resting are Bids).
        // Ask makers lock base asset (BTC), which uses a separate backing invariant.
        // Bid makers lock quote asset (USDC) and may use credit beyond their available balance.
        // After fills reduce actual_collateral, check if total_quoted_notional > actual_collateral * ratio.
        let mut auto_canceled: Vec<OrderCanceledResponse> = vec![];

        if order.side == OrderSide::Ask {
            for maker_user in &affected_makers {
                let mut maker_meta = cow.get_metadata(maker_user, &self.metadata);
                let maker_deposited = maker_meta.actual_collateral;

                // Collect (order_id, remaining_notional) for each still-open order,
                // accounting for fills already applied in this match loop.
                let open_orders: Vec<(OrderId, u64)> = maker_meta
                    .open_order_ids
                    .iter()
                    .filter_map(|&oid| {
                        for book in self.order_books.values() {
                            if let Some(o) = book.get_order(oid) {
                                let consumed = locally_consumed.get(&oid).copied().unwrap_or(0);
                                let remaining = o.remaining_quantity().saturating_sub(consumed);
                                if remaining > 0 {
                                    return Some((oid, CreditSystem::compute_notional(o.price, remaining)));
                                }
                                return None;
                            }
                        }
                        None
                    })
                    .collect();

                let to_cancel = self.credit_system.orders_to_cancel_after_fill(
                    maker_user,
                    maker_deposited,
                    maker_meta.total_quoted_notional,
                    &open_orders,
                );

                for oid in to_cancel {
                    'find_order: for book in self.order_books.values() {
                        if let Some(o) = book.get_order(oid) {
                            let consumed = locally_consumed.get(&oid).copied().unwrap_or(0);
                            let remaining = o.remaining_quantity().saturating_sub(consumed);
                            let notional = CreditSystem::compute_notional(o.price, remaining);
                            // Bid orders lock quote; unlock the notional amount.
                            let unlock_amt = CreditSystem::compute_notional(o.price, remaining);

                            cow.record_remove(o.market.clone(), oid);
                            cow.unlock_to_available(
                                maker_user,
                                &market.quote,
                                unlock_amt,
                                &self.balances,
                            );
                            maker_meta.open_order_ids.retain(|&id| id != oid);
                            maker_meta.total_quoted_notional =
                                maker_meta.total_quoted_notional.saturating_sub(notional);

                            auto_canceled.push(OrderCanceledResponse {
                                order_id: oid,
                                client_order_id: o.client_order_id.clone(),
                            });
                            break 'find_order;
                        }
                    }
                }

                cow.set_metadata(maker_meta);
            }
        }

        Ok((fills, auto_canceled))
    }

    fn apply_fill_balances(&self, fill: &Fill, market: &Market, cow: &mut CowCache) {
        let fill_notional = CreditSystem::compute_notional(fill.price, fill.quantity);

        match fill.side {
            OrderSide::Bid => {
                cow.debit_locked(&fill.taker, &market.quote, fill_notional, &self.balances);
                cow.credit_available(&fill.taker, &market.base, fill.quantity, &self.balances);
                if fill.taker_fee > 0 {
                    cow.debit_available(&fill.taker, &market.quote, fill.taker_fee as u64, &self.balances);
                }
                cow.debit_locked(&fill.maker, &market.base, fill.quantity, &self.balances);
                cow.credit_available(&fill.maker, &market.quote, fill_notional, &self.balances);
                if fill.maker_fee < 0 {
                    cow.credit_available(&fill.maker, &market.quote, fill.maker_fee.unsigned_abs() as u64, &self.balances);
                } else if fill.maker_fee > 0 {
                    cow.debit_available(&fill.maker, &market.quote, fill.maker_fee as u64, &self.balances);
                }
            }
            OrderSide::Ask => {
                cow.debit_locked(&fill.taker, &market.base, fill.quantity, &self.balances);
                cow.credit_available(&fill.taker, &market.quote, fill_notional, &self.balances);
                if fill.taker_fee > 0 {
                    cow.debit_available(&fill.taker, &market.quote, fill.taker_fee as u64, &self.balances);
                }
                cow.debit_locked(&fill.maker, &market.quote, fill_notional, &self.balances);
                cow.credit_available(&fill.maker, &market.base, fill.quantity, &self.balances);
                if fill.maker_fee < 0 {
                    cow.credit_available(&fill.maker, &market.quote, fill.maker_fee.unsigned_abs() as u64, &self.balances);
                } else if fill.maker_fee > 0 {
                    cow.debit_available(&fill.maker, &market.quote, fill.maker_fee as u64, &self.balances);
                }
            }
        }
    }

    fn process_cancel_order(&mut self, req: CancelOrderRequest) -> Vec<Response> {
        let mut meta = self.get_metadata(&req.user);
        if !meta.nonce_window.accept(req.nonce) {
            return vec![Response::Error(ErrorResponse {
                code: ErrorCode::InvalidNonce,
                message: "invalid nonce".into(),
            })];
        }

        let order_id = if let Some(id) = req.order_id {
            id
        } else if let Some(coid) = &req.client_order_id {
            let found = self.order_books.values().find_map(|b| b.find_by_client_order_id(&req.user, coid));
            match found {
                Some(id) => id,
                None => return vec![Response::Error(ErrorResponse {
                    code: ErrorCode::OrderNotFound,
                    message: "order not found".into(),
                })],
            }
        } else {
            return vec![Response::Error(ErrorResponse {
                code: ErrorCode::OrderNotFound,
                message: "must provide order_id or client_order_id".into(),
            })];
        };

        let removed = self.order_books.values_mut().find_map(|b| b.remove_order(order_id));

        match removed {
            Some(order) => {
                meta.open_order_ids.retain(|&id| id != order_id);
                let market = self.markets.get(&order.market).cloned();
                if let Some(market) = market {
                    let (spend_asset, spend_amount) = match order.side {
                        OrderSide::Bid => (
                            market.quote.clone(),
                            CreditSystem::compute_notional(order.price, order.remaining_quantity()),
                        ),
                        OrderSide::Ask => (market.base.clone(), order.remaining_quantity()),
                    };
                    self.unlock_balance(&req.user, &spend_asset, spend_amount);
                }
                meta.total_quoted_notional = meta.total_quoted_notional
                    .saturating_sub(CreditSystem::compute_notional(order.price, order.remaining_quantity()));
                self.metadata.insert(req.user.clone(), meta);
                vec![Response::OrderCanceled(types::OrderCanceledResponse {
                    order_id,
                    client_order_id: order.client_order_id,
                })]
            }
            None => vec![Response::Error(ErrorResponse {
                code: ErrorCode::OrderNotFound,
                message: "order not found".into(),
            })],
        }
    }

    fn unlock_balance(&mut self, user: &UserId, asset: &AssetId, amount: u64) {
        let key = (user.clone(), asset.clone());
        let bal = self.balances.entry(key).or_insert_with(|| Balance {
            user: user.clone(),
            asset: asset.clone(),
            available: 0,
            locked: 0,
        });
        bal.locked = bal.locked.saturating_sub(amount);
        bal.available += amount;
    }

    fn process_deposit(&mut self, req: DepositRequest) -> Vec<Response> {
        // Track actual collateral for credit auto-cancel: only quote assets back bid credit.
        let is_quote = self.markets.values().any(|m| m.quote == req.asset);
        if is_quote {
            let mut meta = self.get_metadata(&req.user);
            meta.actual_collateral += req.amount;
            self.metadata.insert(req.user.clone(), meta);
        }

        let key = (req.user.clone(), req.asset.clone());
        let bal = self.balances.entry(key).or_insert_with(|| Balance {
            user: req.user.clone(),
            asset: req.asset.clone(),
            available: 0,
            locked: 0,
        });
        bal.available += req.amount;
        vec![Response::BalanceUpdated(types::BalanceUpdatedResponse {
            user: req.user,
            asset: req.asset,
            available: bal.available,
            locked: bal.locked,
        })]
    }

    fn process_withdrawal(&mut self, req: WithdrawalRequest) -> Vec<Response> {
        let mut meta = self.get_metadata(&req.user);
        if !meta.nonce_window.accept(req.nonce) {
            return vec![Response::Error(ErrorResponse {
                code: ErrorCode::InvalidNonce,
                message: "invalid nonce".into(),
            })];
        }
        let key = (req.user.clone(), req.asset.clone());
        let bal = self.balances.entry(key).or_insert_with(|| Balance {
            user: req.user.clone(),
            asset: req.asset.clone(),
            available: 0,
            locked: 0,
        });
        if bal.available < req.amount {
            return vec![Response::Error(ErrorResponse {
                code: ErrorCode::InsufficientBalance,
                message: "insufficient available balance".into(),
            })];
        }
        bal.available -= req.amount;
        self.metadata.insert(req.user.clone(), meta);
        vec![Response::BalanceUpdated(types::BalanceUpdatedResponse {
            user: req.user,
            asset: req.asset,
            available: bal.available,
            locked: bal.locked,
        })]
    }

    fn credit_available(&mut self, user: &UserId, asset: &AssetId, amount: u64) {
        let key = (user.clone(), asset.clone());
        let bal = self.balances.entry(key).or_insert_with(|| Balance {
            user: user.clone(),
            asset: asset.clone(),
            available: 0,
            locked: 0,
        });
        bal.available += amount;
    }

    fn debit_available(&mut self, user: &UserId, asset: &AssetId, amount: u64) {
        let key = (user.clone(), asset.clone());
        let bal = self.balances.entry(key).or_insert_with(|| Balance {
            user: user.clone(),
            asset: asset.clone(),
            available: 0,
            locked: 0,
        });
        bal.available = bal.available.saturating_sub(amount);
    }
}

impl MatchingEngine {
    pub fn changed_balance_keys(&self) -> Vec<(UserId, AssetId)> {
        self.balances.keys().cloned().collect()
    }

    pub fn changed_metadata_keys(&self) -> Vec<UserId> {
        self.metadata.keys().cloned().collect()
    }

    pub fn snapshot_balances(&self) -> &std::collections::HashMap<(UserId, AssetId), Balance> {
        &self.balances
    }

    pub fn snapshot_metadata(&self) -> &std::collections::HashMap<UserId, UserMetadata> {
        &self.metadata
    }

    pub fn next_order_id(&self) -> OrderId {
        self.next_order_id
    }

    pub fn set_next_order_id(&mut self, id: OrderId) {
        self.next_order_id = id;
    }
}
