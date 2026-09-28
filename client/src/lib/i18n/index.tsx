import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { MESSAGES, type MessageKey } from './messages';

/**
 * لغتا الواجهة: العربية (الافتراضية، RTL) والإنجليزية (LTR).
 * النصوص في ملف واحد (messages.ts) بمفتاح لكل نص، واللغة تُحفظ في المتصفح
 * وتُطبَّق على <html lang dir> قبل الرسم (سكربت index.html) وعند التبديل.
 */
import { LANG, LANG_KEY as KEY, initialLang, isEn, type Lang } from './lang';

export { LANG, initialLang, isEn, type Lang };

function apply(lang: Lang) {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void; t: (key: MessageKey, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx | null>(null);

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>) {
  const entry = MESSAGES[key];
  let s: string = entry ? entry[lang === 'ar' ? 0 : 1] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang] = useState<Lang>(LANG);
  useEffect(() => apply(lang), [lang]);
  // التبديل يعيد تحميل الصفحة ليتحوّل كل شيء دفعة واحدة (النصوص، التواريخ، العملة، الاتجاه)
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // التخزين غير متاح
    }
    if (l !== LANG) window.location.reload();
  }, []);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return (
    <I18nContext.Provider value={{ lang, setLang, toggle: () => setLang(lang === 'ar' ? 'en' : 'ar'), t }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}

/** زر تبديل اللغة (يعرض اسم اللغة الأخرى) */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, toggle } = useI18n();
  return (
    <button
      type="button"
      translate="no"
      onClick={toggle}
      lang={lang === 'ar' ? 'en' : 'ar'}
      className={className ?? 'grid h-10 min-w-10 place-items-center rounded-lg px-2 text-sm font-semibold text-muted transition-colors hover:bg-subtle hover:text-ink'}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  );
}

export type { MessageKey };
