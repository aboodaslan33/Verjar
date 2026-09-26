/**
 * فتح واتساب برسالة الطلب جاهزة بعد الإرسال.
 * المتصفحات تحجب النوافذ التي تُفتح بعد انتظار الخادم، لذلك تُفتح نافذة فارغة
 * لحظة الضغط على زر الإرسال ثم تُوجَّه لرابط واتساب عند نجاح الطلب (وتُغلق إن فشل).
 */
export function prepareWhatsAppWindow() {
  let win: Window | null = null;
  try {
    win = window.open('', '_blank');
    if (win) win.opener = null;
  } catch {
    win = null;
  }
  return {
    open(link: string) {
      if (!/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(link)) {
        win?.close();
        return;
      }
      if (win && !win.closed) win.location.href = link;
      // النافذة محجوبة: نفتح واتساب في نفس الصفحة
      else window.location.href = link;
    },
    cancel() {
      if (win && !win.closed) win.close();
    },
  };
}
