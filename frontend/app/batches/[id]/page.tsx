'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import HexCanvas from '@/components/HexCanvas'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'
const CN = "'Courier New', monospace"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'

interface StoredFill {
  id: string
  market_id: string
  price: number
  quantity: number
  maker_order_id: number
  taker_order_id: number
  maker_address: string
  taker_address: string
  timestamp: number
  side: string
}

interface BatchDetail {
  batch_id: number
  timestamp: number
  fill_count: number
  order_count: number
  markets: string[]
  state_root: string
  operator_signature: string
  fills: StoredFill[]
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(2)
  return price.toFixed(4)
}

function padBatchId(id: number): string {
  return `#${String(id).padStart(3, '0')}`
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [batch, setBatch] = useState<BatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const fetchBatch = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/batches/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      const data = await res.json()
      if (data.ok && data.data) {
        setBatch(data.data)
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchBatch() }, [fetchBatch])

  function downloadFills() {
    if (!batch) return
    const blob = new Blob([JSON.stringify(batch.fills, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vela-batch-${batch.batch_id}-fills.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={{ background: '#0C0C0C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(232,228,216,0.3)' }}>Loading…</p>
      </div>
    )
  }

  if (notFound || !batch) {
    return (
      <div style={{ background: '#0C0C0C', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ fontFamily: IN, fontSize: '14px', color: 'rgba(232,228,216,0.4)' }}>Batch {id} not found.</p>
        <Link href="/batches" style={{ fontFamily: IN, fontSize: '11px', color: '#E8E4D8', textDecoration: 'underline' }}>← Back to batch explorer</Link>
      </div>
    )
  }

  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 pt-12 pb-12 lg:px-[52px] lg:pt-[60px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', margin: 0 }}>
              Vela Exchange — Batch Explorer
            </p>
            <span style={{ fontFamily: IN, fontSize: '9px', color: '#6B8A5A', border: '1px solid #6B8A5A', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Finalized
            </span>
          </div>
          <h1 style={{ fontFamily: PF, fontWeight: 900, fontSize: '48px', color: '#E8E4D8', margin: '0 0 8px', lineHeight: 1.1 }}>
            Batch {padBatchId(batch.batch_id)}
          </h1>
          <p style={{ fontFamily: IN, fontSize: '13px', color: 'rgba(232,228,216,0.35)', margin: '0 0 4px' }}>
            {new Date(batch.timestamp).toLocaleString()} · {batch.fill_count} fills
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(12,12,12,0.3)', marginBottom: '24px' }}>
          Batch Details
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-[1px] mb-10" style={{ background: 'rgba(12,12,12,0.07)' }}>
          {[
            ['BATCH ID', padBatchId(batch.batch_id)],
            ['TIMESTAMP', new Date(batch.timestamp).toLocaleString()],
            ['FILL COUNT', String(batch.fill_count)],
            ['MARKETS', batch.markets.join(', ')],
            ['ORDER COUNT', String(batch.order_count)],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'white', padding: '20px 24px' }}>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 6px' }}>{label}</p>
              <p style={{ fontFamily: CN, fontSize: '12px', color: '#0C0C0C', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '36px' }}>
          <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', marginBottom: '10px' }}>
            State Root
          </p>
          <div style={{ background: '#0C0C0C', padding: '16px 20px', marginBottom: '12px' }}>
            <p style={{ fontFamily: CN, fontSize: '11px', color: '#E8E4D8', margin: 0, wordBreak: 'break-all' }}>{batch.state_root}</p>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '13px', color: 'rgba(12,12,12,0.5)', lineHeight: 1.8, maxWidth: '560px', marginBottom: '16px' }}>
            The state root is a cryptographic hash of all trades in this batch. Anyone can recompute this hash from the fills below and verify it matches — proving the batch was not tampered with.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{ fontFamily: IN, fontSize: '10px', color: '#0C0C0C', background: 'transparent', border: '1px solid rgba(12,12,12,0.15)', padding: '8px 16px', cursor: 'pointer' }}
          >
            Verify this batch
          </button>
        </div>

        <div>
          <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', marginBottom: '10px' }}>
            Operator Signature
          </p>
          <div style={{ background: '#0C0C0C', padding: '12px 16px', marginBottom: '10px' }}>
            <p style={{ fontFamily: CN, fontSize: '9px', color: 'rgba(232,228,216,0.3)', margin: 0, wordBreak: 'break-all' }}>{batch.operator_signature}</p>
          </div>
          <p style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(12,12,12,0.35)' }}>
            Real cryptographic signatures will be published at mainnet.
          </p>
        </div>
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '24px', color: '#E8E4D8', margin: '0 0 32px' }}>
            Fills in this batch
          </h2>

          <div style={{ padding: '8px 0', borderBottom: '1px solid rgba(232,228,216,0.06)' }} className="grid grid-cols-[1fr_80px_100px_80px] lg:grid-cols-[1fr_100px_120px_100px_180px_180px]">
            {['Time', 'Market', 'Price', 'Size', 'Maker', 'Taker'].map((h, i) => (
              <span key={h} style={{ fontFamily: IN, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.2)' }} className={i >= 4 ? 'hidden lg:block' : ''}>{h}</span>
            ))}
          </div>

          {batch.fills.length === 0 ? (
            <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(232,228,216,0.2)', textAlign: 'center', padding: '48px 0' }}>No fills in this batch.</p>
          ) : (
            batch.fills.map((fill) => {
              const priceNum = fill.price / 1e8
              const sizeNum = fill.quantity / 1e8
              return (
                <div
                  key={fill.id}
                  style={{ padding: '9px 0', borderBottom: '1px solid rgba(232,228,216,0.04)', alignItems: 'center' }}
                  className="grid grid-cols-[1fr_80px_100px_80px] lg:grid-cols-[1fr_100px_120px_100px_180px_180px]"
                >
                  <span style={{ fontFamily: CN, fontSize: '10px', color: 'rgba(232,228,216,0.3)' }}>
                    {new Date(fill.timestamp / 1000).toLocaleTimeString()}
                  </span>
                  <span style={{ fontFamily: IN, fontWeight: 500, fontSize: '11px', color: '#E8E4D8' }}>{fill.market_id}</span>
                  <span style={{ fontFamily: CN, fontSize: '11px', color: fill.side === 'bid' ? '#6B8A5A' : '#CC3333' }}>
                    {formatPrice(priceNum)}
                  </span>
                  <span style={{ fontFamily: CN, fontSize: '10px', color: 'rgba(232,228,216,0.6)' }}>{sizeNum.toFixed(4)}</span>
                  <a
                    href={`/orders/${fill.maker_order_id}`}
                    style={{ fontFamily: CN, fontSize: '10px', color: 'rgba(232,228,216,0.4)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.7)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.4)')}
                    className="hidden lg:block"
                  >
                    {truncateAddress(fill.maker_address)}
                  </a>
                  <a
                    href={`/orders/${fill.taker_order_id}`}
                    style={{ fontFamily: CN, fontSize: '10px', color: 'rgba(232,228,216,0.4)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.7)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.4)')}
                    className="hidden lg:block"
                  >
                    {truncateAddress(fill.taker_address)}
                  </a>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '24px 52px' }}>
        <Link href="/batches" style={{ fontFamily: IN, fontSize: '11px', color: '#0C0C0C', textDecoration: 'underline' }}>
          ← Back to batch explorer
        </Link>
      </div>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,12,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#E8E4D8', padding: '40px', maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', marginBottom: '16px' }}>
              Verify Batch {padBatchId(batch.batch_id)}
            </p>
            <h3 style={{ fontFamily: PF, fontWeight: 700, fontSize: '22px', color: '#0C0C0C', margin: '0 0 24px' }}>
              How to verify this batch
            </h3>
            {[
              ['1', 'Download fills data as JSON', 'Get the raw fill records from this batch.'],
              ['2', 'Compute keccak256 of fill IDs concatenated', 'Hash all fill ID strings in order. The result must match the state root above.'],
              ['3', 'Compare to state root', `Expected: ${batch.state_root.slice(0, 18)}…`],
            ].map(([num, title, desc]) => (
              <div key={num} style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                <span style={{ fontFamily: CN, fontSize: '11px', color: 'rgba(12,12,12,0.3)', flexShrink: 0, paddingTop: '2px' }}>{num}.</span>
                <div>
                  <p style={{ fontFamily: IN, fontWeight: 600, fontSize: '13px', color: '#0C0C0C', margin: '0 0 4px' }}>{title}</p>
                  <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(12,12,12,0.5)', margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={downloadFills}
                style={{ fontFamily: IN, fontWeight: 600, fontSize: '11px', color: '#E8E4D8', background: '#0C0C0C', border: 'none', padding: '10px 20px', cursor: 'pointer' }}
              >
                Download fills JSON
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{ fontFamily: IN, fontSize: '11px', color: '#0C0C0C', background: 'transparent', border: '1px solid rgba(12,12,12,0.15)', padding: '10px 20px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
