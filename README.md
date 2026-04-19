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
| vs. Pulse (leading open-source DEX) | 4.7× faster |
| Test coverage | 73/73 passing |

---

## Architecture
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
│         vela.monolithsystematic.com         │
└────────────────────┬────────────────────────┘
│ HTTP / WebSocket
┌────────────────────▼────────────────────────┐
│           Rust Matching Engine              │
│         vela-engine.fly.dev                 │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │  engine  │ │  state   │ │    api     │   │
│  └──────────┘ └──────────┘ └────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │  types   │ │ committer│ │   zkvm     │   │
│  └──────────┘ └──────────┘ └────────────┘   │
└────────────────────┬────────────────────────┘
│
┌────────────────────▼────────────────────────┐
│        VelaSettlement.sol (Solidity)        │
│   0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686│
│              Ethereum Sepolia               │
└─────────────────────────────────────────────┘

**Stack:** Rust · Solidity/Foundry · Next.js 14 · TypeScript · Tailwind · fly.io · Vercel

---

## Transparency

Vela publishes what no other exchange has published at launch:

- **Live trade feed** — every fill, every counterparty, no anonymization, in real time
- **Proof of reserves** — contract ETH vs. engine credited balances, verified every 60 seconds
- **Order audit trail** — every order's full lifecycle, wallet signature, and fill history
- **Operator disclosure** — named operator, signed commitments, exact powers and limits
- **Batch explorer** — every batch of trades with keccak256 state roots
- **Fraud proof interface** — download any state root, verify any batch, submit challenges

All of this is live at [vela.monolithsystematic.com/transparency](https://vela.monolithsystematic.com/transparency).

---

## Smart Contract

**VelaSettlement.sol** — deployed to Ethereum Sepolia
Address:  0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686
Network:  Ethereum Sepolia (chainId: 11155111)

Key properties:
- `depositETH()` — locks ETH in the contract, not held by the operator
- `withdraw()` — operator-signed withdrawal, verified on-chain
- `initiateEmergencyExit()` — user-triggered 7-day timelock, no operator required
- `executeEmergencyExit()` — reclaim funds directly after timelock expires

The operator can sign withdrawals. The operator cannot steal funds.

---

## Markets

11 spot markets, all vs. USDC:

`BTC` `ETH` `SOL` `AVAX` `LINK` `UNI` `ARB` `OP` `AAVE` `MATIC` `DOGE`

Order books are maintained by a live market maker bot that pulls prices from CoinGecko every 60 seconds and places 10 bid + 10 ask levels per market at 0.05% spread around mid.

---

## API

Base URL: `https://vela-engine.fly.dev`

| Endpoint | Description |
|----------|-------------|
| `GET /markets` | All markets with best bid/ask |
| `GET /orderbook/:pair` | Full order book |
| `GET /account/:address/balances` | User balances |
| `POST /orders` | Place a signed order |
| `POST /orders/cancel` | Cancel a signed order |
| `POST /deposit` | Credit engine balance |
| `POST /withdrawals` | Submit withdrawal request |
| `POST /withdrawal-signature` | Get operator signature for on-chain withdrawal |
| `GET /trades` | All fills, newest first |
| `GET /trades/:market_id` | Fills filtered by market |
| `GET /orders/:order_id` | Full order lifecycle |
| `GET /batches` | Trade batches with state roots |
| `GET /state-root` | Current engine state root |

**Rate limits:** 20 orders/min, 5 deposits/min per wallet.

**Order signing:**
vela:order:{market_id}:{side}:{price}:{quantity}:{nonce}
Sign via MetaMask `personal_sign`.

---

## Running Locally

**Engine:**
```bash
git clone https://github.com/arpjw/vela
cd vela
cargo build --release --bin api
cargo run --release --bin api
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev
```

**Tests:**
```bash
cargo test
```

---

## Deployment

| Service | Platform |
|---------|----------|
| Rust engine | fly.io (sjc region) |
| Frontend | Vercel |
| Domain | Cloudflare |
| State | fly.io persistent volume (1GB) |

Engine snapshots state to `/data/engine_snapshot.json` every 60 seconds. State is restored on restart — orders and balances survive redeployment.

---

## Status

Currently in **public beta** on Ethereum Sepolia testnet. Do not deposit mainnet funds.

- [x] Matching engine (Rust, 6-crate workspace)
- [x] Wallet-signed orders and cancellations
- [x] On-chain ETH deposit and withdrawal
- [x] Live market maker bot (CoinGecko)
- [x] Persistent engine state
- [x] Transparency layer
- [x] Operator disclosure
- [ ] ERC20 on-chain deposits
- [ ] Mainnet deployment

---

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Monolith Systematic LLC](https://monolithsystematic.com) · San Francisco, 2026
