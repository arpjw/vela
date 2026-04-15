'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-6 h-6 bg-primary flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 2l5 8H2z" fill="#0F0B06" />
            </svg>
          </div>
          <span className="font-semibold text-cream text-base tracking-wide">VELA</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-0">
          {LINKS.map(({ href, label }) => {
            const active =
              href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'relative px-4 py-[18px] text-sm font-medium transition-colors duration-150 tracking-wide',
                  active
                    ? 'text-primary'
                    : 'text-stone hover:text-cream',
                ].join(' ')}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-4 right-4 h-px bg-primary" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isConnected && shortAddress ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block px-3 py-1.5 bg-raised border border-neutral-200 text-xs font-mono text-stone">
                {shortAddress}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="px-3 py-1.5 text-xs font-medium text-stone hover:text-cream transition-colors duration-150 tracking-wide"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-4 h-8 border border-primary/60 text-primary text-sm font-medium hover:bg-primary/8 active:bg-primary/12 transition-colors duration-150 disabled:opacity-50 tracking-wide"
            >
              {connecting ? (
                <Spinner size="xs" className="text-primary" />
              ) : null}
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
