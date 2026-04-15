import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#5B4FE8',
          50:  '#EFEDFD',
          100: '#DDD9FA',
          200: '#BBB3F5',
          300: '#998EF0',
          400: '#7768EC',
          500: '#5B4FE8',
          600: '#3F31D6',
          700: '#3126AA',
          800: '#241B7E',
          900: '#161152',
        },
        secondary: {
          DEFAULT: '#00D4FF',
          50:  '#E0FBFF',
          100: '#B3F4FF',
          200: '#66EAFF',
          300: '#1ADDFF',
          400: '#00D4FF',
          500: '#00AACF',
          600: '#00809F',
          700: '#00556F',
          800: '#002B3F',
          900: '#00101F',
        },
        success: {
          DEFAULT: '#22C55E',
          light: '#DCFCE7',
          dark: '#15803D',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#B45309',
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          dark: '#B91C1C',
        },
        neutral: {
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        modal: '0 20px 60px -10px rgb(0 0 0 / 0.18)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}

export default config
