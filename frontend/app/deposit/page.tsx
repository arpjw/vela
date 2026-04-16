'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { deposit, getBalances, type BalanceResponse } from '@/lib/api'
import { depositETH, switchToSepolia } from '@/lib/contract'
import { Spinner } from '@/components/ui/Spinner'

const ASSETS = [
  'USDC', 'ETH', 'BTC', 'SOL', 'AVAX', 'MATIC',
  'LINK', 'UNI', 'ARB', 'OP', 'AAVE', 'DOGE',
]

function ConnectGate() {
  const { connect } = useAuth()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      await connect()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center bg-canvas border border-border shadow-[0_4px_24px_rgba(14,26,32,0.08)] p-8" style={{ borderRadius: 0 }}>
        <div className="w-16 h-16 bg-ochre/10 flex items-center justify-center mx-auto mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 7H3C2.44772 7 2 7.44772 2 8V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V8C22 7.44772 21.5523 7 21 7Z"
              stroke="#00D2D2"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="14" r="2" fill="#00D2D2" />
            <path
              d="M17 7V5C17 3.89543 16.1046 3 15 3H9C7.89543 3 7 3.89543 7 5V7"
              stroke="#00D2D2"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-ink mb-2">Connect your wallet</h2>
        <p className="text-sm text-brown mb-6">Connect your wallet to deposit funds.</p>
        {error && (
          <p className="text-xs text-red-600 mb-4">{error}</p>
        )}
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-4 h-10 border-[1.5px] border-ink text-ink text-[0.8rem] font-medium uppercase tracking-[0.08em] hover:bg-ink hover:text-parchment transition-colors duration-150 disabled:opacity-50"
          style={{ borderRadius: 0 }}
        >
          {connecting && <Spinner size="xs" className="text-ink" />}
          Connect Wallet
        </button>
      </div>
    </div>
  )
}

interface SuccessState {
  amount: string
  asset: string
  newBalance: string
  txHash?: string
}

export default function DepositPage() {
  const { address, isConnected } = useAuth()

  const [selectedAsset, setSelectedAsset] = useState('USDC')
  const [amount, setAmount] = useState('')
  const [balances, setBalances] = useState<BalanceResponse[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<SuccessState | null>(null)

  useEffect(() => {
    if (!address) return
    getBalances(address).then((res) => {
      if (res.ok && res.data) setBalances(res.data)
    })
  }, [address])

  const currentBalance = balances.find(
    (b) => b.asset.toUpperCase() === selectedAsset.toUpperCase(),
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address || !amount) return
    setSubmitting(true)
    setError(null)

    try {
      if (selectedAsset === 'ETH') {
        await switchToSepolia()
        const txHash = await depositETH(amount)
        const res = await deposit(address, selectedAsset, amount)
        setSubmitting(false)

        const updated = res.ok && res.data ? res.data : balances
        if (!res.ok) {
          setError(res.error ?? 'Engine credit failed — on-chain tx sent: ' + txHash)
        }
        const newBal = updated.find(
          (b) => b.asset.toUpperCase() === selectedAsset.toUpperCase(),
        )
        setSuccess({
          amount,
          asset: selectedAsset,
          newBalance: String(Number(newBal?.available ?? '0') / 1_000_000),
          txHash,
        })
      } else {
        const res = await deposit(address, selectedAsset, amount)
        setSubmitting(false)

        if (!res.ok || !res.data) {
          setError(res.error ?? 'Deposit failed')
          return
        }

        const updated = res.data
        setBalances(updated)
        const newBal = updated.find(
          (b) => b.asset.toUpperCase() === selectedAsset.toUpperCase(),
        )
        setSuccess({
          amount,
          asset: selectedAsset,
          newBalance: String(Number(newBal?.available ?? '0') / 1_000_000),
        })
      }
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Deposit failed')
    }
  }

  if (!isConnected) {
    return <ConnectGate />
  }

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  return (
    <div className="min-h-[calc(100vh-60px)] bg-parchment flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.15em] text-brown mb-6">
          DEPOSIT FUNDS
        </p>

        <div
          className="mb-6"
          style={{
            borderLeft: '3px solid #00D2D2',
            background: 'rgba(0,210,210,0.04)',
            padding: '12px 16px',
          }}
        >
          <p className="text-[0.8rem] text-ink leading-relaxed">
            Vela is in public beta. Deposits are trust-based and not settled
            on-chain. Only deposit amounts you are comfortable with.
          </p>
        </div>

        {success ? (
          <div
            className="bg-canvas border border-border p-8 flex flex-col items-center text-center"
            style={{ borderRadius: 0 }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              className="mb-5"
            >
              <circle cx="24" cy="24" r="23" stroke="#00A090" strokeWidth="2" />
              <path
                d="M14 24l7 7 13-14"
                stroke="#00A090"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-xl font-semibold text-ink mb-2">
              Deposit successful
            </p>
            <p className="text-sm text-brown mb-5">
              Your {success.amount} {success.asset} has been credited to your
              account.
            </p>
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-brown mb-1">
              NEW BALANCE
            </p>
            <p
              className="text-lg font-mono text-ink mb-5"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {success.newBalance} {success.asset}
            </p>
            {success.txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${success.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.7rem] font-medium uppercase tracking-[0.12em] mb-7"
                style={{ color: '#00D2D2' }}
              >
                VIEW ON ETHERSCAN ↗
              </a>
            )}
            {!success.txHash && <div className="mb-7" />}
            <Link
              href="/markets/ETH-USDC"
              className="w-full flex items-center justify-center h-10 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink transition-colors duration-150"
              style={{ background: '#00D2D2', borderRadius: 0 }}
            >
              START TRADING
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-canvas border border-border p-8"
            style={{ borderRadius: 0 }}
          >
            <div className="mb-6">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brown mb-2">
                CONNECTED WALLET
              </p>
              <p
                className="text-sm text-ink"
                style={{ fontFamily: 'var(--font-mono)', color: '#7BA4B8' }}
              >
                {shortAddress}
              </p>
            </div>

            <div className="mb-2">
              <label className="block text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brown mb-2">
                ASSET
              </label>
              <select
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
                className="w-full h-10 px-3 bg-vellum border border-border text-sm text-ink appearance-none focus:outline-none focus:border-ink"
                style={{ borderRadius: 0, fontFamily: 'var(--font-mono)' }}
              >
                {ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              {selectedAsset === 'ETH' ? (
                <p className="text-[0.72rem] font-medium" style={{ color: '#00D2D2' }}>
                  ● Ethereum Sepolia — on-chain settlement
                </p>
              ) : (
                <p className="text-[0.72rem] font-medium text-brown">
                  ● Trust-based beta deposit
                </p>
              )}
              {selectedAsset !== 'ETH' && (
                <p className="text-[0.7rem] text-brown mt-1">
                  ERC20 on-chain deposits coming soon
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brown mb-2">
                AMOUNT
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-10 pl-3 pr-16 bg-vellum border border-border text-sm text-ink focus:outline-none focus:border-ink"
                  style={{ borderRadius: 0, fontFamily: 'var(--font-mono)' }}
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brown"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {selectedAsset}
                </span>
              </div>
            </div>

            <div className="mb-7">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brown mb-1">
                CURRENT BALANCE
              </p>
              <p
                className="text-sm text-ink"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {currentBalance ? String(Number(currentBalance.available) / 1_000_000) : '0'}{' '}
                {selectedAsset}
              </p>
            </div>

            {error && (
              <p className="text-xs mb-4" style={{ color: '#00D2D2' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !amount}
              className="w-full flex items-center justify-center gap-2 h-10 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink transition-colors duration-150 disabled:opacity-50"
              style={{ background: '#00D2D2', borderRadius: 0 }}
            >
              {submitting && <Spinner size="xs" className="text-white" />}
              DEPOSIT {amount || '0'} {selectedAsset}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
