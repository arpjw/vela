'use client'

import { useState, useEffect, useCallback } from 'react'
import HexCanvas from '@/components/HexCanvas'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'
const CN = "'Courier New', monospace"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'

interface StateRoot {
  state_root: string
  timestamp: number
  order_count: number
  user_count: number
  block_number: number | null
}

const STEPS = [
  {
    num: '01',
    title: 'Download the state',
    desc: 'Get the state root for any batch from the batch explorer. This is a cryptographic commitment to every trade in the batch.',
  },
  {
    num: '02',
    title: 'Verify locally',
    desc: 'Recompute the state root from the fills data. If your computation matches, the batch is correct. If it doesn\'t match, you\'ve found a discrepancy.',
  },
  {
    num: '03',
    title: 'Submit a challenge',
    desc: 'If you find an invalid batch, submit a challenge below. Vela will produce a fraud proof within 24 hours. If the proof fails, affected users are made whole.',
  },
]

export default function VerifyPage() {
  const [stateRoot, setStateRoot] = useState<StateRoot | null>(null)
  const [batchId, setBatchId] = useState('')
  const [description, setDescription] = useState('')
  const [wallet, setWallet] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const fetchStateRoot = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/state-root`)
      const data = await res.json()
      if (data.ok && data.data) {
        setStateRoot(data.data)
      }
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    fetchStateRoot()
    const t = setInterval(fetchStateRoot, 60_000)
    return () => clearInterval(t)
  }, [fetchStateRoot])

  function downloadSnapshot() {
    if (!stateRoot) return
    const payload = {
      stateRoot: stateRoot.state_root,
      timestamp: stateRoot.timestamp,
      orderCount: stateRoot.order_count,
      userCount: stateRoot.user_count,
      message: 'Download fills from /batches to verify',
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vela-state-snapshot.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const subject = 'Vela+Fraud+Proof+Challenge'
    const body = encodeURIComponent(
      `Batch ID: ${batchId}\nWallet: ${wallet}\n\nDiscrepancy:\n${description}`
    )
    window.location.href = `mailto:arya@monolithsystematic.com?subject=${subject}&body=${body}`
    setSubmitted(true)
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: CN,
    fontSize: '12px',
    color: '#0C0C0C',
    background: 'white',
    border: '1px solid rgba(12,12,12,0.15)',
    padding: '10px 14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: IN,
    fontSize: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    color: 'rgba(12,12,12,0.4)',
    display: 'block',
    marginBottom: '6px',
  }

  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <div style={{ position: 'relative', background: '#0C0C0C', padding: '60px 52px 52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '16px' }}>
            Fraud Proof System
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '48px', color: '#E8E4D8', display: 'block', lineHeight: 1.1 }}>
              Verify any trade.
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '48px', color: 'rgba(232,228,216,0.3)', display: 'block', lineHeight: 1.1 }}>
              Challenge anything.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '15px', lineHeight: 1.75, color: 'rgba(232,228,216,0.4)', maxWidth: '560px', marginTop: '20px' }}>
            Vela uses an optimistic-ZK architecture. Every batch of trades produces a state root. If you believe any batch was processed incorrectly, you can submit a challenge. Honest batches are always provably correct.
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '52px' }}>
        <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(12,12,12,0.3)', marginBottom: '24px' }}>
          How It Works
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(12,12,12,0.07)' }}>
          {STEPS.map((step) => (
            <div key={step.num} style={{ background: 'white', padding: '28px 28px' }}>
              <p style={{ fontFamily: CN, fontSize: '11px', color: 'rgba(12,12,12,0.2)', margin: '0 0 12px' }}>Step {step.num}</p>
              <p style={{ fontFamily: IN, fontWeight: 600, fontSize: '15px', color: '#0C0C0C', margin: '0 0 10px' }}>{step.title}</p>
              <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '13px', color: 'rgba(12,12,12,0.55)', lineHeight: 1.8, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', padding: '52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.25)', marginBottom: '12px' }}>
            Current State Root
          </p>
          <div style={{ background: 'rgba(232,228,216,0.03)', border: '1px solid rgba(232,228,216,0.07)', padding: '20px 24px', marginBottom: '24px' }}>
            <p style={{ fontFamily: CN, fontWeight: 700, fontSize: '14px', color: '#E8E4D8', margin: 0, wordBreak: 'break-all', lineHeight: 1.6 }}>
              {stateRoot ? stateRoot.state_root : '—'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '40px', marginBottom: '28px' }}>
            <div>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.25)', margin: '0 0 4px' }}>Order Count</p>
              <p style={{ fontFamily: CN, fontSize: '14px', color: '#E8E4D8', margin: 0 }}>{stateRoot?.order_count ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.25)', margin: '0 0 4px' }}>User Count</p>
              <p style={{ fontFamily: CN, fontSize: '14px', color: '#E8E4D8', margin: 0 }}>{stateRoot?.user_count ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.25)', margin: '0 0 4px' }}>Timestamp</p>
              <p style={{ fontFamily: CN, fontSize: '12px', color: 'rgba(232,228,216,0.5)', margin: 0 }}>
                {stateRoot ? new Date(stateRoot.timestamp).toLocaleTimeString() : '—'}
              </p>
            </div>
          </div>

          <button
            onClick={downloadSnapshot}
            disabled={!stateRoot}
            style={{ fontFamily: IN, fontSize: '10px', color: stateRoot ? '#E8E4D8' : 'rgba(232,228,216,0.3)', background: 'transparent', border: `1px solid ${stateRoot ? 'rgba(232,228,216,0.25)' : 'rgba(232,228,216,0.08)'}`, padding: '8px 16px', cursor: stateRoot ? 'pointer' : 'not-allowed' }}
          >
            Download state snapshot
          </button>
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '52px' }}>
        <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#0C0C0C', margin: '0 0 12px' }}>
          Found a discrepancy?
        </h2>
        <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '14px', lineHeight: 1.8, color: 'rgba(12,12,12,0.5)', maxWidth: '520px', marginBottom: '36px' }}>
          If you believe a batch was processed incorrectly, submit a challenge here. Include the batch ID, the discrepancy you found, and your wallet address. We will respond within 24 hours.
        </p>

        {submitted ? (
          <div style={{ background: 'white', border: '1px solid rgba(12,12,12,0.1)', padding: '28px', maxWidth: '520px' }}>
            <p style={{ fontFamily: IN, fontWeight: 600, fontSize: '14px', color: '#0C0C0C', margin: '0 0 8px' }}>Challenge submitted.</p>
            <p style={{ fontFamily: IN, fontSize: '13px', color: 'rgba(12,12,12,0.55)', margin: 0 }}>
              We will respond to {wallet || 'your address'} within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Batch ID</label>
              <input
                type="text"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder="#001"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Discrepancy Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you believe is incorrect and how you verified it…"
                required
                style={{ ...inputStyle, fontFamily: IN, fontSize: '13px', minHeight: '120px', resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Your Wallet Address</label>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              style={{ fontFamily: IN, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E8E4D8', background: '#0C0C0C', border: 'none', padding: '12px 24px', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              Submit Challenge →
            </button>
          </form>
        )}
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', padding: '52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '24px', color: '#E8E4D8', margin: '0 0 24px' }}>
            Challenge history
          </h2>
          <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(232,228,216,0.25)', textAlign: 'center', padding: '32px 0' }}>
            No challenges submitted yet.
          </p>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '12px', color: 'rgba(232,228,216,0.2)', maxWidth: '480px' }}>
            All submitted challenges and their resolutions will be published here publicly.
          </p>
        </div>
      </div>
    </div>
  )
}
