import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import Nav from '@/components/Nav'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Vela Exchange',
  description: 'High-performance verifiable spot DEX',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
        <AuthProvider>
          <Nav />
          <main className="min-h-[calc(100vh-64px)]">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
