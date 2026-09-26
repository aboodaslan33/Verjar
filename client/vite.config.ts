import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

async function sha256Base64(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...digest));
}

/**
 * سياسة أمان المحتوى (CSP) لنسخة الإنتاج فقط — تُضاف كـ <meta> في index.html
 * حتى تعمل على أي استضافة. السكربتات المضمّنة (مثل سكربت الوضع الليلي) يُسمح بها ببصمتها فقط.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  return {
    name: 'farjar-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        const hashes = await Promise.all(inline.map(async (code) => `'sha256-${await sha256Base64(code)}'`));
        let api = '';
        try {
          api = apiUrl ? new URL(apiUrl).origin : '';
        } catch {
          api = '';
        }
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          `img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org ${api}`,
          `media-src 'self' blob: https://res.cloudinary.com ${api}`,
          `connect-src 'self' ${api}`,
          'frame-src https://www.google.com https://maps.google.com',
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ]
          .map((d) => d.trim())
          .join('; ');
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_URL ?? '')],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:4000', changeOrigin: true },
        '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
