import { BlockList, isIP } from 'net';
import type { Request } from 'express';

/**
 * عنوان IP الحقيقي للزائر، لحدود المحاولات.
 *
 * على Render تمر الطلبات عبر أكثر من وسيط (Cloudflare أمام الواجهة، إعادة التوجيه /api،
 * موازن الأحمال الداخلي)، وعددها يختلف بين الطلب عبر الواجهة والطلب المباشر للـ API.
 * لذلك لا نعتمد عددًا ثابتًا من الوسطاء: نمشي في X-Forwarded-For من اليمين (ما أضافه الوسطاء)
 * ونتخطى عناوين الوسطاء المعروفة (الشبكات الداخلية وCloudflare وRender)، فأول عنوان غيرها هو الزائر.
 * أي عنوان مزيّف يضيفه الزائر بنفسه يكون على اليسار فلا يُصل إليه.
 */
const proxies = new BlockList();
// شبكات داخلية وخاصة (موازنات الأحمال داخل منصة الاستضافة)
for (const [net, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
] as const)
  proxies.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const)
  proxies.addSubnet(net, prefix, 'ipv6');
// نطاقات Cloudflare المنشورة (https://www.cloudflare.com/ips/)
for (const cidr of [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]) {
  const [net, prefix] = cidr.split('/');
  proxies.addSubnet(net, Number(prefix), 'ipv4');
}
for (const cidr of ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']) {
  const [net, prefix] = cidr.split('/');
  proxies.addSubnet(net, Number(prefix), 'ipv6');
}

// Render: خادم إعادة توجيه /api من الواجهة للـ API يظهر بعنوان عام من نطاقات Render
// (رُصد على الإنتاج: 74.220.48.x بين Cloudflare وموازن الأحمال). يمكن إضافة نطاقات أخرى عبر TRUSTED_PROXY_CIDRS.
for (const cidr of ['74.220.48.0/24', '74.220.56.0/24', ...(process.env.TRUSTED_PROXY_CIDRS ?? '').split(',')]) {
  const [net, prefix] = cidr.trim().split('/');
  const v = isIP(net ?? '');
  if (v && prefix) proxies.addSubnet(net, Number(prefix), v === 4 ? 'ipv4' : 'ipv6');
}

function clean(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith('::ffff:')) s = s.slice(7); // IPv4 داخل IPv6
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.replace(/:\d+$/, ''); // منفذ ملحق
  if (s.startsWith('[') && s.includes(']')) s = s.slice(1, s.indexOf(']'));
  return isIP(s) ? s : null;
}

export function isProxyAddress(ip: string): boolean {
  const v = isIP(ip);
  return v === 4 ? proxies.check(ip, 'ipv4') : v === 6 ? proxies.check(ip, 'ipv6') : false;
}

/** سلسلة العناوين من الأقدم (يسار) إلى الأقرب (يمين)، ثم عنوان الاتصال نفسه */
export function forwardChain(req: Request): string[] {
  const header = req.headers['x-forwarded-for'];
  const list = (Array.isArray(header) ? header.join(',') : header ?? '').split(',');
  return [...list, req.socket.remoteAddress ?? ''].map(clean).filter((x): x is string => Boolean(x));
}

export function clientIp(req: Request): string {
  const chain = forwardChain(req);
  for (let i = chain.length - 1; i >= 0; i--) if (!isProxyAddress(chain[i])) return chain[i];
  // كل السلسلة وسطاء (تطوير محلي): أبعد عنوان
  return chain[0] ?? req.ip ?? 'unknown';
}
