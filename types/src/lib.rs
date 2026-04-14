use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use thiserror::Error;

pub type Price = u64;
pub type Quantity = u64;
pub type OrderId = u64;
pub type Nonce = u64;
pub type Timestamp = u64;

pub const PRICE_DECIMALS: u32 = 8;
pub const QUANTITY_DECIMALS: u32 = 8;
pub const PRICE_SCALE: u64 = 10u64.pow(PRICE_DECIMALS);
pub const QUANTITY_SCALE: u64 = 10u64.pow(QUANTITY_DECIMALS);
pub const NONCE_WINDOW_SIZE: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UserId(pub [u8; 20]);

impl UserId {
    pub fn from_hex(s: &str) -> Result<Self, VelaError> {
        let s = s.strip_prefix("0x").unwrap_or(s);
        let bytes = hex::decode(s).map_err(|_| VelaError::InvalidAddress)?;
        if bytes.len() != 20 {
            return Err(VelaError::InvalidAddress);
        }
        let mut arr = [0u8; 20];
        arr.copy_from_slice(&bytes);
        Ok(UserId(arr))
    }

    pub fn to_hex(&self) -> String {
        format!("0x{}", hex::encode(self.0))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MarketId(pub String);

impl MarketId {
    pub fn new(base: &str, quote: &str) -> Self {
        MarketId(format!("{}-{}", base, quote))
    }
}

impl std::fmt::Display for MarketId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetId(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderSide {
    Bid,
    Ask,
}

impl OrderSide {
    pub fn opposite(&self) -> Self {
        match self {
            OrderSide::Bid => OrderSide::Ask,
            OrderSide::Ask => OrderSide::Bid,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType {
    GoodTillCanceled,
    PostOnly,
    ImmediateOrCancel,
    FillOrKill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Canceled,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: OrderId,
    pub user: UserId,
    pub market: MarketId,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub price: Price,
    pub quantity: Quantity,
    pub filled_quantity: Quantity,
    pub nonce: Nonce,
    pub client_order_id: Option<String>,
    pub timestamp: Timestamp,
    pub status: OrderStatus,
}

impl Order {
    pub fn remaining_quantity(&self) -> Quantity {
        self.quantity.saturating_sub(self.filled_quantity)
    }

    pub fn is_fully_filled(&self) -> bool {
        self.filled_quantity >= self.quantity
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fill {
    pub maker_order_id: OrderId,
    pub taker_order_id: OrderId,
    pub maker: UserId,
    pub taker: UserId,
    pub market: MarketId,
    pub side: OrderSide,
    pub price: Price,
    pub quantity: Quantity,
    pub maker_fee: i64,
    pub taker_fee: i64,
    pub timestamp: Timestamp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub user: UserId,
    pub asset: AssetId,
    pub available: u64,
    pub locked: u64,
}

impl Balance {
    pub fn total(&self) -> u64 {
        self.available.saturating_add(self.locked)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMetadata {
    pub user: UserId,
    pub nonce_window: NonceWindow,
    pub open_order_ids: Vec<OrderId>,
    pub credit_ratio: f64,
    pub total_quoted_notional: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NonceWindow {
    window: BTreeSet<Nonce>,
}

impl NonceWindow {
    pub fn new() -> Self {
        NonceWindow {
            window: BTreeSet::new(),
        }
    }

    pub fn accept(&mut self, nonce: Nonce) -> bool {
        if self.window.len() >= NONCE_WINDOW_SIZE {
            let min = match self.window.iter().next().copied() {
                Some(m) => m,
                None => return false,
            };
            if nonce <= min {
                return false;
            }
            self.window.remove(&min);
        } else if self.window.contains(&nonce) {
            return false;
        }
        self.window.insert(nonce);
        true
    }

    pub fn min(&self) -> Option<Nonce> {
        self.window.iter().next().copied()
    }
}

impl Default for NonceWindow {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeConfig {
    pub maker_fee_bps: i32,
    pub taker_fee_bps: i32,
}

impl Default for FeeConfig {
    fn default() -> Self {
        FeeConfig {
            maker_fee_bps: -2,
            taker_fee_bps: 7,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub id: MarketId,
    pub base: AssetId,
    pub quote: AssetId,
    pub max_orders: usize,
    pub min_order_size: Quantity,
    pub price_tick: Price,
    pub quantity_tick: Quantity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Request {
    PostOrder(PostOrderRequest),
    CancelOrder(CancelOrderRequest),
    Deposit(DepositRequest),
    Withdrawal(WithdrawalRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostOrderRequest {
    pub user: UserId,
    pub market: MarketId,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub price: Price,
    pub quantity: Quantity,
    pub nonce: Nonce,
    pub client_order_id: Option<String>,
    pub signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrderRequest {
    pub user: UserId,
    pub order_id: Option<OrderId>,
    pub client_order_id: Option<String>,
    pub nonce: Nonce,
    pub signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepositRequest {
    pub user: UserId,
    pub asset: AssetId,
    pub amount: u64,
    pub l1_tx_hash: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawalRequest {
    pub user: UserId,
    pub asset: AssetId,
    pub amount: u64,
    pub nonce: Nonce,
    pub signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Response {
    OrderPosted(OrderPostedResponse),
    OrderCanceled(OrderCanceledResponse),
    OrderFilled(Fill),
    BalanceUpdated(BalanceUpdatedResponse),
    Error(ErrorResponse),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderPostedResponse {
    pub order_id: OrderId,
    pub client_order_id: Option<String>,
    pub status: OrderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderCanceledResponse {
    pub order_id: OrderId,
    pub client_order_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceUpdatedResponse {
    pub user: UserId,
    pub asset: AssetId,
    pub available: u64,
    pub locked: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrorCode {
    InvalidNonce,
    InsufficientBalance,
    CreditLimitExceeded,
    OrderNotFound,
    MarketNotFound,
    OrderBookFull,
    PostOnlyWouldMatch,
    FokNotFilled,
    InvalidSignature,
    InvalidMarket,
    InvalidPrice,
    InvalidQuantity,
    DuplicateClientOrderId,
    InternalError,
}

#[derive(Debug, Error)]
pub enum VelaError {
    #[error("invalid address")]
    InvalidAddress,
    #[error("invalid nonce")]
    InvalidNonce,
    #[error("insufficient balance")]
    InsufficientBalance,
    #[error("credit limit exceeded")]
    CreditLimitExceeded,
    #[error("order not found")]
    OrderNotFound,
    #[error("market not found: {0}")]
    MarketNotFound(String),
    #[error("order book full")]
    OrderBookFull,
    #[error("post-only order would match")]
    PostOnlyWouldMatch,
    #[error("fill-or-kill order not fully filled")]
    FokNotFilled,
    #[error("invalid signature")]
    InvalidSignature,
    #[error("duplicate client order id")]
    DuplicateClientOrderId,
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<VelaError> for ErrorResponse {
    fn from(e: VelaError) -> Self {
        let code = match &e {
            VelaError::InvalidNonce => ErrorCode::InvalidNonce,
            VelaError::InsufficientBalance => ErrorCode::InsufficientBalance,
            VelaError::CreditLimitExceeded => ErrorCode::CreditLimitExceeded,
            VelaError::OrderNotFound => ErrorCode::OrderNotFound,
            VelaError::MarketNotFound(_) => ErrorCode::MarketNotFound,
            VelaError::OrderBookFull => ErrorCode::OrderBookFull,
            VelaError::PostOnlyWouldMatch => ErrorCode::PostOnlyWouldMatch,
            VelaError::FokNotFilled => ErrorCode::FokNotFilled,
            VelaError::InvalidSignature => ErrorCode::InvalidSignature,
            VelaError::DuplicateClientOrderId => ErrorCode::DuplicateClientOrderId,
            VelaError::InvalidAddress | VelaError::Internal(_) => ErrorCode::InternalError,
        };
        ErrorResponse {
            code,
            message: e.to_string(),
        }
    }
}
