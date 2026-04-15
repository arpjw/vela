'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { listMarkets, type MarketResponse } from '@/lib/api'
import { fetchLivePrices, type LivePrices } from '@/lib/prices'
import { getWsClient, type WsServerMessage } from '@/lib/ws'
import { Button } from '@/components/ui/Button'

const EASE = [0.25, 0.1, 0.25, 1] as const
const LEVELS = 15

interface BookRow {
  price: string
  quantity: string
}

interface OrderBook {
  bids: BookRow[]
  asks: BookRow[]
}

const MOCK_BIDS: BookRow[] = [
  { price: '42150.00', quantity: '2.4500' },
  { price: '42103.00', quantity: '0.8200' },
  { price: '42056.00', quantity: '3.1000' },
  { price: '42009.00', quantity: '1.5600' },
  { price: '41962.00', quantity: '4.2300' },
  { price: '41915.00', quantity: '0.3800' },
  { price: '41868.00', quantity: '2.9100' },
  { price: '41821.00', quantity: '1.1400' },
  { price: '41774.00', quantity: '3.7600' },
  { price: '41727.00', quantity: '0.6700' },
  { price: '41680.00', quantity: '2.1800' },
  { price: '41633.00', quantity: '4.5200' },
  { price: '41586.00', quantity: '1.3300' },
  { price: '41539.00', quantity: '0.9100' },
  { price: '41492.00', quantity: '3.4700' },
]

const MOCK_ASKS: BookRow[] = [
  { price: '42200.00', quantity: '1.8300' },
  { price: '42251.00', quantity: '3.2100' },
  { price: '42302.00', quantity: '0.7400' },
  { price: '42353.00', quantity: '2.5600' },
  { price: '42404.00', quantity: '4.1200' },
  { price: '42455.00', quantity: '0.4900' },
  { price: '42506.00', quantity: '1.6800' },
  { price: '42557.00', quantity: '3.9300' },
  { price: '42608.00', quantity: '0.2300' },
  { price: '42659.00', quantity: '2.8700' },
  { price: '42710.00', quantity: '1.4200' },
  { price: '42761.00', quantity: '4.7800' },
  { price: '42812.00', quantity: '0.5600' },
  { price: '42863.00', quantity: '2.1900' },
  { price: '42914.00', quantity: '3.6400' },
]

const MOCK_BOOK: OrderBook = { bids: MOCK_BIDS, asks: MOCK_ASKS }

type FlashDir = 'up' | 'down' | null

function stepBook(book: OrderBook): OrderBook {
  const midShift = Math.random() * 0.0004 - 0.0002

  const bids: BookRow[] = book.bids.map((row, i) => ({
    price: (parseFloat(row.price) * (1 + midShift)).toFixed(2),
    quantity: Math.max(0.01, parseFloat(row.quantity) * (1 + (i % 2 === 0 ? 1 : -1) * Math.random() * 0.1)).toFixed(4),
  }))

  const asks: BookRow[] = book.asks.map((row, i) => ({
    price: (parseFloat(row.price) * (1 + midShift)).toFixed(2),
    quantity: Math.max(0.01, parseFloat(row.quantity) * (1 + (i % 2 === 0 ? 1 : -1) * Math.random() * 0.1)).toFixed(4),
  }))

  const numReplace = Math.random() < 0.5 ? 1 : 2
  for (let r = 0; r < numReplace; r++) {
    if (Math.random() < 0.5 && bids.length > 2) {
      const idx = 1 + Math.floor(Math.random() * (bids.length - 1))
      const base = parseFloat(bids[0].price)
      bids[idx] = {
        price: (base - (idx + Math.random()) * 47).toFixed(2),
        quantity: (0.1 + Math.random() * 4).toFixed(4),
      }
    } else if (asks.length > 2) {
      const idx = 1 + Math.floor(Math.random() * (asks.length - 1))
      const base = parseFloat(asks[0].price)
      asks[idx] = {
        price: (base + (idx + Math.random()) * 51).toFixed(2),
        quantity: (0.1 + Math.random() * 4).toFixed(4),
      }
    }
  }

  return { bids, asks }
}

function tradeBook(book: OrderBook): OrderBook {
  const isBidTrade = Math.random() < 0.5

  if (isBidTrade && book.bids.length > 1) {
    const newBids = book.bids.slice(1)
    const base = parseFloat(newBids[newBids.length - 1].price)
    newBids.push({
      price: (base - 47 - Math.random() * 50).toFixed(2),
      quantity: (0.1 + Math.random() * 2).toFixed(4),
    })
    return { bids: newBids, asks: book.asks }
  } else if (book.asks.length > 1) {
    const newAsks = book.asks.slice(1)
    const base = parseFloat(newAsks[newAsks.length - 1].price)
    newAsks.push({
      price: (base + 51 + Math.random() * 50).toFixed(2),
      quantity: (0.1 + Math.random() * 2).toFixed(4),
    })
    return { bids: book.bids, asks: newAsks }
  }

  return book
}

const HEADLINE: { text: string; color: string }[] = [
  { text: 'Trade with', color: '#1A0608' },
  { text: 'provable', color: '#C41E3A' },
  { text: 'fairness.', color: '#E8829A' },
]

const OVERLAY_STATS: { num: string; label: string; color: string }[] = [
  { num: '1.08 μs', label: 'MATCH LATENCY', color: '#E8829A' },
  { num: '57.3k',   label: 'OPS / SEC',     color: '#C41E3A' },
  { num: '4.7×',    label: 'FASTER THAN PULSE', color: '#6B1525' },
]

const PERF_BLOCKS: { num: string; unit: string; label: string; sub: string; color: string }[] = [
  { num: '1.08', unit: 'μs', label: 'MATCH LATENCY', sub: 'p50, release build, Apple Silicon M2', color: '#E8829A' },
  { num: '57.3k', unit: '', label: 'OPS / SECOND', sub: 'realistic MM workload, 98% cancel/2% fill', color: '#C41E3A' },
  { num: '4.7×', unit: '', label: 'FASTER THAN PULSE', sub: 'the leading open-source DEX engine', color: '#6B1525' },
  { num: '73', unit: '', label: 'TESTS PASSING', sub: 'engine, state, API, committer, zkVM', color: '#D4607A' },
]

const galleryLabel: CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.25em',
  fontSize: '0.65rem',
  color: '#4A1520',
}

function OrderBookViz({ book, flashDir }: { book: OrderBook; flashDir: FlashDir }) {
  const displayBids = useMemo(
    () => [...book.bids].slice(0, LEVELS).reverse(),
    [book.bids],
  )
  const displayAsks = useMemo(
    () => book.asks.slice(0, LEVELS),
    [book.asks],
  )

  const maxBidQty = useMemo(
    () => Math.max(...displayBids.map((b) => parseFloat(b.quantity)), 0.01),
    [displayBids],
  )
  const maxAskQty = useMemo(
    () => Math.max(...displayAsks.map((a) => parseFloat(a.quantity)), 0.01),
    [displayAsks],
  )

  const bestBid = parseFloat(book.bids[0]?.price ?? '0')
  const bestAsk = parseFloat(book.asks[0]?.price ?? '0')
  const mid = (bestBid + bestAsk) / 2
  const spreadBps = mid > 0 ? ((bestAsk - bestBid) / mid * 10000).toFixed(1) : '—'
  const rowH = `${100 / LEVELS}%`

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
      }}
    >
      <div
        style={{
          width: 'calc(50% - 4vw)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {displayBids.map((bid, i) => {
          const pct = (parseFloat(bid.quantity) / maxBidQty) * 100
          return (
            <div
              key={`bid-${i}`}
              style={{
                height: rowH,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(to left, rgba(196,30,58,0.35), rgba(196,30,58,0.0))',
                  transition: 'width 400ms cubic-bezier(0.25,0.1,0.25,1)',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  textAlign: 'right',
                  paddingRight: 10,
                  lineHeight: 1.2,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.65rem,1vw,0.85rem)',
                    color: '#C41E3A',
                    opacity: 0.9,
                  }}
                >
                  {bid.price}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'rgba(196,30,58,0.6)',
                  }}
                >
                  {bid.quantity}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          width: '8vw',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: 1,
            background: 'rgba(26,18,8,0.08)',
            transform: 'translateX(-50%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              background:
                flashDir === 'up'
                  ? '#FF1744'
                  : flashDir === 'down'
                    ? '#F4A0B0'
                    : '#C41E3A',
              transform: 'rotate(45deg)',
              flexShrink: 0,
              transition: 'background 300ms ease',
            }}
          />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: '#4A1520',
              whiteSpace: 'nowrap',
            }}
          >
            {spreadBps} bps
          </div>
        </div>
      </div>

      <div
        style={{
          width: 'calc(50% - 4vw)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {displayAsks.map((ask, i) => {
          const pct = (parseFloat(ask.quantity) / maxAskQty) * 100
          return (
            <div
              key={`ask-${i}`}
              style={{
                height: rowH,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(to right, rgba(232,130,154,0.35), rgba(232,130,154,0.0))',
                  transition: 'width 400ms cubic-bezier(0.25,0.1,0.25,1)',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  textAlign: 'left',
                  paddingLeft: 10,
                  lineHeight: 1.2,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.65rem,1vw,0.85rem)',
                    color: '#E8829A',
                    opacity: 0.9,
                  }}
                >
                  {ask.price}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'rgba(232,130,154,0.6)',
                  }}
                >
                  {ask.quantity}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TextOverlay() {
  let wordIndex = 0
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: '6vw',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ color: '#D4607A', display: 'inline-block' }}
        >
          ●
        </motion.span>
        <span
          style={{
            fontFamily: 'var(--font-inter)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            fontSize: '0.65rem',
            color: '#D4607A',
          }}
        >
          LIVE
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '15vh',
          left: '6vw',
        }}
      >
        {HEADLINE.map((line) => (
          <div key={line.text} style={{ display: 'block', lineHeight: 0.9 }}>
            {line.text.split(' ').map((word) => {
              const delay = 0.5 + wordIndex++ * 0.1
              return (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 0.92, y: 0 }}
                  transition={{ delay, duration: 0.8, ease: EASE }}
                  style={{
                    display: 'inline-block',
                    fontFamily: 'var(--font-inter)',
                    fontWeight: 800,
                    fontSize: 'clamp(3rem,5vw,5rem)',
                    color: line.color,
                    lineHeight: 0.9,
                    marginRight: '0.28em',
                  }}
                >
                  {word}
                </motion.span>
              )
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '15vh',
          right: '6vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 20,
        }}
      >
        {OVERLAY_STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 + i * 0.1, duration: 0.6, ease: EASE }}
            style={{ textAlign: 'right' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: '1.4rem',
                color: stat.color,
                lineHeight: 1,
              }}
            >
              {stat.num}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-inter)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                fontSize: '0.58rem',
                color: '#4A1520',
                marginTop: 3,
              }}
            >
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          bottom: '6vh',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-inter)',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          fontSize: '0.65rem',
          color: '#4A1520',
          whiteSpace: 'nowrap',
        }}
      >
        ↓{'  '}EXPLORE
      </motion.div>
    </div>
  )
}

function MarketRow({ market: m, idx, livePrices }: { market: MarketResponse; idx: number; livePrices: LivePrices }) {
  const [hovered, setHovered] = useState(false)
  const live = livePrices[m.id]

  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.06, duration: 0.5, ease: EASE }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid rgba(26,18,8,0.06)',
        borderLeft: hovered ? '3px solid #C41E3A' : '3px solid transparent',
        background: hovered ? 'rgba(196,30,58,0.04)' : 'transparent',
        transition: 'background 150ms ease, border-left-color 150ms ease',
      }}
    >
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: 'rgba(196,30,58,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#C41E3A',
              flexShrink: 0,
            }}
          >
            {m.base.slice(0, 2)}
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#1A0608',
              }}
            >
              {m.base}/{m.quote}
            </div>
            <div
              style={{
                fontSize: '0.625rem',
                color: '#4A1520',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {m.id}
            </div>
          </div>
        </div>
      </td>
      <td
        style={{
          padding: '14px 16px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          fontSize: '0.875rem',
          color: '#1A0608',
        }}
      >
        {live ? live.price.toLocaleString() : (m.best_bid ?? '—')}
      </td>
      <td
        style={{
          padding: '14px 16px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          color: live
            ? live.change24h > 0
              ? '#6B8C52'
              : live.change24h < 0
                ? '#C41E3A'
                : '#4A1520'
            : '#4A1520',
        }}
      >
        {live
          ? live.change24h > 0
            ? `+${live.change24h.toFixed(2)}%`
            : `${live.change24h.toFixed(2)}%`
          : '—'}
      </td>
      <td
        style={{
          padding: '14px 16px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          fontSize: '0.875rem',
          color: '#C41E3A',
        }}
      >
        {m.best_bid ?? '—'}
      </td>
      <td
        style={{
          padding: '14px 16px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          fontSize: '0.875rem',
          color: '#E8829A',
        }}
      >
        {m.best_ask ?? '—'}
      </td>
      <td
        style={{
          padding: '14px 16px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          color: '#6B1525',
        }}
      >
        {m.spread ?? '—'}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        <Link href={`/markets/${encodeURIComponent(m.id)}`}>
          <button
            type="button"
            style={{
              padding: '4px 16px',
              border: '1px solid rgba(196,30,58,0.4)',
              color: '#C41E3A',
              fontSize: '0.7rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            Trade
          </button>
        </Link>
      </td>
    </motion.tr>
  )
}

function MarketsRoom({ markets, livePrices }: { markets: MarketResponse[]; livePrices: LivePrices }) {
  const COLS = ['Pair', 'Last Price', '24H Change', 'Bid', 'Ask', 'Spread', '']

  return (
    <section style={{ padding: '80px 6vw', background: 'white' }}>
      <div style={galleryLabel}>The Collection</div>
      <div
        style={{
          height: 1,
          background: 'rgba(26,18,8,0.1)',
          marginTop: 8,
          marginBottom: 48,
        }}
      />
      {markets.length === 0 ? (
        <p style={{ color: '#4A1520', fontSize: '0.85rem' }}>
          No markets available.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLS.map((col) => (
                  <th
                    key={col}
                    style={{
                      ...galleryLabel,
                      padding: '0 16px 12px',
                      textAlign:
                        col === 'Pair' || col === '' ? 'left' : 'right',
                      borderBottom: '1px solid rgba(26,18,8,0.1)',
                      fontWeight: 500,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markets.map((m, idx) => (
                <MarketRow key={m.id} market={m} idx={idx} livePrices={livePrices} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PerformanceRoom() {
  return (
    <section style={{ padding: '80px 6vw', background: '#F7F5F0' }}>
      <div style={galleryLabel}>The Numbers</div>
      <div
        style={{
          height: 1,
          background: 'rgba(26,18,8,0.1)',
          marginTop: 8,
          marginBottom: 48,
        }}
      />
      <div style={{ display: 'flex' }}>
        {PERF_BLOCKS.map((block, i) => (
          <motion.div
            key={block.label}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, duration: 0.6, ease: EASE }}
            style={{
              flex: 1,
              padding: '0 48px',
              borderLeft:
                i > 0 ? '1px solid rgba(26,18,8,0.1)' : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 'clamp(3rem,5vw,5rem)',
                color: block.color,
                lineHeight: 1,
              }}
            >
              {block.num}
              {block.unit && (
                <span style={{ fontSize: '60%' }}>{block.unit}</span>
              )}
            </div>
            <div style={{ ...galleryLabel, marginTop: 8 }}>{block.label}</div>
            <div
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: '0.7rem',
                color: '#4A1520',
                marginTop: 6,
              }}
            >
              {block.sub}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function EnterSection({ markets }: { markets: MarketResponse[] }) {
  const tradeHref =
    markets.length > 0
      ? `/markets/${encodeURIComponent(markets[0].id)}`
      : '/markets/ETH-USDC'

  const LINES: { text: string; color: string }[] = [
    { text: 'Every trade.', color: '#1A0608' },
    { text: 'Verifiable.', color: '#C41E3A' },
    { text: 'On-chain.', color: '#E8829A' },
  ]

  return (
    <section
      style={{ padding: '120px 6vw', background: 'white', textAlign: 'center' }}
    >
      <div>
        {LINES.map((line, i) => (
          <motion.div
            key={line.text}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.7, ease: EASE }}
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 800,
              fontSize: 'clamp(2.5rem,5vw,4.5rem)',
              color: line.color,
              lineHeight: 0.95,
            }}
          >
            {line.text}
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4, duration: 0.6, ease: EASE }}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          marginTop: 48,
        }}
      >
        <Link href={tradeHref}>
          <Button size="lg">Enter Exchange</Button>
        </Link>
        <a
          href="https://ssrn.com/abstract=6579199"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="ghost" size="lg">
            Read the Paper
          </Button>
        </a>
      </motion.div>
      <div
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: '0.7rem',
          color: '#4A1520',
          marginTop: 24,
        }}
      >
        Vela Exchange v0.1.0 — Monolith Research Vol. 2 — MIT License
      </div>
    </section>
  )
}

export default function HomePage() {
  const [markets, setMarkets] = useState<MarketResponse[]>([])
  const [livePrices, setLivePrices] = useState<LivePrices>({})
  const [book, setBook] = useState<OrderBook>(MOCK_BOOK)
  const [pair, setPair] = useState<string | null>(null)
  const [simBook, setSimBook] = useState<OrderBook>(MOCK_BOOK)
  const [flashDir, setFlashDir] = useState<FlashDir>(null)
  const simRef = useRef<{ book: OrderBook; tickCount: number; prevMid: number; flashTimer: ReturnType<typeof setTimeout> | null }>({
    book: MOCK_BOOK,
    tickCount: 0,
    prevMid: (parseFloat(MOCK_BOOK.bids[0].price) + parseFloat(MOCK_BOOK.asks[0].price)) / 2,
    flashTimer: null,
  })

  useEffect(() => {
    const id = setInterval(() => {
      const s = simRef.current
      s.tickCount++
      const next = s.tickCount % 4 === 0 ? tradeBook(s.book) : stepBook(s.book)
      s.book = next
      setSimBook(next)

      const newMid = (parseFloat(next.bids[0].price) + parseFloat(next.asks[0].price)) / 2
      if (newMid !== s.prevMid) {
        const dir: FlashDir = newMid > s.prevMid ? 'up' : 'down'
        setFlashDir(dir)
        if (s.flashTimer !== null) clearTimeout(s.flashTimer)
        s.flashTimer = setTimeout(() => setFlashDir(null), 500)
      }
      s.prevMid = newMid
    }, 800)

    return () => {
      clearInterval(id)
      if (simRef.current.flashTimer !== null) clearTimeout(simRef.current.flashTimer)
    }
  }, [])

  useEffect(() => {
    listMarkets()
      .then((res) => {
        if (res.ok && res.data && res.data.length > 0) {
          setMarkets(res.data)
          setPair(res.data[0].id)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchLivePrices().then(setLivePrices)
  }, [])

  useEffect(() => {
    if (!pair) return
    const ws = getWsClient()
    ws.connect()
    const channel = `book:${pair}`
    ws.subscribe([channel])

    const removeHandler = ws.onMessage((msg: WsServerMessage) => {
      if (msg.type === 'book_snapshot' && msg.market === pair) {
        setBook({
          bids: msg.bids.map(([price, quantity]) => ({ price, quantity })),
          asks: msg.asks.map(([price, quantity]) => ({ price, quantity })),
        })
      }
    })

    return () => {
      removeHandler()
      ws.unsubscribe([channel])
    }
  }, [pair])

  return (
    <div>
      <section
        style={{
          position: 'relative',
          height: 'calc(100vh - 60px)',
          overflow: 'hidden',
        }}
      >
        <OrderBookViz book={simBook} flashDir={flashDir} />
        <TextOverlay />
      </section>

      <MarketsRoom markets={markets} livePrices={livePrices} />
      <PerformanceRoom />
      <EnterSection markets={markets} />
    </div>
  )
}
