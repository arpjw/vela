'use client'

import { useEffect, useRef, useState } from 'react'
import { listMarkets, getBook, type MarketResponse, type BookLevel } from '@/lib/api'
import { getWsClient } from '@/lib/ws'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'

interface MarketMetrics {
  market: string
  spread: number | null
  spreadBps: number | null
  bidDepth: number
  askDepth: number
  imbalance: number
  lastUpdate: number
}

function formatNumber(n: number, decimals = 4): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function ImbalanceBar({ value }: { value: number }) {
  // value in [-1, 1]; positive = bid-heavy, negative = ask-heavy
  const pct = ((value + 1) / 2) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={[
            'h-full rounded-full transition-all duration-300',
            value >= 0 ? 'bg-success' : 'bg-error',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={[
          'tabular-nums text-xs font-medium w-10 text-right',
          value >= 0 ? 'text-success' : 'text-error',
        ].join(' ')}
      >
        {value >= 0 ? '+' : ''}
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  )
}

export default function AnalyticsPage() {
  const [markets, setMarkets] = useState<MarketResponse[]>([])
  const [metrics, setMetrics] = useState<Map<string, MarketMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const wsRef = useRef(getWsClient())

  // Compute metrics from book data
  function computeMetrics(
    marketId: string,
    bids: BookLevel[],
    asks: BookLevel[],
  ): MarketMetrics {
    const bestBid = bids[0] ? parseFloat(bids[0].price) : null
    const bestAsk = asks[0] ? parseFloat(asks[0].price) : null

    const spread =
      bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null
    const mid =
      bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null
    const spreadBps =
      spread !== null && mid !== null && mid > 0 ? (spread / mid) * 10_000 : null

    const bidDepth = bids
      .slice(0, 10)
      .reduce((s, l) => s + parseFloat(l.quantity), 0)
    const askDepth = asks
      .slice(0, 10)
      .reduce((s, l) => s + parseFloat(l.quantity), 0)

    const totalDepth = bidDepth + askDepth
    const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0

    return {
      market: marketId,
      spread,
      spreadBps,
      bidDepth,
      askDepth,
      imbalance,
      lastUpdate: Date.now(),
    }
  }

  useEffect(() => {
    listMarkets()
      .then(async (res) => {
        if (!res.ok || !res.data) return
        setMarkets(res.data)

        // Fetch initial book for each market
        const bookResults = await Promise.all(
          res.data.map((m) => getBook(m.id)),
        )
        const initial = new Map<string, MarketMetrics>()
        res.data.forEach((m, i) => {
          const book = bookResults[i]
          if (book.ok && book.data) {
            initial.set(m.id, computeMetrics(m.id, book.data.bids, book.data.asks))
          }
        })
        setMetrics(initial)
      })
      .finally(() => setLoading(false))
  }, [])

  // Subscribe to all market book channels via WS
  useEffect(() => {
    if (markets.length === 0) return
    const ws = wsRef.current
    ws.connect()
    const channels = markets.map((m) => `book.${m.id}`)
    ws.subscribe(channels)

    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'book_snapshot') {
        const bids = msg.bids.map(([p, q]) => ({ price: p, quantity: q }))
        const asks = msg.asks.map(([p, q]) => ({ price: p, quantity: q }))
        setMetrics((prev) => {
          const next = new Map(prev)
          next.set(msg.market, computeMetrics(msg.market, bids, asks))
          return next
        })
      }
    })

    return () => {
      unsub()
      ws.unsubscribe(channels)
    }
  }, [markets])

  if (loading) return <FullPageSpinner />

  const metricsList = [...metrics.values()]
  const avgSpreadBps =
    metricsList.filter((m) => m.spreadBps !== null).reduce((s, m) => s + (m.spreadBps ?? 0), 0) /
    (metricsList.filter((m) => m.spreadBps !== null).length || 1)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Microstructure Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Real-time spread, depth, and order-flow imbalance across all markets.
        </p>
      </div>

      {/* Global metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Markets tracked',
            value: markets.length.toString(),
            tooltip: 'Number of active spot markets',
          },
          {
            label: 'Avg spread (bps)',
            value: isNaN(avgSpreadBps) ? '—' : formatNumber(avgSpreadBps, 2),
            tooltip: 'Average spread across all markets in basis points',
          },
          {
            label: 'Match latency',
            value: '1.08 µs',
            tooltip: 'p50 matching latency from the benchmarking suite',
          },
          {
            label: 'Proof system',
            value: 'zkVM',
            tooltip: 'Every match batch is proved by a zkVM for verifiability',
          },
        ].map(({ label, value, tooltip }) => (
          <Tooltip key={label} content={tooltip}>
            <Card className="w-full">
              <div className="text-2xl font-bold text-neutral-900 tabular-nums">
                {value}
              </div>
              <div className="text-sm text-neutral-500 mt-0.5">{label}</div>
            </Card>
          </Tooltip>
        ))}
      </div>

      {/* Per-market metrics */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <CardHeader title="Market Microstructure" className="mb-0" />
          <Badge variant="success" dot>Live</Badge>
        </div>

        {metricsList.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-neutral-500">
            No market data yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Market</th>
                  <th className="px-6 py-3 text-right">Spread</th>
                  <th className="px-6 py-3 text-right">Spread (bps)</th>
                  <th className="px-6 py-3 text-right">Bid depth (10L)</th>
                  <th className="px-6 py-3 text-right">Ask depth (10L)</th>
                  <th className="px-6 py-3 min-w-[160px]">
                    <Tooltip content="Order flow imbalance = (bid depth − ask depth) / total depth. Positive = buy pressure.">
                      OFI
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {metricsList.map((m) => (
                  <tr key={m.market} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 font-semibold text-neutral-900">
                      {m.market}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-neutral-700">
                      {m.spread !== null ? formatNumber(m.spread) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">
                      {m.spreadBps !== null ? (
                        <Badge
                          variant={
                            m.spreadBps < 10
                              ? 'success'
                              : m.spreadBps < 50
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {formatNumber(m.spreadBps, 2)} bps
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-neutral-700">
                      {formatNumber(m.bidDepth)}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-neutral-700">
                      {formatNumber(m.askDepth)}
                    </td>
                    <td className="px-6 py-4 min-w-[160px]">
                      <ImbalanceBar value={m.imbalance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
