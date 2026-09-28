/** لغة الواجهة المحفوظة في المتصفح. ثابتة للجلسة؛ التبديل يعيد تحميل الصفحة */
export type Lang = 'ar' | 'en';
export const LANG_KEY = 'vj-lang';

export function initialLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export const LANG: Lang = initialLang();
export const isEn = () => LANG === 'en';

/** ترجمة نص عربي من الكود حيث لا يصل مترجم الصفحة (مثل القيم الافتراضية لحقول الإدخال) */
let translator: (s: string) => string | null = () => null;
export const setTranslator = (fn: typeof translator) => (translator = fn);
export const tr = (s: string) => (isEn() ? translator(s) ?? s : s);
