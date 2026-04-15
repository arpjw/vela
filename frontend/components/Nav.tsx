'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const LINKS = [
  { href: '/',           label: 'Markets'   },
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/analytics',  label: 'Analytics' },
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
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 2l5 8H2z" fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 text-lg tracking-tight">Vela</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active =
              href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-primary/8 text-primary'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Wallet */}
        <div className="flex items-center gap-2">
          {isConnected && shortAddress ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block px-3 py-1.5 bg-neutral-100 rounded-lg text-sm font-mono text-neutral-700">
                {shortAddress}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              loading={connecting}
              icon={
                connecting ? undefined : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M1 7h12M7 1l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              }
              iconPosition="right"
            >
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
