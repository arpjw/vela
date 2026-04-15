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
        parchment: '#FFFFFF',
        canvas: '#F7F5F0',
        vellum: '#EFEDE8',
        ink: '#1A1208',
        brown: '#6B4F2E',
        ochre: '#C4943A',
        fresco: '#4A6D9C',
        terra: '#A0402A',
        sage: '#6B8C52',
        violet: '#7B5EA7',
        border: 'rgba(26,18,8,0.1)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 20px rgba(26,18,8,0.06)',
        'card-hover': '0 2px 20px rgba(26,18,8,0.08)',
        modal: '0 20px 60px -10px rgba(26,18,8,0.15)',
      },
    },
  },
  plugins: [],
}

export default config
