'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'
import {
  getBook,
  getOrders,
  getBalances,
  listMarkets,
  postOrder,
  cancelOrder,
  type MarketResponse,
  type Order,
  type PostOrderBody,
  type CancelOrderBody,
} from '@/lib/api'
import { signOrder, signCancel } from '@/lib/signing'
import { useAuth } from '@/lib/auth'

const MARKET_NAMES: Record<string, { base: string; quote: string; baseTicker: string }> = {
  'BTC-USDC':  { base: 'Bitcoin',   quote: 'USDC', baseTicker: 'BTC'  },
  'ETH-USDC':  { base: 'Ethereum',  quote: 'USDC', baseTicker: 'ETH'  },
  'SOL-USDC':  { base: 'Solana',    quote: 'USDC', baseTicker: 'SOL'  },
  'AVAX-USDC': { base: 'Avalanche', quote: 'USDC', baseTicker: 'AVAX' },
  'LINK-USDC': { base: 'Chainlink', quote: 'USDC', baseTicker: 'LINK' },
  'UNI-USDC':  { base: 'Uniswap',   quote: 'USDC', baseTicker: 'UNI'  },
  'ARB-USDC':  { base: 'Arbitrum',  quote: 'USDC', baseTicker: 'ARB'  },
  'OP-USDC':   { base: 'Optimism',  quote: 'USDC', baseTicker: 'OP'   },
  'AAVE-USDC': { base: 'Aave',      quote: 'USDC', baseTicker: 'AAVE' },
  'MATIC-USDC':{ base: 'Polygon',   quote: 'USDC', baseTicker: 'MATIC'},
  'DOGE-USDC': { base: 'Dogecoin',  quote: 'USDC', baseTicker: 'DOGE' },
}

const STATIC_CHANGE: Record<string, string> = {
  'BTC-USDC':  '+2.14%',
  'ETH-USDC':  '+1.87%',
  'SOL-USDC':  '+3.42%',
  'AVAX-USDC': '+1.23%',
  'LINK-USDC': '+2.76%',
  'UNI-USDC':  '+1.55%',
  'ARB-USDC':  '+2.91%',
  'OP-USDC':   '+3.18%',
  'AAVE-USDC': '+1.64%',
  'MATIC-USDC':'+2.33%',
  'DOGE-USDC': '+1.97%',
}

type OrderSide = 'buy' | 'sell'
type OrderEntryType = 'limit' | 'market' | 'stop'
type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D'

interface Toast {
  id: number
  message: string
  variant: 'success' | 'error'
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400,
}

function generateCandles(midPrice: number, timeframe: Timeframe, count = 80): CandlestickData<Time>[] {
  const tfSeconds = TIMEFRAME_SECONDS[timeframe]
  const now = Math.floor(Date.now() / 1000)
  const candles: CandlestickData<Time>[] = []
  let price = midPrice * 0.92
  for (let i = count; i >= 0; i--) {
    const time = (now - i * tfSeconds) as Time
    const volatility = 0.008
    const change = (Math.random() - 0.48) * volatility
    const open = price
    const close = price * (1 + change)
    const highExtra = Math.random() * volatility * 0.5
    const lowExtra = Math.random() * volatility * 0.5
    const high = Math.max(open, close) * (1 + highExtra)
    const low = Math.min(open, close) * (1 - lowExtra)
    candles.push({
      time,
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
    })
    price = close
  }
  return candles
}

function fmtPrice(v: string | number | undefined, decimals = 2): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? '—' : n.toFixed(decimals)
}

function fmtSize(v: string | number | undefined, baseTicker = 'BTC'): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '—'
  return ['BTC', 'ETH'].includes(baseTicker.toUpperCase()) ? n.toFixed(4) : n.toFixed(2)
}

function fmtOrderTime(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const addToast = useCallback((message: string, variant: 'success' | 'error') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])
  return { toasts, addToast }
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column-reverse', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: '#111110',
            border: '1px solid rgba(232,228,216,0.08)',
            borderLeft: `3px solid ${t.variant === 'success' ? '#6B8A5A' : '#CC3333'}`,
            padding: '10px 16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            color: 'rgba(232,228,216,0.7)',
            minWidth: 220,
            maxWidth: 320,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

function StatGroup({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(232,228,216,0.2)' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 11, color: 'rgba(232,228,216,0.55)' }}>
        {value}
      </span>
    </div>
  )
}

function TopBar({ pair, market }: { pair: string; market: MarketResponse | undefined }) {
  const info = MARKET_NAMES[pair] ?? {
    base: pair.split('-')[0] ?? pair,
    quote: pair.split('-')[1] ?? '',
    baseTicker: pair.split('-')[0] ?? pair,
  }
  const change = STATIC_CHANGE[pair] ?? '+1.50%'
  const isPositive = change.startsWith('+')

  const bid = market?.best_bid ? parseFloat(market.best_bid) : null
  const ask = market?.best_ask ? parseFloat(market.best_ask) : null
  const mid = bid && ask ? (bid + ask) / 2 : bid ?? ask ?? null

  const midStr = mid ? mid.toFixed(2) : '—'
  const high = mid ? (mid * 1.018).toFixed(2) : '—'
  const low = mid ? (mid * 0.982).toFixed(2) : '—'
  const volMultiplier = pair.startsWith('BTC') ? 1800 : pair.startsWith('ETH') ? 8500 : 45000
  const vol = mid ? `${((mid * volMultiplier) / 1_000_000).toFixed(2)}M` : '—'

  return (
    <div style={{
      height: 44,
      flexShrink: 0,
      borderBottom: '1px solid rgba(232,228,216,0.07)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      gap: 20,
    }}>
      <Link href="/" style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(232,228,216,0.3)', letterSpacing: '0.05em', textDecoration: 'none' }}>
        ←
      </Link>

      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13, color: '#E8E4D8' }}>
        {info.baseTicker} / {info.quote}
      </span>

      <span style={{ fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: 14, color: '#E8E4D8' }}>
        {midStr}
      </span>

      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 11, color: isPositive ? '#6B8A5A' : '#CC3333' }}>
        {change}
      </span>

      <div style={{ width: 1, height: 18, background: 'rgba(232,228,216,0.07)', flexShrink: 0 }} />

      <StatGroup label="24H VOL" value={vol} />
      <StatGroup label="HIGH" value={high} />
      <StatGroup label="LOW" value={low} />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#6B8A5A', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(232,228,216,0.18)', textTransform: 'uppercase' }}>
          SEPOLIA TESTNET
        </span>
      </div>
    </div>
  )
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

function TimeframeRow({ timeframe, onChange }: { timeframe: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div style={{ display: 'flex', padding: '12px 28px 0', borderBottom: '1px solid rgba(232,228,216,0.06)', flexShrink: 0 }}>
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: timeframe === tf ? '2px solid #E8E4D8' : '2px solid transparent',
            color: timeframe === tf ? '#E8E4D8' : 'rgba(232,228,216,0.3)',
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            letterSpacing: '0.08em',
            padding: '7px 12px',
            cursor: 'pointer',
            borderRadius: 0,
            textTransform: 'uppercase',
          }}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

function ChartArea({
  pair,
  midPrice,
  timeframe,
}: {
  pair: string
  midPrice: number | null
  timeframe: Timeframe
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null)
  const midPriceRef = useRef<number | null>(null)
  const timeframeRef = useRef<Timeframe>(timeframe)

  useEffect(() => { midPriceRef.current = midPrice }, [midPrice])
  useEffect(() => { timeframeRef.current = timeframe }, [timeframe])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      layout: {
        background: { color: '#0C0C0C' },
        textColor: 'rgba(232,228,216,0.3)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(232,228,216,0.04)' },
        horzLines: { color: 'rgba(232,228,216,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(232,228,216,0.15)', width: 1, style: 3 },
        horzLine: { color: 'rgba(232,228,216,0.15)', width: 1, style: 3 },
      },
      rightPriceScale: { borderColor: 'rgba(232,228,216,0.06)' },
      timeScale: { borderColor: 'rgba(232,228,216,0.06)', timeVisible: true, secondsVisible: false },
      width: container.clientWidth,
      height: container.clientHeight,
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
        chartRef.current.applyOptions({ width: container.clientWidth, height: container.clientHeight })
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

  const loadCandles = useCallback((tf: Timeframe, price: number) => {
    if (!seriesRef.current) return
    seriesRef.current.setData(generateCandles(price, tf))
    chartRef.current?.timeScale().fitContent()
  }, [])

  useEffect(() => {
    loadCandles(timeframe, midPriceRef.current ?? 100)
  }, [timeframe, pair, loadCandles])

  useEffect(() => {
    if (midPrice) loadCandles(timeframeRef.current, midPrice)
  }, [midPrice, loadCandles])

  useEffect(() => {
    const ticker = setInterval(() => {
      const price = midPriceRef.current
      if (!price || !seriesRef.current) return
      const tf = timeframeRef.current
      const tfSec = TIMEFRAME_SECONDS[tf]
      const now = Math.floor(Date.now() / 1000)
      const open = price * (1 + (Math.random() - 0.5) * 0.001)
      const volatility = 0.002 + Math.random() * 0.008
      const high = open * (1 + Math.random() * volatility)
      const low = open * (1 - Math.random() * volatility)
      const close = low + Math.random() * (high - low)
      seriesRef.current.update({
        time: (Math.floor(now / tfSec) * tfSec) as Time,
        open: +open.toFixed(4),
        high: +high.toFixed(4),
        low: +low.toFixed(4),
        close: +close.toFixed(4),
      })
    }, 60_000)
    return () => clearInterval(ticker)
  }, [])

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  )
}

function OpenOrdersPanel({
  onToast,
}: {
  pair: string
  onToast: (msg: string, v: 'success' | 'error') => void
}) {
  const { address, isConnected } = useAuth()
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
      if (err instanceof Error && (err.message.includes('rejected') || err.message.includes('denied'))) {
        onToast('Signature rejected', 'error')
      } else {
        onToast(err instanceof Error ? err.message : 'Cancel failed', 'error')
      }
    }
  }, [address, onToast, fetchOrders])

  const showEmpty = !isConnected || openOrders.length === 0
  const emptyMsg = !isConnected ? 'Connect wallet to view orders' : 'No open orders'

  return (
    <div style={{ height: 160, flexShrink: 0, borderTop: '1px solid rgba(232,228,216,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 28px', borderBottom: '1px solid rgba(232,228,216,0.05)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.22)' }}>
          OPEN ORDERS ({openOrders.length})
        </span>
      </div>

      {showEmpty ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(232,228,216,0.18)', fontWeight: 300 }}>
            {emptyMsg}
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 60px 50px 80px 80px 80px 1fr', padding: '5px 28px', flexShrink: 0 }}>
            {['TIME', 'PAIR', 'SIDE', 'TYPE', 'PRICE', 'SIZE', 'ACTION'].map((h) => (
              <span key={h} style={{ fontFamily: 'Inter, sans-serif', fontSize: 7.5, textTransform: 'uppercase', color: 'rgba(232,228,216,0.22)', letterSpacing: '0.1em' }}>
                {h}
              </span>
            ))}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {openOrders.map((order) => (
              <div
                key={order.id}
                style={{ display: 'grid', gridTemplateColumns: '100px 60px 50px 80px 80px 80px 1fr', padding: '5px 28px', alignItems: 'center' }}
              >
                <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: 'rgba(232,228,216,0.3)' }}>
                  {fmtOrderTime(order.timestamp)}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#E8E4D8' }}>{order.market}</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: order.side === 'buy' ? '#6B8A5A' : '#CC3333', textTransform: 'uppercase' }}>
                  {order.side}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(232,228,216,0.4)', textTransform: 'uppercase' }}>
                  {order.order_type}
                </span>
                <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#E8E4D8' }}>{fmtPrice(order.price)}</span>
                <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#E8E4D8' }}>{fmtSize(order.quantity)}</span>
                {order.status === 'open' || order.status === 'partial' ? (
                  <button
                    onClick={() => handleCancel(order)}
                    style={{ background: 'transparent', border: 'none', fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'rgba(232,228,216,0.3)', cursor: 'pointer', padding: 0, borderRadius: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#CC3333' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,228,216,0.3)' }}
                  >
                    Cancel
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ChartColumn({
  pair,
  midPrice,
  onToast,
}: {
  pair: string
  midPrice: number | null
  onToast: (msg: string, v: 'success' | 'error') => void
}) {
  const info = MARKET_NAMES[pair] ?? {
    base: pair.split('-')[0] ?? pair,
    quote: pair.split('-')[1] ?? '',
    baseTicker: pair.split('-')[0] ?? pair,
  }
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(232,228,216,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '22px 28px 0', flexShrink: 0 }}>
        <div style={{ lineHeight: 1 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 900, color: '#E8E4D8' }}>
            {info.base}
          </span>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 400, fontStyle: 'italic', color: 'rgba(232,228,216,0.3)' }}>
            {' / '}{info.quote}
          </span>
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 10, color: 'rgba(232,228,216,0.22)', letterSpacing: '0.08em', marginTop: 5 }}>
          Central limit order book · Ethereum Sepolia · Live
        </div>
      </div>

      <TimeframeRow timeframe={timeframe} onChange={setTimeframe} />
      <ChartArea pair={pair} midPrice={midPrice} timeframe={timeframe} />
      <OpenOrdersPanel pair={pair} onToast={onToast} />
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
  const baseTicker = MARKET_NAMES[pair]?.baseTicker ?? pair.split('-')[0] ?? 'BASE'

  const topAsks = useMemo(() => asks.slice(0, 10).reverse(), [asks])
  const topBids = useMemo(() => bids.slice(0, 10), [bids])

  const maxSize = useMemo(() => {
    const sizes = [
      ...asks.slice(0, 10).map((a) => parseFloat(a.quantity)),
      ...bids.slice(0, 10).map((b) => parseFloat(b.quantity)),
    ]
    return sizes.length ? Math.max(...sizes) : 1
  }, [bids, asks])

  const spread = useMemo(() => {
    if (!bids[0] || !asks[0]) return null
    const s = parseFloat(asks[0].price) - parseFloat(bids[0].price)
    return s > 0 ? s.toFixed(4) : null
  }, [bids, asks])

  return (
    <div style={{ width: 200, borderRight: '1px solid rgba(232,228,216,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(232,228,216,0.05)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.2)' }}>
          ORDER BOOK
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '5px 12px', flexShrink: 0 }}>
        {['PRICE', 'SIZE'].map((h) => (
          <span key={h} style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, textTransform: 'uppercase', color: 'rgba(232,228,216,0.18)', letterSpacing: '0.1em' }}>
            {h}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {topAsks.map((lvl) => {
          const pct = maxSize > 0 ? (parseFloat(lvl.quantity) / maxSize) * 100 : 0
          return (
            <div key={`ask-${lvl.price}`} style={{ position: 'relative', padding: '3.5px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(204,51,51,0.08)' }} />
              <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#CC3333', position: 'relative', zIndex: 1 }}>
                {fmtPrice(lvl.price)}
              </span>
              <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#CC3333', textAlign: 'right', position: 'relative', zIndex: 1 }}>
                {fmtSize(lvl.quantity, baseTicker)}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '5px 12px', borderTop: '1px solid rgba(232,228,216,0.04)', borderBottom: '1px solid rgba(232,228,216,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: 'rgba(232,228,216,0.3)' }}>
          ◆ {spread ?? '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6B8A5A', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: 'rgba(107,138,90,0.6)', letterSpacing: '0.12em' }}>LIVE</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'hidden' }}>
        {topBids.map((lvl) => {
          const pct = maxSize > 0 ? (parseFloat(lvl.quantity) / maxSize) * 100 : 0
          return (
            <div key={`bid-${lvl.price}`} style={{ position: 'relative', padding: '3.5px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(107,138,90,0.08)' }} />
              <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#6B8A5A', position: 'relative', zIndex: 1 }}>
                {fmtPrice(lvl.price)}
              </span>
              <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#6B8A5A', textAlign: 'right', position: 'relative', zIndex: 1 }}>
                {fmtSize(lvl.quantity, baseTicker)}
              </span>
            </div>
          )
        })}
      </div>
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

  const info = MARKET_NAMES[pair] ?? {
    base: pair.split('-')[0] ?? pair,
    quote: pair.split('-')[1] ?? '',
    baseTicker: pair.split('-')[0] ?? pair,
  }

  const bestBid = bids[0]?.price ?? null
  const bestAsk = asks[0]?.price ?? null
  const midPrice = bestBid && bestAsk
    ? ((parseFloat(bestBid) + parseFloat(bestAsk)) / 2).toFixed(4)
    : null

  useEffect(() => {
    if (!address) return
    const fetch = () => {
      getBalances(address).then((res) => {
        if (res.ok && res.data) {
          const baseB = res.data.find((b) => b.asset.toUpperCase() === info.baseTicker.toUpperCase())
          const quoteB = res.data.find((b) => b.asset.toUpperCase() === info.quote.toUpperCase())
          setBalances({
            base: baseB ? parseFloat(baseB.available).toFixed(4) : '0',
            quote: quoteB ? parseFloat(quoteB.available).toFixed(2) : '0',
          })
        }
      })
    }
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => clearInterval(interval)
  }, [address, info.baseTicker, info.quote])

  const availableBalance = side === 'buy' ? balances.quote : balances.base
  const availableAsset = side === 'buy' ? info.quote : info.baseTicker

  const total = useMemo(() => {
    const p = parseFloat(price)
    const s = parseFloat(size)
    if (!isNaN(p) && p > 0 && !isNaN(s) && s > 0) return (p * s).toFixed(4)
    return null
  }, [price, size])

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
    if ((orderType === 'limit' || orderType === 'stop') && !price) return
    setSubmitting(true)
    const priceRaw = orderType !== 'market' ? Math.round(parseFloat(price) * 1_000_000) : 0
    const sizeRaw = Math.round(parseFloat(size) * 1_000_000)
    const nonce = Date.now()
    try {
      const sig = await signOrder({ market: pair, side, price: priceRaw, quantity: sizeRaw, nonce, address })
      const body: PostOrderBody = {
        market: pair,
        side,
        order_type: orderType === 'stop' ? 'limit' : orderType,
        price: priceRaw,
        quantity: sizeRaw,
        nonce,
        address,
        signature: sig,
      }
      const res = await postOrder(body)
      if (res.ok) {
        onToast('Order placed', 'success')
        setSize('')
        if (orderType !== 'market') setPrice('')
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

  return (
    <div style={{ width: 240, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(232,228,216,0.07)', flexShrink: 0 }}>
        {(['limit', 'market', 'stop'] as OrderEntryType[]).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            style={{
              padding: '11px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: orderType === t ? '2px solid #E8E4D8' : '2px solid transparent',
              color: orderType === t ? '#E8E4D8' : 'rgba(232,228,216,0.25)',
              fontFamily: 'Inter, sans-serif',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              textAlign: 'center',
              borderRadius: 0,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, margin: '12px 12px 0', flexShrink: 0 }}>
        {(['buy', 'sell'] as OrderSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              padding: 9,
              textAlign: 'center',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              borderRadius: 0,
              border: side === s
                ? s === 'buy' ? '1px solid rgba(107,138,90,0.3)' : '1px solid rgba(204,51,51,0.3)'
                : '1px solid rgba(232,228,216,0.06)',
              background: side === s
                ? s === 'buy' ? 'rgba(107,138,90,0.18)' : 'rgba(204,51,51,0.18)'
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

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid rgba(232,228,216,0.05)' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(232,228,216,0.2)' }}>
            AVAILABLE
          </span>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: 'rgba(232,228,216,0.5)' }}>
            {availableBalance} {availableAsset}
          </span>
        </div>

        {(orderType === 'limit' || orderType === 'stop') && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.2)' }}>
                PRICE ({info.quote})
              </span>
            </div>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', background: '#111110', border: '1px solid rgba(232,228,216,0.08)', color: '#E8E4D8', fontFamily: 'Courier New, monospace', fontSize: 12, padding: '8px 10px', borderRadius: 0, outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(232,228,216,0.18)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(232,228,216,0.08)' }}
            />
            <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
              {[
                { label: 'BID', val: bestBid },
                { label: 'MID', val: midPrice },
                { label: 'ASK', val: bestAsk },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  onClick={() => val && setPrice(parseFloat(val).toFixed(4))}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: 'rgba(232,228,216,0.25)', padding: '2px 7px', border: '1px solid rgba(232,228,216,0.06)', background: 'transparent', cursor: 'pointer', borderRadius: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#E8E4D8'; e.currentTarget.style.borderColor = 'rgba(232,228,216,0.15)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(232,228,216,0.25)'; e.currentTarget.style.borderColor = 'rgba(232,228,216,0.06)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.2)', display: 'block', marginBottom: 4 }}>
            SIZE ({info.baseTicker})
          </span>
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="0.0000"
            style={{ width: '100%', background: '#111110', border: '1px solid rgba(232,228,216,0.08)', color: '#E8E4D8', fontFamily: 'Courier New, monospace', fontSize: 12, padding: '8px 10px', borderRadius: 0, outline: 'none', boxSizing: 'border-box' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(232,228,216,0.18)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(232,228,216,0.08)' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3, marginTop: 4 }}>
            {[{ label: '25%', pct: 0.25 }, { label: '50%', pct: 0.5 }, { label: '75%', pct: 0.75 }, { label: 'MAX', pct: 1 }].map(({ label, pct }) => (
              <button
                key={label}
                onClick={() => handlePctClick(pct)}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, padding: 4, border: '1px solid rgba(232,228,216,0.06)', color: 'rgba(232,228,216,0.25)', background: 'transparent', textAlign: 'center', cursor: 'pointer', borderRadius: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#E8E4D8'; e.currentTarget.style.borderColor = 'rgba(232,228,216,0.15)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(232,228,216,0.25)'; e.currentTarget.style.borderColor = 'rgba(232,228,216,0.06)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {orderType === 'limit' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              onClick={() => setPostOnly(!postOnly)}
              style={{ width: 16, height: 16, border: '1px solid rgba(232,228,216,0.15)', background: postOnly ? 'rgba(232,228,216,0.1)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              {postOnly && <span style={{ color: '#E8E4D8', fontSize: 10, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(232,228,216,0.35)' }}>Post-only</span>
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(232,228,216,0.06)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { label: 'TOTAL', value: total ? `${total} ${info.quote}` : '—' },
            { label: 'FEE', value: '0.00 USDC' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(232,228,216,0.2)' }}>{label}</span>
              <span style={{ fontFamily: 'Courier New, monospace', fontSize: 10, color: '#E8E4D8' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={isConnected ? handleSubmit : connect}
        disabled={isConnected && submitting}
        style={{
          margin: '0 12px 12px',
          padding: 12,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          borderRadius: 0,
          border: 'none',
          cursor: 'pointer',
          background: !isConnected
            ? 'rgba(232,228,216,0.07)'
            : side === 'buy'
            ? 'rgba(107,138,90,0.9)'
            : 'rgba(204,51,51,0.9)',
          color: !isConnected ? 'rgba(232,228,216,0.3)' : 'white',
          flexShrink: 0,
          opacity: isConnected && submitting ? 0.6 : 1,
        }}
      >
        {!isConnected
          ? 'CONNECT WALLET'
          : submitting
          ? '...'
          : side === 'buy'
          ? `BUY ${info.baseTicker}`
          : `SELL ${info.baseTicker}`}
      </button>
    </div>
  )
}

export default function TradingPage({ params }: { params: { pair: string } }) {
  const pair = decodeURIComponent(params.pair)
  const { toasts, addToast } = useToasts()

  const [bids, setBids] = useState<{ price: string; quantity: string }[]>([])
  const [asks, setAsks] = useState<{ price: string; quantity: string }[]>([])
  const [markets, setMarkets] = useState<MarketResponse[]>([])

  const market = useMemo(() => markets.find((m) => m.id === pair), [markets, pair])

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
    const interval = setInterval(fetchMarkets, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <style>{`
        @keyframes slideInRight { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(232,228,216,0.1); }
      `}</style>

      <div style={{ height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column', background: '#0C0C0C', overflow: 'hidden' }}>
        <TopBar pair={pair} market={market} />

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 200px 240px', overflow: 'hidden' }}>
          <ChartColumn pair={pair} midPrice={midPrice} onToast={addToast} />
          <OrderBookPanel bids={bids} asks={asks} pair={pair} />
          <OrderEntryPanel pair={pair} bids={bids} asks={asks} onToast={addToast} />
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </>
  )
}
