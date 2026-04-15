'use client'

// ---------------------------------------------------------------------------
// Vela wallet auth context
//
// Flow:
//   1. connect()           — request MetaMask accounts, store address
//   2. signIn(wsClient)    — RequestChallenge → sign vela:auth:{nonce} → Auth
//   3. signOut()           — clear session
//
// Private WS feed access is gated behind isAuthenticated.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import type { VelaWsClient } from './ws'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthState {
  address: string | null
  isConnected: boolean
  isAuthenticated: boolean
}

export interface AuthContextValue extends AuthState {
  /** Prompt MetaMask, store the returned address. */
  connect: () => Promise<string>
  /** Clear all auth state. */
  signOut: () => void
  /**
   * Run the WS challenge-response flow:
   *   RequestChallenge → receive nonce → personal_sign → Auth → Authenticated
   *
   * Requires the wallet to be connected first (connect() already called).
   * Resolves once the server confirms Authenticated, rejects on error.
   */
  signIn: (wsClient: VelaWsClient) => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    address: null,
    isConnected: false,
    isAuthenticated: false,
  })

  // -------------------------------------------------------------------------
  // connect — request eth_accounts via MetaMask
  // -------------------------------------------------------------------------
  const connect = useCallback(async (): Promise<string> => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No wallet detected. Please install MetaMask.')
    }
    const accounts = (await window.ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[]

    if (!accounts[0]) throw new Error('No accounts returned from wallet.')
    const address = accounts[0].toLowerCase()
    setState((s) => ({ ...s, address, isConnected: true }))
    return address
  }, [])

  // -------------------------------------------------------------------------
  // signOut — wipe session
  // -------------------------------------------------------------------------
  const signOut = useCallback(() => {
    setState({ address: null, isConnected: false, isAuthenticated: false })
  }, [])

  // -------------------------------------------------------------------------
  // signIn — WS challenge-response auth
  // -------------------------------------------------------------------------
  const signIn = useCallback(
    (wsClient: VelaWsClient): Promise<void> => {
      const { address } = state

      if (!address) {
        return Promise.reject(new Error('Wallet not connected.'))
      }
      if (typeof window === 'undefined' || !window.ethereum) {
        return Promise.reject(new Error('No wallet detected.'))
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false

        const unsubscribe = wsClient.onMessage(async (msg) => {
          if (settled) return

          if (msg.type === 'challenge') {
            const { nonce } = msg
            try {
              // Sign the server-issued nonce — message must match
              // auth_signing_message() in api/src/auth.rs
              const message = `vela:auth:${nonce}`
              const signature = (await window.ethereum!.request({
                method: 'personal_sign',
                params: [message, address],
              })) as string

              wsClient.auth(address, signature, nonce)
            } catch (err) {
              settled = true
              unsubscribe()
              reject(err)
            }
            return
          }

          if (msg.type === 'authenticated') {
            settled = true
            unsubscribe()
            setState((s) => ({ ...s, isAuthenticated: true }))
            resolve()
            return
          }

          if (msg.type === 'error') {
            settled = true
            unsubscribe()
            reject(new Error(msg.message))
          }
        })

        // Kick off the challenge flow
        wsClient.requestChallenge()
      })
    },
    [state],
  )

  return (
    <AuthContext.Provider value={{ ...state, connect, signOut, signIn }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>.')
  return ctx
}
