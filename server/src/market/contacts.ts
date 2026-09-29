/**
 * حماية المنصة: قبل قبول العرض لا تُكشف بيانات التواصل بين العميل والمورد.
 * تُخفى أرقام الهواتف والبريد والروابط من الرسائل (مع الأرقام العربية والمسافات بين الخانات).
 */
const DIGIT = '[0-9٠-٩۰-۹]';
const PHONE = new RegExp(`(?:\\+|00)?${DIGIT}(?:[\\s\\-./()]*${DIGIT}){6,}`, 'g');
const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\))\s*[A-Za-z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:wa\.me|t\.me|instagram\.com|facebook\.com|fb\.com)\/\S*/gi;

export function maskContacts(text: string): { text: string; masked: boolean } {
  let masked = false;
  const out = text
    .replace(EMAIL, () => ((masked = true), '[بريد مخفي]'))
    .replace(URL, () => ((masked = true), '[رابط مخفي]'))
    .replace(PHONE, () => ((masked = true), '[رقم مخفي]'));
  return { text: out, masked };
}

/** يخفي رقمًا للعرض الجزئي: 0791234567 → 079•••••67 */
export function partialPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('962') ? `0${d.slice(3)}` : d;
  return local.length > 5 ? `${local.slice(0, 3)}•••••${local.slice(-2)}` : '•••';
}

export function partialEmail(email: string | null | undefined) {
  if (!email) return null;
  const [u, dom] = email.split('@');
  return dom ? `${u.slice(0, 2)}•••@${dom}` : '•••';
}
