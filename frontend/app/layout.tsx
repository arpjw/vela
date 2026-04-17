'use client'

import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import Nav from '@/components/Nav'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '600', '700'],
  display: 'swap',
})

function BetaBanner() {
  return (
    <div
      style={{
        background: '#080C10',
        borderBottom: '1px solid rgba(0, 210, 210, 0.2)',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '36px',
        zIndex: 200,
        fontFamily: 'var(--font-inter)',
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00D2D2' }}>
        <motion.span
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          ●
        </motion.span>
        PUBLIC BETA
      </span>
      <span style={{ color: '#7BA4B8' }}>
        Ethereum Sepolia Testnet — Do not use real funds
      </span>
      <a
        href="https://monolithsystematicllc.mintlify.app/introduction/what-is-vela"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#00D2D2', textDecoration: 'none' }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
      >
        Learn more →
      </a>
    </div>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <head>
        <title>Vela Exchange</title>
        <meta name="description" content="High-performance verifiable spot DEX" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-parchment text-ink font-sans">
        <AuthProvider>
          <div className="relative z-10" style={{ paddingTop: '96px' }}>
            <BetaBanner />
            <Nav />
            <main className="min-h-[calc(100vh-60px)]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={pathname}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
