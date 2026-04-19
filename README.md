# Vela Exchange

A high-performance verifiable spot DEX built by [Monolith Systematic LLC](https://monolithsystematic.com).

**Live:** [vela.monolithsystematic.com](https://vela.monolithsystematic.com) · **Docs:** [monolithsystematicllc.mintlify.app](https://monolithsystematicllc.mintlify.app) · **White Paper:** [SSRN 6579199](https://ssrn.com/abstract=6579199)

---

## Overview

Vela is a central limit order book (CLOB) spot exchange that combines the speed of a centralized exchange with the verifiability of a blockchain system. Every order is cryptographically signed by the user's wallet, every match is deterministic and auditable, and every batch of state transitions is provable via optimistic-ZK fraud proofs. User funds are held in a smart contract on Ethereum — not in a database controlled by the operator.

Most exchanges ask you to trust them. Vela is designed so you don't have to.

---

## Performance

| Metric | Value |
|--------|-------|
| Match latency (p50) | 1.08 μs |
| Operations per second | 57,300 |
| vs. Pulse (leading open-source DEX engine) | 4.7× faster |
| Test suite | 73/73 passing |

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
| Live trade feed | Every fill, every counterparty, no anonymization, in real time |
| Proof of reserves | Contract ETH vs. engine credited balances, verified every 60 seconds |
| Order audit trail | Every order's full lifecycle, wallet signature, and fill history |
| Operator disclosure | Named operator, signed commitments, exact powers and limits |
| Batch explorer | Every batch of trades with keccak256 state roots |
| Fraud proof interface | Download any state root, verify any batch, submit challenges |

All of this is live at [vela.monolithsystematic.com/transparency](https://vela.monolithsystematic.com/transparency).

---

## Smart Contract

**VelaSettlement.sol** deployed to Ethereum Sepolia
Address:   0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686
Network:   Ethereum Sepolia (chainId: 11155111)
Etherscan: https://sepolia.etherscan.io/address/0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686

| Function | Description |
|----------|-------------|
| `depositETH()` | Locks ETH in the contract — not held by the operator |
| `withdraw(asset, amount, nonce, sig)` | Operator-signed withdrawal, verified on-chain |
| `initiateEmergencyExit(asset)` | User-triggered 7-day timelock, no operator required |
| `executeEmergencyExit(asset)` | Reclaim funds directly after timelock expires |

The operator can sign withdrawals. The operator cannot steal funds.

---

## Markets

11 spot markets, all vs. USDC:

`BTC-USDC` `ETH-USDC` `SOL-USDC` `AVAX-USDC` `LINK-USDC` `UNI-USDC` `ARB-USDC` `OP-USDC` `AAVE-USDC` `MATIC-USDC` `DOGE-USDC`

Order books are maintained by an internal market maker bot that pulls live prices from CoinGecko every 60 seconds and places 10 bid + 10 ask levels per market at 0.05% spread around mid.

---

## API

Base URL: `https://vela-engine.fly.dev`

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/markets` | All markets with best bid/ask/spread |
| `GET` | `/orderbook/:pair` | Full order book |
| `GET` | `/account/:address/balances` | User balances by asset |
| `GET` | `/trades` | All fills, newest first (max 500) |
| `GET` | `/trades/:market_id` | Fills filtered by market |
| `GET` | `/orders/:order_id` | Full order lifecycle with fill history |
| `GET` | `/batches` | Trade batches grouped in 30s windows |
| `GET` | `/batches/:id` | Single batch with full fill objects |
| `GET` | `/state-root` | Current engine state root (keccak256) |
| `POST` | `/orders` | Place a signed limit order |
| `POST` | `/orders/cancel` | Cancel a signed order |
| `POST` | `/deposit` | Credit engine balance (trust-based beta) |
| `POST` | `/withdrawals` | Submit a withdrawal request |
| `POST` | `/withdrawal-signature` | Get operator signature for on-chain ETH withdrawal |

### Rate limits

| Endpoint group | Limit |
|----------------|-------|
| POST /orders, /orders/cancel | 20 per minute per wallet |
| POST /deposit, /withdrawals | 5 per minute per wallet |
| GET endpoints | 100 per minute per IP |

### Order signing

**Order signature message format:**
vela:order:{market_id}:{side}:{price}:{quantity}:{nonce}

**Cancel signature message format:**
vela:cancel:{order_id}:{client_order_id}:{nonce}

Sign via MetaMask `personal_sign`. Prices and quantities are fixed-point (multiply display value by 1,000,000).

---

## Running Locally

### Engine

```bash
git clone https://github.com/arpjw/vela
cd vela
cargo build --release --bin api
SNAPSHOT_DIR=./data cargo run --release --bin api
```

The engine starts on port 3001 and seeds all 11 markets on startup.

### Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_WS_URL=ws://localhost:3001
npm install
npm run dev
```

### Tests

```bash
cargo test
# 73/73 passing
```

### Contracts

```bash
cd contracts
forge build
forge test
```

---

## Deployment

| Component | Platform | Region |
|-----------|----------|--------|
| Rust engine | fly.io | sjc |
| Frontend | Vercel | global |
| Domain | Cloudflare | — |
| Engine state | fly.io volume (1GB) | sjc |

Engine snapshots full state to `/data/engine_snapshot.json` every 60 seconds. Orders, balances, and fills survive restarts and redeployments.

```bash
flyctl deploy                      # deploy engine
cd frontend && npx vercel --prod   # deploy frontend
```

---

## Repo Structure

```
vela/
├── types/       # Shared types (Order, Fill, Market, Request, Response)
├── engine/      # Matching engine (price-time priority CLOB)
├── state/       # Merkle Patricia Trie state layer
├── api/         # Axum HTTP server + WebSocket + MM bot + snapshot
├── committer/   # Batch commitment layer
├── zkvm/        # Optimistic-ZK proof generation
├── contracts/   # Solidity (VelaSettlement.sol, Foundry)
├── frontend/    # Next.js 14 frontend
└── docs/        # Mintlify documentation
```

---

## Project Status

Currently in **public beta** on Ethereum Sepolia testnet. Do not deposit mainnet funds.

- [x] Rust matching engine (6-crate workspace)
- [x] Wallet-signed orders and cancellations
- [x] On-chain ETH deposit and withdrawal (VelaSettlement.sol)
- [x] Live market maker bot (CoinGecko price feeds)
- [x] Persistent engine state (60s snapshots)
- [x] Rate limiting and input validation
- [x] Real-time public trade feed
- [x] Proof of reserves dashboard
- [x] Order audit trail
- [x] Operator disclosure
- [x] Batch explorer with keccak256 state roots
- [x] Fraud proof submission interface
- [x] Mobile responsive (terminal gated at <1024px)
- [ ] ERC20 on-chain deposits
- [ ] Candlestick chart from real trade history
- [ ] Mainnet deployment

---

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Monolith Systematic LLC](https://monolithsystematic.com) · San Francisco, 2026
