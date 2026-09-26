/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1200px' } },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
        // اللون الأساسي: أخضر داكن
        brand: {
          50: '#eef4f0',
          100: '#d5e4da',
          200: '#adc9b6',
          300: '#7fa98c',
          400: '#4f8465',
          500: '#33684b',
          600: '#27533c',
          700: '#1f3a2e',
          800: '#182e24',
          900: '#10201a',
        },
        // اللون الثانوي: رملي
        sand: {
          50: '#faf6ee',
          100: '#f3ead7',
          200: '#e8d9b8',
          300: '#dcc596',
          400: '#caa96a',
          500: '#b48f4d',
          600: '#94733c',
          700: '#735832',
        },
        // المحايد — يتغير مع الوضع الليلي عبر CSS variables
        bg: v('c-bg'),
        surface: v('c-surface'),
        subtle: v('c-subtle'),
        line: v('c-line'),
        ink: v('c-ink'),
        muted: v('c-muted'),
        danger: '#b3261e',
        success: '#2e7d4f',
        warn: '#a86b00',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        card: '0 1px 2px rgb(16 32 26 / 0.06), 0 1px 1px rgb(16 32 26 / 0.04)',
        lift: '0 8px 24px -8px rgb(16 32 26 / 0.18)',
      },
      maxWidth: { prose: '68ch' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(-100%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .25s ease-out both',
      },
    },
  },
  plugins: [],
};
