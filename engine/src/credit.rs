use std::collections::HashMap;
use types::{AssetId, OrderId, Price, Quantity, UserId, VelaError, PRICE_SCALE, QUANTITY_SCALE};

pub struct CreditSystem {
    credit_ratios: HashMap<UserId, f64>,
    default_ratio: f64,
}

impl CreditSystem {
    pub fn new(default_ratio: f64) -> Self {
        CreditSystem {
            credit_ratios: HashMap::new(),
            default_ratio,
        }
    }

    pub fn set_ratio(&mut self, user: UserId, ratio: f64) {
        self.credit_ratios.insert(user, ratio);
    }

    pub fn ratio(&self, user: &UserId) -> f64 {
        *self.credit_ratios.get(user).unwrap_or(&self.default_ratio)
    }

    pub fn compute_notional(price: Price, quantity: Quantity) -> u64 {
        let p = price as u128;
        let q = quantity as u128;
        let scale = (PRICE_SCALE as u128) * (QUANTITY_SCALE as u128);
        ((p * q) / scale) as u64
    }

    pub fn check_credit(
        &self,
        user: &UserId,
        deposited: u64,
        current_quoted: u64,
        new_order_notional: u64,
    ) -> Result<(), VelaError> {
        let ratio = self.ratio(user);
        let max_quoted = (deposited as f64 * ratio) as u64;
        if current_quoted.saturating_add(new_order_notional) > max_quoted {
            return Err(VelaError::CreditLimitExceeded);
        }
        Ok(())
    }

    pub fn orders_to_cancel_after_fill(
        &self,
        user: &UserId,
        deposited: u64,
        current_quoted: u64,
        open_orders: &[(OrderId, u64)],
    ) -> Vec<OrderId> {
        let ratio = self.ratio(user);
        let max_quoted = (deposited as f64 * ratio) as u64;

        if current_quoted <= max_quoted {
            return vec![];
        }

        let mut to_cancel = vec![];
        let mut remaining_quoted = current_quoted;
        let mut sorted = open_orders.to_vec();
        sorted.sort_by_key(|(_, notional)| *notional);

        for (order_id, notional) in sorted {
            if remaining_quoted <= max_quoted {
                break;
            }
            to_cancel.push(order_id);
            remaining_quoted = remaining_quoted.saturating_sub(notional);
        }

        to_cancel
    }
}

pub fn compute_notional_f(price: Price, quantity: Quantity) -> f64 {
    (price as f64 * quantity as f64) / ((PRICE_SCALE as f64) * (QUANTITY_SCALE as f64))
}
