import type { Config } from 'tailwindcss';

/**
 * GovTrust UI — design tokens.
 * A modern layer over NIC e-Office aesthetics: sober, trustworthy, data-dense.
 * Light theme only (projector-friendly for judging).
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#14417B',
          hover: '#0F3363',
          foreground: '#FFFFFF',
          50: '#EEF3FA',
          100: '#D9E4F3',
          200: '#B3C8E6',
          600: '#14417B',
          700: '#0F3363',
          900: '#0A2244',
        },
        sidebar: {
          DEFAULT: '#0E2A52',
          hover: '#153A6E',
          active: '#1B4585',
          border: '#1D3E6E',
        },
        saffron: {
          DEFAULT: '#FF9933',
          soft: '#FFF3E6',
          deep: '#B45309',
        },
        success: { DEFAULT: '#0E7A3D', soft: '#E7F5ED' },
        warning: { DEFAULT: '#B45309', soft: '#FEF3E2' },
        danger: { DEFAULT: '#B3261E', soft: '#FDECEA' },
        info: { DEFAULT: '#1D4ED8', soft: '#E8EFFD' },
        violetx: { DEFAULT: '#6D28D9', soft: '#F1EBFC' },
        teal: { DEFAULT: '#0E7490', soft: '#E4F3F7' },
        canvas: '#F6F8FB',
        card: '#FFFFFF',
        borderx: '#E2E8F0',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        deva: ['var(--font-deva)', 'var(--font-sans)', 'sans-serif'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['12px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '21px' }],
        md: ['15px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '36px' }],
        '4xl': ['34px', { lineHeight: '42px' }],
      },
      borderRadius: {
        card: '10px',
        btn: '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.05)',
        cardHover: '0 4px 12px rgb(15 51 99 / 0.08)',
        pop: '0 8px 28px rgb(15 23 42 / 0.12)',
      },
      maxWidth: {
        shell: '1400px',
      },
      keyframes: {
        'pulse-danger': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(179 38 30 / 0.45)' },
          '50%': { boxShadow: '0 0 0 5px rgb(179 38 30 / 0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-danger': 'pulse-danger 2s ease-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.25s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
