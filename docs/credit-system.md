# Vela Market-Maker Credit System

The Vela credit system is the first natively-implemented credit facility in a spot DEX matching engine. It allows market makers to quote notional value beyond their deposited collateral, reusing capital across bid levels. When a fill breaches the credit constraint, the engine automatically cancels open orders to restore the invariant — without requiring any external settlement or margin call.

This document covers the design rationale, the credit math, the auto-cancel mechanism, and the `actual_collateral` invariant that prevents ghost-balance inflation.

---

## Motivation

On a centralized exchange, market makers routinely post bids worth 5–10× their settled balance, relying on the exchange's credit desk to cover any gap. DEX designs have historically avoided this because:

1. Smart contracts cannot atomically enforce margin calls across fills.
2. Off-chain state makes it hard to track the realized vs. quoted notional.
3. No prior DEX matching engine exposed a credit ratio as a first-class parameter.

Vela solves all three problems in the off-chain matching engine. Because the engine is the sole source of truth for exchange state (with the MPT root serving as the on-chain commitment), it can enforce the credit constraint atomically within a single `process()` call — no external settlement required.

---

## Credit Ratio

Each user has a `credit_ratio` (default `1.0`, configurable per user):

```
max_quoted_notional = actual_collateral × credit_ratio
```

`actual_collateral` is the user's real deposited USDC minus the USDC consumed by fills. It specifically excludes the "ghost" balance that a credit extension creates — you cannot compound credit on top of credit.

For `credit_ratio = 1.0`, a maker with 10,000 USDC deposited can post bids with a combined notional of up to 10,000 USDC. For `credit_ratio = 5.0`, the same maker can post up to 50,000 USDC notional.

### Setting a Ratio

`CreditSystem::set_ratio(user: UserId, ratio: f64)` overrides the default for a specific user. The override takes effect on the next order submitted by that user. This is an operator-level call and is not exposed via the public API.

---

## Notional Calculation

For a bid order, notional is the quoted cost:

```
notional = (price × quantity) / QUANTITY_SCALE
```

where `QUANTITY_SCALE = 10^8`. The multiplication uses `u128` intermediates to prevent overflow before dividing back to `u64`:

```rust
pub fn compute_notional(price: Price, quantity: Quantity) -> u64 {
    let p = price as u128;
    let q = quantity as u128;
    ((p * q) / QUANTITY_SCALE as u128) as u64
}
```

For an ask order, no notional accounting is needed — the maker locks the base-asset quantity directly (there is no credit ghost on the ask side because base tokens are real).

---

## Pre-Order Credit Check

Before any bid order is inserted into the book, `check_credit` is called:

```rust
pub fn check_credit(
    &self,
    user:               &UserId,
    deposited:          u64,    // actual_collateral at time of order
    current_quoted:     u64,    // sum of notionals of all open bid orders
    new_order_notional: u64,    // notional of the incoming bid
) -> Result<(), VelaError>
```

The check:

```
max_quoted = deposited × credit_ratio

if current_quoted + new_order_notional > max_quoted:
    return Err(CreditLimitExceeded)
```

If the check passes, the order is posted and `total_quoted_notional` (in `UserMetadata`) is incremented by `new_order_notional`. If the check fails, the request returns `Response::Error(CreditLimitExceeded)` and no state changes are made.

---

## Post-Fill Auto-Cancel

When a taker ask hits a maker bid, the maker receives base tokens and pays USDC. The USDC payment reduces `actual_collateral`. If the reduction causes `total_quoted_notional > actual_collateral × credit_ratio`, the invariant is breached — the maker is now over-extended on their remaining open bids.

The engine handles this automatically within the same `process()` call, after the fill is committed:

1. Compute `max_quoted = actual_collateral × credit_ratio`.
2. If `total_quoted_notional <= max_quoted`, no action needed.
3. Otherwise, collect the user's open bid order IDs and their notionals from `UserMetadata`.
4. Sort orders ascending by notional (cancel the smallest orders first to minimize market impact).
5. Cancel orders one by one, decrementing `total_quoted_notional` and unlocking collateral, until the constraint is satisfied.

```rust
pub fn orders_to_cancel_after_fill(
    &self,
    user:           &UserId,
    deposited:      u64,
    current_quoted: u64,
    open_orders:    &[(OrderId, u64)],  // (order_id, notional)
) -> Vec<OrderId>
```

The cancellation is:
- **Atomic** — happens within the same `CowCache` transaction as the fill
- **Deterministic** — smallest notional first; ties broken by iteration order
- **Minimal** — stops as soon as the constraint is restored, not a full book wipe

The canceled orders produce `Response::OrderCanceled` entries in the response vector, so the maker's WebSocket connection receives `order_update` events for each automatically canceled order.

---

## The `actual_collateral` Invariant

`UserMetadata` carries two balance-adjacent fields:

```rust
pub struct UserMetadata {
    ...
    pub total_quoted_notional: u64,
    pub actual_collateral:     u64,
}
```

`total_quoted_notional` is the sum of notionals of all currently open bid orders. It increases when a bid is posted and decreases when a bid is canceled or filled.

`actual_collateral` is the USDC deposited by the user **minus** the USDC consumed by fills. It is updated on every fill that touches the maker's bid side. Crucially, it does not include the "virtual" USDC that a credit extension makes available — only real on-chain deposits count.

### Why `actual_collateral` Matters

Consider a maker with 1,000 USDC and `credit_ratio = 5.0`:

```
max_quoted = 1000 × 5.0 = 5000 USDC notional
```

The maker posts bids totaling 4,500 USDC notional. A taker fills 800 USDC worth of those bids. The maker receives base tokens; `actual_collateral` decreases to 200 USDC:

```
new max_quoted = 200 × 5.0 = 1000 USDC notional
```

But `total_quoted_notional` is still 3,700 USDC (4,500 − 800). The engine detects the breach and cancels open bids until `total_quoted_notional ≤ 1000`. This prevents a situation where the maker's credit headroom compounds indefinitely as fills reduce their real collateral.

If instead the check used `available` balance (which would include the credited amount), a maker could be "credited on credit" and the effective leverage could far exceed `credit_ratio`. `actual_collateral` is a hard floor on the multiplier denominator.

---

## Asset Backing Invariant

The credit system does not create new assets. The invariant:

```
sum of all user available balances (asset A)
  + sum of all locked balances (asset A)
  == sum of all deposits (asset A) - sum of all withdrawals (asset A)
```

holds at all times. Credit extends *quoting capacity*, not *asset supply*. A maker posting 5× their deposited notional does not increase the total USDC in the system — they are committing to buy at those prices if hit. If a bid is hit and the maker cannot cover (because `actual_collateral` was already exhausted by prior fills), the auto-cancel fires before the fill can occur, preventing undercollateralization.

The engine test `test_asset_backing_invariant_holds` in `engine/tests/matching_tests.rs` verifies this property: after a sequence of deposits, orders, fills, and cancels, the sum of all balances equals the sum of all deposits.

---

## Example: Full Credit Lifecycle

Setup: maker deposits 1,000 USDC, `credit_ratio = 3.0`.

```
actual_collateral = 1000 USDC
max_quoted        = 3000 USDC notional
```

**Step 1 — Post bid at 50,000 USDC/BTC for 0.05 BTC**

```
notional = 50000e8 × 0.05e8 / 1e8 = 2500 USDC
check: 0 + 2500 ≤ 3000 → OK
total_quoted_notional = 2500
```

**Step 2 — Post second bid at 49,000 USDC/BTC for 0.01 BTC**

```
notional = 490 USDC
check: 2500 + 490 ≤ 3000 → OK (2990 ≤ 3000)
total_quoted_notional = 2990
```

**Step 3 — Taker sells 0.05 BTC, hitting the first bid**

```
fill: maker pays 2500 USDC, receives 0.05 BTC
actual_collateral = 1000 - 2500 = MAX(0, ...) → effectively 0
  (saturating_sub: actual_collateral → 0)

new max_quoted = 0 × 3.0 = 0 USDC
total_quoted_notional = 490 (remaining open bid)
490 > 0 → breach detected
```

Auto-cancel fires on the 490 USDC bid. `total_quoted_notional = 0`. Maker receives `OrderCanceled` event.

**Final state:**
- Maker holds 0.05 BTC and ~0 USDC (2500 paid for fill, but 1000 was the deposit → net funded by credit).
- No open bids.
- `actual_collateral = 0` (maker is effectively insolvent on the USDC side until they deposit more).

This demonstrates that the credit system enforces solvency at the per-fill granularity, not just at order submission time.

---

## Fee Interaction

The auto-cancel logic fires after fees are applied. Maker fees are typically negative (rebates), so `actual_collateral` after a fill may be slightly *higher* than expected if the rebate exceeds zero. In practice:

```
actual_collateral after fill = actual_collateral before - fill_cost + maker_rebate
```

where `maker_rebate = |maker_fee_bps| × notional / 10_000` (positive when `maker_fee_bps < 0`).

The auto-cancel check uses the post-fee `actual_collateral`, so rebates count toward the collateral floor.

---

## Configuration Reference

| Parameter | Default | Description |
|---|---|---|
| `default_ratio` | `1.0` | Default credit ratio for all users |
| per-user `credit_ratio` | (inherits default) | Set via `CreditSystem::set_ratio()` |
| `FeeConfig::maker_fee_bps` | `-2` | Maker fee in basis points (negative = rebate) |
| `FeeConfig::taker_fee_bps` | `7` | Taker fee in basis points |
| `NONCE_WINDOW_SIZE` | `20` | Replay-protection window per user |
| `PRICE_SCALE` | `10^8` | Price scaling factor |
| `QUANTITY_SCALE` | `10^8` | Quantity scaling factor |
