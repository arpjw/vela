export async function signOrder(order: {
  market: string
  side: string
  price: number
  quantity: number
  nonce: number
  address: string
}): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet detected. Please install MetaMask.')
  const message = `vela:order:${order.market}:${order.side}:${order.price}:${order.quantity}:${order.nonce}`
  return window.ethereum.request({
    method: 'personal_sign',
    params: [message, order.address],
  }) as Promise<string>
}

export async function signCancel(cancel: {
  order_id?: number
  client_order_id?: string
  nonce: number
  address: string
}): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet detected. Please install MetaMask.')
  const message = `vela:cancel:${cancel.order_id ?? ''}:${cancel.client_order_id ?? ''}:${cancel.nonce}`
  return window.ethereum.request({
    method: 'personal_sign',
    params: [message, cancel.address],
  }) as Promise<string>
}
