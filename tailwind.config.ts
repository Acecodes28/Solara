import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/i18n/**/*.ts'],
  theme: {
    screens: { xs: '480px', sm: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      colors: {
        primary: { DEFAULT: '#1F4D2B', soft: '#E6EFE7', dark: '#163A20' },
        accent: '#7A5230',
        water: { DEFAULT: '#2E7D9A', soft: '#E3F1F6' },
        warning: { DEFAULT: '#D9A441', soft: '#FBF3E2', text: '#7A5410' },
        danger: { DEFAULT: '#B71C1C', soft: '#FBE9E9' },
        success: { DEFAULT: '#2E7D32', soft: '#E8F3E9' },
        page: '#F5F7F2',
        line: '#E3E8DF',
        ink: '#1D2A1F',
        muted: '#5B6B5E',
      },
      borderRadius: { card: '12px', ctl: '8px' },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-deva)', 'system-ui', 'sans-serif'],
        deva: ['var(--font-deva)', 'var(--font-inter)', 'sans-serif'],
      },
      transitionDuration: { DEFAULT: '150ms' },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        grow: { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } },
      },
      animation: {
        fadeUp: 'fadeUp 180ms ease-out both',
        fadeIn: 'fadeIn 160ms ease-out both',
        shimmer: 'shimmer 1.2s linear infinite',
        grow: 'grow 200ms ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
