'use client'

import { useEffect, useRef, useState } from 'react'
import { getBalances, getOrders, cancelOrder, type BalanceResponse, type Order } from '@/lib/api'
import { getWsClient } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'open'     ? 'primary' :
    status === 'filled'   ? 'success' :
    status === 'canceled' ? 'neutral' :
    status === 'partial'  ? 'warning' :
    'neutral'
  return <Badge variant={variant} dot>{status}</Badge>
}

export default function DashboardPage() {
  const { address, isConnected, connect } = useAuth()

  const [balances, setBalances] = useState<BalanceResponse[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [canceling, setCanceling] = useState<Record<number, boolean>>({})

  const wsRef = useRef(getWsClient())

  useEffect(() => {
    if (!address) return
    setLoading(true)
    Promise.all([getBalances(address), getOrders(address)])
      .then(([balRes, ordRes]) => {
        if (balRes.ok && balRes.data) setBalances(balRes.data)
        if (ordRes.ok && ordRes.data) setOrders(ordRes.data)
      })
      .finally(() => setLoading(false))
  }, [address])

  // Live balance + order updates via WS private feed
  useEffect(() => {
    if (!address) return
    const ws = wsRef.current
    ws.connect()

    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'balance_update') {
        setBalances((prev) => {
          const updated = prev.filter((b) => b.asset !== msg.asset)
          return [
            ...updated,
            { asset: msg.asset, available: msg.available, locked: msg.locked, total: '' },
          ]
        })
      }
      if (msg.type === 'order_update') {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === msg.order_id
              ? { ...o, status: msg.status, filled_quantity: msg.filled_quantity }
              : o,
          ),
        )
      }
    })

    return () => unsub()
  }, [address])

  async function handleCancel(orderId: number, nonce: number) {
    if (!address) return
    setCanceling((c) => ({ ...c, [orderId]: true }))
    try {
      await cancelOrder({
        order_id: orderId,
        nonce: nonce + 1,
        address,
        signature: '0x', // placeholder — real impl signs with wallet
      })
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } finally {
      setCanceling((c) => ({ ...c, [orderId]: false }))
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 7H3C2.44772 7 2 7.44772 2 8V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V8C22 7.44772 21.5523 7 21 7Z"
              stroke="#5B4FE8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
            <path d="M16 14C16 15.1046 15.1046 16 14 16C12.8954 16 12 15.1046 12 14C12 12.8954 12.8954 12 14 12C15.1046 12 16 12.8954 16 14Z" fill="#5B4FE8"/>
            <path d="M17 7V5C17 3.89543 16.1046 3 15 3H9C7.89543 3 7 3.89543 7 5V7" stroke="#5B4FE8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-neutral-900">Connect your wallet</h2>
        <p className="text-sm text-neutral-500 text-center max-w-sm">
          Connect a wallet to view your balances, open orders, and trading history.
        </p>
        <Button onClick={() => connect()}>Connect Wallet</Button>
      </div>
    )
  }

  if (loading) return <FullPageSpinner />

  const totalValue = balances.reduce((sum, b) => sum + parseFloat(b.total || b.available), 0)
  const openOrders = orders.filter((o) => o.status === 'open' || o.status === 'partial')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {address?.slice(0, 6)}…{address?.slice(-4)} · {openOrders.length} open order{openOrders.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <div className="text-3xl font-bold text-neutral-900 tabular-nums">
            {totalValue.toFixed(2)}
          </div>
          <div className="text-sm text-neutral-500 mt-1">Portfolio value (USD)</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold text-neutral-900 tabular-nums">
            {openOrders.length}
          </div>
          <div className="text-sm text-neutral-500 mt-1">Open orders</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold text-neutral-900 tabular-nums">
            {balances.length}
          </div>
          <div className="text-sm text-neutral-500 mt-1">Assets held</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balances */}
        <Card padding="none">
          <div className="px-6 py-4 border-b border-neutral-100">
            <CardHeader title="Balances" />
          </div>
          {balances.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-neutral-500">No balances found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Asset</th>
                  <th className="px-6 py-3 text-right">Available</th>
                  <th className="px-6 py-3 text-right">Locked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {balances.map((b) => (
                  <tr key={b.asset} className="hover:bg-neutral-50">
                    <td className="px-6 py-3 font-medium text-neutral-900">{b.asset}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-neutral-700">
                      {b.available}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-neutral-400">
                      {b.locked}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Open Orders */}
        <Card padding="none">
          <div className="px-6 py-4 border-b border-neutral-100">
            <CardHeader title="Open Orders" />
          </div>
          {openOrders.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-neutral-500">
              No open orders.
            </p>
          ) : (
            <div className="divide-y divide-neutral-50">
              {openOrders.map((order) => (
                <div key={order.id} className="px-6 py-4 hover:bg-neutral-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-neutral-900">{order.market}</span>
                        <Badge variant={order.side === 'buy' ? 'success' : 'error'} size="sm">
                          {order.side}
                        </Badge>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-neutral-400 tabular-nums">
                        <span>Price: <span className="text-neutral-600">{order.price}</span></span>
                        <span>Qty: <span className="text-neutral-600">{order.quantity}</span></span>
                        <span>Filled: <span className="text-neutral-600">{order.filled_quantity}</span></span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={canceling[order.id]}
                      onClick={() => handleCancel(order.id, order.nonce)}
                      className="text-error hover:bg-error-light shrink-0"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
