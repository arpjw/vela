# Vela

**A high-performance, verifiable spot exchange engine.**

CEX performance. DEX integrity. Open by default.

Built by [Monolith Systematic LLC](https://monolithsystematic.com).

---

## Performance

Benchmarked on Apple M2 Pro (single instance, all in-memory):

| Operation | Median Latency | Throughput |
|---|---|---|
| Post order | 6.75 μs | — |
| Cancel order | 7.81 μs | — |
| Full loop | 7.92 μs | **125,000 orders/sec** |

---

## What Vela Is

Vela is an off-chain Rust matching engine that achieves CEX-grade throughput while remaining verifiable through zero-knowledge proofs. Exchange state is maintained in a Merkle Patricia Trie (MPT) whose root is periodically anchored to an underlying blockchain. All inputs are published to a public data availability layer so anyone can independently verify execution.

Key properties:
- **High throughput** — 125k+ orders/sec, ~8μs median loop latency
- **Verifiable** — optimistic-ZK proving with a 7-day challenge window and on-demand fast-finality proofs
- **Self-custodial** — funds held in an L1 smart contract; users maintain key control
- **Censorship resistant** — forced inclusion via delayed inbox (same model as Arbitrum)
- **CEX-compatible API** — HTTP/WS interface, no RPC nodes or gas fees for market makers

---

## Novel Features

### Market-Maker Credit System
The first credit system natively implemented in a spot DEX. Market makers can quote beyond their deposited amount up to a configurable credit ratio, reusing collateral across markets. If a fill breaches the ratio, the engine auto-cancels open orders atomically. Assets are always 1:1 backed.

### Private L3 Feeds
L3 data (per-user order updates and fills) is streamed only to the owning address, authenticated via wallet signature. This eliminates DEX front-running and adverse selection that widens maker spreads — a feature standard at CEXs but not previously available in DEXs.

---

## Architecture

Five components run in parallel threads on a single instance:

```
Clients
  │
  ▼
API Handler          ← parallel ECDSA verification, HTTP/WS, feed routing
  │
  ▼
Matching Engine      ← state machine, STF, price-time priority, all in-memory
  │
  ├─────────────────► Committer     ← batched MPT commits, disk persistence, zkVM submission
  │
  ▼
Responses → Clients

Committer
  │
  ├── MPT State Layer ← in-memory cache, dirty-node tracking, root hash
  ├── Disk            ← snapshot persistence for fault tolerance
  └── zkVM            ← re-executes STF, outputs new MPT root + balance deltas
                            │
                            └── Blockchain ← MPT root anchored to consensus
                            └── DA Layer   ← inputs posted publicly
```

### Workspace Crates

| Crate | Role |
|---|---|
| `types` | Shared types — `Order`, `Request`, `Response`, `NonceWindow`, etc. |
| `engine` | Matching engine — STF, `OrderBook`, `CowCache`, `CreditSystem` |
| `state` | MPT state layer — `MptStore`, `StateCache` |
| `api` | HTTP/WS handler — signature verification, feed management |
| `committer` | Batch commits, disk persistence, zkVM submission |
| `zkvm` | STF re-execution for verifiability |
| `benches` | Criterion benchmark suite |

---

## Key Optimizations

**Trie caching** — All state loaded into memory at startup. Zero trie traversal in hot path. This single change reduced median loop time from ~30μs to ~5μs.

**CoW delta buffer** — Orders processed through a copy-on-write cache. On validity, only the delta buffer (not the full modified state) is replayed against engine memory. Commit time: ~2μs.

**Batched inter-thread sends** — Responses batched before crossing thread boundaries. Amortized channel overhead: negligible. Added latency at batch=50: ~400μs (acceptable given cloud RTT).

**Parallel ECDSA** — Signature verification (50–150μs) delegated to API handler thread pool. Matching engine hot path is crypto-free.

---

## Getting Started

```bash
# Clone
git clone https://github.com/arpjw/vela
cd vela

# Build
cargo build --workspace

# Test
cargo test --workspace

# Benchmark
cargo bench -p benches
```

Requires: Rust stable (≥ 1.75).

---

## Technical Paper

The full architecture and design rationale are documented in the Vela white paper, published under Monolith Research on SSRN.

---

## Roadmap

- [x] Core matching engine (price-time priority, GTC/IOC/FOK/Post-Only)
- [x] MPT state layer with in-memory caching
- [x] CoW delta buffer, batched sends, parallel ECDSA
- [x] Market-maker credit system
- [x] Private L3 feed authentication
- [ ] Full match execution (VEL-6 in progress)
- [ ] Purpose-built MPT (BTree API per price level)
- [ ] Optimistic-ZK proving integration
- [ ] DA layer integration (Celestia / EigenDA)
- [ ] Forced inclusion mechanism
- [ ] Frontend (Vela UI)

---

## License

MIT. See [LICENSE](LICENSE).

Built by [Arya Somu](https://arpjw.github.io) / [Monolith Systematic LLC](https://monolithsystematic.com).
