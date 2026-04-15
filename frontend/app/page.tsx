'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listMarkets, type MarketResponse } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listMarkets()
      .then((res) => {
        if (res.ok && res.data) {
          setMarkets(res.data)
        } else {
          setError(res.error ?? 'Failed to load markets')
        }
      })
      .catch(() => setError('Could not reach Vela API'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="mb-10 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Live — verifiable spot DEX
        </div>
        <h1 className="text-4xl font-bold text-neutral-900 tracking-tight leading-tight mb-3">
          Trade with provable fairness
        </h1>
        <p className="text-lg text-neutral-500 leading-relaxed">
          Vela is a high-performance spot exchange where every match is
          verifiable on-chain. Sub-microsecond matching, transparent order
          books, and cryptographic proofs — for everyone.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Markets',       value: markets.length.toString() || '—' },
          { label: 'Avg spread',    value: '—' },
          { label: 'Match latency', value: '1.08 µs' },
          { label: 'Order proofs',  value: 'zkVM' },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-white border border-neutral-200 rounded-2xl px-5 py-4"
          >
            <div className="text-2xl font-bold text-neutral-900 tabular-nums">
              {value}
            </div>
            <div className="text-sm text-neutral-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Markets table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">All Markets</h2>
          <Badge variant="neutral" dot>
            {loading ? 'Loading' : `${markets.length} pair${markets.length !== 1 ? 's' : ''}`}
          </Badge>
        </div>

        {loading && <FullPageSpinner />}

        {error && (
          <div className="px-6 py-10 text-center text-sm text-neutral-500">
            <p className="mb-3">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null)
                setLoading(true)
                listMarkets()
                  .then((res) => {
                    if (res.ok && res.data) setMarkets(res.data)
                    else setError(res.error ?? 'Failed to load markets')
                  })
                  .catch(() => setError('Could not reach Vela API'))
                  .finally(() => setLoading(false))
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && markets.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-neutral-500">
            No markets available yet.
          </p>
        )}

        {!loading && !error && markets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Pair</th>
                  <th className="px-6 py-3 text-right">Best Bid</th>
                  <th className="px-6 py-3 text-right">Best Ask</th>
                  <th className="px-6 py-3 text-right">Spread</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {markets.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-neutral-50 transition-colors duration-100"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-primary">
                          {m.base.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-900">
                            {m.base}/{m.quote}
                          </div>
                          <div className="text-xs text-neutral-400">{m.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-medium text-success">
                      {m.best_bid ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-medium text-error">
                      {m.best_ask ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-neutral-500">
                      {m.spread ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/markets/${encodeURIComponent(m.id)}`}>
                        <Button variant="ghost" size="sm">
                          Trade
                        </Button>
                      </Link>
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
