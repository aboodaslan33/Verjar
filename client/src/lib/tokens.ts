/** قراءة لون من متغيرات الهوية (src/styles/index.css) لاستخدامه خارج CSS، مثل رسومات الخرائط */
export function tokenColor(name: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgb(${v})` : undefined;
}
