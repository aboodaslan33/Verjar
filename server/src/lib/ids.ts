import { randomInt } from 'crypto';

// بدون أحرف ملتبسة (0/O، 1/I/L)
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** رمز مرجعي عشوائي مثل VJ-7K3M9Q */
export function makeRef(prefix: 'B' | 'O' | 'C'): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s}`;
}

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'item';
}

export function randomSuffix(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)].toLowerCase();
  return s;
}
