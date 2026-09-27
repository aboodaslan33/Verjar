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
        // كل القيم في src/styles/index.css (مكان واحد للألوان)
        brand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, v(`brand-${n}`)])),
        sand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700].map((n) => [n, v(`gray-${n}`)])),
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
        accent: v('c-accent-text'),
        danger: v('c-danger'),
        success: v('c-success'),
        warn: v('c-warn'),
        whatsapp: { DEFAULT: v('c-whatsapp'), hover: v('c-whatsapp-hover') },
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.05)',
        lift: '0 10px 28px -12px rgb(var(--c-shadow) / 0.22)',
      },
      maxWidth: { prose: '68ch' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .25s ease-out both',
      },
    },
  },
  plugins: [],
};
