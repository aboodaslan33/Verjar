/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** رابط الـ API. اتركه فارغًا عند استخدام rewrite /api على نفس الدومين */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
