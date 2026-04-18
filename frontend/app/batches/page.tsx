'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import HexCanvas from '@/components/HexCanvas'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'
const CN = "'Courier New', monospace"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'

interface Batch {
  batch_id: number
  timestamp: number
  fill_count: number
  order_count: number
  markets: string[]
  state_root: string
  operator_signature: string
  fills: string[]
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function padBatchId(id: number): string {
  return `#${String(id).padStart(3, '0')}`
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/batches`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.data)) {
        setBatches(data.data.slice().reverse())
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBatches()
    const t = setInterval(fetchBatches, 10_000)
    return () => clearInterval(t)
  }, [fetchBatches])

  const totalFills = batches.reduce((s, b) => s + b.fill_count, 0)
  const avgFills = batches.length > 0 ? (totalFills / batches.length).toFixed(1) : '—'

  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <div style={{ position: 'relative', background: '#0C0C0C', padding: '60px 52px 52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '16px' }}>
            Vela Exchange — Batch Explorer
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '48px', color: '#E8E4D8', display: 'block', lineHeight: 1.1 }}>
              Every batch.
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '48px', color: 'rgba(232,228,216,0.3)', display: 'block', lineHeight: 1.1 }}>
              Every trade. Verifiable.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '15px', lineHeight: 1.75, color: 'rgba(232,228,216,0.4)', maxWidth: '560px', marginTop: '20px' }}>
            Vela processes trades in batches. Each batch has a state root that can be used to verify the integrity of every trade. Browse the complete history below.
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '52px' }}>
        <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(12,12,12,0.3)', marginBottom: '24px' }}>
          Batch History
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px 140px 1fr', padding: '6px 0', borderBottom: '1px solid rgba(12,12,12,0.1)', marginBottom: '0' }}>
          {['BATCH', 'TIMESTAMP', 'FILLS', 'ORDERS', 'STATE ROOT', 'ACTION'].map((h) => (
            <span key={h} style={{ fontFamily: IN, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(12,12,12,0.3)', padding: '48px 0', textAlign: 'center' }}>
            Loading batches…
          </p>
        ) : batches.length === 0 ? (
          <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(12,12,12,0.3)', padding: '48px 0', textAlign: 'center' }}>
            No batches yet. Trades will appear here as they execute.
          </p>
        ) : (
          batches.map((batch) => (
            <div
              key={batch.batch_id}
              style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px 140px 1fr', padding: '12px 0', borderBottom: '1px solid rgba(12,12,12,0.05)', alignItems: 'center' }}
            >
              <span style={{ fontFamily: IN, fontWeight: 600, fontSize: '12px', color: '#0C0C0C' }}>{padBatchId(batch.batch_id)}</span>
              <span style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(12,12,12,0.45)' }}>{formatDateTime(batch.timestamp)}</span>
              <span style={{ fontFamily: CN, fontSize: '12px', color: '#0C0C0C' }}>{batch.fill_count}</span>
              <span style={{ fontFamily: CN, fontSize: '12px', color: 'rgba(12,12,12,0.5)' }}>{batch.order_count}</span>
              <span style={{ fontFamily: CN, fontSize: '10px', color: 'rgba(12,12,12,0.4)' }}>{batch.state_root.slice(0, 10)}…</span>
              <Link
                href={`/batches/${batch.batch_id}`}
                style={{ fontFamily: IN, fontSize: '10px', color: '#0C0C0C', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
              >
                View →
              </Link>
            </div>
          ))
        )}

        <div style={{ display: 'flex', gap: '48px', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(12,12,12,0.08)' }}>
          <div>
            <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 4px' }}>Total Batches</p>
            <p style={{ fontFamily: CN, fontSize: '16px', color: '#0C0C0C', margin: 0 }}>{batches.length}</p>
          </div>
          <div>
            <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 4px' }}>Total Fills</p>
            <p style={{ fontFamily: CN, fontSize: '16px', color: '#0C0C0C', margin: 0 }}>{totalFills}</p>
          </div>
          <div>
            <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 4px' }}>Avg Fills / Batch</p>
            <p style={{ fontFamily: CN, fontSize: '16px', color: '#0C0C0C', margin: 0 }}>{avgFills}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
