'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth'
import { Spinner } from '@/components/ui/Spinner'

const LINKS = [
  { href: '/',           label: 'Markets'   },
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/analytics',  label: 'Analytics' },
  { href: '/history',    label: 'History'   },
]

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
    <header className="sticky top-0 z-40 bg-parchment border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-6 h-6 bg-ochre flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 2l5 8H2z" fill="#1A1208" />
            </svg>
          </div>
          <span className="font-bold text-ink text-base tracking-[0.06em] uppercase">VELA</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-0">
          {LINKS.map(({ href, label }, i) => {
            const active =
              href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <motion.div
                key={href}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <Link
                  href={href}
                  className={[
                    'relative px-4 py-[18px] text-[0.8rem] font-medium transition-colors duration-150 uppercase tracking-[0.1em] block',
                    active
                      ? 'text-ink'
                      : 'text-brown hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-ochre" />
                  )}
                </Link>
              </motion.div>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isConnected && shortAddress ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block px-3 py-1.5 bg-canvas border border-border text-xs font-mono text-brown">
                {shortAddress}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="px-3 py-1.5 text-xs font-medium text-brown hover:text-ink transition-colors duration-150 tracking-[0.08em] uppercase"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 px-4 h-8 border-[1.5px] border-ink text-ink text-[0.8rem] font-medium uppercase tracking-[0.08em] hover:bg-ink hover:text-parchment active:bg-ink active:text-parchment transition-colors duration-150 disabled:opacity-50"
            >
              {connecting ? (
                <Spinner size="xs" className="text-ink" />
              ) : null}
              Connect Wallet
            </motion.button>
          )}
        </div>
      </div>
    </header>
  )
}
