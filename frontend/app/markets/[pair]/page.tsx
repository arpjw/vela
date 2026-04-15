'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getBook,
  listMarkets,
  postOrder,
  type MarketResponse,
  type PostOrderBody,
} from '@/lib/api'
import { getWsClient, type WsStatus } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Card } from '@/components/ui/Card'

const MAX_BOOK_ROWS = 15
const MAX_TRADES = 50
const EASE = [0.25, 0.1, 0.25, 1] as const

type RawLevel = [string, string]

interface DepthLevel {
  price: string
  size: string
  cumSize: number
  depthPct: number
}

interface TradeEntry {
  key: string
  price: string
  size: string
  side: 'buy' | 'sell'
  ts: number
}

type OrderSide = 'buy' | 'sell'
type OrderType = 'limit' | 'market'
type TIF = 'gtc' | 'ioc' | 'fok' | 'post_only'

function buildDepth(levels: RawLevel[], n: number): DepthLevel[] {
  const rows = levels.slice(0, n)
  let cum = 0
  const withCum = rows.map(([price, size]) => {
    cum += parseFloat(size)
    return { price, size, cumSize: cum }
  })
  const maxCum = cum
  return withCum.map((r) => ({
    ...r,
    depthPct: maxCum > 0 ? (r.cumSize / maxCum) * 100 : 0,
  }))
}

function fmt(n: string, dec = 2): string {
  const v = parseFloat(n)
  return isNaN(v) ? n : v.toFixed(dec)
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function calcSpread(
  bids: RawLevel[],
  asks: RawLevel[],
): { abs: string; bps: string } | null {
  if (!bids[0] || !asks[0]) return null
  const bid = parseFloat(bids[0][0])
  const ask = parseFloat(asks[0][0])
  if (isNaN(bid) || isNaN(ask) || ask <= 0) return null
  const abs = ask - bid
  const bps = (abs / ask) * 10_000
  return { abs: abs.toFixed(4), bps: bps.toFixed(2) }
}

function WsStatusBadge({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { label: string; variant: 'success' | 'warning' | 'error' }> = {
    connected:    { label: 'Live',         variant: 'success' },
    connecting:   { label: 'Connecting',   variant: 'warning' },
    reconnecting: { label: 'Reconnecting', variant: 'warning' },
    disconnected: { label: 'Offline',      variant: 'error'   },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant} dot size="sm">{label}</Badge>
}

function BookRowItem({
  level,
  side,
}: {
  level: DepthLevel
  side: 'bid' | 'ask'
}) {
  const prevPrice = useRef<string>(level.price)
  const [flashClass, setFlashClass] = useState('')

  useEffect(() => {
    if (prevPrice.current === level.price) return
    const prev = parseFloat(prevPrice.current)
    const curr = parseFloat(level.price)
    prevPrice.current = level.price
    const cls = curr > prev ? 'flash-up' : 'flash-down'
    setFlashClass(cls)
    const t = setTimeout(() => setFlashClass(''), 400)
    return () => clearTimeout(t)
  }, [level.price])

  const barStyle = side === 'bid'
    ? 'linear-gradient(to left, rgba(196,148,58,0.25), rgba(196,148,58,0.05))'
    : 'linear-gradient(to left, rgba(74,109,156,0.25), rgba(74,109,156,0.05))'
  const priceColor = side === 'bid' ? 'text-ochre' : 'text-terra'
  const hoverBg = side === 'bid' ? 'hover:bg-[rgba(196,148,58,0.08)]' : 'hover:bg-[rgba(74,109,156,0.08)]'

  return (
    <div
      className={`relative grid grid-cols-3 px-3 py-[3px] text-[11px] tabular-nums ${hoverBg} transition-colors duration-75 cursor-default select-none ${flashClass}`}
    >
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: `${level.depthPct}%`, background: barStyle, transition: 'width 300ms cubic-bezier(0.25, 0.1, 0.25, 1)' }}
      />
      <span className={`relative z-10 font-mono font-medium ${priceColor}`}>{fmt(level.price, 4)}</span>
      <span className="relative z-10 font-mono text-ink text-right">{fmt(level.size, 4)}</span>
      <span className="relative z-10 font-mono text-brown text-right">{fmt(level.cumSize.toString(), 4)}</span>
    </div>
  )
}

function BookColumnHeader() {
  return (
    <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] font-medium text-brown uppercase tracking-[0.12em] border-b border-border bg-canvas sticky top-0">
      <span>Price</span>
      <span className="text-right">Size</span>
      <span className="text-right">Total</span>
    </div>
  )
}

function BestPriceDisplay({ value, label, color }: { value: string | null; label: string; color: string }) {
  return (
    <div>
      <span className="block text-[9px] uppercase tracking-[0.18em] text-brown mb-0.5">{label}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={value ?? 'empty'}
          initial={{ scale: 1.08, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="tabular-nums leading-none font-mono font-semibold"
          style={{ fontSize: '2rem', color, display: 'block' }}
        >
          {value ? fmt(value, 4) : '—'}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

function DepthCanvas({ bids, asks }: { bids: RawLevel[]; asks: RawLevel[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.offsetWidth
    const h = canvas.height
    canvas.width = w

    ctx.clearRect(0, 0, w, h)

    const midX = w / 2

    const allBidSizes = bids.map(([, s]) => parseFloat(s))
    const allAskSizes = asks.map(([, s]) => parseFloat(s))
    const maxSize = Math.max(...allBidSizes, ...allAskSizes, 0.0001)

    let bidCum = 0
    const totalBidCum = bids.reduce((acc, [, s]) => acc + parseFloat(s), 0)
    bids.slice(0, MAX_BOOK_ROWS).forEach(([, size], i) => {
      bidCum += parseFloat(size)
      const alpha = totalBidCum > 0 ? (bidCum / totalBidCum) * 0.8 + 0.1 : 0.2
      const strokeW = 1.5 + (parseFloat(size) / maxSize) * 3
      const yBase = h * 0.5
      const yOff = (i - bids.length / 2) * (h / bids.length) * 1.2
      const extentX = midX * (bidCum / totalBidCum) * 0.9

      ctx.beginPath()
      ctx.moveTo(midX, yBase + yOff)
      ctx.bezierCurveTo(
        midX - extentX * 0.3, yBase + yOff,
        midX - extentX * 0.7, yBase + yOff + yOff * 0.1,
        midX - extentX, yBase + yOff,
      )
      ctx.strokeStyle = `rgba(196, 148, 58, ${alpha})`
      ctx.lineWidth = strokeW
      ctx.stroke()
    })

    let askCum = 0
    const totalAskCum = asks.reduce((acc, [, s]) => acc + parseFloat(s), 0)
    asks.slice(0, MAX_BOOK_ROWS).forEach(([, size], i) => {
      askCum += parseFloat(size)
      const alpha = totalAskCum > 0 ? (askCum / totalAskCum) * 0.8 + 0.1 : 0.2
      const strokeW = 1.5 + (parseFloat(size) / maxSize) * 3
      const yBase = h * 0.5
      const yOff = (i - asks.length / 2) * (h / asks.length) * 1.2
      const extentX = midX * (askCum / totalAskCum) * 0.9

      ctx.beginPath()
      ctx.moveTo(midX, yBase + yOff)
      ctx.bezierCurveTo(
        midX + extentX * 0.3, yBase + yOff,
        midX + extentX * 0.7, yBase + yOff + yOff * 0.1,
        midX + extentX, yBase + yOff,
      )
      ctx.strokeStyle = `rgba(74, 109, 156, ${alpha})`
      ctx.lineWidth = strokeW
      ctx.stroke()
    })
  }, [bids, asks])

  return (
    <div className="border-t border-border">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[0.65rem] font-medium text-brown uppercase tracking-[0.15em]">Depth</span>
      </div>
      <canvas ref={canvasRef} height={160} className="w-full block" style={{ background: 'transparent' }} />
    </div>
  )
}

function OrderBook({
  bids,
  asks,
  loading,
}: {
  bids: RawLevel[]
  asks: RawLevel[]
  loading: boolean
}) {
  const bidLevels = useMemo(() => buildDepth(bids, MAX_BOOK_ROWS), [bids])
  const askLevels = useMemo(() => buildDepth(asks, MAX_BOOK_ROWS), [asks])
  const spread = useMemo(() => calcSpread(bids, asks), [bids, asks])

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[0.65rem] font-medium text-fresco uppercase tracking-[0.15em]">
          Asks
        </span>
        {loading && <Spinner size="xs" className="text-brown" />}
      </div>

      <BookColumnHeader />

      <div className="flex flex-col-reverse">
        {askLevels.length === 0 && !loading ? (
          <p className="px-3 py-4 text-[11px] text-brown text-center">No asks</p>
        ) : (
          askLevels.map((lvl) => (
            <BookRowItem key={lvl.price} level={lvl} side="ask" />
          ))
        )}
      </div>

      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center justify-between px-3 py-1.5 bg-[rgba(196,148,58,0.12)] border-y border-[rgba(196,148,58,0.3)]"
      >
        <span className="text-[9px] font-medium text-brown uppercase tracking-[0.15em]">
          Spread
        </span>
        {spread ? (
          <span className="text-[11px] tabular-nums font-mono font-medium text-ochre">
            {spread.abs}
            <span className="ml-1.5 text-brown font-normal">{spread.bps} bps</span>
          </span>
        ) : (
          <span className="text-[11px] text-brown">—</span>
        )}
      </motion.div>

      <div className="px-3 py-1.5 border-b border-border">
        <span className="text-[0.65rem] font-medium text-ochre uppercase tracking-[0.15em]">
          Bids
        </span>
      </div>

      <div>
        {bidLevels.length === 0 && !loading ? (
          <p className="px-3 py-4 text-[11px] text-brown text-center">No bids</p>
        ) : (
          bidLevels.map((lvl) => (
            <BookRowItem key={lvl.price} level={lvl} side="bid" />
          ))
        )}
      </div>

      <DepthCanvas bids={bids} asks={asks} />
    </div>
  )
}

function TradesFeed({ trades }: { trades: TradeEntry[] }) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-[0.65rem] font-medium text-brown uppercase tracking-[0.15em]">
          Recent Trades
        </span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] font-medium text-brown uppercase tracking-[0.12em] border-b border-border">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {trades.length === 0 ? (
        <p className="px-3 py-8 text-[11px] text-brown text-center">
          Waiting for trades…
        </p>
      ) : (
        <AnimatePresence initial={false}>
          {trades.map((t) => (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-3 px-3 py-[3px] text-[11px] tabular-nums hover:bg-[rgba(196,148,58,0.08)] transition-colors duration-75 cursor-default select-none overflow-hidden"
            >
              <span
                className={
                  t.side === 'buy'
                    ? 'font-mono font-medium text-sage'
                    : 'font-mono font-medium text-terra'
                }
              >
                {fmt(t.price, 4)}
              </span>
              <span className="font-mono text-ink text-right">{fmt(t.size, 4)}</span>
              <span className="font-mono text-brown text-right text-[0.7rem]">{fmtTime(t.ts)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}

const TIF_OPTIONS: { value: TIF; label: string }[] = [
  { value: 'gtc',       label: 'GTC'  },
  { value: 'ioc',       label: 'IOC'  },
  { value: 'fok',       label: 'FOK'  },
  { value: 'post_only', label: 'Post' },
]

function OrderEntryForm({
  marketId,
  address,
  isConnected,
  bestBid,
  bestAsk,
}: {
  marketId: string
  address: string | null
  isConnected: boolean
  bestBid: string | null
  bestAsk: string | null
}) {
  const [side, setSide] = useState<OrderSide>('buy')
  const [orderType, setOrderType] = useState<OrderType>('limit')
  const [tif, setTif] = useState<TIF>('gtc')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState(false)

  const [base, quote] = useMemo(() => {
    const parts = marketId.split('-')
    return [parts[0] ?? 'BASE', parts[1] ?? 'QUOTE']
  }, [marketId])

  const total = useMemo(() => {
    const p = parseFloat(price)
    const s = parseFloat(size)
    if (!isNaN(p) && p > 0 && !isNaN(s) && s > 0) {
      return (p * s).toFixed(4)
    }
    return null
  }, [price, size])

  const handleSide = useCallback((s: OrderSide) => {
    setSide(s)
    setSubmitError(null)
    setSubmitOk(false)
  }, [])

  const handleType = useCallback(
    (t: OrderType) => {
      setOrderType(t)
      if (t === 'market' && tif === 'post_only') setTif('gtc')
      setSubmitError(null)
      setSubmitOk(false)
    },
    [tif],
  )

  const handleSubmit = useCallback(async () => {
    if (!address || !size) return
    if (orderType === 'limit' && !price) return

    setSubmitting(true)
    setSubmitError(null)
    setSubmitOk(false)

    try {
      const body: PostOrderBody = {
        market: marketId,
        side,
        order_type: orderType,
        price: orderType === 'limit' ? Math.round(parseFloat(price) * 1e8) : 0,
        quantity: Math.round(parseFloat(size) * 1e8),
        nonce: Date.now(),
        address,
        signature: '0x',
      }
      const res = await postOrder(body)
      if (res.ok) {
        setSubmitOk(true)
        setSize('')
        setPrice('')
        setTimeout(() => setSubmitOk(false), 2500)
      } else {
        setSubmitError(res.error ?? 'Order failed')
      }
    } catch {
      setSubmitError('Network error')
    } finally {
      setSubmitting(false)
    }
  }, [address, marketId, orderType, price, side, size])

  const canSubmit =
    isConnected &&
    size !== '' &&
    parseFloat(size) > 0 &&
    (orderType === 'market' || (price !== '' && parseFloat(price) > 0)) &&
    !submitting

  return (
    <div className="flex flex-col gap-4">
      <div className="flex border border-border bg-vellum">
        {(['buy', 'sell'] as OrderSide[]).map((s) => (
          <motion.button
            key={s}
            type="button"
            onClick={() => handleSide(s)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-all duration-150 uppercase tracking-[0.12em]',
              side === s
                ? s === 'buy'
                  ? 'bg-sage text-vellum'
                  : 'bg-terra text-vellum'
                : 'text-brown hover:text-ink',
            ].join(' ')}
          >
            {s}
          </motion.button>
        ))}
      </div>

      <div className="flex gap-px bg-border">
        {(['limit', 'market'] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleType(t)}
            className={[
              'flex-1 py-1.5 text-[10px] font-medium transition-all duration-150 uppercase tracking-[0.12em]',
              orderType === t
                ? 'bg-violet text-vellum'
                : 'bg-vellum text-brown hover:text-ink',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {orderType === 'limit' && (
        <Input
          label="Price"
          type="number"
          min="0"
          step="0.0001"
          placeholder={
            side === 'buy' ? (bestAsk ?? '0.0000') : (bestBid ?? '0.0000')
          }
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          endAdornment={quote}
        />
      )}

      <Input
        label="Size"
        type="number"
        min="0"
        step="0.0001"
        placeholder="0.0000"
        value={size}
        onChange={(e) => setSize(e.target.value)}
        endAdornment={base}
      />

      {total !== null && (
        <div className="bg-vellum border border-border px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-brown uppercase tracking-[0.12em]">Total</span>
            <span className="tabular-nums font-mono font-medium text-ochre">
              {total} {quote}
            </span>
          </div>
        </div>
      )}

      {orderType === 'limit' && (
        <div className="flex gap-px bg-border">
          {TIF_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTif(value)}
              className={[
                'flex-1 py-1 text-[9px] font-medium transition-all duration-150 uppercase tracking-[0.12em]',
                tif === value
                  ? 'bg-violet text-vellum'
                  : 'bg-vellum border border-[rgba(101,72,42,0.25)] text-brown hover:text-ink',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {submitError && (
        <p className="text-xs text-terra font-mono">{submitError}</p>
      )}
      {submitOk && (
        <p className="text-xs font-medium text-sage font-mono">Order submitted</p>
      )}

      {isConnected ? (
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className={[
            'w-full h-12 font-sans font-semibold text-sm uppercase tracking-[0.1em] transition-all duration-150 disabled:opacity-50',
            side === 'buy'
              ? 'bg-sage text-vellum hover:bg-[#5A7A42]'
              : 'bg-terra text-vellum hover:bg-[#8B3020]',
            submitting ? 'opacity-70' : '',
          ].join(' ')}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full border-2 border-vellum border-t-transparent animate-spin" />
              {side === 'buy' ? 'Buy' : 'Sell'} {base}
            </span>
          ) : (
            `${side === 'buy' ? 'Buy' : 'Sell'} ${base}`
          )}
        </motion.button>
      ) : (
        <Button variant="secondary" size="lg" className="w-full tracking-wide" disabled>
          Connect Wallet to Trade
        </Button>
      )}
    </div>
  )
}

function MarketSelector({
  markets,
  currentPair,
  loading,
}: {
  markets: MarketResponse[]
  currentPair: string
  loading: boolean
}) {
  if (loading) return <Spinner size="xs" className="text-brown" />
  if (markets.length === 0) return null

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {markets.map((m) => (
        <Link
          key={m.id}
          href={`/markets/${encodeURIComponent(m.id)}`}
          className={[
            'px-2.5 py-1 text-[10px] font-medium transition-colors duration-150 uppercase tracking-[0.1em]',
            m.id === currentPair
              ? 'bg-ochre text-ink'
              : 'bg-vellum text-brown border border-border hover:border-ochre/40 hover:text-ink',
          ].join(' ')}
        >
          {m.base}/{m.quote}
        </Link>
      ))}
    </div>
  )
}

interface PageProps {
  params: Promise<{ pair: string }>
}

export default function MarketPage({ params }: PageProps) {
  const { pair } = use(params)
  const marketId = decodeURIComponent(pair)

  const { address, isConnected } = useAuth()

  const [bids, setBids] = useState<RawLevel[]>([])
  const [asks, setAsks] = useState<RawLevel[]>([])
  const [bookLoading, setBookLoading] = useState(true)
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected')
  const [markets, setMarkets] = useState<MarketResponse[]>([])
  const [marketsLoading, setMarketsLoading] = useState(true)

  const wsRef = useRef(getWsClient())

  const bestBid = bids[0]?.[0] ?? null
  const bestAsk = asks[0]?.[0] ?? null
  const spread = useMemo(() => calcSpread(bids, asks), [bids, asks])

  useEffect(() => {
    setBookLoading(true)
    setBids([])
    setAsks([])
    setTrades([])
    getBook(marketId)
      .then((res) => {
        if (res.ok && res.data) {
          setBids(res.data.bids.map((l) => [l.price, l.quantity] as RawLevel))
          setAsks(res.data.asks.map((l) => [l.price, l.quantity] as RawLevel))
        }
      })
      .finally(() => setBookLoading(false))
  }, [marketId])

  useEffect(() => {
    listMarkets()
      .then((res) => {
        if (res.ok && res.data) setMarkets(res.data)
      })
      .finally(() => setMarketsLoading(false))
  }, [])

  useEffect(() => {
    const ws = wsRef.current
    const channels = [`book:${marketId}`, `trades:${marketId}`]

    const unsubStatus = ws.onStatus((s) => {
      setWsStatus(s)
      if (s === 'connected') ws.subscribe(channels)
    })

    const unsubMsg = ws.onMessage((msg) => {
      if (msg.type === 'book_snapshot' && msg.market === marketId) {
        setBids(msg.bids as RawLevel[])
        setAsks(msg.asks as RawLevel[])
        setBookLoading(false)
      }
      if (msg.type === 'trade' && msg.market === marketId) {
        const entry: TradeEntry = {
          key: `${msg.timestamp}-${msg.price}-${crypto.getRandomValues(new Uint32Array(1))[0]}`,
          price: msg.price,
          size: msg.quantity,
          side: msg.side as OrderSide,
          ts: msg.timestamp,
        }
        setTrades((prev) => [entry, ...prev].slice(0, MAX_TRADES))
      }
    })

    ws.connect()
    if (ws.status === 'connected') ws.subscribe(channels)

    return () => {
      unsubStatus()
      unsubMsg()
      ws.unsubscribe(channels)
    }
  }, [marketId])

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 mb-6 pb-5 border-b border-border">
        <div className="flex items-start gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="w-10 h-10 bg-ochre/10 flex items-center justify-center text-xs font-bold text-ochre font-mono shrink-0"
          >
            {marketId.split('-')[0]?.slice(0, 2)}
          </motion.div>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="text-[1.5rem] font-bold text-ink tracking-wide uppercase"
              >
                {marketId}
              </motion.h1>
              <WsStatusBadge status={wsStatus} />
            </div>
            <div className="flex items-end gap-5">
              <BestPriceDisplay value={bestBid} label="Best Bid" color="#C4943A" />
              <div className="pb-0.5 text-center">
                <span className="block text-[9px] uppercase tracking-[0.18em] text-brown mb-0.5">Spread</span>
                <motion.span
                  key={spread?.abs ?? 'empty'}
                  initial={{ scale: 1.06, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-[1.1rem] font-mono font-medium text-fresco tabular-nums leading-none block"
                >
                  {spread?.abs ?? '—'}
                  {spread && (
                    <span className="text-xs font-normal text-brown ml-1">{spread.bps} bps</span>
                  )}
                </motion.span>
              </div>
              <BestPriceDisplay value={bestAsk} label="Best Ask" color="#A0402A" />
            </div>
          </div>
        </div>

        <div className="ml-auto">
          <MarketSelector
            markets={markets}
            currentPair={marketId}
            loading={marketsLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,280px)_1fr_minmax(280px,320px)] gap-4 items-start">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        >
          <Card padding="none" className="overflow-hidden">
            <OrderBook bids={bids} asks={asks} loading={bookLoading} />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
        >
          <Card padding="none" className="overflow-hidden">
            <TradesFeed trades={trades} />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
          className="bg-canvas border border-border shadow-card p-6"
        >
          <OrderEntryForm
            marketId={marketId}
            address={address}
            isConnected={isConnected}
            bestBid={bestBid}
            bestAsk={bestAsk}
          />
        </motion.div>
      </div>
    </div>
  )
}
