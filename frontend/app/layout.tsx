'use client'

import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import Nav from '@/components/Nav'
import FrescoCanvas from '@/components/FrescoCanvas'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <title>Vela Exchange</title>
        <meta name="description" content="High-performance verifiable spot DEX" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-parchment text-ink font-sans">
        <FrescoCanvas />
        <AuthProvider>
          <div className="relative z-10">
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
