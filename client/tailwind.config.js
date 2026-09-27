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
        // العناوين: كوفي هندسي يتناغم مع شكل الفرجار في الشعار
        display: ['"Noto Kufi Arabic"', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
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
          2: v('c-inverse-2'),
          fg: v('c-on-inverse'),
        },
        // المحايد — يتغير مع الوضع الليلي عبر CSS variables
        bg: v('c-bg'),
        surface: v('c-surface'),
        subtle: v('c-subtle'),
        line: v('c-line'),
        'line-strong': v('c-line-strong'),
        ink: v('c-ink'),
        muted: v('c-muted'),
        accent: v('c-accent-text'),
        danger: v('c-danger'),
        success: v('c-success'),
        warn: v('c-warn'),
        info: v('c-info'),
        whatsapp: { DEFAULT: v('c-whatsapp'), hover: v('c-whatsapp-hover') },
      },
      // زوايا معتدلة: 6 للعناصر الصغيرة، 8 للحقول والأزرار، 12 للبطاقات، 16 للصور الكبيرة
      borderRadius: { md: '0.375rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.04)',
        lift: '0 12px 32px -14px rgb(var(--c-shadow) / 0.24)',
        overlay: '0 24px 64px -24px rgb(var(--c-shadow) / 0.38)',
      },
      maxWidth: { prose: '68ch' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .25s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
