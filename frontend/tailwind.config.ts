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
        ink: '#1A0608',
        brown: '#4A1520',
        ochre: '#C41E3A',
        fresco: '#E8829A',
        terra: '#8B0F22',
        sage: '#D4607A',
        violet: '#6B1525',
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
