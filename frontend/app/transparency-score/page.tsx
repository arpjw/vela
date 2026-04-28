'use client'

import Link from 'next/link'
import HexCanvas from '@/components/HexCanvas'
import {
  TRANSPARENCY_CRITERIA,
  COMPLETE_COUNT,
  TOTAL_CRITERIA,
  CATEGORIES,
  type Criterion,
} from '@/lib/transparency-score'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'

function StaticHexTexture() {
  const hex = '00 FF AB 3B A3 ED FD 7A 7B 12 B2 7A C7 2C 3E 67 76 8F 61 7F C8 1B C3 88 8A 51 32 3A 9F B8 AA 4B '
  const content = Array(300).fill(hex).join('')
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <p style={{
        fontFamily: "'Courier New', monospace",
        fontSize: '10.5px',
        lineHeight: '16px',
        color: 'rgba(232,228,216,0.04)',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>{content}</p>
    </div>
  )
}

function EvidenceLink({ evidence, isDark }: { evidence: string; isDark: boolean }) {
  const color = isDark ? 'rgba(232,228,216,0.35)' : 'rgba(12,12,12,0.35)'
  const style: React.CSSProperties = {
    fontFamily: IN,
    fontSize: '9px',
    color,
    textDecoration: 'none',
    display: 'block',
    marginTop: '4px',
  }
  const isExternal = evidence.startsWith('http')
  if (isExternal) {
    return (
      <a href={evidence} target="_blank" rel="noopener noreferrer" style={style}>
        Verify →
      </a>
    )
  }
  return <Link href={evidence} style={style}>Verify →</Link>
}

function StatusDot({ status, isDark }: { status: Criterion['status']; isDark: boolean }) {
  if (status === 'complete') {
    return (
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#6B8A5A', flexShrink: 0 }} />
    )
  }
  if (status === 'planned') {
    const bg = isDark ? 'rgba(232,228,216,0.25)' : 'rgba(12,12,12,0.2)'
    return (
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: bg,
        flexShrink: 0,
        animation: 'velaPulse 2s ease-in-out infinite',
      }} />
    )
  }
  return (
    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#CC3333', flexShrink: 0 }} />
  )
}

function StatusBadge({ criterion, isDark }: { criterion: Criterion; isDark: boolean }) {
  const { status, evidence, plannedIn } = criterion

  if (status === 'complete') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <span style={{
          fontFamily: IN,
          fontSize: '8px',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          color: '#6B8A5A',
          border: '1px solid rgba(107,138,90,0.3)',
          padding: '3px 8px',
          whiteSpace: 'nowrap' as const,
        }}>
          COMPLETE
        </span>
        {evidence && <EvidenceLink evidence={evidence} isDark={isDark} />}
      </div>
    )
  }

  if (status === 'planned') {
    const borderColor = isDark ? 'rgba(232,228,216,0.12)' : 'rgba(12,12,12,0.1)'
    const textColor = isDark ? 'rgba(232,228,216,0.35)' : 'rgba(12,12,12,0.35)'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <span style={{
          fontFamily: IN,
          fontSize: '8px',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          color: textColor,
          border: `1px solid ${borderColor}`,
          padding: '3px 8px',
          whiteSpace: 'nowrap' as const,
        }}>
          PLANNED
        </span>
        {plannedIn && (
          <span style={{ fontFamily: IN, fontSize: '8px', color: isDark ? 'rgba(232,228,216,0.2)' : 'rgba(12,12,12,0.2)' }}>
            {plannedIn}
          </span>
        )}
      </div>
    )
  }

  return (
    <span style={{
      fontFamily: IN,
      fontSize: '8px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.1em',
      color: '#CC3333',
      border: '1px solid rgba(204,51,51,0.3)',
      padding: '3px 8px',
      whiteSpace: 'nowrap' as const,
    }}>
      MISSING
    </span>
  )
}

function CriterionCard({ criterion, isDark }: { criterion: Criterion; isDark: boolean }) {
  const bgBase = isDark ? 'rgba(232,228,216,0.03)' : 'rgba(12,12,12,0.03)'
  const bgHover = isDark ? 'rgba(232,228,216,0.06)' : 'rgba(12,12,12,0.06)'
  const titleColor = isDark ? '#E8E4D8' : '#0C0C0C'
  const descColor = isDark ? 'rgba(232,228,216,0.4)' : 'rgba(12,12,12,0.45)'
  const idColor = isDark ? 'rgba(232,228,216,0.2)' : 'rgba(12,12,12,0.2)'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'start',
        padding: '20px 24px',
        background: bgBase,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = bgHover }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = bgBase }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', paddingTop: '2px' }}>
        <StatusDot status={criterion.status} isDark={isDark} />
        <span style={{ fontFamily: IN, fontSize: '8px', color: idColor }}>{criterion.id}</span>
      </div>

      <div style={{ paddingRight: '16px' }}>
        <p style={{ fontFamily: IN, fontWeight: 600, fontSize: '13px', color: titleColor, margin: 0 }}>
          {criterion.title}
        </p>
        <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '12px', lineHeight: 1.7, color: descColor, margin: '4px 0 0' }}>
          {criterion.description}
        </p>
      </div>

      <StatusBadge criterion={criterion} isDark={isDark} />
    </div>
  )
}

function MiniProgressBar({ complete, total, isDark }: { complete: number; total: number; isDark: boolean }) {
  const pct = total > 0 ? (complete / total) * 100 : 0
  const trackBg = isDark ? 'rgba(232,228,216,0.1)' : 'rgba(12,12,12,0.08)'
  const fillBg = isDark ? '#E8E4D8' : '#0C0C0C'
  return (
    <div style={{ height: '3px', background: trackBg, marginTop: '8px' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: fillBg }} />
    </div>
  )
}

export default function TransparencyScorePage() {
  const pct = (COMPLETE_COUNT / TOTAL_CRITERIA) * 100

  const categoryStats = CATEGORIES.map((cat, i) => {
    const criteria = TRANSPARENCY_CRITERIA.filter(c => c.category === cat)
    const complete = criteria.filter(c => c.status === 'complete').length
    return { category: cat, criteria, complete, total: criteria.length, index: i }
  })

  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <style>{`
        @keyframes velaPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 pt-12 pb-10 lg:px-[52px] lg:pt-[60px] lg:pb-[48px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(232,228,216,0.3)', marginBottom: '20px' }}>
            Vela Exchange — Transparency Standard
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '64px', color: '#E8E4D8', display: 'block', lineHeight: 1 }} className="text-5xl lg:text-[64px]">
              Transparency
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '64px', color: 'rgba(232,228,216,0.3)', display: 'block', lineHeight: 1, marginBottom: '24px' }} className="text-5xl lg:text-[64px]">
              by the numbers.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,228,216,0.4)', maxWidth: '580px' }}>
            Every transparency claim we make is verifiable. Below is the complete rubric — 25 criteria across 5 categories. We score ourselves honestly: complete means anyone can verify it right now. Planned means it is on the roadmap. We publish this so the industry has a standard to measure against.
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px' }}>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '96px', color: '#0C0C0C', lineHeight: 1 }} className="text-[64px] lg:text-[96px]">
              {COMPLETE_COUNT}
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontSize: '48px', color: 'rgba(12,12,12,0.25)', lineHeight: 1 }} className="text-3xl lg:text-[48px]">
              / {TOTAL_CRITERIA}
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 400, fontSize: '14px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(12,12,12,0.4)', marginTop: '8px' }}>
            criteria complete
          </p>
          <div style={{ maxWidth: '400px', margin: '24px auto 0', height: '4px', background: 'rgba(12,12,12,0.08)' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#0C0C0C' }} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[1px]" style={{ background: 'rgba(12,12,12,0.06)' }}>
          {categoryStats.map(({ category, complete, total }) => (
            <div key={category} style={{ background: 'white', padding: '20px 24px' }}>
              <p style={{ fontFamily: IN, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 8px' }}>
                {category}
              </p>
              <p style={{ fontFamily: PF, fontWeight: 700, fontSize: '24px', color: '#0C0C0C', margin: 0 }}>
                {complete}/{total}
              </p>
              <MiniProgressBar complete={complete} total={total} isDark={false} />
            </div>
          ))}
        </div>

        <p style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(12,12,12,0.35)', textAlign: 'center', marginTop: '24px' }}>
          Criteria marked &lsquo;planned&rsquo; have corresponding Linear issues and will be completed before mainnet. Dispute any rating:{' '}
          <a href="mailto:arya@monolithsystematic.com" style={{ color: 'rgba(12,12,12,0.5)', textDecoration: 'underline' }}>
            arya@monolithsystematic.com
          </a>
        </p>
      </div>

      {categoryStats.map(({ category, criteria, complete, total, index }) => {
        const isDark = index % 2 === 0
        const bg = isDark ? '#0C0C0C' : '#E8E4D8'
        const categoryLabelColor = isDark ? 'rgba(232,228,216,0.2)' : 'rgba(12,12,12,0.25)'
        const categoryNameColor = isDark ? '#E8E4D8' : '#0C0C0C'
        const categoryScoreColor = isDark ? 'rgba(232,228,216,0.3)' : 'rgba(12,12,12,0.35)'

        return (
          <div
            key={category}
            style={{ position: 'relative', background: bg, overflow: 'hidden' }}
            className="px-6 py-12 lg:px-[52px] lg:py-[52px]"
          >
            {isDark && <StaticHexTexture />}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.2em', color: categoryLabelColor, marginBottom: '8px' }}>
                Category {index + 1}/5
              </p>
              <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '36px', color: categoryNameColor, margin: 0 }}>
                {category}
              </h2>
              <p style={{ fontFamily: IN, fontSize: '11px', color: categoryScoreColor, marginTop: '4px', marginBottom: '40px' }}>
                {complete}/{total} complete
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {criteria.map((criterion) => (
                  <CriterionCard key={criterion.id} criterion={criterion} isDark={isDark} />
                ))}
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ position: 'relative', background: '#0C0C0C', overflow: 'hidden' }} className="px-6 py-12 lg:px-[52px] lg:py-[52px]">
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '16px' }}>
            The Standard
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#E8E4D8', display: 'block', lineHeight: 1.15 }}>
              This rubric is open.
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '32px', color: 'rgba(232,228,216,0.35)', display: 'block', lineHeight: 1.15 }}>
              Measure anyone against it.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '14px', lineHeight: 1.8, color: 'rgba(232,228,216,0.4)', maxWidth: '560px', margin: '20px 0 32px' }}>
            We built this rubric because no standard existed. Every criterion is specific, verifiable, and binary — complete or not. We score ourselves honestly, including the items we haven&apos;t finished yet.
            <br /><br />
            We invite researchers, journalists, and other exchanges to use this rubric. If you believe any rating is inaccurate, dispute it. If you want to score another exchange against it, publish the results.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <a
              href="mailto:arya@monolithsystematic.com?subject=Vela Transparency Score Dispute"
              style={{
                fontFamily: IN,
                fontSize: '11px',
                border: '1px solid rgba(232,228,216,0.2)',
                color: 'rgba(232,228,216,0.5)',
                padding: '10px 20px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Dispute a rating →
            </a>
            <a
              href="https://github.com/arpjw/vela"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: IN,
                fontSize: '11px',
                border: '1px solid rgba(232,228,216,0.2)',
                color: 'rgba(232,228,216,0.5)',
                padding: '10px 20px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              View on GitHub →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
