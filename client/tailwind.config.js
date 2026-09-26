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
        // الهوية: أصفر دافئ. الدرجات 700–900 داكنة لتصلح كنص وروابط على الأبيض (تباين ≥ 5:1)
        brand: {
          50: '#FEF9E7',
          100: '#FDF1C4',
          200: '#F8E08A',
          300: '#F2CB47',
          400: '#EDBD1F',
          500: '#E8B40B',
          600: '#C79905',
          700: '#8A6400',
          800: '#6B4E00',
          900: '#4A3600',
        },
        // الثانوي: رمادي محايد (للنصوص الثانوية والحدود والخلفيات الخفيفة)
        sand: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
        },
        // أدوار دلالية — القيم في CSS variables (src/styles/index.css)
        primary: {
          DEFAULT: v('c-primary'),
          hover: v('c-primary-hover'),
          fg: v('c-on-primary'),
        },
        inverse: {
          DEFAULT: v('c-inverse'),
          fg: v('c-on-inverse'),
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
        card: '0 1px 2px rgb(17 24 39 / 0.05), 0 1px 1px rgb(17 24 39 / 0.03)',
        lift: '0 8px 24px -8px rgb(17 24 39 / 0.16)',
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
