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
        <div className="pt-20 pb-16 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-12 items-center">
            <div>
              <div className="flex items-center gap-2 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
                <span className="text-[0.7rem] uppercase tracking-[0.15em] text-sage font-medium">
                  Live — Verifiable Spot DEX
                </span>
              </div>

              <h1 className="leading-[0.95] tracking-tight mb-6 max-w-3xl">
                <span className="block text-[clamp(3rem,6vw,5rem)] font-extrabold text-ink">
                  Trade with
                </span>
                <span className="block text-[clamp(3rem,6vw,5rem)] font-extrabold text-ochre">
                  provable fairness
                </span>
              </h1>

              <p className="text-base text-brown leading-[1.7] max-w-[480px] mb-8">
                A high-performance spot exchange where every match is verifiable on-chain.
                Sub-microsecond matching, transparent order books, and cryptographic proofs.
              </p>

              <div className="flex items-center gap-3 mt-8">
                {markets.length > 0 && (
                  <Link href={`/markets/${encodeURIComponent(markets[0].id)}`}>
                    <Button size="lg">
                      View Markets
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
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border">
          {[
            { label: 'Markets',       value: markets.length > 0 ? markets.length.toString() : '—', color: 'text-ochre'  },
            { label: 'Match Latency', value: '1.08 µs',                                             color: 'text-fresco' },
            { label: 'Order Proofs',  value: 'zkVM',                                                color: 'text-violet' },
            { label: 'Avg Spread',    value: '—',                                                   color: 'text-sage'   },
          ].map(({ label, value, color }, i) => (
            <div
              key={label}
              className={[
                'px-10 py-7',
                i < 3 ? 'border-r border-border' : '',
              ].join(' ')}
            >
              <div className={`text-[2.5rem] font-mono font-semibold tabular-nums mb-1 ${color}`}>
                {value}
              </div>
              <div className="text-[0.65rem] uppercase tracking-[0.15em] text-brown font-medium">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="py-8">
          <div className="flex items-center justify-between mb-0 pb-3 border-b border-border">
            <h2 className="text-[0.7rem] uppercase tracking-[0.15em] text-brown font-medium">
              All Markets
            </h2>
            <Badge variant="neutral" dot>
              {loading ? 'Loading' : `${markets.length} pair${markets.length !== 1 ? 's' : ''}`}
            </Badge>
          </div>

          {loading && <FullPageSpinner />}

          {error && (
            <div className="py-12 text-center text-sm text-brown">
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
            <p className="py-12 text-center text-sm text-brown">
              No markets available yet.
            </p>
          )}

          {!loading && !error && markets.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas border-b border-[rgba(101,72,42,0.25)]">
                    <th className="px-0 py-3 text-left text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">Pair</th>
                    <th className="px-4 py-3 text-right text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">Last Price</th>
                    <th className="px-4 py-3 text-right text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">24H Change</th>
                    <th className="px-4 py-3 text-right text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">Bid</th>
                    <th className="px-4 py-3 text-right text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">Ask</th>
                    <th className="px-4 py-3 text-right text-[0.65rem] font-medium text-brown uppercase tracking-[0.12em]">Spread</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m, idx) => (
                    <tr
                      key={m.id}
                      className={[
                        'border-b border-[rgba(101,72,42,0.1)] hover:bg-[rgba(196,148,58,0.08)] transition-colors duration-100',
                        idx % 2 === 0 ? 'bg-parchment' : 'bg-vellum',
                      ].join(' ')}
                    >
                      <td className="px-0 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-ochre/10 flex items-center justify-center text-[10px] font-bold text-ochre">
                            {m.base.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-ink text-sm">
                              {m.base}/{m.quote}
                            </div>
                            <div className="text-[10px] text-brown uppercase tracking-wide">{m.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono font-medium text-ink text-sm">
                        {m.best_bid ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono text-brown text-sm">
                        —
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono font-medium text-ochre text-sm">
                        {m.best_bid ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono font-medium text-fresco text-sm">
                        {m.best_ask ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums font-mono text-violet text-sm">
                        {m.spread ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link href={`/markets/${encodeURIComponent(m.id)}`}>
                          <button
                            type="button"
                            className="px-4 h-7 border border-ochre/40 text-ochre text-xs font-medium uppercase tracking-[0.08em] hover:bg-ochre/8 transition-colors duration-150"
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
