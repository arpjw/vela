'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listMarkets, type MarketResponse } from '@/lib/api'
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
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="pt-20 pb-16 border-b border-neutral-200">
          <div className="flex items-center gap-2 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone font-medium">
              Live — Verifiable Spot DEX
            </span>
          </div>

          <h1 className="text-[clamp(2.8rem,7vw,5.5rem)] font-bold text-cream leading-[0.95] tracking-tight mb-6 max-w-3xl">
            Trade with<br />
            <span className="text-primary">provable fairness</span>
          </h1>

          <p className="text-lg text-stone leading-relaxed max-w-xl mb-10">
            A high-performance spot exchange where every match is verifiable on-chain.
            Sub-microsecond matching, transparent order books, and cryptographic proofs.
          </p>

          <div className="flex items-center gap-4">
            {markets.length > 0 && (
              <Link href={`/markets/${encodeURIComponent(markets[0].id)}`}>
                <Button size="lg">
                  Start Trading
                </Button>
              </Link>
            )}
            <Link href="/analytics">
              <Button variant="ghost" size="lg">
                View Analytics
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-neutral-200">
          {[
            { label: 'Markets',       value: markets.length > 0 ? markets.length.toString() : '—' },
            { label: 'Match Latency', value: '1.08 µs' },
            { label: 'Order Proofs',  value: 'zkVM' },
            { label: 'Avg Spread',    value: '—' },
          ].map(({ label, value }, i) => (
            <div
              key={label}
              className={[
                'px-6 py-8',
                i < 3 ? 'border-r border-neutral-200' : '',
              ].join(' ')}
            >
              <div className="text-3xl font-mono font-bold text-primary tabular-nums mb-1">
                {value}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-stone font-medium">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="py-8">
          <div className="flex items-center justify-between mb-0 px-0 pb-3 border-b border-neutral-200">
            <h2 className="text-[10px] uppercase tracking-[0.18em] text-stone font-medium">
              All Markets
            </h2>
            <Badge variant="neutral" dot>
              {loading ? 'Loading' : `${markets.length} pair${markets.length !== 1 ? 's' : ''}`}
            </Badge>
          </div>

          {loading && <FullPageSpinner />}

          {error && (
            <div className="py-12 text-center text-sm text-stone">
              <p className="mb-4">{error}</p>
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
            <p className="py-12 text-center text-sm text-stone">
              No markets available yet.
            </p>
          )}

          {!loading && !error && markets.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-0 py-3 text-[10px] font-medium text-stone uppercase tracking-[0.15em]">Pair</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium text-stone uppercase tracking-[0.15em]">Best Bid</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium text-stone uppercase tracking-[0.15em]">Best Ask</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium text-stone uppercase tracking-[0.15em]">Spread</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-neutral-200 hover:bg-primary/[0.04] transition-colors duration-100"
                    >
                      <td className="px-0 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {m.base.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-cream text-sm">
                              {m.base}/{m.quote}
                            </div>
                            <div className="text-[10px] text-stone uppercase tracking-wide">{m.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono font-medium text-success text-sm">
                        {m.best_bid ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono font-medium text-error text-sm">
                        {m.best_ask ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono text-stone text-sm">
                        {m.spread ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link href={`/markets/${encodeURIComponent(m.id)}`}>
                          <button
                            type="button"
                            className="px-4 h-7 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/8 transition-colors duration-150 tracking-wide"
                          >
                            Trade
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
