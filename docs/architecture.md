# Vela Architecture

This document describes the internal design of each Vela component. It is written for engineers who want to understand, extend, or audit the system.

---

## Overview

Vela is a single-process exchange engine. All matching happens in one in-memory state machine (`MatchingEngine`). State is periodically snapshotted to a Merkle Patricia Trie (MPT) whose root can be anchored to an L1 chain for verifiability. A separate committer goroutine handles batching and DA uploads without blocking the hot path.

The request lifecycle in one sentence: the API handler verifies the ECDSA signature on a thread-pool thread, then calls `engine.process(request, timestamp)` under a Tokio mutex, which returns a `Vec<Response>`. Those responses are dispatched to the appropriate WebSocket feeds and returned over HTTP.

---

## Crate Map

```
vela/
├── types/       Shared domain types. No logic.
├── engine/      Matching engine STF. Pure in-memory computation.
├── state/       MPT state layer. Owns persistence and root hashing.
├── api/         HTTP/WS API server. ECDSA, feed routing.
├── committer/   Batch commit pipeline. DA, forced inclusion.
├── zkvm/        STF re-execution. Optimistic proving.
└── benches/     Criterion benchmark suite.
```

Dependency graph (edges point from consumer to producer):

```
api ──────────► engine ──► types
     └────────► state  ──► types
committer ─────► state
committer ─────► engine
committer ─────► types
zkvm ──────────► engine
zkvm ──────────► state
zkvm ──────────► types
benches ───────► engine
benches ───────► types
```

---

## 1. Matching Engine (`engine` crate)

### MatchingEngine

```rust
pub struct MatchingEngine {
    pub order_books:  HashMap<MarketId, OrderBook>,
    pub balances:     HashMap<(UserId, AssetId), Balance>,
    pub metadata:     HashMap<UserId, UserMetadata>,
    pub markets:      HashMap<MarketId, Market>,
    fee_config:       FeeConfig,
    credit_system:    CreditSystem,
    timestamp:        Timestamp,
    next_order_id:    OrderId,
}
```

The engine is a pure state machine. `process(request, ts) -> Vec<Response>` is the only public mutation method. It:

1. Validates the request (market exists, nonce not replayed, sufficient balance).
2. Executes the state transition through `CowCache`.
3. Commits the cache if valid; rolls back (drops it) on any error.
4. Returns a `Vec<Response>` describing what happened.

The engine never touches I/O, never allocates beyond what is needed for the response vector, and holds no async state.

### State Transition Function (STF)

Each `Request` variant maps to one STF handler:

| Request | What happens |
|---|---|
| `Deposit` | Credits `available` balance for `(user, asset)`. Deduplication is caller responsibility via `l1_tx_hash`. |
| `Withdrawal` | Verifies `available >= amount`, deducts balance, emits `BalanceUpdated`. Settlement finalized after MPT root proves inclusion. |
| `PostOrder` | Validates nonce, credit check, price/qty constraints; inserts resting order or matches immediately. |
| `CancelOrder` | Looks up order by `order_id` or `client_order_id`; unlocks collateral; removes from book. |

The nonce replay window is a fixed-size sliding window (`NonceWindow`, backed by `BTreeSet<u64>`, window size 20). A nonce is accepted if the window has spare capacity or is newer than the minimum resident nonce; the minimum is evicted to make room.

### OrderBook

```rust
pub struct OrderBook {
    bids: BTreeMap<Price, PriceLevel>,  // descending iteration
    asks: BTreeMap<Price, PriceLevel>,  // ascending iteration
    order_index: HashMap<OrderId, (OrderSide, Price)>,
}

struct PriceLevel {
    orders: VecDeque<Order>,
}
```

Matching is price-time priority. `matchable_asks()` and `matchable_bids()` return a snapshot of all resting orders sorted by price, then by insertion time. On a taker order arriving, the engine iterates the opposite side and fills until the taker is exhausted or no more eligible levels remain.

**Current complexity:**
- Insert: O(log n) BTreeMap insertion
- Cancel: O(log n) level lookup + O(k) linear scan of `VecDeque` within the price level
- Match: O(m) where m = number of fills

**Planned:** Replace `VecDeque<Order>` with a slab-allocated pool indexed by `OrderId` to make cancel O(1).

### CowCache

Every `process()` call allocates a fresh `CowCache`. All state mutations within a single request write to the cache's overlay maps rather than directly to the engine's base maps. On success, `commit()` is called; on error, the cache is dropped with no side effects.

```rust
pub struct CowCache {
    pub balance_overlay:  HashMap<(UserId, AssetId), Balance>,
    pub metadata_overlay: HashMap<UserId, UserMetadata>,
    deltas:               Vec<Delta>,  // order-book structural changes only
}
```

`Delta` variants after VEL-20 optimization:

```rust
pub enum Delta {
    OrderBookInsert      { market: MarketId, order: Order },
    OrderBookRemove      { market: MarketId, order_id: OrderId },
    OrderBookPartialFill { market: MarketId, order_id: OrderId, additional_filled: Quantity },
}
```

Balance and metadata changes are recorded only in the overlay maps. `commit()` drains them with `HashMap::extend()` (ownership transfer, zero clone) and replays only the structural order-book deltas against the live `OrderBook` objects.

**Pre-optimization (before VEL-20):** `set_balance()` and `set_metadata()` each pushed a `Delta::BalanceSet` / `Delta::MetadataSet` to the log *in addition to* inserting into the overlay — two full clones per write. `commit()` then replayed the log, a third redundant apply. Eliminating the two delta variants produced −12% mean latency on `post_order`.

### Fee Model

```
maker_fee_bps: i32  (default −2, i.e., 0.02% rebate)
taker_fee_bps: i32  (default  7, i.e., 0.07% charge)
```

Fees are signed integers to allow negative maker fees (rebates). The fee is computed as:

```
fee = (fill_price × fill_quantity / QUANTITY_SCALE) × bps / 10_000
```

where `QUANTITY_SCALE = 10^8`. Negative values are credited to the maker's balance.

---

## 2. State Layer (`state` crate)

### MptStore

A Merkle Patricia Trie over a `BTreeMap<Vec<u8>, Vec<u8>>`. Keys are `StateKey`-encoded byte strings; values are `serde_json`-serialized state objects. The root is computed lazily by keccak256-hashing all key-value pairs in lexicographic key order. This is not a production-grade sparse MPT — it is a deterministic, auditable state commitment suitable for the current optimistic proving architecture.

```
StateKey encoding:

Balance   → "bal:{20-byte-user-hex}:{asset-id-string}"
Metadata  → "meta:{20-byte-user-hex}"
OrderBook → "book:{market-id-string}"
MarketCfg → "mkt:{market-id-string}"
Sequence  → "seq"
```

### StateCache

An in-memory dirty-tracking layer above `MptStore`. Writes go to a local map tagged as dirty; `commit_batch()` flushes dirty entries to the MPT and recomputes the root. The `StateManager` coordinates the cache, the MPT, and optional disk persistence (snapshot serialized to `snapshot.json`).

### Snapshot / Replay

`take_snapshot() -> Vec<(Vec<u8>, Vec<u8>)>` returns the full MPT state as a list of raw key-value pairs. This snapshot is the input to `verify_execution()` in the zkvm crate — it seeds the engine state so fraud proofs can re-execute any batch from its pre-batch root.

---

## 3. Committer (`committer` crate)

The committer runs as a Tokio task, driven by two channels and a timer:

```
normal_batch_rx   ← API handler sends CommitBatch objects
forced_rx         ← forced-inclusion entries (from DelayedInbox)
timer             ← fires every batch_interval (default 500 ms)
```

On each timer tick, the committer:

1. Drains the `forced_rx` channel into `DelayedInbox`.
2. Drains eligible forced entries (those older than `forced_inclusion_timeout`, default 24 h) and **prepends** them to `pending_requests`.
3. Drains the normal batch queue into `pending_requests`.
4. If `pending_requests` is non-empty **or** forced entries were drained, commits the batch.
5. Writes a `DaBatch` to the DA client (non-blocking; errors are logged and never propagate).
6. Publishes a `CommitResult` to the result channel.

```rust
pub struct CommitResult {
    pub sequence:     u64,
    pub root:         [u8; 32],
    pub batch_size:   usize,
    pub timestamp:    u64,          // Unix micros
    pub forced_count: usize,        // requests from delayed inbox
    pub da_record:    Option<DaRecord>,
}
```

### Forced Inclusion (Delayed Inbox)

Vela implements the Arbitrum delayed-inbox pattern for censorship resistance. Any user can submit a `ForcedEntry` directly to the committer (bypassing the API handler's sequencing). The entry sits in `DelayedInbox` until it has been waiting longer than `forced_inclusion_timeout`. At that point, the committer must prepend it to the next batch — it cannot be excluded.

```rust
pub struct ForcedEntry {
    pub request:      Request,
    pub from:         UserId,
    pub submitted_at: SystemTime,
}
```

The ordering guarantee: forced transactions always appear before normal transactions in the same batch. This mirrors the Arbitrum invariant that a sequencer cannot indefinitely delay forced transactions.

### Data Availability

The `DataAvailabilityClient` trait:

```rust
pub trait DataAvailabilityClient: Send + Sync {
    fn submit(&self, sequence: u64, data: &[u8]) -> anyhow::Result<DaReceipt>;
    fn name(&self) -> &'static str;
}
```

Implementations:
- `LocalDaClient` — writes `da_batch_{sequence:016}.bin` to a directory on disk
- `MockDaClient` — in-memory store with optional failure injection (for tests)

`DaReceipt` contains a `content_hash: [u8; 32]` (keccak256 of the submitted data) and a `sequence: u64`. DA failures never block commits — they are logged at `warn!` level and the `CommitResult` carries `da_record: None`.

---

## 4. API Server (`api` crate)

The API server is an Axum application with a single shared `AppState`:

```rust
pub struct AppState {
    pub engine: Mutex<MatchingEngine>,
    pub feeds:  Mutex<FeedManager>,
}
```

The `MatchingEngine` mutex is the only source of serialization in the system. All matching is single-threaded. ECDSA verification is offloaded to `tokio::task::spawn_blocking` before acquiring the engine lock, so signature work never stalls matching.

### HTTP Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness probe, returns `"ok"` |
| GET | `/markets` | None | All markets with best bid/ask/spread |
| GET | `/markets/:market/book` | None | Order book depth (50 levels each side) |
| GET | `/account/:address/balances` | None | User balances (available / locked / total) |
| GET | `/account/:address/orders` | None | User's open orders |
| POST | `/orders` | ECDSA | Submit order |
| POST | `/orders/cancel` | ECDSA | Cancel order |
| POST | `/withdrawals` | ECDSA | Initiate withdrawal |
| GET | `/ws` | None | WebSocket upgrade |

### Feed Architecture

`FeedManager` maintains two broadcast channel trees:

```
public_tx  →  broadcast::Sender<WsServerMessage>   (capacity 1024)
              ├── subscriber 1
              ├── subscriber 2
              └── ...

private_txs → HashMap<[u8; 20], broadcast::Sender<WsServerMessage>>
              ├── 0xABCD... → broadcast::Sender (capacity 1024)
              │               └── subscriber (WebSocket connection)
              └── 0x1234... → broadcast::Sender
```

Public events (trades, book updates) go to `public_tx`. Private events (fills, order updates, balance changes) go to the per-user sender. A WebSocket connection subscribes to the private channel only after completing the challenge/response authentication.

---

## 5. Optimistic-ZK Layer (`zkvm` crate)

### State Transition Verification

```rust
pub fn verify_execution(input: ZkvmInput) -> anyhow::Result<ZkvmOutput>
```

`ZkvmInput` carries the pre-batch MPT snapshot and the list of requests. `verify_execution` reconstructs engine state from the snapshot (decoding `StateKey` for each entry), processes every request in sequence, commits balances and metadata to a fresh `MptStore`, and returns the post-batch root plus per-request responses.

If the claimed post-batch root in a `CommittedBatch` does not match the root produced by `verify_execution`, the batch is marked `Disputed`.

### OptimisticProver

```rust
pub struct OptimisticProver {
    batches:          HashMap<u64, CommittedBatch>,
    challenge_window: Duration,  // 7 days = 604,800 s
}
```

Lifecycle of a committed batch:

```
submit_batch()
      │
      ▼
  InChallengeWindow  (7 days)
      │
      ├── check_challenge_window() → ChallengeStatus::Open { deadline }
      │
      ├── request_fast_finality_proof()
      │     ├── root matches → FastFinality { proven_root }
      │     └── root differs → Disputed { claimed_root, correct_root }
      │
      └── after 7 days → ChallengeStatus::Expired (implicitly finalized)
```

`proof_status(sequence) -> Option<&ProofStatus>` is the primary query interface for downstream systems deciding whether a withdrawal is safe to finalize on L1.

---

## VEL-20 Profiling Findings

### Methodology

Analytical component decomposition from source inspection, cross-referenced against Criterion latency-percentile measurements (`iter_custom` with raw `Instant` timing per operation). Platform: macOS, Apple M-series, single-threaded, release build (`-C opt-level=3`).

### Hot-Path Component Breakdown (post_order, pre-optimization baseline ~1.26 µs)

| Component | Estimated cost | % of hot path |
|---|---|---|
| HashMap lookups (market config, order book) | ~100 ns | 8% |
| `get_metadata` — overlay miss + `UserMetadata` clone | ~80 ns | 6% |
| `NonceWindow::accept` — `BTreeSet` insert/evict | ~30 ns | 2% |
| `get_balance` — overlay miss + `Balance` clone | ~50 ns | 4% |
| `lock_available` (get + set with 2× `Balance` clone) | ~170 ns | **14%** |
| `set_metadata` (2× `UserMetadata` clone) | ~200 ns | **16%** |
| `record_insert` — `Order` + `MarketId` clone | ~100 ns | 8% |
| `CowCache::commit()` — full delta log replay | ~120 ns | 10% |
| Response `Vec` + misc | ~130 ns | 10% |
| **Total estimated** | **~980 ns** | **78%** |

The remaining ~22% is OS jitter, branch misprediction, and cache misses not easily isolated analytically.

### Optimization: Delta Elimination

`set_balance()` and `set_metadata()` each cloned their argument twice — once into the `Delta` log and once into the overlay map — and `commit()` replayed the log, doing a third apply. Removing `Delta::BalanceSet` and `Delta::MetadataSet` and draining overlays via `extend()` eliminates ~2 `Balance` clones and ~1 `UserMetadata` clone per `PostOrder`.

**Measured improvement:** −12% mean latency on `post_order`, −6% on `full_loop`, −2.5% on `cancel_order`. All four Criterion groups reported "Performance has improved."

### Remaining Bottlenecks

1. **`get_balance` / `get_metadata` always clone** — returning `&Balance` requires threading lifetimes through the engine, a meaningful but invasive refactor.
2. **`OrderBook::matchable_asks/bids` clones all resting orders** — a borrow-based cursor would eliminate the allocation on the taker path.
3. **`OrderBook::remove_order` is O(k)** — linear scan in `VecDeque` per price level. Slab pool + index would make it O(1).
4. **`NonceWindow` uses `BTreeSet<u64>`** — pointer-heavy. A fixed-size ring buffer of u64 (20 slots) would be fully cache-local.
5. **p99.9 tail (~4 µs)** — driven by HashMap rehash and OS preemption. Pre-sizing maps at startup would eliminate rehash spikes.
