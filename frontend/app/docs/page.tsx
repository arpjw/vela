import Link from 'next/link'

const SECTIONS = [
  {
    title: 'Introduction',
    description: 'Learn what Vela is, how the protocol works, and its core design principles.',
    href: '/docs/introduction/what-is-vela',
  },
  {
    title: 'Getting Started',
    description: 'Set up your wallet, deposit funds, and place your first order in minutes.',
    href: '/docs/getting-started/connect-wallet',
  },
  {
    title: 'Trading',
    description: 'Order types, time in force options, fees, and how to read the order book.',
    href: '/docs/trading/order-types',
  },
  {
    title: 'Market Making',
    description: 'The credit system, capital efficiency mechanics, and private L3 data feeds.',
    href: '/docs/market-making/credit-system',
  },
  {
    title: 'API Reference',
    description: 'Complete HTTP and WebSocket API documentation for building on Vela.',
    href: '/docs/api-reference/http-endpoints',
  },
  {
    title: 'Architecture',
    description: 'The matching engine, MPT state layer, committer, zkVM, and DA pipeline.',
    href: '/docs/architecture/matching-engine',
  },
  {
    title: 'Security',
    description: 'ECDSA authentication, replay protection, fraud proofs, and the trust model.',
    href: '/docs/security/ecdsa-authentication',
  },
  {
    title: 'FAQ',
    description: 'Frequently asked questions about Vela Exchange and its public beta.',
    href: '/docs/faq',
  },
]

export default function DocsIndex() {
  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-inter)',
          fontWeight: 700,
          fontSize: '2rem',
          color: '#1A0608',
          marginBottom: '8px',
          lineHeight: 1.2,
        }}
      >
        Vela Exchange Documentation
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontWeight: 400,
          fontSize: '1rem',
          lineHeight: 1.8,
          color: '#3A2A1A',
          marginBottom: '48px',
          maxWidth: '560px',
        }}
      >
        Vela is a high-performance verifiable spot exchange built on a central limit order book
        with cryptographic verification of every match. Use this documentation to explore the
        protocol, integrate via the API, or understand the architecture.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
        }}
      >
        {SECTIONS.map(({ title, description, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: 'block',
              padding: '24px',
              backgroundColor: '#F7F5F0',
              border: '1px solid rgba(26,18,8,0.08)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                color: '#1A0608',
                marginBottom: '8px',
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                fontFamily: 'var(--font-inter)',
                color: '#6B4F2E',
                lineHeight: 1.6,
                marginBottom: '16px',
              }}
            >
              {description}
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                fontFamily: 'var(--font-inter)',
                color: '#C41E3A',
                fontWeight: 500,
              }}
            >
              Read more →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
