// Códigos promocionais. Os códigos ficam só como hash (SHA-256 de "imita-ai:" + CÓDIGO),
// para não aparecerem em texto no código. Por enquanto cada código vale 1 vez por aparelho;
// com as contas, passa a valer 1 vez por conta.
// Para criar um código novo: node -e "console.log(require('crypto').createHash('sha256').update('imita-ai:SEUCODIGO').digest('hex'))"
import { addCoins, type Wallet } from './character';

interface Promo { hash: string; coins: number; label: string; until?: string }

const PROMOS: Promo[] = [
  { hash: 'a9433c1870748ab338b49d9ac3ac2ed87975e5fb5f17390b3798f75f6798c59a', coins: 150, label: 'Boas-vindas' },
  { hash: '87eab4673ec87acb02686702654dcec67dd28e5847860954e20697eb01415c56', coins: 100, label: 'Imita Aí!' },
];

const USED_KEY = 'imita.promo.v1';

const normalize = (code: string) => code.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function used(): string[] {
  try { return JSON.parse(localStorage.getItem(USED_KEY) || '[]'); } catch { return []; }
}

export type RedeemResult = { ok: true; coins: number; label: string; wallet: Wallet } | { ok: false; error: string };

export async function redeem(code: string, pid: string): Promise<RedeemResult> {
  const c = normalize(code);
  if (c.length < 4) return { ok: false, error: 'Digite o código completo.' };
  if (!crypto?.subtle) return { ok: false, error: 'Este aparelho não consegue verificar códigos.' };
  const h = await sha256(`imita-ai:${c}`);
  const promo = PROMOS.find((p) => p.hash === h);
  if (!promo) return { ok: false, error: 'Código inválido.' };
  if (promo.until && new Date() > new Date(promo.until)) return { ok: false, error: 'Esse código já expirou.' };
  const list = used();
  if (list.includes(h)) return { ok: false, error: 'Esse código já foi usado neste aparelho.' };
  try { localStorage.setItem(USED_KEY, JSON.stringify([...list, h])); } catch { /* ok */ }
  const wallet = addCoins(pid, promo.coins);
  return { ok: true, coins: promo.coins, label: promo.label, wallet };
}
