// Duvido! — jogo do mentiroso. Cada rodada tem uma "carta da mesa" (Rei, Dama ou Ás).
// Na sua vez você joga 1 a 3 cartas viradas dizendo que são a carta da mesa.
// O próximo aceita (e joga as dele) ou grita "Duvido!". Quem erra enche o próprio balão;
// a cada enchida a chance de estourar aumenta. Balão estourado = fora. Último de pé leva o pote.
import { shuffle } from '../cards/cards';
import { coin, payWinners, type BaseState, type Config, type GameModule, type SeatInfo } from './types';

export type DvRank = 'K' | 'Q' | 'A' | 'C';
export interface DvCard { id: string; r: DvRank }
export const DV_NAMES: Record<DvRank, string> = { K: 'Rei', Q: 'Dama', A: 'Ás', C: 'Coringa' };
export const DV_PLURAL: Record<DvRank, string> = { K: 'Reis', Q: 'Damas', A: 'Ases', C: 'Coringas' };

export interface DvPlayer { hand: DvCard[]; pumps: number; popAt: number; out: boolean; paid: number; handCount?: number }
export interface DvState extends BaseState {
  config: { stake: number; maxPlay: number; balloon: number; jokers: boolean };
  phase: 'play' | 'reveal' | 'pump' | 'next' | 'over';
  table: Exclude<DvRank, 'C'>;
  p: Record<string, DvPlayer>;
  turn: string;
  lastPlay: { by: string; cards: DvCard[]; count: number } | null;
  pile: number;
  reveal: { by: string; challenger: string; lied: boolean; loser: string } | null;
  pump: { id: string; popped: boolean } | null;
  round: number;
  starter: string;
  winner: string | null;
  pot: number;
}
export type DvAction = { type: 'play'; ids: string[] } | { type: 'doubt' };

const alive = (s: DvState) => s.seats.filter((x) => s.p[x.id] && !s.p[x.id].out).map((x) => x.id);
const valid = (s: DvState, c: DvCard) => c.r === s.table || c.r === 'C';

function nextAlive(s: DvState, from: string): string {
  const order = s.seats.map((x) => x.id);
  const i = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(i + k) % order.length];
    if (s.p[id] && !s.p[id].out) return id;
  }
  return from;
}

function deal(s: DvState, starter: string): DvState {
  const deck: DvCard[] = [];
  let n = 0;
  for (const r of ['K', 'Q', 'A'] as const) for (let i = 0; i < 6; i++) deck.push({ id: `c${n++}`, r });
  if (s.config.jokers) for (let i = 0; i < 2; i++) deck.push({ id: `c${n++}`, r: 'C' });
  const cards = shuffle(deck);
  const p = { ...s.p };
  const ids = alive(s);
  const per = Math.min(5, Math.floor(cards.length / ids.length)); // 4 jogadores sem coringa: 4 cartas cada
  ids.forEach((id, i) => { p[id] = { ...p[id], hand: cards.slice(i * per, i * per + per) }; });
  const table = (['K', 'Q', 'A'] as const)[Math.floor(Math.random() * 3)];
  return {
    ...s, p, table, phase: 'play', turn: starter, starter, lastPlay: null, pile: 0, reveal: null, pump: null,
    banner: `Rodada ${s.round}: carta da mesa é ${DV_NAMES[table].toUpperCase()}!`,
  };
}

const name = (s: DvState, id: string) => s.seats.find((x) => x.id === id)?.name || '?';

export const Duvido: GameModule<DvState, DvAction> = {
  id: 'duvido',
  title: 'Duvido!',
  emoji: '🤥',
  minSeats: 2,
  maxSeats: 4,
  defaultConfig: { stake: 10, maxPlay: 3, balloon: 6, jokers: true },
  configFields: [
    { key: 'stake', label: 'Aposta da partida (vai pro pote)', type: 'select', options: [0, 10, 25, 50, 100].map((v) => ({ v, t: v ? `🪙 ${v}` : 'Grátis' })), hint: 'Quem vence leva o pote (a casa fica com 5%) e ganha um prêmio — o triplo contra pessoas.' },
    { key: 'balloon', label: 'Tamanho do balão', type: 'select', options: [{ v: 4, t: 'Pequeno' }, { v: 6, t: 'Médio' }, { v: 8, t: 'Grande' }], hint: 'Balão pequeno estoura mais cedo — partida mais rápida.' },
    { key: 'maxPlay', label: 'Máximo de cartas por jogada', type: 'select', options: [1, 2, 3].map((v) => ({ v, t: String(v) })) },
    { key: 'jokers', label: 'Coringas (valem como a carta da mesa)', type: 'toggle' },
  ],

  init(config: Config, seats: SeatInfo[]) {
    const c = { stake: Number(config.stake), maxPlay: Number(config.maxPlay), balloon: Number(config.balloon), jokers: !!config.jokers };
    let s: DvState = {
      seats, coinEvents: [], over: false, banner: null, config: c, phase: 'play', table: 'K', p: {}, turn: seats[0].id,
      lastPlay: null, pile: 0, reveal: null, pump: null, round: 1, starter: seats[0].id, winner: null, pot: 0,
    };
    for (const seat of seats) {
      const stake = Math.min(c.stake, seat.bank);
      s.p[seat.id] = { hand: [], pumps: 0, popAt: 1 + Math.floor(Math.random() * c.balloon), out: false, paid: stake };
      if (stake) { s = coin(s, seat.id, -stake, 'aposta do Duvido') as DvState; s.pot += stake; }
    }
    const starter = seats[Math.floor(Math.random() * seats.length)].id;
    return deal(s, starter);
  },

  act(s, id, a) {
    if (s.phase !== 'play') return { error: 'Espere um instante…' };
    if (s.turn !== id) return { error: 'Não é a sua vez.' };
    const me = s.p[id];
    if (a.type === 'doubt') {
      if (!s.lastPlay || s.lastPlay.by === id) return { error: 'Não tem jogada para duvidar.' };
      const lied = s.lastPlay.cards.some((c) => !valid(s, c));
      const loser = lied ? s.lastPlay.by : id;
      return { ...s, phase: 'reveal', reveal: { by: s.lastPlay.by, challenger: id, lied, loser }, banner: `${name(s, id)}: "DUVIDO!"` };
    }
    const ids = a.ids.slice(0, s.config.maxPlay);
    if (!ids.length) return { error: 'Escolha pelo menos 1 carta.' };
    if (a.ids.length > s.config.maxPlay) return { error: `No máximo ${s.config.maxPlay} cartas.` };
    const cards = me.hand.filter((c) => ids.includes(c.id));
    if (cards.length !== ids.length) return { error: 'Essas cartas não estão na sua mão.' };
    const p = { ...s.p, [id]: { ...me, hand: me.hand.filter((c) => !ids.includes(c.id)) } };
    // O próximo vivo decide: aceita (joga) ou duvida. Sem cartas, ele só pode duvidar.
    const next = nextAlive({ ...s, p }, id);
    const s2: DvState = {
      ...s, p, lastPlay: { by: id, cards, count: cards.length }, pile: s.pile + cards.length, turn: next,
      banner: `${name(s, id)} jogou ${cards.length} ${cards.length === 1 ? 'carta' : 'cartas'}: "${cards.length === 1 ? `é ${DV_NAMES[s.table]}` : `são ${DV_PLURAL[s.table]}`}!"`,
    };
    return s2;
  },

  auto(s) {
    if (s.phase === 'reveal' && s.reveal) {
      const loser = s.reveal.loser;
      const pl = s.p[loser];
      const pumps = pl.pumps + 1;
      const popped = pumps >= pl.popAt;
      return {
        state: {
          ...s, phase: 'pump', pump: { id: loser, popped },
          p: { ...s.p, [loser]: { ...pl, pumps, out: popped } },
          banner: s.reveal.lied ? `MENTIRA! ${name(s, loser)} enche o balão…` : `Era verdade! ${name(s, loser)} enche o balão…`,
        },
        delay: 2600,
      };
    }
    if (s.phase === 'pump' && s.pump) {
      const left = alive(s);
      const msg = s.pump.popped ? `💥 POW! O balão de ${name(s, s.pump.id)} estourou!` : `😮‍💨 Ufa! O balão de ${name(s, s.pump.id)} aguentou.`;
      if (left.length <= 1) {
        const winner = left[0];
        let fin: DvState = { ...s, phase: 'over', winner, over: true, banner: `${msg} ${name(s, winner)} venceu!` };
        fin = payWinners(fin, [winner], fin.pot, s.round >= 3 ? 5 : 2, 'do Duvido');
        return { state: fin, delay: 2400 };
      }
      return { state: { ...s, phase: 'next', banner: msg }, delay: 2400 };
    }
    if (s.phase === 'next') {
      const loser = s.pump!.id;
      const starter = s.p[loser].out ? nextAlive(s, loser) : loser;
      return { state: deal({ ...s, round: s.round + 1 }, starter), delay: 2000 };
    }
    return null;
  },

  waitingFor: (s) => (s.phase === 'play' ? [s.turn] : []),

  bot(s, id) {
    const me = s.p[id];
    const last = s.lastPlay;
    if (last && last.by !== id) {
      const mineValid = me.hand.filter((c) => valid(s, c)).length;
      const totalValid = 6 + (s.config.jokers ? 2 : 0);
      const unseenValid = totalValid - mineValid;
      if (last.count > unseenValid || !me.hand.length) return { type: 'doubt' };
      const claimer = s.p[last.by];
      let chance = 0.18 + 0.12 * (last.count - 1) + (claimer.hand.length === 0 ? 0.25 : 0) + (mineValid >= 4 ? 0.2 : 0);
      chance = Math.min(0.85, chance);
      if (Math.random() < chance) return { type: 'doubt' };
    }
    if (!me.hand.length) return { type: 'doubt' };
    const truth = me.hand.filter((c) => valid(s, c));
    const lie = me.hand.filter((c) => !valid(s, c));
    let pick: string[];
    if (truth.length && (Math.random() < 0.75 || !lie.length)) pick = truth.slice(0, Math.min(s.config.maxPlay, 1 + Math.floor(Math.random() * Math.min(2, truth.length)))).map((c) => c.id);
    else pick = lie.slice(0, Math.random() < 0.7 ? 1 : Math.min(2, s.config.maxPlay)).map((c) => c.id);
    return { type: 'play', ids: pick };
  },

  view(s, viewer) {
    const reveal = s.phase === 'reveal' || s.phase === 'pump' || s.phase === 'next' || s.phase === 'over';
    const p = Object.fromEntries(Object.entries(s.p).map(([id, pl]) => [id, {
      hand: id === viewer ? pl.hand : [], handCount: pl.hand.length, pumps: pl.pumps, out: pl.out, paid: pl.paid,
      popAt: s.phase === 'over' || pl.out ? pl.popAt : 0,
    }]));
    return { ...s, p, lastPlay: s.lastPlay ? { ...s.lastPlay, cards: reveal ? s.lastPlay.cards : [] } : null };
  },

  joinable: true,
  canAdmit: (s) => s.phase === 'next',
  addSeat: (s, seat) => {
    const stake = Math.min(s.config.stake, seat.bank);
    let n: DvState = { ...s, seats: [...s.seats, seat], p: { ...s.p, [seat.id]: { hand: [], pumps: 0, popAt: 1 + Math.floor(Math.random() * s.config.balloon), out: false, paid: stake } } };
    if (stake) { n = coin(n, seat.id, -stake, 'aposta do Duvido') as DvState; n.pot += stake; }
    return n;
  },
  removeSeat: (s, id) => {
    const p = { ...s.p };
    delete p[id];
    return { ...s, seats: s.seats.filter((x) => x.id !== id), p };
  },
  refund: (s) => {
    if (s.over || !s.pot) return s;
    let n: DvState = s;
    for (const seat of s.seats) {
      const back = Math.min(s.p[seat.id]?.paid || 0, n.pot);
      if (back) { n = coin(n, seat.id, back, 'aposta devolvida') as DvState; n = { ...n, pot: n.pot - back }; }
    }
    return { ...n, pot: 0, over: true, banner: 'Partida interrompida — apostas devolvidas.' };
  },
};
