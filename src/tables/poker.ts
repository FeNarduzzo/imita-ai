// Poker Texas Hold'em sem limite, de 2 a 6 jogadores.
// Cada um recebe 2 cartas; na mesa saem flop (3), turn (1) e river (1), com uma rodada de apostas
// antes de cada. Vale a melhor combinação de 5 entre as 7 cartas.
// Fichas: a entrada em moedas vira fichas (1 para 1) e, no fim, as fichas voltam a ser moedas.
// No modo treino, todo mundo recebe 1000 fichas de mentira e nenhuma moeda muda.
// Os blinds podem subir a cada 8 mãos; a partida acaba quando alguém fica com todas as fichas.
import { RANKS, SUITS, makeDeck, type Card, type Rank } from '../cards/cards';
import { coin, type BaseState, type Config, type GameModule, type SeatInfo } from './types';

export const PRACTICE_CHIPS = 1000;
export const RISE_EVERY = 8;
/** Ajuste dos bots (a simulação de testes usa menos iterações). */
export const PK_BOT = { iters: 140 };

// ---------------------------------------------------------------- avaliação de mãos

const RV: Record<Rank, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
export const rankValue = (c: Card) => RV[c.r];

/** Carta mais alta da maior sequência (Ás também vale 1), ou 0. `desc` em ordem decrescente. */
function straightHigh(desc: number[]): number {
  const u = [...new Set(desc)];
  if (u[0] === 14) u.push(1);
  let run = 1;
  for (let i = 1; i < u.length; i++) {
    if (u[i] === u[i - 1] - 1) { run++; if (run >= 5) return u[i] + 4; } else run = 1;
  }
  return 0;
}

/** Pontuação da melhor mão de 5 entre até 7 cartas: [categoria, desempates…]. Maior é melhor. */
export function score7(cards: Card[]): number[] {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const bySuit = new Map<string, number[]>();
  for (const c of cards) { const a = bySuit.get(c.s) || []; a.push(rankValue(c)); bySuit.set(c.s, a); }
  let flush: number[] | null = null;
  for (const a of bySuit.values()) if (a.length >= 5) flush = a.sort((x, y) => y - x);
  if (flush) { const sf = straightHigh(flush); if (sf) return [8, sf]; }
  const cnt = new Map<number, number>();
  for (const v of vals) cnt.set(v, (cnt.get(v) || 0) + 1);
  const g = [...cnt.entries()].map(([v, c]) => ({ v, c })).sort((a, b) => b.c - a.c || b.v - a.v);
  const rest = (...ex: number[]) => vals.filter((v) => !ex.includes(v));
  if (g[0].c === 4) return [7, g[0].v, rest(g[0].v)[0] ?? 0];
  if (g[0].c === 3 && g[1] && g[1].c >= 2) return [6, g[0].v, g[1].v];
  if (flush) return [5, ...flush.slice(0, 5)];
  const st = straightHigh(vals);
  if (st) return [4, st];
  if (g[0].c === 3) return [3, g[0].v, ...rest(g[0].v).slice(0, 2)];
  if (g[0].c === 2 && g[1] && g[1].c === 2) return [2, g[0].v, g[1].v, rest(g[0].v, g[1].v)[0] ?? 0];
  if (g[0].c === 2) return [1, g[0].v, ...rest(g[0].v).slice(0, 3)];
  return [0, ...vals.slice(0, 5)];
}

export function cmpScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; }
  return 0;
}

const ONE: Record<number, string> = { 14: 'Ás', 13: 'Rei', 12: 'Dama', 11: 'Valete' };
const MANY: Record<number, string> = { 14: 'Ases', 13: 'Reis', 12: 'Damas', 11: 'Valetes' };
const one = (v: number) => ONE[v] || String(v);
const many = (v: number) => MANY[v] || String(v);

export function handName(sc: number[]): string {
  switch (sc[0]) {
    case 8: return sc[1] === 14 ? 'Royal flush' : `Straight flush até ${one(sc[1])}`;
    case 7: return `Quadra de ${many(sc[1])}`;
    case 6: return `Full house (${many(sc[1])} e ${many(sc[2])})`;
    case 5: return `Flush, ${one(sc[1])} alto`;
    case 4: return `Sequência até ${one(sc[1])}`;
    case 3: return `Trinca de ${many(sc[1])}`;
    case 2: return `Dois pares (${many(sc[1])} e ${many(sc[2])})`;
    case 1: return `Par de ${many(sc[1])}`;
    default: return `Carta alta: ${one(sc[1])}`;
  }
}

/** As 5 cartas que formam a melhor mão (para destacar no fim). */
export function best5(cards: Card[]): Card[] {
  if (cards.length <= 5) return cards;
  const target = score7(cards);
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    if (n === 7 && cmpScore(score7(five), target) === 0) return five;
    if (n === 6) {
      for (let c = 0; c < n; c++) { const f = cards.filter((_, i) => i !== c); if (cmpScore(score7(f), target) === 0) return f; }
    }
  }
  return cards.slice(0, 5);
}

const FULL_DECK: Card[] = SUITS.flatMap((s) => RANKS.map((r) => ({ r, s, id: `0${r}${s}` })));

/** Chance de ganhar (Monte Carlo) contra `opps` mãos desconhecidas — o bot só usa o que ele vê. */
export function equity(hole: Card[], board: Card[], opps: number, iters = PK_BOT.iters): number {
  if (opps <= 0) return 1;
  const known = new Set([...hole, ...board].map((c) => c.id));
  const pool = FULL_DECK.filter((c) => !known.has(c.id));
  const need = opps * 2 + (5 - board.length);
  let score = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) { const j = i + Math.floor(Math.random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const b = [...board, ...pool.slice(opps * 2, need)];
    const mine = score7([...hole, ...b]);
    let lost = false;
    let ties = 0;
    for (let o = 0; o < opps && !lost; o++) {
      const d = cmpScore(mine, score7([pool[o * 2], pool[o * 2 + 1], ...b]));
      if (d < 0) lost = true; else if (d === 0) ties++;
    }
    if (!lost) score += ties ? 1 / (ties + 1) : 1;
  }
  return score / iters;
}

// ---------------------------------------------------------------- estado

export interface PkPlayer {
  stack: number;
  /** Apostado nesta rodada de apostas. */
  bet: number;
  /** Apostado nesta mão (todas as rodadas). */
  total: number;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  /** Sem fichas: fica de fora (assiste). */
  out: boolean;
  acted: boolean;
  /** Moedas que entraram como fichas. */
  paid: number;
  last: string | null;
  /** Só na visão: quantas cartas tem na mão. */
  count?: number;
}
export interface PkResult { id: string; won: number; name: string | null; best: string[] }

export interface PkState extends BaseState {
  config: { buyIn: number; pace: number; rise: boolean };
  practice: boolean;
  p: Record<string, PkPlayer>;
  deck: Card[];
  board: Card[];
  button: string;
  sb: number;
  bb: number;
  sbSeat: string | null;
  bbSeat: string | null;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  phase: 'bet' | 'deal' | 'showdown' | 'over';
  turn: string | null;
  currentBet: number;
  minRaise: number;
  handNo: number;
  pots: { amount: number; eligible: string[] }[];
  results: PkResult[] | null;
  showCards: boolean;
  winner: string | null;
  cashout: Record<string, number> | null;
}

export type PkAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number } | { type: 'allin' };

// ---------------------------------------------------------------- regras

const order = (s: PkState) => s.seats.map((x) => x.id).filter((id) => s.p[id]);
const inHand = (s: PkState, id: string) => !!s.p[id] && !s.p[id].folded && !s.p[id].out;
const canAct = (s: PkState, id: string) => inHand(s, id) && !s.p[id].allIn;
const nm = (s: PkState, id: string) => s.seats.find((x) => x.id === id)?.name || '?';
const err = (error: string) => ({ error });
export const potTotal = (s: Pick<PkState, 'p'>) => Object.values(s.p).reduce((a, x) => a + x.total, 0);

function nextWhere(s: PkState, from: string, ok: (id: string) => boolean): string | null {
  const o = order(s);
  const i = o.indexOf(from);
  for (let k = 1; k <= o.length; k++) { const id = o[(i + k + o.length) % o.length]; if (ok(id)) return id; }
  return null;
}

function blindAt(s: PkState, level: number): number {
  const start = s.practice ? PRACTICE_CHIPS : s.config.buyIn;
  const base = Math.max(2, 2 * Math.round((start * s.config.pace) / 200));
  return Math.max(2, 2 * Math.round((base * Math.pow(1.5, level)) / 2));
}

function setP(s: PkState, id: string, patch: Partial<PkPlayer>): PkState {
  return { ...s, p: { ...s.p, [id]: { ...s.p[id], ...patch } } };
}

/** Põe fichas na mesa (blind, pagar ou aumentar). */
function put(s: PkState, id: string, amount: number): PkState {
  const pl = s.p[id];
  const a = Math.max(0, Math.min(amount, pl.stack));
  return setP(s, id, { stack: pl.stack - a, bet: pl.bet + a, total: pl.total + a, allIn: pl.stack - a === 0 });
}

function finish(s: PkState, winner: string | null): PkState {
  let f: PkState = { ...s, phase: 'over', over: true, winner, turn: null, cashout: {}, banner: winner ? `🏆 ${nm(s, winner)} ficou com todas as fichas!` : 'Fim da partida.' };
  const cash: Record<string, number> = {};
  for (const id of order(s)) {
    const amt = s.p[id].stack + s.p[id].total;
    cash[id] = s.practice ? 0 : amt;
    if (!s.practice && amt) f = coin(f, id, amt, 'fichas do Poker') as PkState;
  }
  return { ...f, cashout: cash };
}

function startHand(s0: PkState): PkState {
  let s: PkState = { ...s0, p: { ...s0.p } };
  for (const id of order(s)) {
    const pl = s.p[id];
    s.p[id] = { ...pl, bet: 0, total: 0, cards: [], folded: pl.stack <= 0, allIn: false, out: pl.stack <= 0, acted: false, last: pl.stack <= 0 ? 'fora' : null };
  }
  const live = order(s).filter((id) => !s.p[id].out);
  if (live.length < 2) return finish(s, live[0] ?? null);
  const handNo = s.handNo + 1;
  const level = s.config.rise ? Math.floor((handNo - 1) / RISE_EVERY) : 0;
  const bb = blindAt(s, level);
  const sb = bb / 2;
  const isLive = (id: string) => live.includes(id);
  const button = nextWhere(s, s.button, isLive)!;
  const sbSeat = live.length === 2 ? button : nextWhere(s, button, isLive)!;
  const bbSeat = nextWhere(s, sbSeat, isLive)!;
  const deck = makeDeck(1);
  let k = 0;
  let id = nextWhere(s, button, isLive)!;
  for (let i = 0; i < live.length; i++) { s.p[id] = { ...s.p[id], cards: deck.slice(k, k + 2) }; k += 2; id = nextWhere(s, id, isLive)!; }
  const raised = handNo > 1 && bb !== s0.bb;
  s = {
    ...s, handNo, sb, bb, button, sbSeat, bbSeat, board: [], deck: deck.slice(k), street: 'preflop', phase: 'bet', turn: null,
    currentBet: bb, minRaise: bb, pots: [], results: null, showCards: false,
    banner: raised ? `Blinds subiram: ${sb}/${bb}` : `Mão ${handNo} · blinds ${sb}/${bb}`,
  };
  s = put(s, sbSeat, sb); // as etiquetas SB/BB e as fichas na mesa já mostram os blinds
  s = put(s, bbSeat, bb);
  return openRound(s, bbSeat);
}

/** Decide quem joga agora (ou se a rodada de apostas acabou). */
function openRound(s: PkState, after: string): PkState {
  const actors = order(s).filter((x) => canAct(s, x));
  const pending = actors.filter((x) => !s.p[x].acted || s.p[x].bet < s.currentBet);
  if (!pending.length || (actors.length === 1 && s.p[actors[0]].bet >= s.currentBet)) return { ...s, phase: 'deal', turn: null };
  return { ...s, phase: 'bet', turn: nextWhere(s, after, (x) => pending.includes(x)) };
}

/** Depois de pagar o pote, zera as apostas da mão (as fichas já estão nas pilhas). */
const settle = (s: PkState): PkState => ({ ...s, p: Object.fromEntries(Object.entries(s.p).map(([id, pl]) => [id, { ...pl, bet: 0, total: 0 }])) });

function winByFold(s: PkState, winner: string): PkState {
  const pot = potTotal(s);
  const n = settle(setP(s, winner, { stack: s.p[winner].stack + pot }));
  return {
    ...n, phase: 'showdown', turn: null, showCards: false, pots: [{ amount: pot, eligible: [winner] }],
    results: [{ id: winner, won: pot, name: null, best: [] }], banner: `${nm(s, winner)} levou ${pot} — os outros desistiram`,
  };
}

function afterAction(s: PkState, id: string): PkState {
  const alive = order(s).filter((x) => inHand(s, x));
  if (alive.length === 1) return winByFold(s, alive[0]);
  return openRound(s, id);
}

export function buildPots(s: PkState): { amount: number; eligible: string[] }[] {
  const all = order(s).map((id) => ({ id, t: s.p[id].total, live: inHand(s, id) }));
  const levels = [...new Set(all.filter((x) => x.live && x.t > 0).map((x) => x.t))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const L of levels) {
    const amount = all.reduce((a, x) => a + Math.max(0, Math.min(x.t, L) - prev), 0);
    const eligible = all.filter((x) => x.live && x.t >= L).map((x) => x.id);
    const last = pots[pots.length - 1];
    if (amount > 0) {
      if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = L;
  }
  const leftover = all.reduce((a, x) => a + Math.max(0, x.t - prev), 0);
  if (leftover && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

function showdown(s: PkState): PkState {
  const alive = order(s).filter((x) => inHand(s, x));
  const pots = buildPots(s);
  const sc: Record<string, number[]> = {};
  for (const id of alive) sc[id] = score7([...s.p[id].cards, ...s.board]);
  const won: Record<string, number> = {};
  for (const pot of pots) {
    let winners: string[] = [];
    for (const id of pot.eligible) {
      if (!winners.length) { winners = [id]; continue; }
      const d = cmpScore(sc[id], sc[winners[0]]);
      if (d > 0) winners = [id]; else if (d === 0) winners.push(id);
    }
    // ficha que sobra na divisão vai para o primeiro depois do botão
    const o = order(s);
    const bi = o.indexOf(s.button);
    winners.sort((a, b) => ((o.indexOf(a) - bi - 1 + o.length) % o.length) - ((o.indexOf(b) - bi - 1 + o.length) % o.length));
    const share = Math.floor(pot.amount / winners.length);
    winners.forEach((w, i) => { won[w] = (won[w] || 0) + share + (i === 0 ? pot.amount - share * winners.length : 0); });
  }
  let n: PkState = s;
  for (const [id, amt] of Object.entries(won)) n = setP(n, id, { stack: n.p[id].stack + amt });
  const results: PkResult[] = alive.map((id) => ({
    id, won: won[id] || 0, name: handName(sc[id]), best: won[id] ? best5([...s.p[id].cards, ...s.board]).map((c) => c.id) : [],
  })).sort((a, b) => b.won - a.won);
  const top = results.filter((r) => r.won > 0);
  const banner = top.length === 1
    ? `${nm(s, top[0].id)} ganhou ${top[0].won} com ${top[0].name}`
    : `${top.map((r) => nm(s, r.id)).join(' e ')} dividiram o pote`;
  return { ...settle(n), phase: 'showdown', turn: null, showCards: true, pots, results, banner };
}

const STREET_NAME = { flop: 'Flop', turn: 'Turn', river: 'River' } as const;

function nextStreet(s0: PkState): PkState {
  const p = Object.fromEntries(Object.entries(s0.p).map(([id, pl]) => [id, { ...pl, bet: 0, acted: false, last: canAct(s0, id) ? null : pl.last }]));
  const s: PkState = { ...s0, p, currentBet: 0, minRaise: s0.bb };
  if (s.street === 'river') return showdown(s);
  const take = s.street === 'preflop' ? 3 : 1;
  const street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
  const ns: PkState = { ...s, board: [...s.board, ...s.deck.slice(0, take)], deck: s.deck.slice(take), street, banner: STREET_NAME[street] };
  const actors = order(ns).filter((x) => canAct(ns, x));
  if (actors.length >= 2) return { ...ns, phase: 'bet', turn: nextWhere(ns, ns.button, (x) => actors.includes(x)) };
  return { ...ns, phase: 'deal', turn: null, showCards: true }; // todo mundo all-in: mostra as cartas e corre a mesa
}

function bankIn(s: PkState, seat: SeatInfo): { s: PkState; chips: number } {
  const chips = s.practice ? PRACTICE_CHIPS : Math.min(s.config.buyIn, Math.max(0, seat.bank));
  let n = s;
  if (!s.practice && chips) n = coin(n, seat.id, -chips, 'entrada no Poker') as PkState;
  return { s: n, chips };
}

// ---------------------------------------------------------------- módulo

export const Poker: GameModule<PkState, PkAction> = {
  id: 'poker',
  title: 'Poker',
  emoji: '♠️',
  minSeats: 2,
  maxSeats: 6,
  defaultConfig: { buyIn: 0, pace: 4, rise: true },
  configFields: [
    {
      key: 'buyIn', label: 'Entrada (moedas viram fichas)', type: 'select',
      options: [{ v: 0, t: 'Treino' }, ...[20, 50, 100, 200].map((v) => ({ v, t: `🪙 ${v}` }))],
      hint: 'Cada moeda vira 1 ficha; no fim, as fichas voltam a ser moedas. No treino, todo mundo ganha 1000 fichas de mentira.',
    },
    { key: 'pace', label: 'Blinds', type: 'select', options: [{ v: 2, t: 'Baixos' }, { v: 4, t: 'Normais' }, { v: 10, t: 'Altos' }], hint: 'Big blind de 2%, 4% ou 10% das fichas iniciais.' },
    { key: 'rise', label: `Blinds sobem a cada ${RISE_EVERY} mãos`, type: 'toggle', hint: 'Deixa a partida andar até alguém ficar com tudo.' },
  ],

  init(config: Config, seats: SeatInfo[]) {
    const buyIn = Number(config.buyIn) || 0;
    let s: PkState = {
      seats, coinEvents: [], over: false, banner: null, config: { buyIn, pace: Number(config.pace) || 4, rise: !!config.rise }, practice: buyIn === 0,
      p: {}, deck: [], board: [], button: seats[0].id, sb: 0, bb: 0, sbSeat: null, bbSeat: null, street: 'preflop', phase: 'bet', turn: null,
      currentBet: 0, minRaise: 0, handNo: 0, pots: [], results: null, showCards: false, winner: null, cashout: null,
    };
    const p: Record<string, PkPlayer> = {};
    for (const seat of seats) {
      const r = bankIn(s, seat);
      s = r.s;
      p[seat.id] = { stack: r.chips, bet: 0, total: 0, cards: [], folded: true, allIn: false, out: r.chips <= 0, acted: false, paid: s.practice ? 0 : r.chips, last: r.chips <= 0 ? 'sem moedas' : null };
    }
    s = { ...s, p, button: seats[Math.floor(Math.random() * seats.length)].id };
    return startHand(s);
  },

  act(s, id, a) {
    if (!s.p[id]) return err('Você não está nesta mesa.');
    if (s.phase !== 'bet') return err('Espere um instante…');
    if (s.turn !== id) return err('Não é a sua vez.');
    const pl = s.p[id];
    const toCall = s.currentBet - pl.bet;
    const max = pl.bet + pl.stack;
    let n: PkState;
    let type = a.type;
    let to = a.type === 'raise' ? Math.floor(Number(a.to)) : 0;
    if (type === 'allin') { if (max > s.currentBet) { type = 'raise'; to = max; } else type = 'call'; }
    switch (type) {
      case 'fold':
        n = setP(s, id, { folded: true, acted: true, last: 'desistiu' });
        n = { ...n, banner: `${nm(s, id)} desistiu` };
        break;
      case 'check':
        if (toCall > 0) return err('Tem aposta: pague, aumente ou desista.');
        n = setP(s, id, { acted: true, last: 'passou' });
        n = { ...n, banner: `${nm(s, id)} passou` };
        break;
      case 'call': {
        if (toCall <= 0) return err('Não tem nada para pagar — pode passar.');
        n = put(s, id, toCall);
        const allIn = n.p[id].allIn;
        n = setP(n, id, { acted: true, last: allIn ? 'all-in' : `pagou ${toCall}` });
        n = { ...n, banner: allIn ? `${nm(s, id)} pagou com tudo (all-in)` : `${nm(s, id)} pagou ${toCall}` };
        break;
      }
      case 'raise': {
        if (!Number.isFinite(to)) return err('Valor inválido.');
        if (to > max) return err('Fichas insuficientes.');
        if (to <= s.currentBet) return err('O aumento precisa passar da aposta atual.');
        const full = to - s.currentBet >= s.minRaise;
        if (!full && to !== max) return err(`Aumento mínimo: para ${s.currentBet + s.minRaise}.`);
        const opening = s.currentBet === 0;
        n = put(s, id, to - pl.bet);
        const allIn = n.p[id].allIn;
        // aumento reabre a rodada para os outros (simplificação: até o all-in curto reabre)
        const p = Object.fromEntries(Object.entries(n.p).map(([x, q]) => [x, x === id ? { ...q, acted: true, last: allIn ? 'all-in' : opening ? `apostou ${to}` : `aumentou p/ ${to}` } : { ...q, acted: false }]));
        n = { ...n, p, currentBet: to, minRaise: full ? to - s.currentBet : s.minRaise, banner: allIn ? `${nm(s, id)} foi de ALL-IN (${to})!` : opening ? `${nm(s, id)} apostou ${to}` : `${nm(s, id)} aumentou para ${to}` };
        break;
      }
      default:
        return err('Jogada inválida.');
    }
    return afterAction(n, id);
  },

  auto(s) {
    if (s.phase === 'deal') return { state: nextStreet(s), delay: s.showCards ? 1500 : 900 };
    if (s.phase === 'showdown') return { state: startHand(s), delay: s.showCards ? 4500 : 2600 };
    return null;
  },

  waitingFor: (s) => (s.phase === 'bet' && s.turn ? [s.turn] : []),

  bot(s, id) {
    const pl = s.p[id];
    const toCall = s.currentBet - pl.bet;
    const opps = order(s).filter((x) => x !== id && inHand(s, x)).length;
    const e = equity(pl.cards, s.board, opps);
    const pot = potTotal(s);
    const max = pl.bet + pl.stack;
    const r = Math.random();
    const raiseTo = (frac: number) => Math.min(max, s.currentBet + Math.max(s.minRaise, Math.round(pot * frac)));
    // contra muita gente, a chance "justa" é menor
    const fair = 1 / (opps + 1);
    const strong = e > Math.min(0.85, fair + 0.35);
    const good = e > fair + 0.12;
    if (toCall <= 0) {
      if (strong || (good && r < 0.35) || r < 0.06) { const to = raiseTo(strong ? 0.85 : 0.55); if (to > s.currentBet) return { type: 'raise', to }; }
      return { type: 'check' };
    }
    const odds = toCall / (pot + toCall);
    if (strong && r < 0.55) { const to = raiseTo(0.75); if (to > s.currentBet) return { type: 'raise', to }; }
    if (e >= odds + 0.03 || (toCall <= s.bb && e > fair * 0.8) || r < 0.04) return { type: 'call' };
    return { type: 'fold' };
  },

  view(s, viewer) {
    const p = Object.fromEntries(Object.entries(s.p).map(([id, pl]) => {
      const show = id === viewer || (s.showCards && !pl.folded && !pl.out);
      return [id, { ...pl, cards: show ? pl.cards : [], count: pl.cards.length }];
    }));
    return { ...s, p, deck: [] };
  },

  joinable: true,
  canAdmit: (s) => s.phase === 'showdown',
  addSeat: (s, seat) => {
    const r = bankIn({ ...s, seats: [...s.seats, seat] }, seat);
    return {
      ...r.s,
      p: { ...r.s.p, [seat.id]: { stack: r.chips, bet: 0, total: 0, cards: [], folded: true, allIn: false, out: r.chips <= 0, acted: false, paid: s.practice ? 0 : r.chips, last: r.chips <= 0 ? 'sem moedas' : 'chegou' } },
    };
  },
  removeSeat: (s, id) => {
    let n = s;
    const pl = s.p[id];
    if (pl && !s.practice && pl.stack + pl.total > 0) n = coin(n, id, pl.stack + pl.total, 'fichas do Poker') as PkState;
    const p = { ...n.p };
    delete p[id];
    return { ...n, seats: n.seats.filter((x) => x.id !== id), p };
  },
  refund: (s) => {
    if (s.over) return s;
    if (s.practice) return { ...s, over: true, phase: 'over', banner: 'Mesa encerrada.' };
    const f = finish(s, null);
    return { ...f, banner: 'Mesa encerrada — fichas trocadas por moedas.' };
  },
};
