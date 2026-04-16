const CONTRACT_ADDRESS = '0xAa8E680c11a883F9bf6eb980B2D4E9D18DD25686'
const SEPOLIA_CHAIN_ID = 11155111
const ETH_ASSET = '0x0000000000000000000000000000000000000000'

function encodeDepositETH(): string {
  return '0xf9a06f72'
}

function encodeGetBalance(userAddress: string): string {
  const selector = '0x5c36b186'
  const paddedUser = userAddress.toLowerCase().replace('0x', '').padStart(64, '0')
  const paddedAsset = ETH_ASSET.replace('0x', '').padStart(64, '0')
  return selector + paddedUser + paddedAsset
}

export async function switchToSepolia(): Promise<void> {
  const ethereum = (window as any).ethereum
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xaa36a7' }],
    })
  } catch (err: any) {
    if (err.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0xaa36a7',
            chainName: 'Sepolia',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

export async function depositETH(amountEth: string): Promise<string> {
  const ethereum = (window as any).ethereum
  await switchToSepolia()

  const accounts: string[] = await ethereum.request({ method: 'eth_accounts' })
  if (!accounts.length) throw new Error('No connected account')

  const weiHex = '0x' + BigInt(Math.round(parseFloat(amountEth) * 1e18)).toString(16)

  const txHash: string = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: accounts[0],
        to: CONTRACT_ADDRESS,
        data: encodeDepositETH(),
        value: weiHex,
      },
    ],
  })

  return txHash
}

function encodeWithdrawCall(
  assetAddress: string,
  amountWei: string,
  nonce: number,
  signature: string
): string {
  const selector = '3ccfd60b'
  const paddedAsset = assetAddress.slice(2).padStart(64, '0')
  const paddedAmount = BigInt(amountWei).toString(16).padStart(64, '0')
  const paddedNonce = BigInt(nonce).toString(16).padStart(64, '0')
  const offset = '0000000000000000000000000000000000000000000000000000000000000080'
  const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature
  const sigLength = BigInt(sigHex.length / 2).toString(16).padStart(64, '0')
  const sigPadded = sigHex.padEnd(Math.ceil(sigHex.length / 64) * 64, '0')
  return '0x' + selector + paddedAsset + paddedAmount + paddedNonce + offset + sigLength + sigPadded
}

export async function withdrawETH(
  amountWei: string,
  nonce: number,
  signature: string
): Promise<string> {
  await switchToSepolia()
  const ethereum = (window as any).ethereum
  const accounts: string[] = await ethereum.request({ method: 'eth_accounts' })
  if (!accounts.length) throw new Error('No connected account')

  const data = encodeWithdrawCall(ETH_ASSET, amountWei, nonce, signature)

  const txHash: string = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: accounts[0],
        to: CONTRACT_ADDRESS,
        data,
        value: '0x0',
      },
    ],
  })

  return txHash
}

export async function requestWithdrawalSignature(
  user: string,
  asset: string,
  amount: string,
  nonce: number
): Promise<{ signature: string; amountWei: string; assetAddress: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://vela-engine.fly.dev'
  const res = await fetch(`${apiUrl}/withdrawal-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, asset, amount, nonce }),
    cache: 'no-store',
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'Failed to get signature')
  return {
    signature: data.data.signature,
    amountWei: data.data.amount_wei,
    assetAddress: data.data.asset,
  }
}

export async function getOnChainBalance(userAddress: string): Promise<string> {
  const ethereum = (window as any).ethereum

  const result: string = await ethereum.request({
    method: 'eth_call',
    params: [
      {
        to: CONTRACT_ADDRESS,
        data: encodeGetBalance(userAddress),
      },
      'latest',
    ],
  })

  if (!result || result === '0x') return '0'
  const wei = BigInt(result)
  return (Number(wei) / 1e18).toString()
}
