# Vela Exchange

A high-performance verifiable spot DEX built by Monolith Systematic LLC.

**Live:** https://vela.monolithsystematic.com  
**White Paper:** https://ssrn.com/abstract=6579199 (Monolith Research Vol. 2)  
**License:** MIT

---

## Benchmarks

| Metric | Result |
|---|---|
| Match latency (p50) | 1.08 μs |
| Throughput | 57.3k ops/sec |
| vs. Pulse baseline | 4.7× faster |
| p99.9 tail latency reduction | −73% (delta elimination) |
| Tests passing | 73/73 |

Benchmarked on Apple Silicon M2, release build, realistic MM workload (98% cancel / 2% fill, 10 markets, 5 MMs).

---

## Architecture

Vela is a six-crate Rust workspace:

```
types      — shared types, fixed-point arithmetic, wire protocol
engine     — matching engine, order book, credit system, CoW cache
state      — MPT state layer, in-memory caching, deterministic root
api        — HTTP/WS handler, ECDSA auth, feed manager
committer  — async batch committer, DA layer integration
zkvm       — optimistic-ZK prover, fraud proof verification
```

```
                ┌─────────────────┐
 HTTP/WS        │   api handler   │
────────────────▶│  ECDSA auth     │
                │  feed manager   │
                └────────┬────────┘
                         │ Request
                ┌────────▼────────┐
                │ matching engine  │
                │  CoW cache       │
                │  credit system   │
                └────────┬────────┘
                         │ CommitBatch
                ┌────────▼────────┐
                │   committer     │
                │   MPT state     │
                │   DA layer      │
                └────────┬────────┘
                         │ ZkvmInput
                ┌────────▼────────┐
                │     zkvm        │
                │ fraud proofs    │
                └─────────────────┘
```

---

## Key Features

**MM Credit System** — Market makers quote up to N× their deposited collateral across markets. Credit ratio is configurable per user. Auto-cancel fires atomically when a fill would breach the ratio.

**Private L3 Feed Authentication** — Wallet owners receive private fill/order streams. Authentication uses a challenge-response protocol: server issues a nonce, client signs with personal_sign, server recovers the address. Replay-resistant.

**Optimistic-ZK Proving** — Every batch is provable. The zkvm crate seeds the matching engine from a snapshot and re-executes all requests, producing a fraud proof if outputs diverge.

**Forced Inclusion** — A DelayedInbox queue ensures operator cannot censor transactions. After a timeout, forced entries are included regardless of operator action.

**CoW Cache with Delta Replay** — Orders execute in a copy-on-write cache. On success, only the delta (not a full state copy) is committed. Reduces commit time from ~5μs to ~2μs.

**DA Layer** — CommitResults are published to a configurable DA backend. Local backend writes binary batch files; production backend targets Celestia/EigenDA.

---

## Markets

11 markets live on public beta:

BTC-USDC · ETH-USDC · SOL-USDC · AVAX-USDC · MATIC-USDC · LINK-USDC · UNI-USDC · ARB-USDC · OP-USDC · AAVE-USDC · DOGE-USDC

---

## Frontend

Next.js 14, TypeScript strict, Tailwind CSS.

**Routes:**
- `/` — Live order book composition hero, markets collection, performance stats
- `/markets/[pair]` — Order book, depth chart, order entry, trade feed
- `/dashboard` — MM credit gauge, open orders, P&L tracker
- `/analytics` — Spread chart, OFI bar, depth visualization, VWAS
- `/history` — Private fill history, CSV export, public trade feed

**Design:** Crimson and blush on white. Art gallery aesthetic — the data is the art. Live order book fills the viewport as a full-screen composition on the landing page.

---

## Deployment

| Component | Platform |
|---|---|
| Rust engine | fly.io (sjc region) |
| Next.js frontend | Vercel |
| Domain | vela.monolithsystematic.com (Cloudflare) |

---

## Getting Started

```bash
# Clone
git clone https://github.com/arpjw/vela
cd vela

# Build engine
cargo build --release --bin api

# Run locally
PORT=3001 ./target/release/api

# Frontend
cd frontend
npm install
npm run dev
```

Engine runs on `localhost:3001`. Set `NEXT_PUBLIC_API_URL=http://localhost:3001` and `NEXT_PUBLIC_WS_URL=ws://localhost:3001` in `frontend/.env.local`.

---

## Research

Built under **Monolith Systematic LLC** as part of the Monolith Research publication series.

White paper: *Vela Exchange: A High-Performance Verifiable Spot DEX* (Monolith Research Vol. 2) — https://ssrn.com/abstract=6579199

---

## License

MIT — see LICENSE.
