import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    borderRadius: {
      none: '0px',
      sm: '0px',
      DEFAULT: '0px',
      md: '0px',
      lg: '0px',
      xl: '0px',
      '2xl': '0px',
      '3xl': '0px',
      full: '9999px',
    },
    extend: {
      colors: {
        parchment: '#080C10',
        canvas: '#0D1218',
        vellum: '#131920',
        ink: '#E8F4F8',
        brown: '#7BA4B8',
        ochre: '#00D2D2',
        fresco: '#00B0B0',
        terra: '#CC3333',
        sage: '#00A090',
        violet: '#00D2D2',
        border: 'rgba(14,26,32,1)',
      },
      fontFamily: {
        sans: ['"IBM Plex Mono"', 'monospace'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 20px rgba(14,26,32,0.06)',
        'card-hover': '0 2px 20px rgba(14,26,32,0.08)',
        modal: '0 20px 60px -10px rgba(14,26,32,0.15)',
      },
    },
  },
  plugins: [],
}

export default config
