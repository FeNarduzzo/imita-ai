// Códigos promocionais. Ficam no servidor (Supabase): o admin cria pelo menu de admin,
// e cada código vale uma vez por conta. O servidor também limita 10 tentativas erradas por hora.
import { rpc } from '../net/supabase';
import { getWallet, isAccount, setAccountWallet, type Wallet } from './character';
import { XP_CATEGORIES, type XpCategory } from './levels';

export type RedeemResult = { ok: true; text: string; wallet: Wallet } | { ok: false; error: string };

interface ServerRedeem {
  error?: string;
  coins?: number;
  xp?: Partial<Record<XpCategory, number>>;
  item?: string | null;
  balance?: number;
}

const normalize = (code: string) => code.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

export async function redeem(code: string, pid: string): Promise<RedeemResult> {
  const c = normalize(code);
  if (c.length < 4) return { ok: false, error: 'Digite o código completo.' };
  if (!isAccount(pid)) return { ok: false, error: 'Códigos valem só para a conta logada neste aparelho.' };
  let r: ServerRedeem;
  try {
    r = await rpc<ServerRedeem>('redeem_code', { p_code: c });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (r.error) return { ok: false, error: r.error };
  const before = getWallet(pid);
  const wallet = { coins: r.balance ?? before.coins, owned: r.item && !before.owned.includes(r.item) ? [...before.owned, r.item] : before.owned };
  setAccountWallet(wallet);
  const parts: string[] = [];
  if (r.coins) parts.push(`+🪙 ${r.coins}`);
  for (const [cat, amount] of Object.entries(r.xp || {})) {
    const c2 = XP_CATEGORIES.find((x) => x.id === cat);
    if (amount) parts.push(`+${amount} XP ${c2 ? `${c2.emoji} ${c2.label}` : cat}`);
  }
  if (r.item) parts.push('+ item exclusivo no vestiário');
  return { ok: true, text: `🎉 Código resgatado: ${parts.join(', ') || 'prêmio liberado'}!`, wallet };
}
