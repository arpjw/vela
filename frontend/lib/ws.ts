// ---------------------------------------------------------------------------
// Vela WebSocket client — typed against api/src/types.rs WsClientMessage /
// WsServerMessage.  Serde serializes with tag="type", rename_all="snake_case".
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type WsClientMessage =
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'request_challenge' }
  | { type: 'auth'; address: string; signature: string; nonce: string }
  | { type: 'ping' }

export type WsServerMessage =
  | { type: 'subscribed'; channels: string[] }
  | { type: 'book_snapshot'; market: string; bids: [string, string][]; asks: [string, string][] }
  | { type: 'trade'; market: string; price: string; quantity: string; side: string; timestamp: number }
  | { type: 'order_update'; order_id: number; status: string; filled_quantity: string }
  | { type: 'fill'; maker_order_id: number; taker_order_id: number; price: string; quantity: string; side: string; maker_fee: string; taker_fee: string; timestamp: number }
  | { type: 'balance_update'; asset: string; available: string; locked: string }
  | { type: 'challenge'; nonce: string }
  | { type: 'authenticated'; address: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }

export type MessageHandler = (msg: WsServerMessage) => void
export type StatusHandler = (status: WsStatus) => void

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const INITIAL_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000

export class VelaWsClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false
  private _status: WsStatus = 'disconnected'

  constructor(private readonly url: string) {}

  get status(): WsStatus {
    return this._status
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  connect(): void {
    if (typeof window === 'undefined') return
    this.shouldReconnect = true
    this.setStatus('connecting')
    this.openSocket()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopHeartbeat()
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.setStatus('disconnected')
  }

  // -------------------------------------------------------------------------
  // Sending messages
  // -------------------------------------------------------------------------

  send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  subscribe(channels: string[]): void {
    this.send({ type: 'subscribe', channels })
  }

  unsubscribe(channels: string[]): void {
    this.send({ type: 'unsubscribe', channels })
  }

  requestChallenge(): void {
    this.send({ type: 'request_challenge' })
  }

  auth(address: string, signature: string, nonce: string): void {
    this.send({ type: 'auth', address, signature, nonce })
  }

  ping(): void {
    this.send({ type: 'ping' })
  }

  // -------------------------------------------------------------------------
  // Event subscription — returns an unsubscribe function
  // -------------------------------------------------------------------------

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private openSocket(): void {
    try {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = () => this.handleOpen()
      this.ws.onclose = () => this.handleClose()
      this.ws.onerror = () => this.handleClose()
      this.ws.onmessage = (e) => this.handleMessage(e)
    } catch {
      this.scheduleReconnect()
    }
  }

  private handleOpen(): void {
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS
    this.setStatus('connected')
    this.startHeartbeat()
  }

  private handleClose(): void {
    this.stopHeartbeat()
    if (this.shouldReconnect) {
      this.setStatus('reconnecting')
      this.scheduleReconnect()
    } else {
      this.setStatus('disconnected')
    }
  }

  private handleMessage(event: MessageEvent): void {
    let msg: WsServerMessage
    try {
      msg = JSON.parse(event.data as string) as WsServerMessage
    } catch {
      return
    }
    if (msg.type === 'pong') {
      this.clearHeartbeatTimeout()
    }
    this.messageHandlers.forEach((h) => h(msg))
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS,
      )
      this.openSocket()
    }, this.reconnectDelay)
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.ping()
      this.heartbeatTimeout = setTimeout(() => {
        // No pong — connection is stale; force a reconnect
        this.ws?.close()
      }, HEARTBEAT_TIMEOUT_MS)
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.clearHeartbeatTimeout()
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout !== null) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private setStatus(status: WsStatus): void {
    this._status = status
    this.statusHandlers.forEach((h) => h(status))
  }
}

// ---------------------------------------------------------------------------
// Singleton factory — one client per WS URL
// ---------------------------------------------------------------------------

const clients = new Map<string, VelaWsClient>()

export function getWsClient(
  url?: string,
): VelaWsClient {
  const wsUrl = url ?? process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws'
  if (!clients.has(wsUrl)) {
    clients.set(wsUrl, new VelaWsClient(wsUrl))
  }
  return clients.get(wsUrl)!
}
