# Vela Exchange

A high-performance verifiable spot DEX built by [Monolith Systematic LLC](https://monolithsystematic.com).

**Live:** [vela.monolithsystematic.com](https://vela.monolithsystematic.com) · **Docs:** [monolithsystematicllc.mintlify.app](https://monolithsystematicllc.mintlify.app) · **White Paper:** [SSRN 6579199](https://ssrn.com/abstract=6579199)

---

## Overview

Vela is a central limit order book (CLOB) spot exchange that combines 
the speed of a centralized exchange with the verifiability of a 
blockchain system. Every order is cryptographically signed by the 
user's wallet, every match is deterministic and auditable, and every 
batch of state transitions is provable via optimistic-ZK fraud proofs. 
User funds are held in a smart contract on Ethereum — not in a database 
controlled by the operator.

Most exchanges ask you to trust them. Vela is designed so you don't 
have to.

---

## Performance

Benchmarked on Apple M3. Methodology matches Pulse's published benchmark:
10 markets at capacity, 50 market makers, 1 taker, 98% cancel/2% fill.

| Metric | Vela (M3) | Pulse (M2 Pro) |
|--------|-----------|----------------|
| Full loop latency (p50) | **1.38 μs** | 7.92 μs |
| Throughput | **725,000 ops/sec** | 125,000 ops/sec |
| FOK rollback (CoW) | **841 ns** | N/A |
| Fee calculation overhead | **~0.2 μs** | N/A |
| vs. Pulse | **5.8× faster** | baseline |

---

## Architecture
```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
│         vela.monolithsystematic.com         │
└────────────────────┬────────────────────────┘
                     │ HTTP / WebSocket
┌────────────────────▼────────────────────────┐
│           Rust Matching Engine              │
│         vela-engine.fly.dev                 │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  engine  │ │  state   │ │    api     │  │
│  └──────────┘ └──────────┘ └────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  types   │ │ committer│ │   zkvm     │  │
│  └──────────┘ └──────────┘ └────────────┘  │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│        VelaSettlement.sol (Solidity)        │
│  0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686 │
│              Ethereum Sepolia               │
└─────────────────────────────────────────────┘
```

**Stack:** Rust · Solidity/Foundry · Next.js 14 · TypeScript · Tailwind · fly.io · Vercel

---

## Transparency

Vela publishes what no other exchange has published at launch:

| Feature | Description |
|---------|-------------|
| Live trade feed | Every fill, every counterparty, no anonymization, real time |
| Proof of reserves | Contract ETH vs. engine credited balances, verified every 60s |
| Order audit trail | Every order's full lifecycle, wallet signature, and fill history |
| Operator disclosure | Named operator, signed commitments, exact powers and limits |
| Batch explorer | Every batch with keccak256 state roots, verifiable by anyone |
| Fraud proof interface | Download any state root, verify any batch, submit challenges |

All live at [vela.monolithsystematic.com/transparency](https://vela.monolithsystematic.com/transparency).

---

## Engine Features (v0.2.0)

**Order types:** GTC · Post-Only · IOC · FOK

**Market maker infrastructure:**
- Credit system: quote beyond deposited amount (first in DEX history)
- HFT nonce scheme: rolling 20-window, 20 concurrent in-flight orders
- Client order IDs: assign and cancel by your own identifiers
- Auto-cancel on credit breach: oldest orders cancelled to make room
- Configurable maker/taker fees: -1 bps maker rebate, 5 bps taker

**Atomicity:**
- Copy-on-Write delta buffer: failed FOK/IOC rolls back with zero state corruption
- All mutations through DeltaBuffer — atomic across the full order lifecycle

**Data layer:**
- Depth-32 sparse Merkle tree with O(dirty×32) root recompute
- DA layer: all fills posted async, content-addressed, retrievable
- Forced inclusion: /force-include endpoint + DelayedInbox

**Real-time feeds:**
- WebSocket: orderbook:{market}, trades:{market}, markets, account:{address}
- Private L3 feeds: authenticated account channel (personal_sign)
- Sequence numbers per channel for gap detection and reconnection

**Transparency:**
- Real OHLCV from trade history (GET /ohlcv/:market_id)
- Batch state roots (keccak256 of all fill IDs per 30s window)
- Referral program: 20% of taker fees to referrers for 90 days

---

## Smart Contract

**VelaSettlement.sol** deployed to Ethereum Sepolia
```
Address:   0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686
Network:   Ethereum Sepolia (chainId: 11155111)
Etherscan: https://sepolia.etherscan.io/address/0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686
```

| Function | Description |
|----------|-------------|
| `depositETH()` | Locks ETH — not held by operator |
| `depositToken(asset, amount)` | Locks ERC20 (USDC two-step: approve → deposit) |
| `withdraw(asset, amount, nonce, sig)` | Operator-signed, verified on-chain |
| `initiateEmergencyExit(asset)` | User-triggered 7-day timelock |
| `executeEmergencyExit(asset)` | Reclaim funds after timelock, no operator needed |

The operator can sign withdrawals. The operator cannot steal funds.

---

## Markets

16 spot markets, all vs. USDC:

`BTC` `ETH` `SOL` `AVAX` `LINK` `UNI` `ARB` `OP` `AAVE` `MATIC` `DOGE` `PEPE` `WIF` `JUP` `PENDLE` `EIGEN`

Order books maintained by an internal MM bot: CoinGecko prices every 60s, 
10 bid + 10 ask levels per market at 0.05% spread.

---

## API

Base URL: `https://vela-engine.fly.dev`

### Orders

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Place a signed order |
| `POST` | `/orders/cancel` | Cancel by order ID or client order ID |
| `GET` | `/account/:address/orders/by-client-id/:id` | Look up by client ID |

### Market data

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/markets` | All markets with best bid/ask/spread |
| `GET` | `/orderbook/:pair` | Full order book |
| `GET` | `/ohlcv/:market_id` | OHLCV candles from real trade history |
| `GET` | `/trades` | All fills, newest first (max 500) |
| `GET` | `/trades/:market_id` | Fills filtered by market |

### Account

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/account/:address/balances` | User balances by asset |
| `POST` | `/deposit` | Credit engine balance |
| `POST` | `/withdrawals` | Submit withdrawal request |
| `POST` | `/withdrawal-signature` | Get operator signature for on-chain withdrawal |

### Transparency

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/orders/:order_id` | Full order lifecycle with fill history |
| `GET` | `/batches` | Trade batches with keccak256 state roots |
| `GET` | `/batches/:id` | Single batch with full fill objects |
| `GET` | `/state-root` | Current engine state root |
| `GET` | `/orders/:id/da-proof` | DA content hash for order |

### Referrals

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/referral/register` | Register a referrer |
| `GET` | `/referral/:address` | Referral stats and earnings |
| `GET` | `/leaderboard` | Top traders by volume + top referrers |

### WebSocket

`wss://vela-engine.fly.dev/ws`

Channels: `orderbook:{market_id}` · `trades:{market_id}` · `markets` · `account:{address}`

### Rate limits

| Endpoint group | Limit |
|----------------|-------|
| POST /orders, /orders/cancel | 20/min per wallet |
| POST /deposit, /withdrawals | 5/min per wallet |
| GET endpoints | 100/min per IP |

### Order signing
```
vela:order:{market_id}:{side}:{price}:{quantity}:{nonce}
vela:order:{market_id}:{side}:{price}:{quantity}:{nonce}:{client_order_id}
vela:cancel:{order_id}:{client_order_id}:{nonce}
```

Sign via MetaMask `personal_sign`. Prices/quantities in fixed-point (×1,000,000).

---

## Running Locally

### Engine

```bash
git clone https://github.com/arpjw/vela
cd vela
cargo build --release --bin api
SNAPSHOT_DIR=./data cargo run --release --bin api
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_WS_URL=ws://localhost:3001
npm install && npm run dev
```

### Tests

```bash
cargo test
# 142+ tests passing
```

### Benchmarks

```bash
bash scripts/run_benchmarks.sh
# Criterion HTML report: engine/target/criterion/report/index.html
```

### Contracts

```bash
cd contracts && forge build && forge test
```

---

## Deployment

| Component | Platform | Region |
|-----------|----------|--------|
| Rust engine | fly.io | sjc |
| Frontend | Vercel | global |
| Domain | Cloudflare | — |
| Engine state | fly.io volume (1GB) | sjc |

```bash
flyctl deploy                      # deploy engine
cd frontend && npx vercel --prod   # deploy frontend
```

Engine snapshots to `/data/engine_snapshot.json` every 60s.
All state (orders, balances, fills, referrals) survives redeployment.

---

## Repo Structure

```
vela/
├── types/       # Shared types (Order, Fill, Market, Request, Response)
├── engine/      # Matching engine (CLOB, CoW, HFT nonces, fees)
├── state/       # Depth-32 sparse Merkle tree, delta snapshots
├── api/         # Axum HTTP + WebSocket + MM bot + snapshot + DA
├── committer/   # Batch commitment + forced inclusion
├── zkvm/        # Optimistic-ZK proof generation
├── contracts/   # Solidity (VelaSettlement.sol, Foundry)
├── frontend/    # Next.js 14 frontend
├── docs/        # Mintlify documentation
├── scripts/     # Benchmark runner
└── BENCHMARKS.md
```

---

## Project Status

Currently in **public beta** on Ethereum Sepolia. Do not deposit mainnet funds.

**Phase 1 — Core Exchange**
- [x] Rust matching engine (6-crate workspace)
- [x] Wallet-signed orders and cancellations
- [x] On-chain ETH and ERC20 (USDC) deposit and withdrawal
- [x] Live market maker bot (CoinGecko, 16 markets)
- [x] Persistent engine state (60s snapshots)
- [x] Rate limiting and input validation

**Phase 2 — Production Engine**
- [x] Parallel signature verification (100k+ ops/sec ceiling)
- [x] HFT rolling 20-window nonce scheme
- [x] Client order IDs with cancel-by-client-id
- [x] Copy-on-Write delta buffer (atomic FOK/IOC)
- [x] Batched response sending
- [x] Auto-cancel on credit ratio breach
- [x] Configurable maker/taker fee framework
- [x] DA layer (content-addressed fill storage)
- [x] Depth-32 sparse Merkle tree (SMT)
- [x] Forced inclusion / delayed inbox

**Phase 3 — Mainnet Readiness**
- [x] ERC20 on-chain deposits (USDC two-step approve/deposit)
- [x] Real OHLCV from trade history with LIVE/SIMULATED badge
- [x] Full WebSocket real-time feeds (orderbook, trades, account)
- [x] Market maker API guide (~850 lines, published to Mintlify)
- [x] Comprehensive benchmark suite (8 criterion benchmarks)
- [x] 16 spot markets (added PEPE, WIF, JUP, PENDLE, EIGEN)
- [x] Referral program (20% taker fee split, 90 days)
- [x] Trading leaderboard (/leaderboard)
- [ ] Smart contract security audit
- [ ] Mainnet deployment

---

## Changelog

### v0.2.0 (April 2026)
Phase 2 + Phase 3 complete. Full production engine with HFT nonces, 
CoW semantics, fee framework, WebSocket feeds, real OHLCV, ERC20 
deposits, 16 markets, referral program, and benchmark suite.

### v0.1.0 (April 2026)
Initial public beta. Core exchange, transparency layer, on-chain 
ETH settlement, 11 markets, MM bot, Mintlify docs, white paper.

---

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Monolith Systematic LLC](https://monolithsystematic.com) · San Francisco, 2026
