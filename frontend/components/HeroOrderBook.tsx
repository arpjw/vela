'use client'

import { useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'

interface BookLevel {
  price: string
  quantity: string
}

interface BookData {
  bids: BookLevel[]
  asks: BookLevel[]
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function SkeletonRow() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '5px 20px',
        gap: '4px',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: '11px',
            background: 'rgba(232,228,216,0.06)',
            animation: 'shimmer 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function HeroOrderBook() {
  const [book, setBook] = useState<BookData | null>(null)
  const [error, setError] = useState(false)
  const prevBook = useRef<BookData | null>(null)
  const [flashedAsks, setFlashedAsks] = useState<Set<string>>(new Set())
  const [flashedBids, setFlashedBids] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchBook() {
      try {
        const res = await fetch(`${API_URL}/markets/BTC-USDC/book`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          setError(true)
          return
        }
        const json = await res.json()
        const data: BookData = json.data ?? json

        const prev = prevBook.current
        if (prev) {
          const prevAskPrices = new Set(prev.asks.map((l) => l.price))
          const prevBidPrices = new Set(prev.bids.map((l) => l.price))
          const newAskFlashes = new Set<string>()
          const newBidFlashes = new Set<string>()

          data.asks.forEach((l) => {
            const match = prev.asks.find((p) => p.price === l.price)
            if (!match || match.quantity !== l.quantity || !prevAskPrices.has(l.price)) {
              newAskFlashes.add(l.price)
            }
          })
          data.bids.forEach((l) => {
            const match = prev.bids.find((p) => p.price === l.price)
            if (!match || match.quantity !== l.quantity || !prevBidPrices.has(l.price)) {
              newBidFlashes.add(l.price)
            }
          })

          if (newAskFlashes.size > 0) {
            setFlashedAsks(newAskFlashes)
            setTimeout(() => setFlashedAsks(new Set()), 400)
          }
          if (newBidFlashes.size > 0) {
            setFlashedBids(newBidFlashes)
            setTimeout(() => setFlashedBids(new Set()), 400)
          }
        }

        prevBook.current = data
        setBook(data)
        setError(false)
      } catch {
        setError(true)
      }
    }

    fetchBook()
    const id = setInterval(fetchBook, 3000)
    return () => clearInterval(id)
  }, [])

  const asks = book
    ? [...book.asks].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5)
    : []
  const bids = book
    ? [...book.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5)
    : []

  const bestAsk = asks.length ? parseFloat(asks[asks.length - 1].price) : 0
  const bestBid = bids.length ? parseFloat(bids[0].price) : 0
  const midPrice = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : 0
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0
  const bps = bestAsk ? ((spread / bestAsk) * 10000).toFixed(1) : '0.0'

  const maxAskSize = asks.reduce((m, l) => Math.max(m, parseFloat(l.quantity)), 0)
  const maxBidSize = bids.reduce((m, l) => Math.max(m, parseFloat(l.quantity)), 0)

  function runningTotal(levels: BookLevel[], index: number): number {
    return levels.slice(0, index + 1).reduce((s, l) => s + parseFloat(l.quantity), 0)
  }

  const IN = "'Inter', sans-serif"
  const MONO = "'Courier New', monospace"

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes flash-ask {
          0% { background: rgba(204,51,51,0.2); }
          100% { background: transparent; }
        }
        @keyframes flash-bid {
          0% { background: rgba(107,138,90,0.2); }
          100% { background: transparent; }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.1; }
        }
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          border: '1px solid rgba(232,228,216,0.08)',
          background: 'rgba(232,228,216,0.02)',
          fontFamily: MONO,
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(232,228,216,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: IN,
              fontWeight: 600,
              fontSize: '12px',
              color: '#E8E4D8',
            }}
          >
            BTC-USDC
          </span>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: IN,
                fontWeight: 600,
                fontSize: '13px',
                color: '#E8E4D8',
              }}
            >
              {midPrice ? fmt(midPrice, 2) : '—'}
            </div>
            <div
              style={{
                fontFamily: IN,
                fontSize: '11px',
                color: 'rgba(140,180,120,1)',
              }}
            >
              +2.14%
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '8px 20px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            fontFamily: IN,
            fontSize: '9px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(232,228,216,0.25)',
          }}
        >
          <span>Price (USDC)</span>
          <span>Size (BTC)</span>
          <span>Total</span>
        </div>

        {error ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              fontFamily: IN,
              fontSize: '11px',
              color: 'rgba(232,228,216,0.25)',
            }}
          >
            Connecting...
          </div>
        ) : !book ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
            <div style={{ padding: '6px 20px', borderTop: '1px solid rgba(232,228,216,0.04)', borderBottom: '1px solid rgba(232,228,216,0.04)' }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </>
        ) : (
          <>
            {asks.map((level, i) => {
              const sizeRatio = maxAskSize ? (parseFloat(level.quantity) / maxAskSize) * 100 : 0
              const flashing = flashedAsks.has(level.price)
              return (
                <div
                  key={level.price}
                  style={{
                    position: 'relative',
                    padding: '5px 20px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    fontFamily: MONO,
                    fontSize: '11px',
                    color: '#CC3333',
                    animation: flashing ? 'flash-ask 0.4s ease-out forwards' : undefined,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: `${sizeRatio}%`,
                      height: '100%',
                      background: 'rgba(204,51,51,0.07)',
                      pointerEvents: 'none',
                    }}
                  />
                  <span style={{ position: 'relative' }}>{fmt(parseFloat(level.price), 2)}</span>
                  <span style={{ position: 'relative' }}>{fmt(parseFloat(level.quantity), 4)}</span>
                  <span style={{ position: 'relative' }}>{fmt(runningTotal(asks, i), 4)}</span>
                </div>
              )
            })}

            <div
              style={{
                padding: '6px 20px',
                borderTop: '1px solid rgba(232,228,216,0.04)',
                borderBottom: '1px solid rgba(232,228,216,0.04)',
                fontFamily: IN,
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: 'rgba(232,228,216,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span>◆ {fmt(spread, 2)} USDC · {bps} bps</span>
              <div
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: '#6B8A5A',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
            </div>

            {bids.map((level, i) => {
              const sizeRatio = maxBidSize ? (parseFloat(level.quantity) / maxBidSize) * 100 : 0
              const flashing = flashedBids.has(level.price)
              return (
                <div
                  key={level.price}
                  style={{
                    position: 'relative',
                    padding: '5px 20px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    fontFamily: MONO,
                    fontSize: '11px',
                    color: 'rgba(140,180,120,0.9)',
                    animation: flashing ? 'flash-bid 0.4s ease-out forwards' : undefined,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: `${sizeRatio}%`,
                      height: '100%',
                      background: 'rgba(107,138,90,0.07)',
                      pointerEvents: 'none',
                    }}
                  />
                  <span style={{ position: 'relative' }}>{fmt(parseFloat(level.price), 2)}</span>
                  <span style={{ position: 'relative' }}>{fmt(parseFloat(level.quantity), 4)}</span>
                  <span style={{ position: 'relative' }}>{fmt(runningTotal(bids, i), 4)}</span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}
