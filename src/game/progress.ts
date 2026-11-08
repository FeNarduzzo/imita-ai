// XP de fim de partida para a conta logada. Quem decide quanto vale de verdade é o servidor
// (limite por partida e por dia, bônus da 1ª vitória do dia e moedas ao subir de nível).
// Sem internet, o XP fica numa fila e é enviado depois (a `key` impede contar duas vezes).
import type { XpCategory } from './levels';

export interface XpResult {
  added?: number;
  level?: number;
  levelups?: { level: number; title: string }[];
  bonus_coins?: number;
  first_win?: boolean;
  duplicate?: boolean;
  capped?: boolean;
}
export interface XpBridge {
  /** Jogador do aparelho que é a conta logada. */
  pid: string;
  grant(category: XpCategory, amount: number, won: boolean, key: string): Promise<XpResult>;
}
type Pending = { category: XpCategory; amount: number; won: boolean; key: string };

const PENDING_KEY = 'imita.pending-xp.v1';
let bridge: XpBridge | null = null;
const listeners = new Set<(r: XpResult & { category: XpCategory }) => void>();

const readPending = (): Pending[] => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; } };
const writePending = (p: Pending[]) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p.slice(-200))); } catch { /* ok */ } };
const isOffline = (e: unknown) => /internet|conexão|fetch|network/i.test(String((e as Error)?.message ?? e));

/** Avisa quando o servidor confirma XP (para mostrar "subiu de nível!"). */
export function onXp(f: (r: XpResult & { category: XpCategory }) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

async function send(p: Pending): Promise<boolean> {
  if (!bridge) return false;
  try {
    const r = await bridge.grant(p.category, p.amount, p.won, p.key);
    if (!r.duplicate) listeners.forEach((f) => f({ ...r, category: p.category }));
    return true;
  } catch (e) {
    return !isOffline(e); // erro do servidor (ex.: conta suspensa): não adianta tentar de novo
  }
}

export function bindXp(b: XpBridge | null) {
  bridge = b;
  if (!b) return;
  const list = readPending();
  if (!list.length) return;
  writePending([]);
  (async () => {
    const left: Pending[] = [];
    for (const p of list) if (!(await send(p))) left.push(p);
    if (left.length) writePending([...left, ...readPending()]);
  })();
}

/** Registra XP de uma partida. Só conta para a conta logada (`pid` = jogador dela no aparelho). */
export function reportXp(pid: string | undefined | null, category: XpCategory, amount: number, won: boolean, key: string) {
  if (!bridge || !pid || bridge.pid !== pid || amount <= 0) return;
  const p: Pending = { category, amount: Math.round(amount), won, key };
  send(p).then((ok) => { if (!ok) writePending([...readPending(), p]); });
}

/** Chave curta e única para identificar um evento. */
export const eventKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
