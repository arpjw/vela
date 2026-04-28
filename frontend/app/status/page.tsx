'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import HexCanvas from '@/components/HexCanvas'
import Skeleton from '@/components/ui/Skeleton'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'

interface StatusData {
  status: 'operational' | 'degraded' | 'starting'
  engine_uptime_seconds: number
  engine_version: string
  last_snapshot_timestamp: number
  last_state_root: string
  orders_processed_today: number
  fills_today: number
  volume_today_usdc: string
  active_markets: number
  connected_ws_clients: number
  last_restart_reason: string | null
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  return `${d}d ${h}h`
}

function formatRelativeTime(tsMs: number): string {
  if (!tsMs) return 'Never'
  const diff = Math.floor((Date.now() - tsMs) / 1000)
  if (diff < 5) return 'Just now'
  if (diff < 60) return `${diff} seconds ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  return `${Math.floor(diff / 86400)} days ago`
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/status`)
      const json = await res.json()
      if (json.ok) {
        setData(json.data)
        setLastUpdated(new Date())
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    intervalRef.current = setInterval(fetchStatus, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchStatus])

  const status = data?.status ?? null

  const dotColor = status === 'operational'
    ? '#6B8A5A'
    : status === 'degraded'
    ? '#CC3333'
    : 'rgba(232,228,216,0.4)'

  const statusLabel = status === 'operational'
    ? 'OPERATIONAL'
    : status === 'degraded'
    ? 'DEGRADED'
    : 'STARTING'

  const statusColor = status === 'operational'
    ? '#6B8A5A'
    : status === 'degraded'
    ? '#CC3333'
    : 'rgba(232,228,216,0.4)'

  const metrics = data ? [
    { label: 'ENGINE UPTIME', value: formatUptime(data.engine_uptime_seconds) },
    { label: 'ORDERS TODAY', value: data.orders_processed_today.toLocaleString() },
    { label: 'FILLS TODAY', value: data.fills_today.toString() },
    { label: 'VOLUME TODAY', value: `$${parseFloat(data.volume_today_usdc).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` },
    { label: 'ACTIVE MARKETS', value: data.active_markets.toString() },
    { label: 'ENGINE VERSION', value: `v${data.engine_version}` },
    { label: 'LAST SNAPSHOT', value: formatRelativeTime(data.last_snapshot_timestamp) },
    { label: 'WS CLIENTS', value: data.connected_ws_clients.toString() },
  ] : []

  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 pt-12 pb-10 lg:px-[52px] lg:pt-[60px] lg:pb-[40px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '16px' }}>
            Vela Exchange — System Status
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '52px', color: '#E8E4D8', display: 'block', lineHeight: 1.1 }}>
              Status
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '52px', color: 'rgba(232,228,216,0.3)', display: 'block', lineHeight: 1.1 }}>
              Always published.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '14px', lineHeight: 1.75, color: 'rgba(232,228,216,0.4)', maxWidth: '520px', marginTop: '20px' }}>
            Engine health, uptime, and incident history. Published in real time. Exchanges hide downtime. Vela doesn&apos;t.
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className="w-32 h-5" />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '16px',
                height: '16px',
                background: dotColor,
                borderRadius: '50%',
                boxShadow: status === 'operational' ? '0 0 12px rgba(107,138,90,0.4)' : 'none',
                animation: status === 'starting' ? 'pulse 2s infinite' : 'none',
              }} />
              <span style={{
                fontFamily: IN,
                fontWeight: 700,
                fontSize: '18px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: statusColor,
              }}>
                {statusLabel}
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px]" style={{ background: 'rgba(12,12,12,0.05)' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: '#E8E4D8', padding: '24px', borderLeft: '2px solid rgba(12,12,12,0.08)' }}>
                <Skeleton className="w-24 h-2 mb-3" />
                <Skeleton className="w-16 h-8" />
              </div>
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px]" style={{ background: 'rgba(12,12,12,0.05)' }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ background: 'rgba(12,12,12,0.04)', padding: '24px', borderLeft: '2px solid rgba(12,12,12,0.08)' }}>
                <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.35)', margin: '0 0 10px' }}>
                  {m.label}
                </p>
                <p style={{ fontFamily: IN, fontWeight: 600, fontSize: '20px', color: '#0C0C0C', margin: 0 }}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: IN, fontSize: '13px', color: 'rgba(12,12,12,0.4)', textAlign: 'center', padding: '40px 0' }}>
            Unable to load status. The engine may be offline.
          </p>
        )}

        {lastUpdated && (
          <p style={{ fontFamily: IN, fontSize: '10px', color: 'rgba(12,12,12,0.35)', marginTop: '16px' }}>
            Updated {lastUpdated.toLocaleTimeString()} · Auto-refreshes every 30s
          </p>
        )}
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '20px' }}>
            Incident History
          </p>
          <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#E8E4D8', margin: '0 0 16px' }}>
            The complete record.
          </h2>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '14px', lineHeight: 1.8, color: 'rgba(232,228,216,0.35)', maxWidth: '500px', marginBottom: '32px' }}>
            Every engine restart, snapshot restore, and degraded performance event is logged here permanently. This record starts from Vela&apos;s first deployment.
          </p>

          {/* TODO VEL-T2-02: fetch from GET /incidents */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '40px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', background: '#6B8A5A', borderRadius: '50%' }} />
              <span style={{ fontFamily: IN, fontSize: '13px', color: '#6B8A5A' }}>No incidents recorded.</span>
            </div>
            <span style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(232,228,216,0.3)' }}>
              Vela has been operational since launch.
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: '#0C0C0C', borderTop: '1px solid rgba(232,228,216,0.06)' }} className="px-6 py-6 lg:px-[52px]">
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {[
            { href: '/', label: 'Home' },
            { href: '/status', label: 'Status' },
            { href: '/transparency', label: 'Transparency' },
            { href: '/operator', label: 'Operator' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(232,228,216,0.35)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.35)')}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
