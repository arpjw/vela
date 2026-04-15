'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
  const barColor = side === 'bid' ? 'bg-primary/[0.14]' : 'bg-secondary/[0.12]'
  const priceColor = side === 'bid' ? 'text-success' : 'text-error'

  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-[11px] tabular-nums hover:bg-neutral-50 transition-colors duration-75 cursor-default select-none">
      <div
        className={`absolute inset-y-0 right-0 ${barColor} transition-[width] duration-100`}
        style={{ width: `${level.depthPct}%` }}
      />
      <span className={`relative z-10 font-mono font-medium ${priceColor}`}>{fmt(level.price, 4)}</span>
      <span className="relative z-10 font-mono text-neutral-600 text-right">{fmt(level.size, 4)}</span>
      <span className="relative z-10 font-mono text-neutral-400 text-right">{fmt(level.cumSize.toString(), 4)}</span>
    </div>
  )
}

function BookColumnHeader() {
  return (
    <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] font-medium text-stone uppercase tracking-[0.15em] border-b border-neutral-200 bg-surface sticky top-0">
      <span>Price</span>
      <span className="text-right">Size</span>
      <span className="text-right">Total</span>
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
      <div className="px-3 py-2.5 border-b border-neutral-200 flex items-center justify-between">
        <span className="text-[9px] font-medium text-stone uppercase tracking-[0.15em]">
          Order Book
        </span>
        {loading && <Spinner size="xs" className="text-stone" />}
      </div>

      <BookColumnHeader />

      <div className="flex flex-col-reverse">
        {askLevels.length === 0 && !loading ? (
          <p className="px-3 py-4 text-[11px] text-stone text-center">No asks</p>
        ) : (
          askLevels.map((lvl) => (
            <BookRowItem key={lvl.price} level={lvl} side="ask" />
          ))
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 bg-raised border-y border-neutral-200">
        <span className="text-[9px] font-medium text-stone uppercase tracking-[0.15em]">
          Spread
        </span>
        {spread ? (
          <span className="text-[11px] tabular-nums font-mono font-medium text-primary">
            {spread.abs}
            <span className="ml-1.5 text-stone font-normal">{spread.bps} bps</span>
          </span>
        ) : (
          <span className="text-[11px] text-stone">—</span>
        )}
      </div>

      <div>
        {bidLevels.length === 0 && !loading ? (
          <p className="px-3 py-4 text-[11px] text-stone text-center">No bids</p>
        ) : (
          bidLevels.map((lvl) => (
            <BookRowItem key={lvl.price} level={lvl} side="bid" />
          ))
        )}
      </div>
    </div>
  )
}

function TradesFeed({ trades }: { trades: TradeEntry[] }) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-neutral-200">
        <span className="text-[9px] font-medium text-stone uppercase tracking-[0.15em]">
          Recent Trades
        </span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] font-medium text-stone uppercase tracking-[0.15em] border-b border-neutral-200">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {trades.length === 0 ? (
        <p className="px-3 py-8 text-[11px] text-stone text-center">
          Waiting for trades…
        </p>
      ) : (
        trades.map((t) => (
          <div
            key={t.key}
            className="grid grid-cols-3 px-3 py-[3px] text-[11px] tabular-nums hover:bg-neutral-50 transition-colors duration-75 cursor-default select-none"
          >
            <span
              className={
                t.side === 'buy'
                  ? 'font-mono font-medium text-success'
                  : 'font-mono font-medium text-error'
              }
            >
              {fmt(t.price, 4)}
            </span>
            <span className="font-mono text-neutral-600 text-right">{fmt(t.size, 4)}</span>
            <span className="font-mono text-stone text-right">{fmtTime(t.ts)}</span>
          </div>
        ))
      )}
    </div>
  )
}

const TIF_OPTIONS: { value: TIF; label: string }[] = [
  { value: 'gtc',       label: 'GTC'       },
  { value: 'ioc',       label: 'IOC'       },
  { value: 'fok',       label: 'FOK'       },
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
      <div className="flex border border-neutral-200 bg-raised">
        {(['buy', 'sell'] as OrderSide[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSide(s)}
            className={[
              'flex-1 py-2.5 text-xs font-semibold transition-all duration-150 uppercase tracking-[0.12em]',
              side === s
                ? s === 'buy'
                  ? 'bg-success text-canvas'
                  : 'bg-error text-cream'
                : 'text-stone hover:text-cream',
            ].join(' ')}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-px bg-neutral-200">
        {(['limit', 'market'] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleType(t)}
            className={[
              'flex-1 py-1.5 text-[10px] font-medium transition-all duration-150 uppercase tracking-[0.12em]',
              orderType === t
                ? 'bg-raised text-cream'
                : 'bg-surface text-stone hover:text-cream',
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
        <div className="bg-raised border border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone uppercase tracking-[0.12em]">Total</span>
            <span className="tabular-nums font-mono font-medium text-cream">
              {total} {quote}
            </span>
          </div>
        </div>
      )}

      {orderType === 'limit' && (
        <div className="flex gap-px bg-neutral-200">
          {TIF_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTif(value)}
              className={[
                'flex-1 py-1 text-[9px] font-medium transition-all duration-150 uppercase tracking-[0.12em]',
                tif === value
                  ? 'bg-primary text-canvas'
                  : 'bg-surface text-stone hover:text-cream',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {submitError && (
        <p className="text-xs text-error font-mono">{submitError}</p>
      )}
      {submitOk && (
        <p className="text-xs font-medium text-success font-mono">Order submitted</p>
      )}

      {isConnected ? (
        <Button
          variant={side === 'buy' ? 'buy' : 'danger'}
          size="lg"
          loading={submitting}
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full tracking-[0.12em] uppercase text-sm"
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {base}
        </Button>
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
  if (loading) return <Spinner size="xs" className="text-stone" />
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
              ? 'bg-primary text-canvas'
              : 'bg-raised text-stone border border-neutral-200 hover:border-primary/40 hover:text-cream',
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
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 mb-6 pb-5 border-b border-neutral-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-primary/10 flex items-center justify-center text-xs font-bold text-primary font-mono shrink-0">
            {marketId.split('-')[0]?.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-base font-bold text-cream tracking-wide uppercase">
                {marketId}
              </h1>
              <WsStatusBadge status={wsStatus} />
            </div>
            <div className="flex items-end gap-5">
              <div>
                <span className="block text-[9px] uppercase tracking-[0.18em] text-stone mb-0.5">Best Bid</span>
                <span className="text-2xl font-mono font-bold text-success tabular-nums leading-none">
                  {bestBid ? fmt(bestBid, 4) : '—'}
                </span>
              </div>
              <div className="pb-0.5">
                <span className="block text-[9px] uppercase tracking-[0.18em] text-stone mb-0.5">Spread</span>
                <span className="text-lg font-mono font-bold text-primary tabular-nums leading-none">
                  {spread?.abs ?? '—'}
                  {spread && (
                    <span className="text-xs font-normal text-stone ml-1">{spread.bps} bps</span>
                  )}
                </span>
              </div>
              <div>
                <span className="block text-[9px] uppercase tracking-[0.18em] text-stone mb-0.5">Best Ask</span>
                <span className="text-2xl font-mono font-bold text-error tabular-nums leading-none">
                  {bestAsk ? fmt(bestAsk, 4) : '—'}
                </span>
              </div>
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
        <Card padding="none" className="overflow-hidden">
          <OrderBook bids={bids} asks={asks} loading={bookLoading} />
        </Card>

        <Card padding="none" className="overflow-hidden">
          <TradesFeed trades={trades} />
        </Card>

        <Card padding="sm">
          <OrderEntryForm
            marketId={marketId}
            address={address}
            isConnected={isConnected}
            bestBid={bestBid}
            bestAsk={bestAsk}
          />
        </Card>
      </div>
    </div>
  )
}
