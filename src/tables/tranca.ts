// Tranca — 1 contra 1 ou 2 contra 2 (parceiros de frente), dois baralhos sem Joker.
// Cada um recebe 11 cartas e cada dupla tem um morto de 11 cartas.
// Na vez: compra do monte (ou pega o lixo inteiro), baixa/encaixa jogos e descarta 1 carta.
// Jogos: 3 ou mais cartas do mesmo valor, no máximo um 2 (curinga). 7 cartas = canastra
// (limpa, sem 2: 200 pontos; suja: 100).
// Pegar o lixo: a carta de cima precisa entrar num jogo — com 2 iguais da mão ou num jogo da dupla.
// 3 vermelho desce sozinho (+100, ou -100 se a dupla não baixou nada). 3 preto no lixo tranca o lixo;
// os 3 pretos só baixam (3 ou 4 juntos) na hora de bater.
// Quem zera a mão pega o morto da dupla; para bater precisa já ter pego o morto e ter uma canastra limpa.
// Partida até 3000 pontos.
import { makeDeck, type Card, type Rank } from '../cards/cards';
import { coin, payWinners, type BaseState, type Config, type GameModule, type SeatInfo } from './types';

export type Team = 0 | 1;
export interface TrMeld { id: string; rank: Rank | 'B3'; cards: Card[] }
export interface TrTeamScore { mesa: number; canastras: number; red3: number; morto: number; batida: number; mao: number; total: number }

export interface TrState extends BaseState {
  config: { stake: number; target: number };
  teams: [string[], string[]];
  score: [number, number];
  hands: Record<string, Card[]>;
  stock: Card[];
  pile: Card[];
  /** null = a dupla já pegou o morto. */
  mortos: [Card[] | null, Card[] | null];
  melds: [TrMeld[], TrMeld[]];
  red3: [number, number];
  dealer: string;
  turn: string;
  phase: 'draw' | 'play' | 'handEnd' | 'over';
  /** Carta que o jogador da vez acabou de comprar (só ele vê). */
  drawn: string | null;
  seq: number;
  handNo: number;
  lastHand: { batida: Team | null; why: string; detail: [TrTeamScore, TrTeamScore] } | null;
  winnerTeam: Team | null;
  pot: number;
  paid: Record<string, number>;
  /** Só na visão. */
  counts?: Record<string, number>;
  stockCount?: number;
  pileCount?: number;
  mortoCounts?: [number | null, number | null];
}

export type TrAction =
  | { type: 'draw' }
  | { type: 'take'; with?: string[]; to?: string }
  | { type: 'meld'; ids: string[] }
  | { type: 'add'; meld: string; ids: string[] }
  | { type: 'discard'; id: string };

// ---------------------------------------------------------------- cartas e jogos

export const isWild = (c: Card) => c.r === '2';
export const isRed3 = (c: Card) => c.r === '3' && (c.s === '♥' || c.s === '♦');
export const isBlack3 = (c: Card) => c.r === '3' && (c.s === '♠' || c.s === '♣');
const HIGH: Rank[] = ['8', '9', '10', 'J', 'Q', 'K'];
export const cardPts = (c: Card) => (c.r === 'A' ? 15 : isWild(c) || HIGH.includes(c.r) ? 10 : 5);
/** Ordem para arrumar a mão: A K Q … 4, depois 3 e 2. */
export const TR_ORDER: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/** Valor do jogo, se for válido: ≥3 cartas, ≥2 naturais do mesmo valor (nem 2 nem 3), no máximo um 2. */
export function meldRank(cards: Card[]): Rank | null {
  if (cards.length < 3) return null;
  const nat = cards.filter((c) => !isWild(c));
  if (cards.length - nat.length > 1 || nat.length < 2) return null;
  const r = nat[0].r;
  if (r === '3' || nat.some((c) => c.r !== r)) return null;
  return r;
}
const isBlack3Meld = (cards: Card[]) => (cards.length === 3 || cards.length === 4) && cards.every(isBlack3);
export const isCanastra = (m: TrMeld) => m.cards.length >= 7;
export const isClean = (m: TrMeld) => !m.cards.some(isWild);
export const hasCleanCanastra = (s: Pick<TrState, 'melds'>, t: Team) => s.melds[t].some((m) => isCanastra(m) && isClean(m));
/** A dupla pode zerar a mão? (pega o morto, ou bate se já pegou e tem canastra limpa) */
const canEmpty = (s: TrState, t: Team) => s.mortos[t] !== null || hasCleanCanastra(s, t);

export const teamOf = (s: Pick<TrState, 'teams'>, id: string): Team => (s.teams[0].includes(id) ? 0 : 1);
const order = (s: TrState) => s.seats.map((x) => x.id);
const nextSeat = (s: TrState, id: string) => { const o = order(s); return o[(o.indexOf(id) + 1) % o.length]; };
const nm = (s: TrState, id: string) => s.seats.find((x) => x.id === id)?.name || '?';
export const teamName = (s: TrState, t: Team) => s.teams[t].map((id) => nm(s, id)).join(' e ');
const err = (error: string) => ({ error });

/** Tira os 3 vermelhos da mão (vão para a mesa da dupla) e repõe do monte. */
function fixRed3(s: TrState, id: string): TrState {
  let hand = s.hands[id];
  if (!hand.some(isRed3)) return s;
  const t = teamOf(s, id);
  const red3: [number, number] = [...s.red3];
  let stock = s.stock;
  while (hand.some(isRed3)) {
    const n = hand.filter(isRed3).length;
    red3[t] += n;
    hand = hand.filter((c) => !isRed3(c));
    const take = Math.min(n, stock.length);
    hand = [...hand, ...stock.slice(0, take)];
    stock = stock.slice(take);
  }
  return { ...s, hands: { ...s.hands, [id]: hand }, stock, red3 };
}

function deal(s: TrState, dealer: string): TrState {
  const deck = makeDeck(2);
  const hands: Record<string, Card[]> = {};
  let k = 0;
  let id = nextSeat(s, dealer);
  for (let i = 0; i < s.seats.length; i++) { hands[id] = deck.slice(k, k + 11); k += 11; id = nextSeat(s, id); }
  const mortos: [Card[], Card[]] = [deck.slice(k, k + 11), deck.slice(k + 11, k + 22)];
  k += 22;
  let n: TrState = {
    ...s, hands, mortos, stock: deck.slice(k), pile: [], melds: [[], []], red3: [0, 0], dealer, turn: nextSeat(s, dealer),
    phase: 'draw', drawn: null, handNo: s.handNo + 1, lastHand: null, banner: `Mão ${s.handNo + 1}: boa sorte!`,
  };
  for (const x of order(n)) n = fixRed3(n, x);
  return n;
}

function scoreTeam(s: TrState, t: Team, batida: Team | null): TrTeamScore {
  const melds = s.melds[t];
  const mesa = melds.reduce((a, m) => a + m.cards.reduce((b, c) => b + cardPts(c), 0), 0);
  const canastras = melds.reduce((a, m) => a + (isCanastra(m) ? (isClean(m) ? 200 : 100) : 0), 0);
  const red3 = s.red3[t] * (melds.length ? 100 : -100);
  const morto = s.mortos[t] !== null ? -100 : 0;
  const bat = batida === t ? 100 : 0;
  const mao = -s.teams[t].reduce((a, id) => a + (s.hands[id] || []).reduce((b, c) => b + cardPts(c), 0), 0);
  return { mesa, canastras, red3, morto, batida: bat, mao, total: mesa + canastras + red3 + morto + bat + mao };
}

function endHand(s: TrState, batida: Team | null, why: string): TrState {
  const detail: [TrTeamScore, TrTeamScore] = [scoreTeam(s, 0, batida), scoreTeam(s, 1, batida)];
  const score: [number, number] = [s.score[0] + detail[0].total, s.score[1] + detail[1].total];
  const f = (x: number) => (x > 0 ? `+${x}` : String(x));
  return {
    ...s, score, phase: 'handEnd', drawn: null, lastHand: { batida, why, detail },
    banner: `${why} ${teamName(s, 0)} ${f(detail[0].total)} · ${teamName(s, 1)} ${f(detail[1].total)}`,
  };
}

function passTurn(s: TrState): TrState {
  return { ...s, turn: nextSeat(s, s.turn), phase: 'draw', drawn: null };
}

/** Depois que a mão diminuiu: pega o morto, bate, ou recusa se não pode zerar. */
function afterChange(s: TrState, id: string, then: 'play' | 'next'): TrState | { error: string } {
  const t = teamOf(s, id);
  const left = s.hands[id].length;
  if (left === 0) {
    const morto = s.mortos[t];
    if (morto) {
      const mortos: [Card[] | null, Card[] | null] = [...s.mortos];
      mortos[t] = null;
      let n: TrState = { ...s, mortos, hands: { ...s.hands, [id]: morto }, banner: `${nm(s, id)} pegou o morto! 🎁` };
      n = fixRed3(n, id);
      return then === 'play' ? { ...n, phase: 'play' } : passTurn(n);
    }
    if (hasCleanCanastra(s, t)) return endHand(s, t, `${nm(s, id)} bateu! 🎉`);
    if (then === 'next' && !s.stock.length) return endHand(s, null, 'O monte acabou.');
    return err('Para bater, a dupla precisa ter pego o morto e ter uma canastra limpa.');
  }
  if (left === 1 && then === 'play' && !canEmpty(s, t)) return err('Guarde pelo menos 2 cartas: ainda não dá para bater (falta o morto ou uma canastra limpa).');
  return then === 'play' ? s : passTurn(s);
}

function pick(hand: Card[], ids: string[]): Card[] | null {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return null;
  const cards = ids.map((x) => hand.find((c) => c.id === x));
  return cards.every(Boolean) ? (cards as Card[]) : null;
}
const without = (hand: Card[], cards: Card[]) => hand.filter((c) => !cards.includes(c));

// ---------------------------------------------------------------- bots

function naturals(hand: Card[]): Map<Rank, Card[]> {
  const m = new Map<Rank, Card[]>();
  for (const c of hand) if (!isWild(c) && c.r !== '3') m.set(c.r, [...(m.get(c.r) || []), c]);
  return m;
}

function botPlay(s: TrState, id: string): TrAction {
  const t = teamOf(s, id);
  const hand = s.hands[id];
  const own = s.melds[t];
  const opp = s.melds[(1 - t) as Team];
  const byRank = naturals(hand);
  const minLeft = canEmpty(s, t) ? 0 : 2;
  const room = hand.length - minLeft;
  // 1) encaixa naturais nos jogos da dupla
  for (const m of own) {
    if (m.rank === 'B3') continue;
    const fit = hand.filter((c) => !isWild(c) && c.r === m.rank);
    const k = Math.min(fit.length, room);
    if (k > 0) return { type: 'add', meld: m.id, ids: fit.slice(0, k).map((c) => c.id) };
  }
  // 2) jogo novo com 3 ou mais naturais
  for (const [r, cs] of byRank) {
    if (cs.length < 3 || own.some((m) => m.rank === r)) continue;
    const k = Math.min(cs.length, room);
    if (k >= 3) return { type: 'meld', ids: cs.slice(0, k).map((c) => c.id) };
  }
  // 3) o 2: fecha canastra suja (quando já tem limpa) ou abre jogo com um par se a mão está cheia
  const wild = hand.find(isWild);
  if (wild && room >= 1) {
    const six = own.find((m) => m.rank !== 'B3' && isClean(m) && m.cards.length === 6);
    if (six && hasCleanCanastra(s, t)) return { type: 'add', meld: six.id, ids: [wild.id] };
    if (hand.length >= 8 && room >= 3) {
      for (const [r, cs] of byRank) if (cs.length === 2 && !own.some((m) => m.rank === r)) return { type: 'meld', ids: [...cs.map((c) => c.id), wild.id] };
    }
  }
  // 4) 3 pretos: só na hora de bater
  const b3 = hand.filter(isBlack3);
  if (b3.length >= 3 && s.mortos[t] === null && hasCleanCanastra(s, t) && hand.length - b3.length <= 1) return { type: 'meld', ids: b3.slice(0, 4).map((c) => c.id) };
  // 5) descarte: 3 preto tranca o lixo; evita dar carta que encaixa nos jogos dos outros
  const oppRanks = new Set(opp.map((m) => m.rank));
  const ownRanks = new Set(own.map((m) => m.rank));
  let best = hand[0];
  let bestV = Infinity;
  for (const c of hand) {
    let v = cardPts(c);
    if (isBlack3(c)) v = -100;
    else if (isWild(c)) v = 1000;
    else {
      const n = byRank.get(c.r)?.length || 0;
      if (ownRanks.has(c.r)) v += 500;
      if (n >= 2) v += 200;
      if (oppRanks.has(c.r)) v += 300;
    }
    if (v < bestV) { bestV = v; best = c; }
  }
  return { type: 'discard', id: best.id };
}

// ---------------------------------------------------------------- módulo

export const Tranca: GameModule<TrState, TrAction> = {
  id: 'tranca',
  title: 'Tranca',
  emoji: '♣️',
  minSeats: 2,
  maxSeats: 4,
  defaultConfig: { stake: 10, target: 3000 },
  configFields: [
    { key: 'stake', label: 'Aposta da partida (vai pro pote)', type: 'select', options: [0, 10, 25, 50, 100].map((v) => ({ v, t: v ? `🪙 ${v}` : 'Grátis' })), hint: 'Quem vence leva o pote (no 2 contra 2, dividido; a casa fica com 5%) e ganha um prêmio — o triplo contra pessoas.' },
    { key: 'target', label: 'Pontos para vencer', type: 'select', options: [{ v: 1500, t: '1500 (rápida)' }, { v: 3000, t: '3000' }] },
  ],
  seatCheck: (n) => (n === 2 || n === 4 ? null : 'A Tranca é 1 contra 1 ou 2 contra 2: deixe 2 ou 4 lugares na mesa.'),
  seatTag: (i, n) => (n === 4 ? (i % 2 === 0 ? 'Dupla 1' : 'Dupla 2') : null),

  init(config: Config, seats: SeatInfo[]) {
    const c = { stake: Number(config.stake) || 0, target: Number(config.target) || 3000 };
    const teams: [string[], string[]] = [seats.filter((_, i) => i % 2 === 0).map((x) => x.id), seats.filter((_, i) => i % 2 === 1).map((x) => x.id)];
    let s: TrState = {
      seats, coinEvents: [], over: false, banner: null, config: c, teams, score: [0, 0], hands: {}, stock: [], pile: [], mortos: [null, null],
      melds: [[], []], red3: [0, 0], dealer: seats[0].id, turn: seats[0].id, phase: 'draw', drawn: null, seq: 0, handNo: 0, lastHand: null,
      winnerTeam: null, pot: 0, paid: {},
    };
    const paid: Record<string, number> = {};
    for (const seat of seats) {
      const stake = Math.min(c.stake, seat.bank);
      paid[seat.id] = stake;
      if (stake) { s = coin(s, seat.id, -stake, 'aposta da Tranca') as TrState; s = { ...s, pot: s.pot + stake }; }
    }
    return deal({ ...s, paid }, seats[Math.floor(Math.random() * seats.length)].id);
  },

  act(s, id, a) {
    if (!s.hands[id]) return err('Você não está nesta mesa.');
    if (s.phase !== 'draw' && s.phase !== 'play') return err('Espere a próxima mão.');
    if (s.turn !== id) return err('Não é a sua vez.');
    const t = teamOf(s, id);
    const hand = s.hands[id];
    switch (a.type) {
      case 'draw': {
        if (s.phase !== 'draw') return err('Você já comprou nesta vez.');
        if (!s.stock.length) return endHand(s, null, 'O monte acabou.');
        const card = s.stock[0];
        let n: TrState = { ...s, stock: s.stock.slice(1), hands: { ...s.hands, [id]: [...hand, card] }, phase: 'play', drawn: card.id, banner: `${nm(s, id)} comprou do monte` };
        n = fixRed3(n, id);
        if (n.red3[t] > s.red3[t]) n = { ...n, drawn: null, banner: `${nm(s, id)} tirou um 3 vermelho! +100` };
        return n;
      }
      case 'take': {
        if (s.phase !== 'draw') return err('Você já comprou nesta vez.');
        const top = s.pile[s.pile.length - 1];
        if (!top) return err('O lixo está vazio.');
        if (isBlack3(top)) return err('Lixo trancado: tem um 3 preto em cima.');
        if (isWild(top)) return err('Com um 2 em cima não dá para pegar o lixo.');
        const rest = s.pile.slice(0, -1);
        let n: TrState;
        if (a.to) {
          const m = s.melds[t].find((x) => x.id === a.to);
          if (!m || m.rank === 'B3') return err('Escolha um jogo da sua dupla.');
          if (meldRank([...m.cards, top]) !== m.rank) return err('A carta de cima não encaixa nesse jogo.');
          const melds: [TrMeld[], TrMeld[]] = [...s.melds];
          melds[t] = melds[t].map((x) => (x.id === m.id ? { ...x, cards: [...x.cards, top] } : x));
          n = { ...s, melds, hands: { ...s.hands, [id]: [...hand, ...rest] } };
        } else {
          const cards = pick(hand, a.with || []);
          if (!cards || cards.length !== 2) return err('Escolha 2 cartas da sua mão iguais à de cima do lixo.');
          if (cards.some((c) => isWild(c) || c.r !== top.r)) return err('As 2 cartas precisam ser iguais à de cima (sem curinga).');
          if (s.melds[t].some((x) => x.rank === top.r)) return err('Sua dupla já tem esse jogo: encaixe a carta nele.');
          const melds: [TrMeld[], TrMeld[]] = [...s.melds];
          melds[t] = [...melds[t], { id: `m${s.seq + 1}`, rank: top.r, cards: [top, ...cards] }];
          n = { ...s, melds, seq: s.seq + 1, hands: { ...s.hands, [id]: [...without(hand, cards), ...rest] } };
        }
        n = { ...n, pile: [], phase: 'play', drawn: null, banner: `${nm(s, id)} pegou o lixo (${s.pile.length} ${s.pile.length === 1 ? 'carta' : 'cartas'})!` };
        return afterChange(n, id, 'play');
      }
      case 'meld': {
        if (s.phase !== 'play') return err('Primeiro compre do monte ou pegue o lixo.');
        const cards = pick(hand, a.ids);
        if (!cards) return err('Essas cartas não estão na sua mão.');
        let rank: Rank | 'B3';
        if (cards.length && cards.every(isBlack3)) {
          if (!isBlack3Meld(cards)) return err('Os 3 pretos baixam juntos, 3 ou 4 de uma vez.');
          if (s.mortos[t] !== null || !hasCleanCanastra(s, t) || hand.length - cards.length > 1) return err('Os 3 pretos só baixam na hora de bater.');
          rank = 'B3';
        } else {
          const r = meldRank(cards);
          if (!r) return err('Jogo inválido: 3 ou mais cartas do mesmo valor, no máximo um 2.');
          if (s.melds[t].some((x) => x.rank === r)) return err('Sua dupla já tem esse jogo: encaixe as cartas nele.');
          rank = r;
        }
        const melds: [TrMeld[], TrMeld[]] = [...s.melds];
        melds[t] = [...melds[t], { id: `m${s.seq + 1}`, rank, cards }];
        const n: TrState = { ...s, melds, seq: s.seq + 1, hands: { ...s.hands, [id]: without(hand, cards) }, drawn: null, banner: `${nm(s, id)} baixou um jogo` };
        return afterChange(n, id, 'play');
      }
      case 'add': {
        if (s.phase !== 'play') return err('Primeiro compre do monte ou pegue o lixo.');
        const m = s.melds[t].find((x) => x.id === a.meld);
        if (!m) return err('Escolha um jogo da sua dupla.');
        const cards = pick(hand, a.ids);
        if (!cards || !cards.length) return err('Escolha as cartas para encaixar.');
        if (m.rank === 'B3' || meldRank([...m.cards, ...cards]) !== m.rank) return err('Essas cartas não encaixam nesse jogo (no máximo um 2 por jogo).');
        const melds: [TrMeld[], TrMeld[]] = [...s.melds];
        const updated = { ...m, cards: [...m.cards, ...cards] };
        melds[t] = melds[t].map((x) => (x.id === m.id ? updated : x));
        const done = !isCanastra(m) && isCanastra(updated);
        const n: TrState = {
          ...s, melds, hands: { ...s.hands, [id]: without(hand, cards) }, drawn: null,
          banner: done ? `${nm(s, id)} fechou uma canastra ${isClean(updated) ? 'LIMPA! ✨' : 'suja!'}` : `${nm(s, id)} encaixou no jogo`,
        };
        return afterChange(n, id, 'play');
      }
      case 'discard': {
        if (s.phase !== 'play') return err('Primeiro compre do monte ou pegue o lixo.');
        const card = hand.find((c) => c.id === a.id);
        if (!card) return err('Essa carta não está na sua mão.');
        const n: TrState = {
          ...s, hands: { ...s.hands, [id]: without(hand, [card]) }, pile: [...s.pile, card],
          banner: isBlack3(card) ? `${nm(s, id)} descartou um 3 preto: lixo trancado! 🔒` : `${nm(s, id)} descartou`,
        };
        return afterChange(n, id, 'next');
      }
      default:
        return err('Jogada inválida.');
    }
  },

  auto(s) {
    if (s.phase !== 'handEnd') return null;
    const [a, b] = s.score;
    if (Math.max(a, b) >= s.config.target && a !== b) {
      const wt: Team = a > b ? 0 : 1;
      let fin: TrState = { ...s, phase: 'over', over: true, winnerTeam: wt, banner: `🏆 ${teamName(s, wt)} ${s.teams[wt].length > 1 ? 'venceram' : 'venceu'} a partida!` };
      fin = payWinners(fin, s.teams[wt], s.pot, s.config.target >= 3000 ? 15 : 8, 'da Tranca');
      return { state: fin, delay: 5000 };
    }
    return { state: deal(s, nextSeat(s, s.dealer)), delay: 6000 };
  },

  waitingFor: (s) => (s.phase === 'draw' || s.phase === 'play' ? [s.turn] : []),

  bot(s, id) {
    if (s.phase === 'draw') {
      const t = teamOf(s, id);
      const top = s.pile[s.pile.length - 1];
      if (top && !isBlack3(top) && !isWild(top) && (s.pile.length >= 3 || Math.random() < 0.5)) {
        const m = s.melds[t].find((x) => x.rank === top.r);
        if (m && meldRank([...m.cards, top]) === m.rank) {
          const after = s.hands[id].length + s.pile.length - 1;
          if (after >= 2 || canEmpty(s, t)) return { type: 'take', to: m.id };
        }
        const nat = naturals(s.hands[id]).get(top.r) || [];
        if (!m && nat.length >= 2) {
          const after = s.hands[id].length - 2 + s.pile.length - 1;
          if (after >= 2 || canEmpty(s, t)) return { type: 'take', with: nat.slice(0, 2).map((c) => c.id) };
        }
      }
      return { type: 'draw' };
    }
    return botPlay(s, id);
  },

  view(s, viewer) {
    const counts = Object.fromEntries(Object.entries(s.hands).map(([id, h]) => [id, h.length]));
    return {
      ...s, counts,
      hands: viewer && s.hands[viewer] ? { [viewer]: s.hands[viewer] } : {},
      stock: [], stockCount: s.stock.length,
      pile: s.pile.slice(-1), pileCount: s.pile.length,
      mortos: [s.mortos[0] ? [] : null, s.mortos[1] ? [] : null],
      mortoCounts: [s.mortos[0]?.length ?? null, s.mortos[1]?.length ?? null],
      drawn: viewer === s.turn ? s.drawn : null,
    };
  },

  joinable: false,
  refund: (s) => {
    if (s.over || !s.pot) return s;
    let n: TrState = s;
    for (const seat of s.seats) {
      const back = s.paid[seat.id] || 0;
      if (back) n = coin(n, seat.id, back, 'aposta devolvida') as TrState;
    }
    return { ...n, pot: 0, over: true, banner: 'Partida interrompida — apostas devolvidas.' };
  },
};
