// Blackjack (21) contra o dealer, apostando moedas do jogo.
import { makeDeck, type Card } from '../cards/cards';
import { coin, type BaseState, type Config, type GameModule } from './types';

export interface BjHand { cards: Card[]; bet: number; doubled?: boolean; split?: boolean; done?: boolean; result?: 'blackjack' | 'win' | 'push' | 'lose' | 'bust'; payout?: number }
export interface BjSeatState { bet: number; ready: boolean; hands: BjHand[]; cur: number }

export interface BjState extends BaseState {
  config: { decks: number; minBet: number; maxBet: number; hitSoft17: boolean; pay: '3:2' | '6:5' };
  shoe: Card[];
  dealer: Card[];
  holeHidden: boolean;
  st: Record<string, BjSeatState>;
  phase: 'bet' | 'play' | 'dealer' | 'settle';
  turn: string | null;
  round: number;
  /** Etapa interna do dealer/distribuição. */
  step: 'deal' | 'draw' | null;
}

export type BjAction = { type: 'bet'; amount: number } | { type: 'hit' } | { type: 'stand' } | { type: 'double' } | { type: 'split' };

const VAL: Record<string, number> = { A: 11, J: 10, Q: 10, K: 10 };
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += VAL[c.r] ?? Number(c.r);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const isBJ = (h: BjHand) => h.cards.length === 2 && !h.split && handValue(h.cards).total === 21;
const cardVal = (c: Card) => VAL[c.r] ?? Number(c.r);

function draw(s: BjState): [Card, BjState] {
  let shoe = s.shoe;
  if (shoe.length < 15) shoe = makeDeck(s.config.decks);
  return [shoe[0], { ...s, shoe: shoe.slice(1) }];
}

const players = (s: BjState) => s.seats.filter((x) => s.st[x.id]?.bet > 0 && s.st[x.id].hands.length);

/** Próximo jogador/mão que ainda precisa jogar. */
function nextTurn(s: BjState): BjState {
  for (const seat of s.seats) {
    const st = s.st[seat.id];
    if (!st?.hands.length) continue;
    const idx = st.hands.findIndex((h) => !h.done);
    if (idx >= 0) return { ...s, turn: seat.id, st: { ...s.st, [seat.id]: { ...st, cur: idx } } };
  }
  return { ...s, turn: null, phase: 'dealer', step: 'draw', holeHidden: false };
}

function patchHand(s: BjState, id: string, fn: (h: BjHand) => BjHand): BjState {
  const st = s.st[id];
  const hands = st.hands.map((h, i) => (i === st.cur ? fn(h) : h));
  return { ...s, st: { ...s.st, [id]: { ...st, hands } } };
}

function settle(s0: BjState): BjState {
  let s: BjState = { ...s0, phase: 'settle', turn: null, holeHidden: false };
  const d = handValue(s.dealer);
  const dealerBJ = s.dealer.length === 2 && d.total === 21;
  const bjMult = s.config.pay === '3:2' ? 2.5 : 2.2;
  const lines: string[] = [];
  for (const seat of s.seats) {
    const st = s.st[seat.id];
    if (!st?.hands.length) continue;
    let total = 0;
    const hands = st.hands.map((h) => {
      const v = handValue(h.cards).total;
      let result: BjHand['result'];
      let payout = 0;
      if (v > 21) result = 'bust';
      else if (isBJ(h) && !dealerBJ) { result = 'blackjack'; payout = Math.floor(h.bet * bjMult); }
      else if (dealerBJ && !isBJ(h)) result = 'lose';
      else if (d.total > 21 || v > d.total) { result = 'win'; payout = h.bet * 2; }
      else if (v === d.total) { result = 'push'; payout = h.bet; }
      else result = 'lose';
      total += payout;
      return { ...h, result, payout, done: true };
    });
    s = { ...s, st: { ...s.st, [seat.id]: { ...st, hands } } };
    if (total) s = coin(s, seat.id, total, 'blackjack') as BjState;
    const net = total - hands.reduce((a, h) => a + h.bet, 0);
    lines.push(`${seat.name} ${net > 0 ? `+${net}` : net}`);
  }
  return { ...s, banner: dealerBJ ? 'Dealer fez Blackjack!' : d.total > 21 ? 'Dealer estourou!' : `Dealer fez ${d.total}` };
}

export const Blackjack: GameModule<BjState, BjAction> = {
  id: 'blackjack',
  title: 'Blackjack',
  emoji: '🂡',
  minSeats: 1,
  maxSeats: 5,
  defaultConfig: { decks: 6, minBet: 10, maxBet: 200, hitSoft17: false, pay: '3:2' },
  configFields: [
    { key: 'minBet', label: 'Aposta mínima', type: 'select', options: [5, 10, 25, 50].map((v) => ({ v, t: `🪙 ${v}` })) },
    { key: 'maxBet', label: 'Aposta máxima', type: 'select', options: [100, 200, 500, 1000].map((v) => ({ v, t: `🪙 ${v}` })) },
    { key: 'decks', label: 'Baralhos no sapato', type: 'select', options: [1, 2, 4, 6].map((v) => ({ v, t: String(v) })) },
    { key: 'pay', label: 'Blackjack paga', type: 'select', options: [{ v: '3:2', t: '3 para 2' }, { v: '6:5', t: '6 para 5' }] },
    { key: 'hitSoft17', label: 'Dealer pede no 17 com Ás', type: 'toggle', hint: 'Se ligado, o dealer compra com 17 "mole" (ex.: Ás + 6).' },
  ],

  init(config: Config, seats) {
    const c = { decks: Number(config.decks), minBet: Number(config.minBet), maxBet: Number(config.maxBet), hitSoft17: !!config.hitSoft17, pay: config.pay as '3:2' | '6:5' };
    return {
      seats, coinEvents: [], over: false, banner: 'Façam suas apostas!',
      config: c, shoe: makeDeck(c.decks), dealer: [], holeHidden: true,
      st: Object.fromEntries(seats.map((s) => [s.id, { bet: 0, ready: false, hands: [], cur: 0 }])),
      phase: 'bet', turn: null, round: 1, step: null,
    };
  },

  act(s, id, a) {
    const seat = s.seats.find((x) => x.id === id);
    const st = s.st[id];
    if (!seat || !st) return { error: 'Você não está nesta mesa.' };
    if (a.type === 'bet') {
      if (s.phase !== 'bet') return { error: 'Espere a próxima rodada.' };
      const amt = Math.round(a.amount);
      if (amt === 0) return { ...s, st: { ...s.st, [id]: { ...st, bet: 0, ready: true } } };
      if (amt < s.config.minBet || amt > s.config.maxBet) return { error: `Aposte entre ${s.config.minBet} e ${s.config.maxBet}.` };
      if (amt > seat.bank) return { error: 'Moedas insuficientes.' };
      return { ...s, st: { ...s.st, [id]: { ...st, bet: amt, ready: true } } };
    }
    if (s.phase !== 'play' || s.turn !== id) return { error: 'Não é a sua vez.' };
    const h = st.hands[st.cur];
    if (a.type === 'stand') return nextTurn(patchHand(s, id, (x) => ({ ...x, done: true })));
    if (a.type === 'hit') {
      const [c, s2] = draw(s);
      const s3 = patchHand(s2, id, (x) => {
        const cards = [...x.cards, c];
        const v = handValue(cards).total;
        return { ...x, cards, done: v >= 21 };
      });
      return s3.st[id].hands[st.cur].done ? nextTurn(s3) : s3;
    }
    if (a.type === 'double') {
      if (h.cards.length !== 2) return { error: 'Só dá para dobrar com 2 cartas.' };
      if (seat.bank < h.bet) return { error: 'Moedas insuficientes para dobrar.' };
      let s2 = coin(s, id, -h.bet, 'dobrar') as BjState;
      const [c, s3] = draw(s2);
      s2 = patchHand(s3, id, (x) => ({ ...x, cards: [...x.cards, c], bet: x.bet * 2, doubled: true, done: true }));
      return nextTurn({ ...s2, banner: `${seat.name} dobrou!` });
    }
    if (a.type === 'split') {
      if (h.cards.length !== 2 || cardVal(h.cards[0]) !== cardVal(h.cards[1]) || st.hands.length > 1) return { error: 'Só dá para dividir um par.' };
      if (seat.bank < h.bet) return { error: 'Moedas insuficientes para dividir.' };
      let s2 = coin(s, id, -h.bet, 'dividir') as BjState;
      let c1: Card, c2: Card;
      [c1, s2] = draw(s2);
      [c2, s2] = draw(s2);
      const aces = h.cards[0].r === 'A';
      const hands: BjHand[] = [
        { cards: [h.cards[0], c1], bet: h.bet, split: true, done: aces },
        { cards: [h.cards[1], c2], bet: h.bet, split: true, done: aces },
      ];
      const s3 = { ...s2, banner: `${seat.name} dividiu!`, st: { ...s2.st, [id]: { ...st, hands, cur: 0 } } };
      return aces ? nextTurn(s3) : s3;
    }
    return { error: 'Jogada inválida.' };
  },

  auto(s) {
    if (s.phase === 'bet') {
      const humans = s.seats.filter((x) => !x.bot);
      if (!humans.every((x) => s.st[x.id].ready)) return null;
      // Todos apostaram: tira as apostas da banca e distribui
      let n: BjState = { ...s, dealer: [], holeHidden: true, banner: null };
      const st: Record<string, BjSeatState> = {};
      for (const seat of n.seats) {
        const b = n.st[seat.id].bet;
        st[seat.id] = { bet: b, ready: false, hands: b > 0 ? [{ cards: [], bet: b }] : [], cur: 0 };
        if (b > 0) n = coin(n, seat.id, -b, 'aposta') as BjState;
      }
      n = { ...n, st };
      if (!players(n).length) return { state: { ...n, banner: 'Ninguém apostou nesta rodada.', st: Object.fromEntries(n.seats.map((x) => [x.id, { bet: 0, ready: false, hands: [], cur: 0 }])) }, delay: 1200 };
      for (let k = 0; k < 2; k++) {
        for (const seat of players(n)) {
          let c: Card;
          [c, n] = draw(n);
          const ss = n.st[seat.id];
          n = { ...n, st: { ...n.st, [seat.id]: { ...ss, hands: [{ ...ss.hands[0], cards: [...ss.hands[0].cards, c] }] } } };
        }
        let c: Card;
        [c, n] = draw(n);
        n = { ...n, dealer: [...n.dealer, c] };
      }
      // Blackjack natural fica de pé sozinho
      for (const seat of players(n)) {
        const ss = n.st[seat.id];
        if (isBJ(ss.hands[0])) n = { ...n, st: { ...n.st, [seat.id]: { ...ss, hands: [{ ...ss.hands[0], done: true }] } } };
      }
      const up = n.dealer[0];
      if ((up.r === 'A' || cardVal(up) === 10) && handValue(n.dealer).total === 21) return { state: settle(n), delay: 900 };
      return { state: nextTurn({ ...n, phase: 'play' }), delay: 700 };
    }
    if (s.phase === 'dealer') {
      const anyAlive = players(s).some((x) => s.st[x.id].hands.some((h) => handValue(h.cards).total <= 21));
      const v = handValue(s.dealer);
      const mustHit = anyAlive && (v.total < 17 || (v.total === 17 && v.soft && s.config.hitSoft17));
      if (!mustHit) return { state: settle(s), delay: 900 };
      const [c, s2] = draw(s);
      return { state: { ...s2, dealer: [...s2.dealer, c] }, delay: 750 };
    }
    if (s.phase === 'settle') {
      return {
        state: {
          ...s, phase: 'bet', round: s.round + 1, dealer: [], holeHidden: true, banner: 'Façam suas apostas!',
          st: Object.fromEntries(s.seats.map((x) => [x.id, { bet: s.st[x.id]?.bet || 0, ready: false, hands: [], cur: 0 }])),
        },
        delay: 3800,
      };
    }
    return null;
  },

  waitingFor(s) {
    if (s.phase === 'bet') return s.seats.filter((x) => !s.st[x.id].ready).map((x) => x.id);
    if (s.phase === 'play' && s.turn) return [s.turn];
    return [];
  },

  bot(s, id) {
    const seat = s.seats.find((x) => x.id === id)!;
    if (s.phase === 'bet') {
      const opts = [s.config.minBet, s.config.minBet * 2, s.config.minBet * 5].filter((v) => v <= Math.min(seat.bank, s.config.maxBet));
      return { type: 'bet', amount: opts.length ? opts[Math.floor(Math.random() * opts.length)] : 0 };
    }
    const st = s.st[id];
    const h = st.hands[st.cur];
    const { total, soft } = handValue(h.cards);
    const up = cardVal(s.dealer[0]);
    if (h.cards.length === 2 && cardVal(h.cards[0]) === cardVal(h.cards[1]) && st.hands.length === 1 && ['A', '8'].includes(h.cards[0].r) && seat.bank >= h.bet) return { type: 'split' };
    if (h.cards.length === 2 && (total === 11 || (total === 10 && up < 10)) && seat.bank >= h.bet) return { type: 'double' };
    if (soft) return total <= 17 || (total === 18 && up >= 9) ? { type: 'hit' } : { type: 'stand' };
    if (total <= 11) return { type: 'hit' };
    if (total <= 16) return up >= 7 ? { type: 'hit' } : { type: 'stand' };
    return { type: 'stand' };
  },

  view(s) {
    return { ...s, shoe: [], dealer: s.holeHidden && s.dealer.length > 1 ? [s.dealer[0]] : s.dealer, shoeCount: s.shoe.length };
  },

  joinable: true,
  canAdmit: (s) => s.phase === 'bet',
  refund: (s) => {
    if (s.phase !== 'play' && s.phase !== 'dealer') return s; // na fase de aposta nada foi cobrado; no acerto já foi pago
    let n: BjState = s;
    for (const seat of s.seats) {
      const back = (s.st[seat.id]?.hands || []).reduce((a, h) => a + h.bet, 0);
      if (back) n = coin(n, seat.id, back, 'aposta devolvida') as BjState;
    }
    return { ...n, phase: 'settle', over: true, banner: 'Rodada interrompida — apostas devolvidas.' };
  },
  addSeat: (s, seat) => ({ ...s, seats: [...s.seats, seat], st: { ...s.st, [seat.id]: { bet: 0, ready: false, hands: [], cur: 0 } } }),
  removeSeat: (s, id) => {
    const st = { ...s.st };
    delete st[id];
    return { ...s, seats: s.seats.filter((x) => x.id !== id), st };
  },
};
