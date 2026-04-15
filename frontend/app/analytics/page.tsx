'use client'

import { useEffect, useMemo, useReducer, useRef } from 'react'
import { listMarkets, getBook, type MarketResponse } from '@/lib/api'
import { getWsClient } from '@/lib/ws'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'

const WINDOW_MS = 5 * 60 * 1000

interface TradePoint {
  ts: number
  price: number
  size: number
  side: 'buy' | 'sell'
}

interface SpreadPoint {
  ts: number
  bps: number
}

interface DepthState {
  bids: [string, string][]
  asks: [string, string][]
  ofi: number
  spreadBps: number | null
  ts: number
}

interface AnalyticsState {
  markets: MarketResponse[]
  selectedMarket: string | null
  tradesByMarket: Record<string, TradePoint[]>
  spreadByMarket: Record<string, SpreadPoint[]>
  depthByMarket: Record<string, DepthState>
  marketsLoading: boolean
}

type AnalyticsAction =
  | { type: 'INIT_MARKETS'; markets: MarketResponse[] }
  | { type: 'SELECT_MARKET'; market: string }
  | { type: 'ADD_TRADE'; market: string; trade: TradePoint }
  | {
      type: 'DEPTH_POLL'
      market: string
      bids: [string, string][]
      asks: [string, string][]
    }
  | { type: 'PRUNE'; cutoff: number }

const initState: AnalyticsState = {
  markets: [],
  selectedMarket: null,
  tradesByMarket: {},
  spreadByMarket: {},
  depthByMarket: {},
  marketsLoading: true,
}

function analyticsReducer(
  state: AnalyticsState,
  action: AnalyticsAction,
): AnalyticsState {
  switch (action.type) {
    case 'INIT_MARKETS':
      return {
        ...state,
        markets: action.markets,
        selectedMarket: state.selectedMarket ?? action.markets[0]?.id ?? null,
        marketsLoading: false,
      }

    case 'SELECT_MARKET':
      return { ...state, selectedMarket: action.market }

    case 'ADD_TRADE': {
      const prev = state.tradesByMarket[action.market] ?? []
      return {
        ...state,
        tradesByMarket: {
          ...state.tradesByMarket,
          [action.market]: [...prev, action.trade].slice(-3000),
        },
      }
    }

    case 'DEPTH_POLL': {
      const bids10 = action.bids.slice(0, 10)
      const asks10 = action.asks.slice(0, 10)
      const bidDepth = bids10.reduce((s, [, sz]) => s + parseFloat(sz), 0)
      const askDepth = asks10.reduce((s, [, sz]) => s + parseFloat(sz), 0)
      const total = bidDepth + askDepth
      const ofi = total > 0 ? (bidDepth - askDepth) / total : 0

      const bestBid = action.bids[0] ? parseFloat(action.bids[0][0]) : null
      const bestAsk = action.asks[0] ? parseFloat(action.asks[0][0]) : null
      const mid =
        bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null
      const spreadBps =
        bestBid !== null && bestAsk !== null && mid !== null && mid > 0
          ? ((bestAsk - bestBid) / mid) * 10_000
          : null

      const prevSpread = state.spreadByMarket[action.market] ?? []
      const newSpread =
        spreadBps !== null
          ? [...prevSpread, { ts: Date.now(), bps: spreadBps }].slice(-1500)
          : prevSpread

      return {
        ...state,
        depthByMarket: {
          ...state.depthByMarket,
          [action.market]: {
            bids: action.bids,
            asks: action.asks,
            ofi,
            spreadBps,
            ts: Date.now(),
          },
        },
        spreadByMarket: {
          ...state.spreadByMarket,
          [action.market]: newSpread,
        },
      }
    }

    case 'PRUNE': {
      const prunedTrades: Record<string, TradePoint[]> = {}
      for (const [mkt, trades] of Object.entries(state.tradesByMarket)) {
        prunedTrades[mkt] = trades.filter((t) => t.ts >= action.cutoff)
      }
      const prunedSpread: Record<string, SpreadPoint[]> = {}
      for (const [mkt, pts] of Object.entries(state.spreadByMarket)) {
        prunedSpread[mkt] = pts.filter((p) => p.ts >= action.cutoff)
      }
      return {
        ...state,
        tradesByMarket: prunedTrades,
        spreadByMarket: prunedSpread,
      }
    }

    default:
      return state
  }
}

function stepPath(
  levels: { price: number; cum: number }[],
  toX: (p: number) => number,
  toY: (c: number) => number,
  bottomY: number,
): string {
  if (levels.length === 0) return ''
  const pts: string[] = [`M ${toX(levels[0].price)} ${bottomY}`]
  for (let i = 0; i < levels.length; i++) {
    pts.push(`L ${toX(levels[i].price)} ${toY(levels[i].cum)}`)
    if (i < levels.length - 1) {
      pts.push(`L ${toX(levels[i + 1].price)} ${toY(levels[i].cum)}`)
    }
  }
  pts.push(`L ${toX(levels[levels.length - 1].price)} ${bottomY} Z`)
  return pts.join(' ')
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs text-stone font-mono">
      {label}
    </div>
  )
}

function SpreadChart({ history }: { history: SpreadPoint[] }) {
  const W = 600
  const H = 140
  const PAD = { top: 14, right: 14, bottom: 32, left: 46 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const bottomY = PAD.top + innerH

  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const visible = history.filter((p) => p.ts >= windowStart)

  if (visible.length < 2) {
    return (
      <div style={{ height: H }}>
        <ChartEmpty label="Waiting for data…" />
      </div>
    )
  }

  const bpsValues = visible.map((p) => p.bps)
  const minBps = Math.min(...bpsValues)
  const maxBps = Math.max(...bpsValues)
  const bpsRange = maxBps - minBps || 1
  const pad = bpsRange * 0.1

  const toX = (ts: number) =>
    PAD.left + ((ts - windowStart) / (now - windowStart)) * innerW
  const toY = (bps: number) =>
    PAD.top +
    innerH -
    ((bps - (minBps - pad)) / (bpsRange + 2 * pad)) * innerH

  const linePoints = visible.map((p) => `${toX(p.ts)},${toY(p.bps)}`).join(' ')
  const lastPt = visible[visible.length - 1]!
  const fillPoints = [
    `${toX(visible[0]!.ts)},${bottomY}`,
    linePoints,
    `${toX(lastPt.ts)},${bottomY}`,
  ].join(' ')

  const yLabels = [minBps - pad, (minBps + maxBps) / 2, maxBps + pad]
  const minuteMarks = [0, 1, 2, 3, 4, 5].map((m) => ({
    ts: now - m * 60_000,
    label: m === 0 ? 'now' : `-${m}m`,
  }))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          y1={PAD.top + innerH * f}
          x2={PAD.left + innerW}
          y2={PAD.top + innerH * f}
          stroke="#2E2318"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
      ))}

      <polygon points={fillPoints} fill="#C4943A" fillOpacity="0.08" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#C4943A"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <circle
        cx={toX(lastPt.ts)}
        cy={toY(lastPt.bps)}
        r="3"
        fill="#C4943A"
      />

      {minuteMarks.map(({ ts, label }) => (
        <text
          key={label}
          x={toX(ts)}
          y={H - 6}
          textAnchor="middle"
          fontSize="9"
          fill="#8B7355"
          fontFamily="JetBrains Mono, monospace"
        >
          {label}
        </text>
      ))}

      {yLabels.map((v) => (
        <text
          key={v}
          x={PAD.left - 6}
          y={toY(v) + 3}
          textAnchor="end"
          fontSize="9"
          fill="#8B7355"
          fontFamily="JetBrains Mono, monospace"
        >
          {v.toFixed(1)}
        </text>
      ))}

      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={bottomY}
        stroke="#2E2318"
        strokeWidth="0.5"
      />
      <line
        x1={PAD.left}
        y1={bottomY}
        x2={PAD.left + innerW}
        y2={bottomY}
        stroke="#2E2318"
        strokeWidth="0.5"
      />
    </svg>
  )
}

function OFIBar({ ofi }: { ofi: number }) {
  const bidPct = Math.max(0, ofi) * 50
  const askPct = Math.max(0, -ofi) * 50
  const isBidHeavy = ofi >= 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
        <span>Ask pressure</span>
        <span
          className={[
            'text-xs font-bold tabular-nums',
            isBidHeavy ? 'text-success' : 'text-error',
          ].join(' ')}
        >
          {ofi >= 0 ? '+' : ''}
          {(ofi * 100).toFixed(1)}%
        </span>
        <span>Bid pressure</span>
      </div>

      <div className="relative h-7 bg-raised overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-300 z-10" />

        {isBidHeavy ? (
          <div
            className="absolute top-0 bottom-0 bg-success/60 rounded-r-xl transition-[width] duration-300"
            style={{ left: '50%', width: `${bidPct}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 bg-error/60 rounded-l-xl transition-[width] duration-300"
            style={{ right: '50%', width: `${askPct}%` }}
          />
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] font-semibold text-stone tabular-nums uppercase tracking-[0.1em]">
            {isBidHeavy ? 'Bid-heavy' : 'Ask-heavy'}
          </span>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-neutral-400">
        <span>−100%</span>
        <span>0</span>
        <span>+100%</span>
      </div>
    </div>
  )
}

function DepthChart({ depth }: { depth: DepthState | null }) {
  const W = 600
  const H = 160
  const PAD = { top: 14, right: 14, bottom: 36, left: 48 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const bottomY = PAD.top + innerH

  if (!depth || (depth.bids.length === 0 && depth.asks.length === 0)) {
    return (
      <div style={{ height: H }}>
        <ChartEmpty label="Waiting for depth data…" />
      </div>
    )
  }

  const bids10 = depth.bids.slice(0, 10)
  const asks10 = depth.asks.slice(0, 10)

  let bidCum = 0
  const bidLevels = bids10.map(([p, s]) => {
    bidCum += parseFloat(s)
    return { price: parseFloat(p), cum: bidCum }
  })

  let askCum = 0
  const askLevels = asks10.map(([p, s]) => {
    askCum += parseFloat(s)
    return { price: parseFloat(p), cum: askCum }
  })

  const allPrices = [
    ...bidLevels.map((l) => l.price),
    ...askLevels.map((l) => l.price),
  ]
  if (allPrices.length === 0) {
    return (
      <div style={{ height: H }}>
        <ChartEmpty label="No price data" />
      </div>
    )
  }

  const minPrice = Math.min(...allPrices)
  const maxPrice = Math.max(...allPrices)
  const priceRange = maxPrice - minPrice || 1
  const pricePad = priceRange * 0.05
  const maxCum = Math.max(bidCum, askCum, 0.001)

  const toX = (p: number) =>
    PAD.left +
    ((p - (minPrice - pricePad)) / (priceRange + 2 * pricePad)) * innerW
  const toY = (c: number) =>
    PAD.top + innerH - (c / (maxCum * 1.05)) * innerH

  const bidPath = stepPath(bidLevels, toX, toY, bottomY)
  const askPath = stepPath(askLevels, toX, toY, bottomY)

  const midPrice =
    bidLevels[0] && askLevels[0]
      ? (bidLevels[0].price + askLevels[0].price) / 2
      : null

  const priceTickCount = 5
  const priceTicks = Array.from({ length: priceTickCount }, (_, i) => {
    const p = minPrice - pricePad + ((priceRange + 2 * pricePad) * i) / (priceTickCount - 1)
    return p
  })

  const cumTicks = [0, maxCum * 0.5, maxCum]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          y1={PAD.top + innerH * f}
          x2={PAD.left + innerW}
          y2={PAD.top + innerH * f}
          stroke="#2E2318"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
      ))}

      {bidPath && (
        <>
          <path d={bidPath} fill="#C4943A" fillOpacity="0.18" />
          <path
            d={bidPath}
            fill="none"
            stroke="#C4943A"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </>
      )}

      {askPath && (
        <>
          <path d={askPath} fill="#6B85A8" fillOpacity="0.18" />
          <path
            d={askPath}
            fill="none"
            stroke="#6B85A8"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </>
      )}

      {midPrice !== null && (
        <line
          x1={toX(midPrice)}
          y1={PAD.top}
          x2={toX(midPrice)}
          y2={bottomY}
          stroke="#3D3024"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}

      {priceTicks.map((p, i) => (
        <text
          key={i}
          x={toX(p)}
          y={H - 6}
          textAnchor="middle"
          fontSize="8.5"
          fill="#8B7355"
          fontFamily="JetBrains Mono, monospace"
        >
          {p.toFixed(2)}
        </text>
      ))}

      {cumTicks.map((c) => (
        <text
          key={c}
          x={PAD.left - 6}
          y={toY(c) + 3}
          textAnchor="end"
          fontSize="8.5"
          fill="#8B7355"
          fontFamily="JetBrains Mono, monospace"
        >
          {c.toFixed(2)}
        </text>
      ))}

      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={bottomY}
        stroke="#2E2318"
        strokeWidth="0.5"
      />
      <line
        x1={PAD.left}
        y1={bottomY}
        x2={PAD.left + innerW}
        y2={bottomY}
        stroke="#2E2318"
        strokeWidth="0.5"
      />
    </svg>
  )
}

function VWASIndicator({
  current,
  ago60s,
}: {
  current: number | null
  ago60s: number | null
}) {
  const trend =
    current !== null && ago60s !== null
      ? current > ago60s + 0.01
        ? 'up'
        : current < ago60s - 0.01
        ? 'down'
        : 'flat'
      : null

  return (
    <div>
      <div className="text-[9px] font-medium text-stone uppercase tracking-[0.15em] mb-2">
        VW Avg Spread
      </div>
      <div className="text-3xl font-mono font-bold tabular-nums text-primary">
        {current !== null ? current.toFixed(2) : '—'}
        <span className="text-sm font-normal text-stone ml-1">bps</span>
      </div>
      {trend !== null && (
        <div
          className={[
            'flex items-center gap-1 mt-1.5 text-sm font-medium',
            trend === 'up'
              ? 'text-error'
              : trend === 'down'
              ? 'text-success'
              : 'text-neutral-400',
          ].join(' ')}
        >
          <span className="text-lg leading-none">
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
          <span className="text-xs text-neutral-400 font-normal">vs 60s ago</span>
        </div>
      )}
      {ago60s !== null && (
        <div className="text-xs text-neutral-400 mt-1 tabular-nums">
          60s ago: {ago60s.toFixed(2)} bps
        </div>
      )}
    </div>
  )
}

interface FillRateRow {
  market: string
  trades1m: number
  avgSize: number | null
  spreadBps: number | null
  ofi: number | null
}

function FillRateTable({ rows }: { rows: FillRateRow[] }) {
  return (
    <Card padding="none">
      <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
        <span className="font-semibold text-neutral-900">Fill Rate by Market</span>
        <Badge variant="success" dot size="sm">
          Live
        </Badge>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-neutral-400 text-center">
          No market data
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-50">
                <th className="px-5 py-3">Market</th>
                <th className="px-5 py-3 text-right">
                  <Tooltip content="Number of trades executed in the last 60 seconds">
                    Trades (1m)
                  </Tooltip>
                </th>
                <th className="px-5 py-3 text-right">
                  <Tooltip content="Average trade size over the 5-minute window">
                    Avg Size
                  </Tooltip>
                </th>
                <th className="px-5 py-3 text-right">
                  <Tooltip content="Current bid-ask spread in basis points">
                    Spread (bps)
                  </Tooltip>
                </th>
                <th className="px-5 py-3 min-w-[180px]">
                  <Tooltip content="Order flow imbalance = (bid10 − ask10) / total10. Positive = buy pressure.">
                    OFI
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {rows.map((row) => (
                <tr
                  key={row.market}
                  className="hover:bg-neutral-50 transition-colors duration-100"
                >
                  <td className="px-5 py-3 font-semibold text-neutral-900 text-xs">
                    {row.market}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-xs text-neutral-700">
                    {row.trades1m}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-xs text-neutral-700">
                    {row.avgSize !== null ? row.avgSize.toFixed(4) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.spreadBps !== null ? (
                      <Badge
                        variant={
                          row.spreadBps < 10
                            ? 'success'
                            : row.spreadBps < 50
                            ? 'warning'
                            : 'error'
                        }
                        size="sm"
                      >
                        {row.spreadBps.toFixed(2)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 min-w-[180px]">
                    {row.ofi !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden relative">
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-300" />
                          {row.ofi >= 0 ? (
                            <div
                              className="absolute top-0 bottom-0 bg-success rounded-r-full transition-[width] duration-300"
                              style={{
                                left: '50%',
                                width: `${Math.abs(row.ofi) * 50}%`,
                              }}
                            />
                          ) : (
                            <div
                              className="absolute top-0 bottom-0 bg-error rounded-l-full transition-[width] duration-300"
                              style={{
                                right: '50%',
                                width: `${Math.abs(row.ofi) * 50}%`,
                              }}
                            />
                          )}
                        </div>
                        <span
                          className={[
                            'text-[11px] font-medium tabular-nums w-12 text-right',
                            row.ofi >= 0 ? 'text-success' : 'text-error',
                          ].join(' ')}
                        >
                          {row.ofi >= 0 ? '+' : ''}
                          {(row.ofi * 100).toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function AnalyticsPage() {
  const [state, dispatch] = useReducer(analyticsReducer, initState)
  const wsRef = useRef(getWsClient())

  useEffect(() => {
    listMarkets().then((res) => {
      if (res.ok && res.data) {
        dispatch({ type: 'INIT_MARKETS', markets: res.data })
      } else {
        dispatch({ type: 'INIT_MARKETS', markets: [] })
      }
    })
  }, [])

  useEffect(() => {
    if (state.markets.length === 0) return
    const ws = wsRef.current
    ws.connect()
    const channels = state.markets.map((m) => `trades:${m.id}`)
    ws.subscribe(channels)

    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'trade') {
        dispatch({
          type: 'ADD_TRADE',
          market: msg.market,
          trade: {
            ts: msg.timestamp,
            price: parseFloat(msg.price),
            size: parseFloat(msg.quantity),
            side: msg.side as 'buy' | 'sell',
          },
        })
      }
    })

    return () => {
      unsub()
      ws.unsubscribe(channels)
    }
  }, [state.markets])

  useEffect(() => {
    if (state.markets.length === 0) return

    async function poll() {
      await Promise.all(
        state.markets.map(async (m) => {
          const res = await getBook(m.id)
          if (res.ok && res.data) {
            dispatch({
              type: 'DEPTH_POLL',
              market: m.id,
              bids: res.data.bids.map(
                (l) => [l.price, l.quantity] as [string, string],
              ),
              asks: res.data.asks.map(
                (l) => [l.price, l.quantity] as [string, string],
              ),
            })
          }
        }),
      )
    }

    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [state.markets])

  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: 'PRUNE', cutoff: Date.now() - WINDOW_MS - 60_000 })
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  const selectedDepth = useMemo(
    () =>
      state.selectedMarket
        ? (state.depthByMarket[state.selectedMarket] ?? null)
        : null,
    [state.selectedMarket, state.depthByMarket],
  )

  const selectedSpreadHistory = useMemo(
    () =>
      state.selectedMarket
        ? (state.spreadByMarket[state.selectedMarket] ?? [])
        : [],
    [state.selectedMarket, state.spreadByMarket],
  )

  const vwas = useMemo(() => {
    if (!state.selectedMarket) return { current: null, ago60s: null }
    const trades = state.tradesByMarket[state.selectedMarket] ?? []
    const spreads = state.spreadByMarket[state.selectedMarket] ?? []
    if (trades.length === 0 || spreads.length === 0)
      return { current: null, ago60s: null }

    function spreadAt(ts: number): number | null {
      let last: SpreadPoint | null = null
      for (const sp of spreads) {
        if (sp.ts <= ts) last = sp
        else break
      }
      return last?.bps ?? null
    }

    function computeWindow(from: number, to: number): number | null {
      const window = trades.filter((t) => t.ts >= from && t.ts <= to)
      if (window.length === 0) return null
      let weightedSum = 0
      let totalSize = 0
      for (const t of window) {
        const sp = spreadAt(t.ts)
        if (sp !== null) {
          weightedSum += sp * t.size
          totalSize += t.size
        }
      }
      return totalSize > 0 ? weightedSum / totalSize : null
    }

    const now = Date.now()
    return {
      current: computeWindow(now - 60_000, now),
      ago60s: computeWindow(now - 120_000, now - 60_000),
    }
  }, [state.selectedMarket, state.tradesByMarket, state.spreadByMarket])

  const fillRateRows = useMemo((): FillRateRow[] => {
    const now = Date.now()
    return state.markets.map((m) => {
      const trades = state.tradesByMarket[m.id] ?? []
      const depth = state.depthByMarket[m.id] ?? null
      const trades1m = trades.filter((t) => t.ts >= now - 60_000).length
      const avgSize =
        trades.length > 0
          ? trades.reduce((s, t) => s + t.size, 0) / trades.length
          : null
      return {
        market: m.id,
        trades1m,
        avgSize,
        spreadBps: depth?.spreadBps ?? null,
        ofi: depth?.ofi ?? null,
      }
    })
  }, [state.markets, state.tradesByMarket, state.depthByMarket])

  if (state.marketsLoading) return <FullPageSpinner />

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cream">
          Microstructure Analytics
        </h1>
        <p className="text-sm text-stone mt-1">
          Real-time spread decomposition, depth imbalance, and order flow.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-6">
        {state.markets.length === 0 ? (
          <span className="text-sm text-neutral-400">No markets</span>
        ) : (
          state.markets.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                dispatch({ type: 'SELECT_MARKET', market: m.id })
              }
              className={[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
                state.selectedMarket === m.id
                  ? 'bg-primary text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900',
              ].join(' ')}
            >
              {m.base}/{m.quote}
            </button>
          ))
        )}
        <div className="ml-auto">
          <Badge variant="success" dot size="sm">
            Live
          </Badge>
        </div>
      </div>

      {state.selectedMarket && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 mb-5">
            <Card padding="none">
              <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Bid-Ask Spread — 5 min rolling
                </span>
                {selectedDepth?.spreadBps !== null &&
                  selectedDepth?.spreadBps !== undefined && (
                    <Badge
                      variant={
                        selectedDepth.spreadBps < 10
                          ? 'success'
                          : selectedDepth.spreadBps < 50
                          ? 'warning'
                          : 'error'
                      }
                      size="sm"
                    >
                      {selectedDepth.spreadBps.toFixed(2)} bps
                    </Badge>
                  )}
              </div>
              <div className="px-2 py-2">
                <SpreadChart history={selectedSpreadHistory} />
              </div>
            </Card>

            <Card>
              <VWASIndicator
                current={vwas.current}
                ago60s={vwas.ago60s}
              />

              <div className="mt-5 pt-5 border-t border-neutral-100">
                <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-3">
                  Order Flow Imbalance
                </div>
                {selectedDepth ? (
                  <OFIBar ofi={selectedDepth.ofi} />
                ) : (
                  <p className="text-xs text-neutral-400">Waiting for data…</p>
                )}
              </div>
            </Card>
          </div>

          <Card padding="none" className="mb-5">
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                Depth Chart — 10 levels
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-stone">
                  <span className="w-3 h-0.5 bg-primary inline-block" />
                  Bids
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-stone">
                  <span className="w-3 h-0.5 bg-secondary inline-block" />
                  Asks
                </span>
              </div>
            </div>
            <div className="px-2 py-2">
              <DepthChart depth={selectedDepth} />
            </div>
          </Card>
        </>
      )}

      <FillRateTable rows={fillRateRows} />
    </div>
  )
}
