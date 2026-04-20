export const MARKET_DATA: Record<string, { name: string; ticker: string; quoteTicker: string; vol: string }> = {
  'BTC-USDC':  { name: 'Bitcoin',   ticker: 'BTC',  quoteTicker: 'USDC', vol: '$1.2B'  },
  'ETH-USDC':  { name: 'Ethereum',  ticker: 'ETH',  quoteTicker: 'USDC', vol: '$480M'  },
  'SOL-USDC':  { name: 'Solana',    ticker: 'SOL',  quoteTicker: 'USDC', vol: '$210M'  },
  'AVAX-USDC': { name: 'Avalanche', ticker: 'AVAX', quoteTicker: 'USDC', vol: '$88M'   },
  'LINK-USDC': { name: 'Chainlink', ticker: 'LINK', quoteTicker: 'USDC', vol: '$42M'   },
  'ARB-USDC':  { name: 'Arbitrum',  ticker: 'ARB',  quoteTicker: 'USDC', vol: '$31M'   },
  'OP-USDC':   { name: 'Optimism',  ticker: 'OP',   quoteTicker: 'USDC', vol: '$28M'   },
  'UNI-USDC':  { name: 'Uniswap',   ticker: 'UNI',  quoteTicker: 'USDC', vol: '$24M'   },
  'AAVE-USDC': { name: 'Aave',      ticker: 'AAVE', quoteTicker: 'USDC', vol: '$18M'   },
  'MATIC-USDC':{ name: 'Polygon',   ticker: 'MATIC',quoteTicker: 'USDC', vol: '$14M'   },
  'DOGE-USDC':  { name: 'Dogecoin',   ticker: 'DOGE',   quoteTicker: 'USDC', vol: '$11M'   },
  'PEPE-USDC':  { name: 'Pepe',       ticker: 'PEPE',   quoteTicker: 'USDC', vol: '$8M'    },
  'WIF-USDC':   { name: 'dogwifhat',  ticker: 'WIF',    quoteTicker: 'USDC', vol: '$6M'    },
  'JUP-USDC':   { name: 'Jupiter',    ticker: 'JUP',    quoteTicker: 'USDC', vol: '$5M'    },
  'PENDLE-USDC':{ name: 'Pendle',     ticker: 'PENDLE', quoteTicker: 'USDC', vol: '$4M'    },
  'EIGEN-USDC': { name: 'EigenLayer', ticker: 'EIGEN',  quoteTicker: 'USDC', vol: '$3M'    },
}

export const ORDERED_PAIRS = Object.keys(MARKET_DATA)

export function getMarketInfo(pair: string) {
  return (
    MARKET_DATA[pair] ?? {
      name: pair.split('-')[0] ?? pair,
      ticker: pair.split('-')[0] ?? pair,
      quoteTicker: pair.split('-')[1] ?? 'USDC',
      vol: '—',
    }
  )
}

function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0
  }
  return h
}

export function pairChange(pair: string): number {
  const h = hashStr(pair)
  const r = (h % 10000) / 10000
  return r * 9 - 3.7
}

export function sparklineBars(pair: string): { height: number; up: boolean }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    height: 25 + (hashStr(pair + String(i)) % 76),
    up: hashStr(pair + String(i) + 'u') % 3 !== 0,
  }))
}

export function getPriceDecimals(pair: string): number {
  const ticker = pair.split('-')[0] ?? ''
  if (['ARB', 'OP', 'MATIC', 'DOGE'].includes(ticker)) return 4
  return 2
}
