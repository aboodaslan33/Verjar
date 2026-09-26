/**
 * توحيد أرقام الهواتف للصيغة الدولية بدون + (مثال: 962780192930)
 * يقبل: 0780192930، 780192930، +962780192930، 00962780192930، وأرقام دولية أخرى تبدأ بـ + أو 00
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  let s = raw.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d))).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('07') && s.length === 10) s = '962' + s.slice(1);
  else if (/^7[789]\d{7}$/.test(s)) s = '962' + s;
  if (!/^\d{8,15}$/.test(s)) return null;
  if (s.startsWith('962') && !/^9627[789]\d{7}$/.test(s) && !/^9626\d{7}$/.test(s)) return null;
  return s;
}

/** عرض الرقم بصيغة محلية للأرقام الأردنية */
export function displayPhone(p: string): string {
  if (/^9627\d{8}$/.test(p)) return '0' + p.slice(3);
  return '+' + p;
}
