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
