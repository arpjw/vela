'use client'

import { useEffect, useRef, useState } from 'react'
import { use } from 'react'
import { getBook, postOrder, type BookLevel, type PostOrderBody } from '@/lib/api'
import { getWsClient, type WsServerMessage } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

interface PageProps {
  params: Promise<{ pair: string }>
}

type OrderSide = 'buy' | 'sell'

export default function MarketPage({ params }: PageProps) {
  const { pair } = use(params)
  const marketId = decodeURIComponent(pair)

  const { address, isConnected } = useAuth()

  const [bids, setBids] = useState<BookLevel[]>([])
  const [asks, setAsks] = useState<BookLevel[]>([])
  const [bookLoading, setBookLoading] = useState(true)

  const [side, setSide] = useState<OrderSide>('buy')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const wsRef = useRef(getWsClient())

  // Initial HTTP snapshot
  useEffect(() => {
    getBook(marketId)
      .then((res) => {
        if (res.ok && res.data) {
          setBids(res.data.bids)
          setAsks(res.data.asks)
        }
      })
      .finally(() => setBookLoading(false))
  }, [marketId])

  // WS live updates
  useEffect(() => {
    const ws = wsRef.current
    ws.connect()
    ws.subscribe([`book.${marketId}`])

    const unsub = ws.onMessage((msg: WsServerMessage) => {
      if (msg.type === 'book_snapshot' && msg.market === marketId) {
        setBids(msg.bids.map(([price, quantity]) => ({ price, quantity })))
        setAsks(msg.asks.map(([price, quantity]) => ({ price, quantity })))
      }
    })

    return () => {
      unsub()
      ws.unsubscribe([`book.${marketId}`])
    }
  }, [marketId])

  async function handlePlaceOrder() {
    if (!address || !price || !quantity) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Signing happens server-side in scaffold; real impl signs here
      const body: PostOrderBody = {
        market: marketId,
        side,
        order_type: 'limit',
        price: Math.round(parseFloat(price) * 1e8),
        quantity: Math.round(parseFloat(quantity) * 1e8),
        nonce: Date.now(),
        address,
        signature: '0x', // placeholder — real impl signs with wallet
      }
      const res = await postOrder(body)
      if (!res.ok) setSubmitError(res.error ?? 'Order failed')
    } catch {
      setSubmitError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const midPrice =
    bids[0] && asks[0]
      ? ((parseFloat(bids[0].price) + parseFloat(asks[0].price)) / 2).toFixed(4)
      : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{marketId}</h1>
          {midPrice && (
            <p className="text-sm text-neutral-500 mt-0.5">
              Mid price:{' '}
              <span className="tabular-nums font-medium text-neutral-700">
                {midPrice}
              </span>
            </p>
          )}
        </div>
        <Badge variant="success" dot>
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Order Book */}
        <div className="lg:col-span-2">
          <Card padding="none">
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-700">
                Order Book
              </span>
              {bookLoading && <Spinner size="sm" className="text-neutral-400" />}
            </div>

            <div className="grid grid-cols-2 divide-x divide-neutral-100">
              {/* Bids */}
              <div>
                <div className="grid grid-cols-2 px-4 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-50">
                  <span>Price</span>
                  <span className="text-right">Qty</span>
                </div>
                <div className="divide-y divide-neutral-50">
                  {bids.slice(0, 14).map((level, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-2 px-4 py-1.5 relative overflow-hidden group"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-success/8 transition-all"
                        style={{
                          width: `${(parseFloat(level.quantity) /
                            (bids[0]
                              ? parseFloat(bids[0].quantity) * 2
                              : 1)) *
                            100}%`,
                        }}
                      />
                      <span className="relative tabular-nums text-xs font-medium text-success">
                        {level.price}
                      </span>
                      <span className="relative tabular-nums text-xs text-neutral-500 text-right">
                        {level.quantity}
                      </span>
                    </div>
                  ))}
                  {!bookLoading && bids.length === 0 && (
                    <p className="px-4 py-6 text-xs text-neutral-400 text-center">
                      No bids
                    </p>
                  )}
                </div>
              </div>

              {/* Asks */}
              <div>
                <div className="grid grid-cols-2 px-4 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-50">
                  <span>Price</span>
                  <span className="text-right">Qty</span>
                </div>
                <div className="divide-y divide-neutral-50">
                  {asks.slice(0, 14).map((level, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-2 px-4 py-1.5 relative overflow-hidden"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-error/8 transition-all"
                        style={{
                          width: `${(parseFloat(level.quantity) /
                            (asks[0]
                              ? parseFloat(asks[0].quantity) * 2
                              : 1)) *
                            100}%`,
                        }}
                      />
                      <span className="relative tabular-nums text-xs font-medium text-error">
                        {level.price}
                      </span>
                      <span className="relative tabular-nums text-xs text-neutral-500 text-right">
                        {level.quantity}
                      </span>
                    </div>
                  ))}
                  {!bookLoading && asks.length === 0 && (
                    <p className="px-4 py-6 text-xs text-neutral-400 text-center">
                      No asks
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Order Form */}
        <div>
          <Card>
            <div className="flex rounded-xl border border-neutral-200 p-0.5 mb-5">
              {(['buy', 'sell'] as OrderSide[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={[
                    'flex-1 py-2 text-sm font-semibold rounded-[10px] transition-all duration-150 capitalize',
                    side === s
                      ? s === 'buy'
                        ? 'bg-success text-white shadow-sm'
                        : 'bg-error text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Price"
                type="number"
                min="0"
                step="0.0001"
                placeholder="0.0000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                endAdornment={marketId.split('-')[1] ?? 'QUOTE'}
              />
              <Input
                label="Quantity"
                type="number"
                min="0"
                step="0.00000001"
                placeholder="0.00000000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                endAdornment={marketId.split('-')[0] ?? 'BASE'}
              />

              {price && quantity && (
                <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm">
                  <div className="flex justify-between text-neutral-500">
                    <span>Total</span>
                    <span className="tabular-nums font-medium text-neutral-700">
                      {(parseFloat(price || '0') * parseFloat(quantity || '0')).toFixed(4)}{' '}
                      {marketId.split('-')[1] ?? ''}
                    </span>
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-xs text-error">{submitError}</p>
              )}

              {isConnected ? (
                <Button
                  variant={side === 'buy' ? 'primary' : 'danger'}
                  loading={submitting}
                  onClick={handlePlaceOrder}
                  disabled={!price || !quantity}
                  className="w-full capitalize"
                >
                  {side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" disabled>
                  Connect Wallet to Trade
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
