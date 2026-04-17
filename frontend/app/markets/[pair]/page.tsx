'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
} from 'lightweight-charts'
import {
  getBook,
  getOrders,
  getBalances,
  listMarkets,
  postOrder,
  cancelOrder,
  type MarketResponse,
  type Order,
  type BalanceResponse,
  type PostOrderBody,
  type CancelOrderBody,
} from '@/lib/api'
import { signOrder, signCancel } from '@/lib/signing'
import { useAuth } from '@/lib/auth'

type OrderSide = 'buy' | 'sell'
type OrderEntryType = 'limit' | 'market' | 'stop'
type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D'

interface Toast {
  id: number
  message: string
  variant: 'success' | 'error'
}

const TIMEFRAME_BARS: Record<Timeframe, { seconds: number; count: number }> = {
  '1m':  { seconds: 60,      count: 120 },
  '5m':  { seconds: 300,     count: 100 },
  '15m': { seconds: 900,     count: 96  },
  '1H':  { seconds: 3600,    count: 72  },
  '4H':  { seconds: 14400,   count: 60  },
  '1D':  { seconds: 86400,   count: 60  },
}

function generateOHLCV(
  currentPrice: number,
  timeframe: Timeframe,
  bars: number,
): CandlestickData<Time>[] {
  const { seconds } = TIMEFRAME_BARS[timeframe]
  const now = Math.floor(Date.now() / 1000)
  const startTime = now - bars * seconds

  const result: CandlestickData<Time>[] = []
  let close = currentPrice * (1 + (Math.random() - 0.5) * 0.05)

  for (let i = 0; i < bars; i++) {
    const time = (startTime + i * seconds) as Time
    const open = close * (1 + (Math.random() - 0.5) * 0.002)
    const volatility = 0.003 + Math.random() * 0.012
    const high = open * (1 + Math.random() * volatility)
    const low = open * (1 - Math.random() * volatility)
    close = low + Math.random() * (high - low)
    result.push({
      time,
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
    })
  }
  return result
}

function fmtPrice(v: string | number | undefined, decimals = 2): string {
  if (v === undefined || v === null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '—'
  return n.toFixed(decimals)
}

function fmtSize(v: string | number | undefined, base = 'BTC'): string {
  if (v === undefined || v === null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '—'
  const highPrecision = ['BTC', 'ETH'].includes(base.toUpperCase())
  return n.toFixed(highPrecision ? 4 : 2)
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtOrderTime(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const addToast = useCallback((message: string, variant: 'success' | 'error') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return { toasts, addToast }
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: '#111110',
            border: '1px solid rgba(232,228,216,0.08)',
            borderLeft: `3px solid ${t.variant === 'success' ? '#6B8A5A' : '#CC3333'}`,
            padding: '10px 16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            color: t.variant === 'success' ? '#6B8A5A' : '#CC3333',
            animation: 'slideInRight 0.2s ease-out',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

function HeaderBar({
  pair,
  markets,
  bids,
  asks,
}: {
  pair: string
  markets: MarketResponse[]
  bids: { price: string; quantity: string }[]
  asks: { price: string; quantity: string }[]
}) {
  const market = markets.find((m) => m.id === pair)
  const [base, quote] = useMemo(() => {
    const parts = pair.split('-')
    return [parts[0] ?? '', parts[1] ?? '']
  }, [pair])

  const midPrice = useMemo(() => {
    const bid = market?.best_bid ? parseFloat(market.best_bid) : bids[0] ? parseFloat(bids[0].price) : null
    const ask = market?.best_ask ? parseFloat(market.best_ask) : asks[0] ? parseFloat(asks[0].price) : null
    if (bid && ask) return ((bid + ask) / 2).toFixed(2)
    if (bid) return bid.toFixed(2)
    if (ask) return ask.toFixed(2)
    return null
  }, [market, bids, asks])

  const spread = useMemo(() => {
    if (market?.spread) return parseFloat(market.spread).toFixed(4)
    if (bids[0] && asks[0]) {
      return (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(4)
    }
    return null
  }, [market, bids, asks])

  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        background: '#0C0C0C',
        borderBottom: '1px solid rgba(232,228,216,0.06)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <Link
        href="/"
        style={{
          color: 'rgba(232,228,216,0.3)',
          fontSize: 14,
          textDecoration: 'none',
          lineHeight: 1,
        }}
      >
        ←
      </Link>

      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: 14,
          color: '#E8E4D8',
          letterSpacing: '0.02em',
        }}
      >
        {base} / {quote}
      </span>

      {midPrice && (
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 16,
            color: '#E8E4D8',
          }}
        >
          {midPrice}
        </span>
      )}

      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          fontSize: 12,
          color: '#6B8A5A',
        }}
      >
        —
      </span>

      <div
        style={{
          width: 1,
          height: 20,
          background: 'rgba(232,228,216,0.06)',
          flexShrink: 0,
        }}
      />

      <StatItem label="24H VOL" value="—" />
      <StatItem label="HIGH" value={market?.best_ask ? fmtPrice(market.best_ask) : '—'} />
      <StatItem label="LOW" value={market?.best_bid ? fmtPrice(market.best_bid) : '—'} />

      {spread && (
        <>
          <div style={{ width: 1, height: 20, background: 'rgba(232,228,216,0.06)', flexShrink: 0 }} />
          <StatItem label="SPREAD" value={spread} />
        </>
      )}

      <div style={{ marginLeft: 'auto' }}>
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 9,
            color: 'rgba(232,228,216,0.2)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: '#6B8A5A' }}>●</span> SEPOLIA TESTNET
        </span>
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'rgba(232,228,216,0.3)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          fontSize: 12,
          color: '#E8E4D8',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function MarketSelectorPanel({
  markets,
  currentPair,
}: {
  markets: MarketResponse[]
  currentPair: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return markets
    return markets.filter((m) =>
      m.id.toLowerCase().includes(search.toLowerCase()),
    )
  }, [markets, search])

  return (
    <div
      style={{
        width: 200,
        background: '#0C0C0C',
        borderRight: '1px solid rgba(232,228,216,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(232,228,216,0.2)',
          borderBottom: '1px solid rgba(232,228,216,0.04)',
          flexShrink: 0,
        }}
      >
        MARKETS
      </div>

      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(232,228,216,0.04)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid rgba(232,228,216,0.08)',
            color: '#E8E4D8',
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 0,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map((m) => {
          const isActive = m.id === currentPair
          const bid = m.best_bid ? parseFloat(m.best_bid) : null
          const ask = m.best_ask ? parseFloat(m.best_ask) : null
          const price = bid && ask ? ((bid + ask) / 2).toFixed(2) : bid ? bid.toFixed(2) : ask ? ask.toFixed(2) : '—'

          return (
            <div
              key={m.id}
              onClick={() => router.push(`/markets/${m.id}`)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(232,228,216,0.03)',
                borderLeft: isActive ? '2px solid #E8E4D8' : '2px solid transparent',
                background: isActive ? 'rgba(232,228,216,0.05)' : 'transparent',
                paddingLeft: isActive ? 10 : 12,
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(232,228,216,0.03)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, color: '#E8E4D8' }}>
                  {m.base}/{m.quote}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 11, color: '#E8E4D8' }}>
                  {price}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'rgba(232,228,216,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  SPOT
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#6B8A5A' }}>
                  —
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChartPanel({
  pair,
  midPrice,
}: {
  pair: string
  midPrice: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')
  const timeframeRef = useRef<Timeframe>('1H')
  const midPriceRef = useRef<number | null>(null)

  useEffect(() => {
    midPriceRef.current = midPrice
  }, [midPrice])

  useEffect(() => {
    timeframeRef.current = timeframe
  }, [timeframe])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      layout: {
        background: { color: '#0C0C0C' },
        textColor: 'rgba(232,228,216,0.4)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(232,228,216,0.04)' },
        horzLines: { color: 'rgba(232,228,216,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(232,228,216,0.2)', width: 1 },
        horzLine: { color: 'rgba(232,228,216,0.2)', width: 1 },
      },
      rightPriceScale: {
        borderColor: 'rgba(232,228,216,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(232,228,216,0.06)',
        timeVisible: true,
      },
      width: container.offsetWidth,
      height: container.offsetHeight,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#6B8A5A',
      downColor: '#CC3333',
      borderUpColor: '#6B8A5A',
      borderDownColor: '#CC3333',
      wickUpColor: '#6B8A5A',
      wickDownColor: '#CC3333',
    })

    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (container && chartRef.current) {
        chartRef.current.resize(container.offsetWidth, container.offsetHeight)
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  const loadData = useCallback((tf: Timeframe, price: number) => {
    if (!seriesRef.current) return
    const { count } = TIMEFRAME_BARS[tf]
    const data = generateOHLCV(price, tf, count)
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [])

  useEffect(() => {
    const price = midPriceRef.current ?? 100
    loadData(timeframe, price)
  }, [timeframe, pair, loadData])

  useEffect(() => {
    if (midPrice && seriesRef.current) {
      const price = midPrice
      const tf = timeframeRef.current
      loadData(tf, price)
    }
  }, [midPrice, loadData])

  useEffect(() => {
    const interval = setInterval(() => {
      const price = midPriceRef.current
      if (!price || !seriesRef.current) return
      const tf = timeframeRef.current
      const { seconds } = TIMEFRAME_BARS[tf]
      const nowSec = Math.floor(Date.now() / 1000)
      const open = price * (1 + (Math.random() - 0.5) * 0.001)
      const volatility = 0.002 + Math.random() * 0.008
      const high = open * (1 + Math.random() * volatility)
      const low = open * (1 - Math.random() * volatility)
      const close = low + Math.random() * (high - low)
      seriesRef.current.update({
        time: (Math.floor(nowSec / seconds) * seconds) as Time,
        open: +open.toFixed(4),
        high: +high.toFixed(4),
        low: +low.toFixed(4),
        close: +close.toFixed(4),
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const timeframes: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid rgba(232,228,216,0.06)',
          flexShrink: 0,
          height: 36,
          gap: 2,
        }}
      >
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            style={{
              background: timeframe === tf ? 'rgba(232,228,216,0.08)' : 'transparent',
              color: timeframe === tf ? '#E8E4D8' : 'rgba(232,228,216,0.3)',
              border: 'none',
              padding: '4px 10px',
              fontFamily: 'Inter, sans-serif',
              fontSize: 10,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              textTransform: 'uppercase',
              borderRadius: 0,
            }}
          >
            {tf}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  )
}

function OrderBookPanel({
  bids,
  asks,
  pair,
}: {
  bids: { price: string; quantity: string }[]
  asks: { price: string; quantity: string }[]
  pair: string
}) {
  const [base] = useMemo(() => {
    const parts = pair.split('-')
    return [parts[0] ?? 'BASE']
  }, [pair])

  const topAsks = useMemo(() => asks.slice(0, 12).reverse(), [asks])
  const topBids = useMemo(() => bids.slice(0, 12), [bids])

  const maxAskSize = useMemo(() => {
    if (asks.length === 0) return 1
    return Math.max(...asks.slice(0, 12).map((a) => parseFloat(a.quantity)))
  }, [asks])

  const maxBidSize = useMemo(() => {
    if (bids.length === 0) return 1
    return Math.max(...bids.slice(0, 12).map((b) => parseFloat(b.quantity)))
  }, [bids])

  const spread = useMemo(() => {
    if (!bids[0] || !asks[0]) return null
    const s = parseFloat(asks[0].price) - parseFloat(bids[0].price)
    return s > 0 ? s.toFixed(4) : null
  }, [bids, asks])

  const prevPricesRef = useRef<Map<string, string>>(new Map())
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map())

  useEffect(() => {
    const allLevels = [...bids.slice(0, 12), ...asks.slice(0, 12)]
    const newFlashes = new Map<string, 'up' | 'down'>()
    for (const lvl of allLevels) {
      const prev = prevPricesRef.current.get(lvl.price)
      if (prev !== undefined && prev !== lvl.quantity) {
        const prevN = parseFloat(prev)
        const currN = parseFloat(lvl.quantity)
        newFlashes.set(lvl.price, currN > prevN ? 'up' : 'down')
      }
      prevPricesRef.current.set(lvl.price, lvl.quantity)
    }
    if (newFlashes.size > 0) {
      setFlashMap(newFlashes)
      const t = setTimeout(() => setFlashMap(new Map()), 400)
      return () => clearTimeout(t)
    }
  }, [bids, asks])

  return (
    <div
      style={{
        width: 220,
        borderRight: '1px solid rgba(232,228,216,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'rgba(232,228,216,0.2)',
          borderBottom: '1px solid rgba(232,228,216,0.06)',
          flexShrink: 0,
        }}
      >
        ORDER BOOK
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '5px 12px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 8,
          textTransform: 'uppercase',
          color: 'rgba(232,228,216,0.2)',
          letterSpacing: '0.1em',
          flexShrink: 0,
        }}
      >
        <span>PRICE</span>
        <span style={{ textAlign: 'right' }}>SIZE</span>
        <span style={{ textAlign: 'right' }}>TOTAL</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {topAsks.map((lvl) => {
            const size = parseFloat(lvl.quantity)
            const pct = maxAskSize > 0 ? (size / maxAskSize) * 100 : 0
            const flash = flashMap.get(lvl.price)
            return (
              <BookRow
                key={`ask-${lvl.price}`}
                price={fmtPrice(lvl.price)}
                size={fmtSize(lvl.quantity, base)}
                total={fmtSize(lvl.quantity, base)}
                side="ask"
                depthPct={pct}
                flash={flash}
              />
            )
          })}
        </div>

        <div
          style={{
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(232,228,216,0.04)',
            borderBottom: '1px solid rgba(232,228,216,0.04)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'rgba(232,228,216,0.4)' }}>
            ◆ {spread ?? '—'}
          </span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: 'rgba(107,138,90,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#6B8A5A', animation: 'pulse 2s infinite' }}>●</span> LIVE
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          {topBids.map((lvl) => {
            const size = parseFloat(lvl.quantity)
            const pct = maxBidSize > 0 ? (size / maxBidSize) * 100 : 0
            const flash = flashMap.get(lvl.price)
            return (
              <BookRow
                key={`bid-${lvl.price}`}
                price={fmtPrice(lvl.price)}
                size={fmtSize(lvl.quantity, base)}
                total={fmtSize(lvl.quantity, base)}
                side="bid"
                depthPct={pct}
                flash={flash}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BookRow({
  price,
  size,
  total,
  side,
  depthPct,
  flash,
}: {
  price: string
  size: string
  total: string
  side: 'bid' | 'ask'
  depthPct: number
  flash?: 'up' | 'down'
}) {
  const color = side === 'bid' ? '#6B8A5A' : '#CC3333'
  const barColor = side === 'bid' ? 'rgba(107,138,90,0.08)' : 'rgba(204,51,51,0.08)'
  const bgFlash =
    flash === 'up' ? 'rgba(107,138,90,0.12)' :
    flash === 'down' ? 'rgba(204,51,51,0.12)' :
    'transparent'

  return (
    <div
      style={{
        position: 'relative',
        padding: '3px 12px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        background: bgFlash,
        transition: 'background 0.4s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${depthPct}%`,
          background: barColor,
        }}
      />
      <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10.5, color, position: 'relative', zIndex: 1 }}>
        {price}
      </span>
      <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10.5, color: 'rgba(232,228,216,0.6)', textAlign: 'right', position: 'relative', zIndex: 1 }}>
        {size}
      </span>
      <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10.5, color: 'rgba(232,228,216,0.4)', textAlign: 'right', position: 'relative', zIndex: 1 }}>
        {total}
      </span>
    </div>
  )
}

function OrderEntryPanel({
  pair,
  bids,
  asks,
  onToast,
}: {
  pair: string
  bids: { price: string; quantity: string }[]
  asks: { price: string; quantity: string }[]
  onToast: (msg: string, v: 'success' | 'error') => void
}) {
  const { address, isConnected, connect } = useAuth()
  const [orderType, setOrderType] = useState<OrderEntryType>('limit')
  const [side, setSide] = useState<OrderSide>('buy')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [postOnly, setPostOnly] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [balances, setBalances] = useState<{ base: string; quote: string }>({ base: '0', quote: '0' })

  const [base, quote] = useMemo(() => {
    const parts = pair.split('-')
    return [parts[0] ?? 'BASE', parts[1] ?? 'QUOTE']
  }, [pair])

  const bestBid = bids[0]?.price ?? null
  const bestAsk = asks[0]?.price ?? null
  const midPrice = bestBid && bestAsk
    ? ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toFixed(4)
    : null

  useEffect(() => {
    if (!address) return
    getBalances(address).then((res) => {
      if (res.ok && res.data) {
        const baseB = res.data.find((b) => b.asset.toUpperCase() === base.toUpperCase())
        const quoteB = res.data.find((b) => b.asset.toUpperCase() === quote.toUpperCase())
        setBalances({
          base: baseB ? (parseFloat(baseB.available) / 1_000_000).toFixed(4) : '0',
          quote: quoteB ? (parseFloat(quoteB.available) / 1_000_000).toFixed(2) : '0',
        })
      }
    })
  }, [address, base, quote])

  const total = useMemo(() => {
    const p = parseFloat(price)
    const s = parseFloat(size)
    if (!isNaN(p) && p > 0 && !isNaN(s) && s > 0) return (p * s).toFixed(4)
    return null
  }, [price, size])

  const availableBalance = side === 'buy' ? balances.quote : balances.base
  const availableAsset = side === 'buy' ? quote : base

  const handlePctClick = useCallback((pct: number) => {
    const bal = parseFloat(availableBalance)
    if (isNaN(bal) || bal <= 0) return
    if (side === 'buy') {
      const p = parseFloat(price) || parseFloat(midPrice ?? '0')
      if (p > 0) setSize(((bal * pct) / p).toFixed(4))
    } else {
      setSize((bal * pct).toFixed(4))
    }
  }, [availableBalance, side, price, midPrice])

  const handleSubmit = useCallback(async () => {
    if (!address || !isConnected || !size) return
    if (orderType === 'limit' && !price) return

    setSubmitting(true)
    const scaledPrice = orderType === 'limit' ? Math.round(parseFloat(price) * 1_000_000) : 0
    const scaledQty = Math.round(parseFloat(size) * 1_000_000)
    const nonce = Date.now()

    try {
      const sig = await signOrder({ market: pair, side, price: scaledPrice, quantity: scaledQty, nonce, address })
      const body: PostOrderBody = {
        market: pair,
        side,
        order_type: orderType === 'stop' ? 'limit' : orderType,
        price: scaledPrice,
        quantity: scaledQty,
        nonce,
        address,
        signature: sig,
      }
      const res = await postOrder(body)
      if (res.ok) {
        onToast('Order placed', 'success')
        setSize('')
        if (orderType === 'limit') setPrice('')
      } else {
        onToast(res.error ?? 'Order failed', 'error')
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('rejected') || err.message.includes('denied') || err.message.includes('cancelled'))) {
        onToast('Signature rejected', 'error')
      } else {
        onToast(err instanceof Error ? err.message : 'Signing failed', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }, [address, isConnected, pair, orderType, price, size, side, onToast])

  const tabs: OrderEntryType[] = ['limit', 'market', 'stop']

  return (
    <div
      style={{
        width: 260,
        background: '#0C0C0C',
        borderLeft: '1px solid rgba(232,228,216,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(232,228,216,0.06)',
          flexShrink: 0,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: orderType === t ? '2px solid #E8E4D8' : '2px solid transparent',
              color: orderType === t ? '#E8E4D8' : 'rgba(232,228,216,0.3)',
              fontFamily: 'Inter, sans-serif',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          margin: '12px 12px 0',
          flexShrink: 0,
        }}
      >
        {(['buy', 'sell'] as OrderSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              padding: '9px',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              borderRadius: 0,
              border: side === s
                ? s === 'buy'
                  ? '1px solid rgba(107,138,90,0.3)'
                  : '1px solid rgba(204,51,51,0.3)'
                : '1px solid rgba(232,228,216,0.06)',
              background: side === s
                ? s === 'buy'
                  ? 'rgba(107,138,90,0.2)'
                  : 'rgba(204,51,51,0.2)'
                : 'transparent',
              color: side === s
                ? s === 'buy' ? '#6B8A5A' : '#CC3333'
                : 'rgba(232,228,216,0.2)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.3)' }}>
            AVAILABLE
          </span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 11, color: '#E8E4D8' }}>
            {availableBalance} {availableAsset}
          </span>
        </div>

        {orderType === 'limit' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.3)', display: 'block', marginBottom: 5 }}>
              PRICE ({quote})
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                background: '#111110',
                border: '1px solid rgba(232,228,216,0.08)',
                color: '#E8E4D8',
                fontFamily: 'Courier New, monospace',
                fontSize: 12,
                padding: '8px 10px',
                borderRadius: 0,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {[
                { label: 'BID', val: bestBid },
                { label: 'MID', val: midPrice },
                { label: 'ASK', val: bestAsk },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  onClick={() => val && setPrice(parseFloat(val).toFixed(4))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 8,
                    color: 'rgba(232,228,216,0.3)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: 0,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#E8E4D8' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,228,216,0.3)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.3)', display: 'block', marginBottom: 5 }}>
            SIZE ({base})
          </label>
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="0.00"
            style={{
              width: '100%',
              background: '#111110',
              border: '1px solid rgba(232,228,216,0.08)',
              color: '#E8E4D8',
              fontFamily: 'Courier New, monospace',
              fontSize: 12,
              padding: '8px 10px',
              borderRadius: 0,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePctClick(pct)}
              style={{
                flex: 1,
                padding: '5px 0',
                fontFamily: 'Inter, sans-serif',
                fontSize: 9,
                textAlign: 'center',
                border: '1px solid rgba(232,228,216,0.08)',
                color: 'rgba(232,228,216,0.3)',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'rgba(232,228,216,0.2)'
                el.style.color = '#E8E4D8'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = 'rgba(232,228,216,0.08)'
                el.style.color = 'rgba(232,228,216,0.3)'
              }}
            >
              {Math.round(pct * 100)}%
            </button>
          ))}
        </div>

        {orderType === 'limit' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <div
              onClick={() => setPostOnly(!postOnly)}
              style={{
                width: 16,
                height: 16,
                border: '1px solid rgba(232,228,216,0.2)',
                background: postOnly ? 'rgba(232,228,216,0.1)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {postOnly && <span style={{ color: '#E8E4D8', fontSize: 10, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(232,228,216,0.4)' }}>
              Post-only
            </span>
          </label>
        )}

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(232,228,216,0.06)',
          }}
        >
          {[
            { label: 'TOTAL', value: total ? `${total} ${quote}` : '—' },
            { label: 'FEE', value: '0.00 USDC' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.3)' }}>
                {label}
              </span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 11, color: '#E8E4D8' }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={isConnected ? handleSubmit : connect}
          disabled={isConnected && submitting}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '12px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            borderRadius: 0,
            border: 'none',
            cursor: 'pointer',
            background: !isConnected
              ? 'rgba(232,228,216,0.1)'
              : side === 'buy'
              ? 'rgba(107,138,90,0.9)'
              : 'rgba(204,51,51,0.9)',
            color: !isConnected ? 'rgba(232,228,216,0.4)' : 'white',
            opacity: isConnected && submitting ? 0.6 : 1,
          }}
        >
          {!isConnected
            ? 'CONNECT WALLET'
            : submitting
            ? '...'
            : side === 'buy'
            ? `BUY ${base}`
            : `SELL ${base}`}
        </button>
      </div>
    </div>
  )
}

function OpenOrdersPanel({
  pair,
  onToast,
}: {
  pair: string
  onToast: (msg: string, v: 'success' | 'error') => void
}) {
  const { address, isConnected } = useAuth()
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const [orders, setOrders] = useState<Order[]>([])

  const fetchOrders = useCallback(() => {
    if (!address) return
    getOrders(address).then((res) => {
      if (res.ok && res.data) setOrders(res.data)
    })
  }, [address])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === 'open' || o.status === 'partial'),
    [orders],
  )

  const handleCancel = useCallback(async (order: Order) => {
    if (!address) return
    const nonce = Date.now()
    try {
      const sig = await signCancel({ order_id: order.id, nonce, address })
      const body: CancelOrderBody = { order_id: order.id, nonce, address, signature: sig }
      const res = await cancelOrder(body)
      if (res.ok) {
        onToast('Order cancelled', 'success')
        fetchOrders()
      } else {
        onToast(res.error ?? 'Cancel failed', 'error')
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('rejected') || err.message.includes('denied') || err.message.includes('cancelled'))) {
        onToast('Signature rejected', 'error')
      } else {
        onToast(err instanceof Error ? err.message : 'Cancel failed', 'error')
      }
    }
  }, [address, onToast, fetchOrders])

  const displayOrders = tab === 'open' ? openOrders : orders

  const cols = [
    { key: 'time', label: 'TIME', width: 80 },
    { key: 'pair', label: 'PAIR', width: 80 },
    { key: 'side', label: 'SIDE', width: 50 },
    { key: 'type', label: 'TYPE', width: 60 },
    { key: 'price', label: 'PRICE', width: 80 },
    { key: 'size', label: 'SIZE', width: 70 },
    { key: 'filled', label: 'FILLED', width: 60 },
    { key: 'action', label: '', width: 60 },
  ]

  return (
    <div
      style={{
        height: 180,
        flexShrink: 0,
        background: '#0C0C0C',
        borderTop: '1px solid rgba(232,228,216,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(232,228,216,0.06)',
          flexShrink: 0,
        }}
      >
        {[
          { key: 'open' as const, label: `OPEN ORDERS (${openOrders.length})` },
          { key: 'history' as const, label: 'ORDER HISTORY' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === key ? '1px solid #E8E4D8' : '1px solid transparent',
              color: tab === key ? '#E8E4D8' : 'rgba(232,228,216,0.3)',
              fontFamily: 'Inter, sans-serif',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols.map((c) => `${c.width}px`).join(' ') + ' 1fr',
          padding: '6px 16px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 8,
          textTransform: 'uppercase',
          color: 'rgba(232,228,216,0.2)',
          letterSpacing: '0.1em',
          flexShrink: 0,
          borderBottom: '1px solid rgba(232,228,216,0.04)',
        }}
      >
        {cols.map((c) => <span key={c.key}>{c.label}</span>)}
        <span />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {!isConnected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(232,228,216,0.2)' }}>
            Connect wallet to view orders
          </div>
        ) : displayOrders.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(232,228,216,0.2)' }}>
            No open orders
          </div>
        ) : (
          displayOrders.map((order) => {
            const filled = parseFloat(order.filled_quantity)
            const qty = parseFloat(order.quantity)
            const filledPct = qty > 0 ? Math.round((filled / qty) * 100) : 0
            const price = (parseFloat(order.price) / 1_000_000).toFixed(2)
            const quantity = (parseFloat(order.quantity) / 1_000_000).toFixed(4)
            return (
              <div
                key={order.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: cols.map((c) => `${c.width}px`).join(' ') + ' 1fr',
                  padding: '4px 16px',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(232,228,216,0.02)',
                }}
              >
                <span style={{ color: 'rgba(232,228,216,0.3)', fontSize: 10 }}>
                  {fmtOrderTime(order.timestamp)}
                </span>
                <span style={{ color: '#E8E4D8' }}>{order.market}</span>
                <span style={{ color: order.side === 'buy' ? '#6B8A5A' : '#CC3333', textTransform: 'uppercase' }}>
                  {order.side}
                </span>
                <span style={{ color: 'rgba(232,228,216,0.4)', textTransform: 'uppercase' }}>
                  {order.order_type}
                </span>
                <span style={{ fontFamily: 'Courier New, monospace', color: '#E8E4D8' }}>{price}</span>
                <span style={{ fontFamily: 'Courier New, monospace', color: 'rgba(232,228,216,0.6)' }}>{quantity}</span>
                <span style={{ color: 'rgba(232,228,216,0.4)' }}>{filledPct}%</span>
                <span />
                {(order.status === 'open' || order.status === 'partial') && (
                  <button
                    onClick={() => handleCancel(order)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 9,
                      color: 'rgba(232,228,216,0.3)',
                      cursor: 'pointer',
                      padding: 0,
                      borderRadius: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#CC3333' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,228,216,0.3)' }}
                  >
                    CANCEL
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function TradingPage({ params }: { params: { pair: string } }) {
  const pair = decodeURIComponent(params.pair)
  const { toasts, addToast } = useToasts()

  const [bids, setBids] = useState<{ price: string; quantity: string }[]>([])
  const [asks, setAsks] = useState<{ price: string; quantity: string }[]>([])
  const [markets, setMarkets] = useState<MarketResponse[]>([])

  const midPrice = useMemo(() => {
    const bid = bids[0] ? parseFloat(bids[0].price) : null
    const ask = asks[0] ? parseFloat(asks[0].price) : null
    if (bid && ask) return (bid + ask) / 2
    return bid ?? ask ?? null
  }, [bids, asks])

  useEffect(() => {
    const fetchBook = () => {
      getBook(pair).then((res) => {
        if (res.ok && res.data) {
          setBids(res.data.bids)
          setAsks(res.data.asks)
        }
      })
    }
    fetchBook()
    const interval = setInterval(fetchBook, 2000)
    return () => clearInterval(interval)
  }, [pair])

  useEffect(() => {
    const fetchMarkets = () => {
      listMarkets().then((res) => {
        if (res.ok && res.data) setMarkets(res.data)
      })
    }
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(232,228,216,0.1); }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 96px)',
          background: '#0C0C0C',
          overflow: 'hidden',
        }}
      >
        <HeaderBar pair={pair} markets={markets} bids={bids} asks={asks} />

        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '200px 1fr 220px 260px',
            overflow: 'hidden',
          }}
        >
          <MarketSelectorPanel markets={markets} currentPair={pair} />
          <ChartPanel pair={pair} midPrice={midPrice} />
          <OrderBookPanel bids={bids} asks={asks} pair={pair} />
          <OrderEntryPanel pair={pair} bids={bids} asks={asks} onToast={addToast} />
        </div>

        <OpenOrdersPanel pair={pair} onToast={addToast} />
      </div>

      <ToastContainer toasts={toasts} />
    </>
  )
}
