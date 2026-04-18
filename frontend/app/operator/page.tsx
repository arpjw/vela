'use client'

import HexCanvas from '@/components/HexCanvas'

const PF = "'Playfair Display', serif"
const IN = 'Inter, sans-serif'
const CN = "'Courier New', monospace"

const OPERATOR_ADDRESS = '0x63c1C089e08EF6949f6Ee8dB1F3c2dC7f3e9B64EC0'

const CAN_DO = [
  'Match orders submitted by users',
  'Set market parameters (tick size, lot size)',
  'Pause the exchange in emergencies',
  'Sign withdrawal authorizations',
  'Update the frontend',
  'Delist markets with 7-day notice',
]

const CANNOT_DO = [
  'Steal user funds (held in smart contract)',
  'Execute trades without valid user signatures',
  'Modify your order after submission',
  'Prevent emergency exit after 7-day timelock',
  'Forge a withdrawal without your wallet signing',
  'Alter historical trade records',
]

const COMMITMENTS = [
  {
    title: 'FAIR MATCHING',
    body: 'Orders are matched in strict price-time priority. We do not front-run orders, preference any user, or execute trades not submitted by users. The matching engine is open source and verifiable at github.com/arpjw/vela.',
  },
  {
    title: 'FULL RESERVES',
    body: 'Vela holds 100% of user funds in the VelaSettlement smart contract on Ethereum. We never lend, rehypothecate, or use user deposits for any purpose. Verifiable in real time at vela.monolithsystematic.com/transparency.',
  },
  {
    title: 'EMERGENCY EXIT',
    body: 'If Vela ever becomes unavailable, users can recover their funds directly from the smart contract after a 7-day timelock, without any operator involvement. The contract code is immutable and open source.',
  },
]

const SIGNED_STATEMENT = `I, the operator of Vela Exchange (Monolith Systematic LLC),
commit to: (1) matching all orders in strict price-time priority,
(2) maintaining 100% reserves of user funds in the VelaSettlement
contract, (3) never front-running or manipulating user orders,
(4) preserving user emergency exit rights.
Signed: April 2026. Operator: 0x63c1C089...3e9B64EC0`

const PLACEHOLDER_SIG = '0x' + '0'.repeat(130)

export default function OperatorPage() {
  return (
    <div style={{ background: '#0C0C0C', minHeight: '100vh' }}>
      <div style={{ position: 'relative', background: '#0C0C0C', padding: '60px 52px 52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '16px' }}>
            Vela Exchange — Operator Disclosure
          </p>
          <div>
            <span style={{ fontFamily: PF, fontWeight: 900, fontSize: '48px', color: '#E8E4D8', display: 'block', lineHeight: 1.1 }}>
              Who runs Vela.
            </span>
            <span style={{ fontFamily: PF, fontWeight: 400, fontStyle: 'italic', fontSize: '48px', color: 'rgba(232,228,216,0.3)', display: 'block', lineHeight: 1.1 }}>
              And what they can&apos;t do.
            </span>
          </div>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '15px', lineHeight: 1.75, color: 'rgba(232,228,216,0.4)', maxWidth: '520px', marginTop: '20px' }}>
            Transparency starts with knowing who is operating this exchange and what powers they hold.
          </p>
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '52px' }}>
        <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(12,12,12,0.3)', marginBottom: '20px' }}>
          The Operator
        </p>
        <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '36px', color: '#0C0C0C', margin: '0 0 32px' }}>
          Monolith Systematic LLC
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(12,12,12,0.07)', marginBottom: '40px' }}>
          {[
            ['ENTITY', 'Monolith Systematic LLC'],
            ['TYPE', 'Delaware Limited Liability Company'],
            ['FOUNDED', 'March 2026'],
            ['LOCATION', 'San Francisco, California'],
            ['FOUNDER', 'Arya Somu'],
            ['CONTACT', 'arya@monolithsystematic.com'],
            ['WEBSITE', 'monolithsystematic.com'],
            ['GITHUB', 'github.com/arpjw/vela'],
            ['WHITE PAPER', 'ssrn.com/abstract=6579199'],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'white', padding: '20px 24px' }}>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 6px' }}>{label}</p>
              <p style={{ fontFamily: IN, fontSize: '13px', color: '#0C0C0C', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', marginBottom: '10px' }}>
          Operator Wallet Address
        </p>
        <div style={{ background: '#0C0C0C', padding: '16px 20px', marginBottom: '10px' }}>
          <p style={{ fontFamily: CN, fontSize: '12px', color: '#E8E4D8', margin: 0, wordBreak: 'break-all' }}>
            {OPERATOR_ADDRESS}
          </p>
        </div>
        <a
          href={`https://sepolia.etherscan.io/address/${OPERATOR_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: IN, fontSize: '11px', color: '#0C0C0C', textDecoration: 'underline' }}
        >
          View on Sepolia Etherscan →
        </a>
        <p style={{ fontFamily: IN, fontSize: '12px', color: 'rgba(12,12,12,0.45)', marginTop: '10px', maxWidth: '480px' }}>
          This wallet holds the operator signing key for withdrawal authorization and batch signing.
        </p>
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', padding: '52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '20px' }}>
            Operator Powers
          </p>
          <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#E8E4D8', margin: '0 0 36px' }}>
            What we can do.
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
            <div>
              <div style={{ borderLeft: '3px solid #6B8A5A', paddingLeft: '20px' }}>
                {CAN_DO.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#6B8A5A', fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: IN, fontSize: '13px', color: '#E8E4D8', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ borderLeft: '3px solid #CC3333', paddingLeft: '20px' }}>
                {CANNOT_DO.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#CC3333', fontWeight: 700, flexShrink: 0 }}>✗</span>
                    <span style={{ fontFamily: IN, fontSize: '13px', color: 'rgba(232,228,216,0.8)', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#E8E4D8', padding: '52px' }}>
        <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(12,12,12,0.3)', marginBottom: '20px' }}>
          Commitments
        </p>
        <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#0C0C0C', margin: '0 0 32px' }}>
          Our promise to users.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(12,12,12,0.07)' }}>
          {COMMITMENTS.map((c) => (
            <div key={c.title} style={{ background: 'white', padding: '28px 28px' }}>
              <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(12,12,12,0.3)', margin: '0 0 12px' }}>{c.title}</p>
              <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '13px', color: 'rgba(12,12,12,0.7)', lineHeight: 1.8, margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', background: '#0C0C0C', padding: '52px', overflow: 'hidden' }}>
        <HexCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: IN, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(232,228,216,0.3)', marginBottom: '20px' }}>
            Signed Commitment
          </p>
          <h2 style={{ fontFamily: PF, fontWeight: 700, fontSize: '32px', color: '#E8E4D8', margin: '0 0 16px' }}>
            Cryptographically committed.
          </h2>
          <p style={{ fontFamily: IN, fontWeight: 300, fontSize: '14px', lineHeight: 1.75, color: 'rgba(232,228,216,0.35)', maxWidth: '560px', marginBottom: '32px' }}>
            The following statement has been signed by the operator wallet. This signature proves that the operator acknowledges these commitments and cannot later deny them.
          </p>

          <div style={{ background: 'rgba(232,228,216,0.04)', border: '1px solid rgba(232,228,216,0.08)', padding: '24px', marginBottom: '24px' }}>
            <pre style={{ fontFamily: CN, fontSize: '11px', color: '#E8E4D8', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{SIGNED_STATEMENT}</pre>
          </div>

          <p style={{ fontFamily: IN, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(232,228,216,0.25)', marginBottom: '8px' }}>
            Operator Signature (placeholder — mainnet launch)
          </p>
          <div style={{ background: 'rgba(232,228,216,0.03)', border: '1px solid rgba(232,228,216,0.06)', padding: '12px 16px', marginBottom: '12px' }}>
            <p style={{ fontFamily: CN, fontSize: '9px', color: 'rgba(232,228,216,0.25)', margin: 0, wordBreak: 'break-all' }}>{PLACEHOLDER_SIG}</p>
          </div>
          <p style={{ fontFamily: IN, fontSize: '11px', color: 'rgba(232,228,216,0.2)', margin: 0 }}>
            Cryptographic signature of this commitment will be published at mainnet launch.
          </p>
        </div>
      </div>
    </div>
  )
}
