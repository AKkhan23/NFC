/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        gold: {
          50: '#FBF6E9',
          100: '#F6EACB',
          200: '#EED69A',
          300: '#E5BE6B',
          400: '#DDA84A',
          500: '#D4A853',
          600: '#B8893A',
          700: '#8F6A2E',
          800: '#5F4722',
          900: '#3A2C15',
        },
        ink: {
          950: '#060607',
          900: '#0B0B0D',
          850: '#101013',
          800: '#151518',
          700: '#1D1D21',
          600: '#26262C',
        },
      },
      boxShadow: {
        premium: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 12px 32px -12px rgba(0,0,0,0.8)',
        'premium-lg': '0 1px 0 0 rgba(255,255,255,0.08) inset, 0 24px 64px -16px rgba(0,0,0,0.85)',
        glow: '0 0 24px -4px rgba(212,168,83,0.45), 0 0 64px -8px rgba(212,168,83,0.25)',
        'glow-sm': '0 0 16px -4px rgba(212,168,83,0.5)',
        card: '0 8px 24px -8px rgba(0,0,0,0.7)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      letterSpacing: {
        luxe: '0.14em',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.85)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
