import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './reza/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Palette utama Kartolo
        primary: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0', // Soft
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E', // Primary
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
          950: '#052e16', // Darkest shade untuk dark mode
          DEFAULT: '#22C55E',
        },
        soft: '#BBF7D0',
        surface: '#F8FAFC',     // Background light
        ink: '#0F172A',          // Text utama light
        muted: '#64748B',        // Text sekunder light
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(34, 197, 94, 0.15)',
        glow: '0 0 0 4px rgba(34, 197, 94, 0.12)',
        card: '0 12px 40px -12px rgba(15, 23, 42, 0.12)',
      },
      backgroundImage: {
        'gradient-soft': 'linear-gradient(135deg, #F0FDF4 0%, #BBF7D0 100%)',
        'gradient-primary': 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
        'gradient-hero': 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '50%': { transform: 'translateY(-12px) translateX(8px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'progress-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
        'fade-in': 'fade-in 0.5s ease-out both',
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
        'slide-in-left': 'slide-in-left 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'pop-in': 'pop-in 0.16s ease-out both',
        'progress-slide': 'progress-slide 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
