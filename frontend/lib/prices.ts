export type LivePrices = {
  [pair: string]: {
    price: number
    change24h: number
  }
}

const COINGECKO_IDS: Record<string, string> = {
  'BTC-USDC': 'bitcoin',
  'ETH-USDC': 'ethereum',
  'SOL-USDC': 'solana',
  'AVAX-USDC': 'avalanche-2',
  'MATIC-USDC': 'matic-network',
  'LINK-USDC': 'chainlink',
  'UNI-USDC': 'uniswap',
  'ARB-USDC': 'arbitrum',
  'OP-USDC': 'optimism',
  'AAVE-USDC': 'aave',
  'DOGE-USDC': 'dogecoin',
}

export async function fetchLivePrices(): Promise<LivePrices> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { cache: 'no-store' }
    )
    if (!res.ok) return {}
    const data = await res.json()
    const result: LivePrices = {}
    for (const [pair, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]) {
        result[pair] = {
          price: data[geckoId].usd,
          change24h: data[geckoId].usd_24h_change ?? 0,
        }
      }
    }
    return result
  } catch {
    return {}
  }
}
