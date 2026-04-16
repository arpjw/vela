use serde::{Deserialize, Serialize};
use types::{MarketId, OrderSide, OrderStatus, OrderType, Price, Quantity, UserId};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    Subscribe { channels: Vec<String> },
    Unsubscribe { channels: Vec<String> },
    RequestChallenge,
    Auth { address: String, signature: String, nonce: String },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsServerMessage {
    Subscribed { channels: Vec<String> },
    BookSnapshot { market: String, bids: Vec<[String; 2]>, asks: Vec<[String; 2]> },
    Trade { market: String, price: String, quantity: String, side: String, timestamp: u64 },
    OrderUpdate { order_id: u64, status: String, filled_quantity: String },
    Fill { maker_order_id: u64, taker_order_id: u64, price: String, quantity: String, side: String, maker_fee: String, taker_fee: String, timestamp: u64 },
    BalanceUpdate { asset: String, available: String, locked: String },
    Challenge { nonce: String },
    Authenticated { address: String },
    Error { code: String, message: String },
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostOrderBody {
    pub market: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub price: Price,
    pub quantity: Quantity,
    pub nonce: u64,
    pub client_order_id: Option<String>,
    pub address: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrderBody {
    pub order_id: Option<u64>,
    pub client_order_id: Option<String>,
    pub nonce: u64,
    pub address: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawBody {
    pub asset: String,
    pub amount: u64,
    pub nonce: u64,
    pub address: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepositBody {
    pub user: String,
    pub asset: String,
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookLevel {
    pub price: String,
    pub quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookResponse {
    pub market: String,
    pub bids: Vec<BookLevel>,
    pub asks: Vec<BookLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketResponse {
    pub id: String,
    pub base: String,
    pub quote: String,
    pub best_bid: Option<String>,
    pub best_ask: Option<String>,
    pub spread: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceResponse {
    pub asset: String,
    pub available: String,
    pub locked: String,
    pub total: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        ApiResponse { ok: true, data: Some(data), error: None }
    }
    pub fn err(msg: impl Into<String>) -> ApiResponse<()> {
        ApiResponse { ok: false, data: None, error: Some(msg.into()) }
    }
}

pub fn format_amount(raw: u64, decimals: u32) -> String {
    let scale = 10u64.pow(decimals);
    let whole = raw / scale;
    let frac = raw % scale;
    if frac == 0 {
        format!("{}", whole)
    } else {
        format!("{}.{:0>width$}", whole, frac, width = decimals as usize)
            .trim_end_matches('0')
            .to_string()
    }
}
