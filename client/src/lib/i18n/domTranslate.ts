import { EN_PATTERNS, EN_TEXT } from './en';
import { setTranslator } from './lang';

/**
 * الواجهة الإنجليزية لكل الصفحات: بدل تغيير كل ملف، نترجم النصوص العربية المعروضة
 * (نص العناصر، placeholder، title، aria-label، alt، وعنوان الصفحة) من قاموس en.ts
 * لحظة ظهورها. React يحدّث نفس عقد النص، فنعيد ترجمتها عند كل تغيير.
 * النصوص التي يكتبها المستخدم (حقول الإدخال) والمحتوى غير الموجود في القاموس تبقى كما هي.
 */
const AR = /[؀-ۿ]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// الأكثر تحديدًا أولًا (نص ثابت أطول)، حتى لا يلتقط نمط عام مثل "كل {0}" نصًا له نمط أدق
const PATTERNS = EN_PATTERNS.map(([ar, en]) => {
  const parts = ar.split(/\{(\d)\}/);
  let re = '^';
  const order: number[] = [];
  parts.forEach((p, i) => {
    if (i % 2) {
      re += '(.+?)';
      order.push(Number(p));
    } else re += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { re: new RegExp(re + '$'), order, en, weight: ar.replace(/\{\d\}/g, '').length };
}).sort((a, b) => b.weight - a.weight);

const cache = new Map<string, string | null>();
const SEP = /(\s[·—|]\s|،\s?)/;

function lookup(s: string): string | null {
  const direct = EN_TEXT[s];
  if (direct != null) return direct;
  for (const p of PATTERNS) {
    const m = p.re.exec(s);
    if (!m) continue;
    const vals: Record<number, string> = {};
    let loose = false;
    p.order.forEach((n, i) => {
      const v = m[i + 1].trim();
      const t = AR.test(v) ? translateText(v) : v;
      // جملة طويلة غير مترجمة داخل نمط قصير ("كل {0}") تعني أن النمط لا يخص هذا النص؛
      // أما الاسم القصير (منتج، عميل) فهو بيانات تبقى كما هي داخل الجملة المترجمة
      if (t == null && p.weight < 6 && v.split(' ').length > 4) loose = true;
      vals[n] = t ?? v;
    });
    if (loose) continue;
    return p.en.replace(/\{(\d)\}/g, (_, n) => vals[Number(n)] ?? '');
  }
  return null;
}

export function translateText(raw: string): string | null {
  const s = norm(raw);
  if (!s || !AR.test(s)) return null;
  if (cache.has(s)) return cache.get(s)!;
  cache.set(s, null); // يمنع التكرار اللانهائي
  let out = lookup(s);
  // علامة في البداية أو النهاية ("— نص"، "نص:"، "نص (3)")
  if (out == null) {
    const m = /^([—·\-–•(]\s*)?(.*?)(\s*[:：]|\s*\(\d+\)|\s*[)])?$/.exec(s);
    if (m && (m[1] || m[3]) && m[2] && m[2] !== s) {
      const core = translateText(m[2]);
      if (core != null) out = (m[1] ?? '') + core + (m[3] ?? '');
    }
  }
  // نص مركّب بفواصل ("حجز · عمّان"، "السبت، الأحد"): نترجم كل جزء على حدة
  if (out == null && SEP.test(s)) {
    const joined = s
      .split(SEP)
      .map((x) => (SEP.test(x) ? (x.startsWith('،') ? ', ' : x) : translateText(x) ?? x))
      .join('');
    if (joined !== s) out = joined;
  }
  cache.set(s, out);
  return out;
}

function skipped(el: Element | null, attrsOnly = false): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (attrsOnly && e === el && e.tagName === 'TEXTAREA') continue;
    if (SKIP.has(e.tagName) || e.getAttribute('translate') === 'no' || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const v = node.nodeValue;
  if (!v || !AR.test(v) || skipped(node.parentElement)) return;
  // ترجمة صريحة لكلمة يختلف معناها حسب السياق: <span data-en="at">الساعة</span>
  const forced = node.parentElement?.getAttribute('data-en');
  if (forced != null) {
    node.nodeValue = forced;
    return;
  }
  const t = translateText(v);
  if (t == null) return;
  const lead = v.match(/^\s*/)![0];
  const trail = v.match(/\s*$/)![0];
  const next = (lead ? ' ' : '') + t + (trail ? ' ' : '');
  if (next !== v) node.nodeValue = next;
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && AR.test(v)) {
      const t = translateText(v);
      if (t != null && !skipped(el, true)) el.setAttribute(a, t);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  doAttrs(el);
  if (SKIP.has(el.tagName)) return;
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

export function startDomTranslation() {
  setTranslator(translateText);
  walk(document.documentElement);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
