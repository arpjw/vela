'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { listMarkets, type MarketResponse } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

const EASE = [0.25, 0.1, 0.25, 1] as const

const HEADLINE_LINES = [
  { text: 'Trade with', color: '#1A1208' },
  { text: 'provable', color: '#C4943A' },
  { text: 'fairness.', color: '#4A6D9C' },
]

const STAT_CARDS = [
  { value: '1.08 μs', label: 'MATCH LATENCY', color: '#4A6D9C' },
  { value: '57.3k',   label: 'OPS / SEC',      color: '#C4943A' },
  { value: '4.7×',    label: 'FASTER THAN PULSE', color: '#7B5EA7' },
  { value: 'zkVM',    label: 'VERIFIED PROOFS', color: '#A0402A' },
]

function PulsingDot() {
  return (
    <motion.span
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      style={{ color: '#6B8C52', display: 'inline-block' }}
    >
      ●
    </motion.span>
  )
}

function AnimatedHeadline() {
  const prefersReduced = useRef(false)
  useEffect(() => {
    prefersReduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  return (
    <h1 className="leading-[0.95] tracking-tight mb-6">
      {HEADLINE_LINES.map((line, li) => (
        <span key={line.text} className="block" style={{ fontSize: 'clamp(4rem, 8vw, 7rem)', fontWeight: 800 }}>
          {line.text.split(' ').map((word, wi) => (
            <motion.span
              key={word + wi}
              initial={{ opacity: 0, y: 40, rotateX: -20 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{
                delay: (li * 2 + wi) * 0.08,
                duration: 0.7,
                ease: EASE,
              }}
              style={{ color: line.color, display: 'inline-block', marginRight: '0.28em', transformOrigin: 'bottom' }}
            >
              {word}
            </motion.span>
          ))}
        </span>
      ))}
    </h1>
  )
}

function StatBar({ markets }: { markets: MarketResponse[] }) {
  const stats = [
    { label: 'Markets',       value: markets.length > 0 ? markets.length.toString() : '—', color: 'text-ochre'  },
    { label: 'Match Latency', value: '1.08 µs',                                             color: 'text-fresco' },
    { label: 'Order Proofs',  value: 'zkVM',                                                color: 'text-violet' },
    { label: 'Avg Spread',    value: '—',                                                   color: 'text-sage'   },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 bg-canvas border-t border-b border-border">
      {stats.map(({ label, value, color }, i) => (
        <div key={label} className={['px-10 py-7', i < 3 ? 'border-r border-border' : ''].join(' ')}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: i * 0.15 }}
            className={`text-[2.5rem] font-mono font-semibold tabular-nums mb-1 ${color}`}
          >
            {value}
          </motion.div>
          <div className="flex items-center gap-0">
            {i < 3 && (
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                style={{ transformOrigin: 'top' }}
                className="absolute right-0 top-0 h-full w-px bg-border"
              />
            )}
          </div>
          <div className="text-[0.65rem] uppercase tracking-[0.15em] text-brown font-medium">
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

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
        <section
          className="relative border-b border-border"
          style={{ minHeight: '92vh', display: 'flex', alignItems: 'center', padding: '0 0' }}
        >
          <div className="w-full grid grid-cols-1 lg:grid-cols-[60%_40%] gap-12 items-center" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex items-center gap-2 mb-8"
              >
                <PulsingDot />
                <span style={{ color: '#6B8C52', fontSize: '0.7rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                  LIVE — VERIFIABLE SPOT DEX
                </span>
              </motion.div>

              <AnimatedHeadline />

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0, duration: 0.6, ease: EASE }}
                style={{ color: '#6B4F2E', fontSize: '1.05rem', lineHeight: 1.75, maxWidth: 460 }}
                className="mb-8"
              >
                A high-performance spot exchange where every match is verifiable on-chain.
                Sub-microsecond matching, transparent order books, and cryptographic proofs.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5, ease: EASE }}
                className="flex items-center gap-3"
              >
                {markets.length > 0 && (
                  <Link href={`/markets/${encodeURIComponent(markets[0].id)}`}>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                      <Button size="lg">Enter Exchange</Button>
                    </motion.div>
                  </Link>
                )}
                <Link href="/analytics">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                    <Button variant="ghost" size="lg">View Analytics</Button>
                  </motion.div>
                </Link>
              </motion.div>
            </div>

            <div className="hidden lg:flex flex-col gap-3 items-end">
              {STAT_CARDS.map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ x: 60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.6 + i * 0.12, duration: 0.55, ease: EASE }}
                  style={{
                    background: '#F7F5F0',
                    border: '1px solid rgba(26,18,8,0.08)',
                    boxShadow: '0 4px 24px rgba(26,18,8,0.08)',
                    padding: '16px 20px',
                    minWidth: 180,
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '1.6rem', color: card.color, lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontFamily: 'var(--font-inter)', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.6rem', color: '#6B4F2E', marginTop: 6 }}>
                    {card.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            style={{ color: '#6B4F2E', fontSize: '1.2rem' }}
          >
            ↓
          </motion.div>
        </section>

        <StatBar markets={markets} />

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
                  <tr className="bg-canvas border-b border-border">
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
                    <motion.tr
                      key={m.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: EASE, delay: idx * 0.06 }}
                      whileHover={{ backgroundColor: 'rgba(196,148,58,0.08)' }}
                      className={[
                        'border-b border-border transition-colors duration-100',
                        idx % 2 === 0 ? 'bg-parchment' : 'bg-canvas',
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
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                            className="px-4 h-7 border border-ochre/40 text-ochre text-xs font-medium uppercase tracking-[0.08em] hover:bg-ochre/8 transition-colors duration-150"
                          >
                            Trade
                          </motion.button>
                        </Link>
                      </td>
                    </motion.tr>
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
