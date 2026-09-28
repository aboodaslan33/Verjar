// يُنفَّذ قبل رسم الصفحة (ملف منفصل حتى تمنع سياسة CSP أي سكربت مضمَّن)
// الوضع الليلي لتجنب الوميض، واللغة: العربية افتراضيًا (RTL) والإنجليزية (LTR) إن اختارها الزائر
// حماية من التضمين في إطار موقع آخر (clickjacking) حتى لو لم تُضبط ترويسة X-Frame-Options على الاستضافة
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try {
    window.top.location = window.self.location.href;
  } catch (e) {}
}
try {
  var t = localStorage.getItem('vj-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
  if (localStorage.getItem('vj-lang') === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
} catch (e) {}
