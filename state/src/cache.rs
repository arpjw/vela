use std::collections::HashMap;
use types::{AssetId, Balance, MarketId, UserId, UserMetadata};

pub struct StateCache {
    pub balances: HashMap<(UserId, AssetId), Balance>,
    pub metadata: HashMap<UserId, UserMetadata>,
    pub dirty_balance_keys: Vec<(UserId, AssetId)>,
    pub dirty_metadata_keys: Vec<UserId>,
    pub dirty_markets: Vec<MarketId>,
}

impl StateCache {
    pub fn new() -> Self {
        StateCache {
            balances: HashMap::new(),
            metadata: HashMap::new(),
            dirty_balance_keys: vec![],
            dirty_metadata_keys: vec![],
            dirty_markets: vec![],
        }
    }

    pub fn mark_balance_dirty(&mut self, user: UserId, asset: AssetId) {
        self.dirty_balance_keys.push((user, asset));
    }

    pub fn mark_metadata_dirty(&mut self, user: UserId) {
        self.dirty_metadata_keys.push(user);
    }

    pub fn mark_market_dirty(&mut self, market: MarketId) {
        self.dirty_markets.push(market);
    }

    pub fn flush_dirty(&mut self) -> (Vec<(UserId, AssetId)>, Vec<UserId>, Vec<MarketId>) {
        let b = std::mem::take(&mut self.dirty_balance_keys);
        let m = std::mem::take(&mut self.dirty_metadata_keys);
        let k = std::mem::take(&mut self.dirty_markets);
        (b, m, k)
    }
}

impl Default for StateCache {
    fn default() -> Self {
        Self::new()
    }
}
