'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth'
import { Spinner } from '@/components/ui/Spinner'

const LINKS = [
  { href: '/markets',    label: 'Markets'   },
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/analytics',  label: 'Analytics' },
  { href: '/history',    label: 'History'   },
]

const PF = "var(--font-playfair), 'Playfair Display', serif"
const IN = "var(--font-inter-sans), 'Inter', sans-serif"

export default function Nav() {
  const pathname = usePathname()
  const { address, isConnected, connect, signOut } = useAuth()
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      await connect()
    } catch (err) {
      console.error(err)
    } finally {
      setConnecting(false)
    }
  }

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null

  return (
    <header
      style={{
        background: '#0C0C0C',
        borderBottom: '1px solid rgba(232,228,216,0.08)',
        position: 'fixed',
        top: '36px',
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center shrink-0">
          <span
            style={{
              fontFamily: PF,
              fontStyle: 'italic',
              fontSize: '24px',
              color: '#E8E4D8',
              lineHeight: 1,
            }}
          >
            Vela
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-0">
          {LINKS.map(({ href, label }, i) => {
            const active = pathname.startsWith(href)
            return (
              <motion.div
                key={href}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <Link
                  href={href}
                  style={{
                    fontFamily: IN,
                    fontSize: '12px',
                    letterSpacing: '0.02em',
                    color: active ? '#E8E4D8' : 'rgba(232,228,216,0.38)',
                    textDecoration: 'none',
                    display: 'block',
                    padding: '18px 16px',
                    position: 'relative',
                    textTransform: 'uppercase',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'rgba(232,228,216,0.65)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'rgba(232,228,216,0.38)' }}
                >
                  {label}
                  {active && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '16px',
                        right: '16px',
                        height: '2px',
                        background: '#E8E4D8',
                      }}
                    />
                  )}
                </Link>
              </motion.div>
            )
          })}
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + LINKS.length * 0.08, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Link
                href="/deposit"
                style={{
                  fontFamily: IN,
                  fontSize: '12px',
                  letterSpacing: '0.02em',
                  color: pathname.startsWith('/deposit') ? '#E8E4D8' : 'rgba(232,228,216,0.38)',
                  textDecoration: 'none',
                  display: 'block',
                  padding: '18px 16px',
                  position: 'relative',
                  textTransform: 'uppercase',
                }}
              >
                Deposit
                {pathname.startsWith('/deposit') && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '16px',
                      right: '16px',
                      height: '2px',
                      background: '#E8E4D8',
                    }}
                  />
                )}
              </Link>
            </motion.div>
          )}
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + (LINKS.length + 1) * 0.08, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Link
                href="/withdraw"
                style={{
                  fontFamily: IN,
                  fontSize: '12px',
                  letterSpacing: '0.02em',
                  color: pathname.startsWith('/withdraw') ? '#E8E4D8' : 'rgba(232,228,216,0.38)',
                  textDecoration: 'none',
                  display: 'block',
                  padding: '18px 16px',
                  position: 'relative',
                  textTransform: 'uppercase',
                }}
              >
                Withdraw
                {pathname.startsWith('/withdraw') && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '16px',
                      right: '16px',
                      height: '2px',
                      background: '#E8E4D8',
                    }}
                  />
                )}
              </Link>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + (LINKS.length + 2) * 0.08, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <a
              href="https://monolithsystematicllc.mintlify.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: IN,
                fontSize: '12px',
                letterSpacing: '0.02em',
                color: 'rgba(232,228,216,0.38)',
                textDecoration: 'none',
                display: 'block',
                padding: '18px 16px',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.65)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(232,228,216,0.38)')}
            >
              Docs
            </a>
          </motion.div>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isConnected && shortAddress ? (
            <button
              type="button"
              onClick={signOut}
              style={{
                fontFamily: IN,
                fontWeight: 600,
                fontSize: '12px',
                color: '#0C0C0C',
                background: '#E8E4D8',
                padding: '8px 20px',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              {shortAddress}
            </button>
          ) : (
            <>
              <motion.button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                whileHover={{ opacity: 0.8 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{
                  fontFamily: IN,
                  fontSize: '12px',
                  color: 'rgba(232,228,216,0.55)',
                  background: 'transparent',
                  border: '1px solid rgba(232,228,216,0.18)',
                  padding: '8px 18px',
                  borderRadius: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {connecting ? <Spinner size="xs" className="text-ink" /> : null}
                Log in
              </motion.button>
              <motion.button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                whileHover={{ opacity: 0.85 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{
                  fontFamily: IN,
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#0C0C0C',
                  background: '#E8E4D8',
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                Get started
              </motion.button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
