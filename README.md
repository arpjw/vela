# Vela

**A high-performance, verifiable spot exchange engine.**

CEX performance. DEX integrity. Open by default.

Built by [Monolith Systematic LLC](https://monolithsystematic.com).

---

## Performance

Benchmarked on Apple M-series (single instance, all in-memory, realistic MM workload — 10 markets, 50 MMs, 98:2 cancel/fill ratio):

| Benchmark | p50 | p99 | p99.9 | Criterion mean |
|---|---|---|---|---|
| Post order (resting GTC) | **1.08 µs** | 1.12 µs | 4.00 µs | 1.44 µs |
| Cancel order | **1.08 µs** | 1.08 µs | 3.04 µs | 1.45 µs |
| Full loop (cancel + repost) | **1.08 µs** | 1.08 µs | 1.62 µs | — |
| Sustained throughput | — | — | — | **57.3 K ops/s** |

4.7× faster than Pulse on equivalent workloads. The p99.9 tail at ~4 µs is driven by OS jitter and HashMap rehash; at steady state the distribution is bimodal with the bulk of measurements at 1.08 µs.

Reproduce: `cargo bench -p benches`

---

## What Vela Is

Vela is an off-chain Rust matching engine that delivers CEX-grade latency while remaining independently verifiable through optimistic zero-knowledge proofs. Exchange state is maintained in a Merkle Patricia Trie (MPT) whose root is periodically anchored to an underlying L1. All inputs are published to a public data availability layer so any party can independently re-execute the state transition function (STF) and detect fraud.

**Key properties:**

- **Sub-microsecond hot path** — 1.08 µs p50 on realistic MM workload, crypto-free in the matching core
- **Verifiable** — optimistic-ZK proving with a 7-day challenge window; on-demand fast-finality proofs bypass the window
- **Self-custodial** — funds held in an L1 bridge contract; users retain key control at all times
- **Censorship-resistant** — forced inclusion via delayed inbox (Arbitrum delayed-inbox pattern); any user can force their transaction on-chain after the timeout
- **CEX-compatible API** — standard HTTP/WS interface; no RPC nodes, no gas fees, no wallet pop-ups for market makers

---

## Product Tiers

**Vela Core** (this repository)  
The open-source matching engine, state layer, and API server. Deploy on any cloud instance. Suitable for institutional operators running their own matching infrastructure.

**Vela Cloud** *(coming)*  
Managed hosted deployment with SLA guarantees, geographic redundancy, and operator dashboard. Zero infrastructure overhead for teams that want exchange-grade performance without DevOps.

**Vela Pro** *(coming)*  
Full verifiability stack: on-chain MPT root anchoring, DA layer integration (Celestia / EigenDA), ZK proof generation, and the Vela bridge contract for trustless deposits and withdrawals.

---

## Architecture

Six crates, five responsibilities:

```
                          Clients
                             │
                    ┌────────▼────────┐
                    │   api crate     │  HTTP/WS, parallel ECDSA, feed routing
                    │ (axum, tokio)   │  50–150 µs sig verify offloaded to
                    └────────┬────────┘  spawn_blocking — never touches hot path
                             │ engine.process(Request, ts)
                    ┌────────▼────────┐
                    │ engine crate    │  Matching engine — STF, price-time priority,
                    │ MatchingEngine  │  CowCache, CreditSystem. All in-memory.
                    └──┬──────────┬──┘  1.08 µs p50 per operation
                       │          │
         ┌─────────────▼──┐   ┌──▼──────────────┐
         │  state crate   │   │ committer crate  │  Batched MPT commits, DA upload,
         │ MptStore       │   │ Committer        │  forced-inclusion inbox, 500 ms
         │ StateCache     │   │ CommitResult     │  default batch interval
         └─────────────┬──┘   └──┬───────────────┘
                       │         │
                    ┌──▼─────────▼──┐
                    │  zkvm crate   │  STF re-execution for fraud proofs;
                    │ OptimisticPrv │  7-day challenge window; fast-finality
                    └──────┬────────┘  on-demand via verify_execution()
                           │
              ┌────────────┴──────────────┐
              │          L1               │  MPT root anchored to consensus
              │    + DA layer             │  inputs published for public verification
              └───────────────────────────┘
```

### Workspace Crates

| Crate | Role |
|---|---|
| `types` | Shared types: `Order`, `Request`, `Response`, `NonceWindow`, `FeeConfig` |
| `engine` | Matching STF: `MatchingEngine`, `OrderBook`, `CowCache`, `CreditSystem` |
| `state` | MPT state layer: `MptStore`, `StateCache`, `StateKey` encoding |
| `api` | HTTP/WS server: ECDSA verification, `FeedManager`, `AppState` |
| `committer` | Batch commits: `Committer`, `CommitResult`, `DelayedInbox`, DA client |
| `zkvm` | Verifiability: `OptimisticProver`, `execute_stf`, `verify_execution` |
| `benches` | Criterion benchmark suite |

---

## Novel Features

### Market-Maker Credit System

The first credit system natively implemented in a spot DEX matching engine. Market makers can quote notional beyond their deposited amount up to a configurable `credit_ratio`, reusing collateral across bid levels. When a fill reduces `actual_collateral` below the threshold, the engine atomically cancels open orders — smallest notional first — to restore the invariant. Assets remain 1:1 backed at all times.

See [docs/credit-system.md](docs/credit-system.md) for the full design.

### Private L3 Feeds

Per-user order updates and fill notifications are streamed only to the owning address, authenticated via wallet signature (EIP-191 personal_sign with a server-issued challenge nonce). Unauthenticated connections receive only public market data. This eliminates DEX front-running and adverse selection that widens maker spreads — a feature standard at CEXs, not previously available in DEXs.

---

## Key Optimizations

**CoW delta buffer — eliminating redundant clones** (VEL-20)  
The original `CowCache` pushed `Delta::BalanceSet` / `Delta::MetadataSet` records to a log *and* inserted into overlay HashMaps — two full clones per write. `commit()` then replayed the log, a third redundant apply. The optimization: remove the two delta variants entirely; `commit()` drains the overlays with `extend()` (zero-copy move) and replays only order-book structural deltas. Result: −12% mean latency on post_order.

**In-memory trie caching**  
All state loaded into `HashMap` at startup. Zero trie traversal in the hot path. This single change reduced median loop time from ~30 µs (full trie traversal) to ~5 µs (pre-cache).

**Batched inter-thread dispatch**  
Responses batched before crossing thread boundaries. Amortized channel overhead: negligible.

**Parallel ECDSA**  
Signature verification (50–150 µs each) delegated to `tokio::task::spawn_blocking`. The matching engine hot path is completely crypto-free.

---

## Quickstart

```bash
# Requirements: Rust stable >= 1.75

git clone https://github.com/arpjw/vela
cd vela

# Build all crates
cargo build --workspace

# Run tests
cargo test --workspace

# Run the benchmark suite (outputs p50/p99/p99.9 to stdout)
cargo bench -p benches
```

---

## Documentation

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Deep dive on each component, the STF, CoW cache, committer pipeline, and optimistic-ZK design |
| [docs/api.md](docs/api.md) | Full HTTP endpoint reference, WebSocket message protocol, and signing message formats |
| [docs/credit-system.md](docs/credit-system.md) | MM credit system design, credit ratio math, auto-cancel logic, and the asset-backing invariant |

**Technical paper:** Vela white paper — Monolith Research, SSRN (link forthcoming).

---

## Roadmap

- [x] Core matching engine (price-time priority, GTC / IOC / FOK / Post-Only)
- [x] MPT state layer with in-memory caching
- [x] CoW delta buffer (VEL-20: delta elimination, −12% latency)
- [x] Batched sends, parallel ECDSA
- [x] Market-maker credit system with auto-cancel
- [x] Private L3 feed authentication (server nonce challenge)
- [x] Optimistic-ZK proving with 7-day challenge window
- [x] DA layer integration (local + mock clients)
- [x] Forced inclusion via delayed inbox
- [x] Benchmarking pipeline (57.3 K ops/s, p50 = 1.08 µs)
- [ ] Purpose-built MPT (B-tree per price level, O(1) cancel)
- [ ] On-chain MPT root anchoring
- [ ] Celestia / EigenDA production DA client
- [ ] Vela bridge contract (L1 deposit / withdrawal)
- [ ] Frontend (Vela UI)

---

## License

MIT. See [LICENSE](LICENSE).

Built by [Arya Somu](https://arpjw.github.io) / [Monolith Systematic LLC](https://monolithsystematic.com).
