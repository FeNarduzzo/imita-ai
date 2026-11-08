// Truco Paulista (com vira). 1 contra 1 ou 2 contra 2, parceiros sentados de frente.
// Baralho sem 8, 9 e 10 (40 cartas). Da mais fraca para a mais forte: 4 5 6 7 Q J K A 2 3.
// Depois de dar 3 cartas para cada um, vira-se uma carta: a seguinte a ela é a manilha
// (manilhas, da mais fraca à mais forte: ouros/pica-fumo, espadas/espadilha, copas/copeta, paus/zap).
// A mão é melhor de 3 vazas e vale 1 ponto; o truco sobe para 3, depois seis, nove e doze.
// Mão de onze: quem tem 11 vê a mão do parceiro e decide se joga (vale 3) ou corre (o outro lado ganha 1).
// Mão de ferro: 11 a 11, todo mundo joga sem ver as próprias cartas. Partida até 12.
import { makeDeck, RANK_NAMES, SUIT_NAMES, type Card, type Rank, type Suit } from '../cards/cards';
import { coin, type BaseState, type Config, type GameModule, type SeatInfo } from './types';

export const TC_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
export const MANILHA_SUITS: Suit[] = ['♦', '♠', '♥', '♣'];
export const MANILHA_NAMES: Record<Suit, string> = { '♦': 'Pica-fumo', '♠': 'Espadilha', '♥': 'Copeta', '♣': 'Zap' };
export const RAISE_NAMES: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };
export const TC_TARGET = 12;

export type Team = 0 | 1;
export interface TcCard extends Card { blind?: boolean }
export interface TcPlay { seat: string; card: TcCard | null; covered: boolean }

export interface TcState extends BaseState {
  config: { stake: number; coberta: boolean; ferro: boolean };
  /** Dupla 0 = lugares 1 e 3; dupla 1 = lugares 2 e 4 (no 1 contra 1, um em cada). */
  teams: [string[], string[]];
  score: [number, number];
  hands: Record<string, TcCard[]>;
  /** Só na visão: quantas cartas cada um tem. */
  counts?: Record<string, number>;
  /** Só na visão, na mão de onze: as cartas do parceiro de quem tem 11. */
  partnerHand?: TcCard[];
  vira: Card;
  manilha: Rank;
  dealer: string;
  /** Quem é "mão" (começa a primeira vaza). */
  mao: string;
  turn: string;
  /** Quem começa a próxima vaza. */
  lead: string;
  trick: TcPlay[];
  tricks: (Team | -1)[];
  tricksBy: (string | null)[];
  value: number;
  raisedBy: Team | null;
  pending: { by: string; team: Team; to: number; responder: string; resume: string } | null;
  phase: 'onze' | 'play' | 'call' | 'trickEnd' | 'handEnd' | 'over';
  onze: { team: Team; decider: string } | null;
  ferro: boolean;
  noTruco: boolean;
  handNo: number;
  lastHand: { team: Team | null; points: number; why: string } | null;
  winnerTeam: Team | null;
  pot: number;
  paid: Record<string, number>;
}

export type TcAction =
  | { type: 'play'; id: string; covered?: boolean }
  | { type: 'truco' }
  | { type: 'accept' }
  | { type: 'run' }
  | { type: 'raise' }
  | { type: 'onze'; play: boolean };

// ---------------------------------------------------------------- regras puras

export const manilhaOf = (vira: Card): Rank => TC_ORDER[(TC_ORDER.indexOf(vira.r) + 1) % TC_ORDER.length];
/** Força da carta: 0 (4) … 9 (3); manilhas 20 (pica-fumo) … 23 (zap). */
export const power = (c: Card, manilha: Rank) => (c.r === manilha ? 20 + MANILHA_SUITS.indexOf(c.s) : TC_ORDER.indexOf(c.r));
export const nextValue = (v: number) => (v === 1 ? 3 : v + 3);
export const teamOf = (s: Pick<TcState, 'teams'>, id: string): Team => (s.teams[0].includes(id) ? 0 : 1);

/** Quem levou a mão, dadas as vazas (0/1 = dupla, -1 = empate). undefined = continua; null = ninguém marca. */
export function handWinner(t: (Team | -1)[]): Team | null | undefined {
  if (t.length < 2) return undefined;
  const [a, b, c] = t;
  if (t.length === 2) {
    if (a !== -1 && a === b) return a;
    if (a === -1 && b !== -1) return b; // empatou a primeira: quem ganha a segunda leva
    if (a !== -1 && b === -1) return a; // empatou a segunda: vale a primeira
    return undefined;
  }
  if (c !== -1) return c;
  if (a === -1 && b === -1) return null; // empatou as três
  return a as Team; // uma para cada e empatou a terceira: leva quem fez a primeira
}

const order = (s: TcState) => s.seats.map((x) => x.id);
const nextSeat = (s: TcState, id: string) => { const o = order(s); return o[(o.indexOf(id) + 1) % o.length]; };
const nextOpponent = (s: TcState, id: string) => { let x = nextSeat(s, id); while (teamOf(s, x) === teamOf(s, id) && x !== id) x = nextSeat(s, x); return x; };
const nm = (s: TcState, id: string) => s.seats.find((x) => x.id === id)?.name || '?';
export const teamName = (s: TcState, t: Team) => s.teams[t].map((id) => nm(s, id)).join(' e ');
/** Verbo concordando com a dupla ("levou" / "levaram"). */
const vb = (s: TcState, t: Team, one: string, many: string) => (s.teams[t].length > 1 ? many : one);
const err = (error: string) => ({ error });

function deal(s: TcState, dealer: string): TcState {
  const deck = makeDeck(1, TC_ORDER);
  const start = nextSeat(s, dealer);
  const hands: Record<string, TcCard[]> = {};
  let k = 0;
  let id = start;
  for (let i = 0; i < s.seats.length; i++) { hands[id] = deck.slice(k, k + 3); k += 3; id = nextSeat(s, id); }
  const vira = deck[k];
  const manilha = manilhaOf(vira);
  const at11 = (t: Team) => s.score[t] === TC_TARGET - 1;
  const both = at11(0) && at11(1);
  const onzeTeam: Team | null = both ? null : at11(0) ? 0 : at11(1) ? 1 : null;
  const ferro = both && s.config.ferro;
  let n: TcState = {
    ...s, hands, vira, manilha, dealer, mao: start, turn: start, lead: start, trick: [], tricks: [], tricksBy: [], value: 1, raisedBy: null,
    pending: null, onze: null, ferro, noTruco: both || onzeTeam !== null, handNo: s.handNo + 1, lastHand: null, phase: 'play',
    banner: ferro ? 'Mão de ferro! 11 a 11 — todo mundo joga no escuro.' : `Vira: ${RANK_NAMES[vira.r]} de ${SUIT_NAMES[vira.s]} — manilha é ${RANK_NAMES[manilha]}`,
  };
  if (onzeTeam !== null) {
    const decider = s.teams[onzeTeam].find((x) => !s.seats.find((y) => y.id === x)?.bot) || s.teams[onzeTeam][0];
    n = { ...n, phase: 'onze', onze: { team: onzeTeam, decider }, value: 3, banner: `Mão de onze para ${teamName(s, onzeTeam)}!` };
  }
  return n;
}

function endHand(s: TcState, team: Team | null, points: number, why: string): TcState {
  const score: [number, number] = [...s.score];
  if (team !== null) score[team] = Math.min(TC_TARGET, score[team] + points);
  return {
    ...s, score, phase: 'handEnd', pending: null, onze: null, lastHand: { team, points: team === null ? 0 : points, why },
    banner: team === null ? `${why} — ninguém marca.` : `${why}. ${teamName(s, team)} +${points}`,
  };
}

function resolveTrick(s: TcState): TcState {
  let best = -2;
  let bestTeams = new Set<Team>();
  let first: string = s.trick[0].seat;
  for (const p of s.trick) {
    const v = p.covered || !p.card ? -1 : power(p.card, s.manilha);
    if (v > best) { best = v; bestTeams = new Set([teamOf(s, p.seat)]); first = p.seat; } else if (v === best) bestTeams.add(teamOf(s, p.seat));
  }
  const tie = bestTeams.size > 1;
  const w: Team | -1 = tie ? -1 : [...bestTeams][0];
  return {
    ...s, phase: 'trickEnd', tricks: [...s.tricks, w], tricksBy: [...s.tricksBy, tie ? null : first], lead: first,
    banner: tie ? 'Empatou a vaza (cangou)!' : `${nm(s, first)} fez a ${s.tricks.length + 1}ª vaza`,
  };
}

// ---------------------------------------------------------------- bots

const cardScore = (x: number) => (x >= 20 ? 0.86 + (x - 20) * 0.045 : x / 12);

/** Chance (bem aproximada) de a dupla levar a mão, só com o que o jogador sabe. */
function handEval(s: TcState, id: string): number {
  const me = teamOf(s, id);
  const won = s.tricks.filter((t) => t === me).length;
  const lost = s.tricks.filter((t) => t !== me && t !== -1).length;
  if (won >= 2) return 1;
  if (lost >= 2) return 0;
  if (s.ferro) return 0.5;
  const cards: Card[] = [...s.hands[id]];
  const mine = s.trick.find((p) => p.seat === id);
  if (mine?.card && !mine.covered) cards.push(mine.card);
  const pw = cards.map((c) => power(c, s.manilha)).sort((a, b) => b - a);
  let p = 0.1 + 0.55 * (pw.length ? cardScore(pw[0]) : 0) + 0.35 * (pw.length > 1 ? cardScore(pw[1]) : 0);
  if (s.tricks.length) p += s.tricks[0] === me ? 0.25 : s.tricks[0] === -1 ? 0 : -0.25;
  if (s.seats.length === 4) p += 0.05; // o parceiro ajuda
  return Math.max(0, Math.min(1, p));
}

function pickCard(s: TcState, id: string): { id: string; covered?: boolean } {
  const hand = s.hands[id];
  if (s.ferro) return { id: hand[Math.floor(Math.random() * hand.length)].id };
  const me = teamOf(s, id);
  const pw = (c: Card) => power(c, s.manilha);
  const sorted = [...hand].sort((a, b) => pw(a) - pw(b));
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const canCover = s.config.coberta && s.tricks.length > 0;
  if (!s.trick.length) {
    if (s.tricks.length === 0 && sorted.length === 3) return { id: sorted[1].id }; // abre a primeira com a do meio
    return { id: highest.id };
  }
  let best = -2;
  let bestTeam: Team | -1 = -1;
  for (const p of s.trick) {
    const v = p.covered || !p.card ? -1 : pw(p.card);
    const t = teamOf(s, p.seat);
    if (v > best) { best = v; bestTeam = t; } else if (v === best && t !== bestTeam) bestTeam = -1;
  }
  const last = s.trick.length === s.seats.length - 1;
  if (bestTeam === me && (last || best >= 8)) return { id: lowest.id, covered: canCover && pw(lowest) < 7 && Math.random() < 0.4 };
  const beats = sorted.filter((c) => pw(c) > best);
  if (beats.length) return { id: beats[0].id };
  const ties = sorted.filter((c) => pw(c) === best);
  if (ties.length && bestTeam !== me && s.tricks[0] === me) return { id: ties[0].id }; // empatar segura a mão
  return { id: lowest.id, covered: canCover && Math.random() < 0.5 };
}

// ---------------------------------------------------------------- módulo

export const Truco: GameModule<TcState, TcAction> = {
  id: 'truco',
  title: 'Truco Paulista',
  emoji: '🃏',
  minSeats: 2,
  maxSeats: 4,
  defaultConfig: { stake: 10, coberta: true, ferro: true },
  configFields: [
    { key: 'stake', label: 'Aposta da partida (vai pro pote)', type: 'select', options: [0, 10, 25, 50, 100].map((v) => ({ v, t: v ? `🪙 ${v}` : 'Grátis' })), hint: 'No 2 contra 2, a dupla que vence divide o pote.' },
    { key: 'coberta', label: 'Carta coberta (da 2ª vaza em diante)', type: 'toggle', hint: 'Joga a carta virada: não vale nada, mas esconde o seu jogo.' },
    { key: 'ferro', label: 'Mão de ferro (11 a 11 joga no escuro)', type: 'toggle' },
  ],
  seatCheck: (n) => (n === 2 || n === 4 ? null : 'O Truco é 1 contra 1 ou 2 contra 2: deixe 2 ou 4 lugares na mesa.'),
  seatTag: (i, n) => (n === 4 ? (i % 2 === 0 ? 'Dupla 1' : 'Dupla 2') : null),

  init(config: Config, seats: SeatInfo[]) {
    const c = { stake: Number(config.stake) || 0, coberta: !!config.coberta, ferro: !!config.ferro };
    const teams: [string[], string[]] = [seats.filter((_, i) => i % 2 === 0).map((x) => x.id), seats.filter((_, i) => i % 2 === 1).map((x) => x.id)];
    let s: TcState = {
      seats, coinEvents: [], over: false, banner: null, config: c, teams, score: [0, 0], hands: {}, vira: { r: '4', s: '♦', id: '-' }, manilha: '5',
      dealer: seats[0].id, mao: seats[0].id, turn: seats[0].id, lead: seats[0].id, trick: [], tricks: [], tricksBy: [], value: 1, raisedBy: null,
      pending: null, phase: 'play', onze: null, ferro: false, noTruco: false, handNo: 0, lastHand: null, winnerTeam: null, pot: 0, paid: {},
    };
    const paid: Record<string, number> = {};
    for (const seat of seats) {
      const stake = Math.min(c.stake, seat.bank);
      paid[seat.id] = stake;
      if (stake) { s = coin(s, seat.id, -stake, 'aposta do Truco') as TcState; s = { ...s, pot: s.pot + stake }; }
    }
    s = { ...s, paid };
    return deal(s, seats[Math.floor(Math.random() * seats.length)].id);
  },

  act(s, id, a) {
    if (!s.seats.some((x) => x.id === id)) return err('Você não está nesta mesa.');
    if (a.type === 'onze') {
      if (s.phase !== 'onze' || !s.onze) return err('Agora não.');
      if (teamOf(s, id) !== s.onze.team) return err('Quem decide é a dupla que tem 11.');
      if (a.play) return { ...s, phase: 'play', onze: null, value: 3, banner: `${teamName(s, s.onze.team)} ${vb(s, s.onze.team, 'vai', 'vão')} jogar a mão de onze (vale 3)!` };
      return endHand(s, (1 - s.onze.team) as Team, 1, `${teamName(s, s.onze.team)} ${vb(s, s.onze.team, 'correu', 'correram')} da mão de onze`);
    }
    if (a.type === 'accept' || a.type === 'run' || a.type === 'raise') {
      const p = s.pending;
      if (s.phase !== 'call' || !p) return err('Ninguém pediu truco.');
      if (id !== p.responder) return err(`Quem responde é ${nm(s, p.responder)}.`);
      if (a.type === 'accept') return { ...s, phase: 'play', value: p.to, raisedBy: p.team, pending: null, turn: p.resume, banner: `${nm(s, id)} aceitou! Vale ${p.to}.` };
      if (a.type === 'run') return endHand(s, p.team, s.value, `${nm(s, id)} correu do ${RAISE_NAMES[p.to].toLowerCase()}`);
      if (p.to >= TC_TARGET) return err('Já está valendo 12.');
      const to = nextValue(p.to);
      return { ...s, value: p.to, raisedBy: p.team, pending: { by: id, team: teamOf(s, id), to, responder: nextOpponent(s, id), resume: p.resume }, banner: `${nm(s, id)} pediu ${RAISE_NAMES[to]}!` };
    }
    if (s.phase === 'call') return err('Primeiro responda o pedido de truco.');
    if (s.phase !== 'play') return err('Espere um instante…');
    if (s.turn !== id) return err('Não é a sua vez.');
    if (a.type === 'truco') {
      if (s.noTruco) return err(s.ferro ? 'Na mão de ferro não tem truco.' : 'Nesta mão não tem truco.');
      if (s.value >= TC_TARGET) return err('Já está valendo 12!');
      if (s.raisedBy === teamOf(s, id)) return err('Sua dupla já pediu — agora só o outro lado pode aumentar.');
      const to = nextValue(s.value);
      return { ...s, phase: 'call', pending: { by: id, team: teamOf(s, id), to, responder: nextOpponent(s, id), resume: id }, banner: `${nm(s, id)} pediu ${RAISE_NAMES[to]}!` };
    }
    if (a.type !== 'play') return err('Jogada inválida.');
    const hand = s.hands[id] || [];
    const idx = s.ferro && /^b\d$/.test(a.id) ? Number(a.id.slice(1)) : -1;
    const card = idx >= 0 ? hand[idx] : hand.find((c) => c.id === a.id);
    if (!card) return err('Essa carta não está na sua mão.');
    const covered = !!a.covered;
    if (covered && (!s.config.coberta || !s.tricks.length || s.ferro)) return err('Agora não dá para jogar coberta.');
    const trick = [...s.trick, { seat: id, card, covered }];
    const n: TcState = { ...s, hands: { ...s.hands, [id]: hand.filter((c) => c.id !== card.id) }, trick, banner: null };
    if (trick.length < s.seats.length) return { ...n, turn: nextSeat(s, id) };
    return resolveTrick(n);
  },

  auto(s) {
    if (s.phase === 'trickEnd') {
      const w = handWinner(s.tricks);
      if (w === undefined) return { state: { ...s, phase: 'play', trick: [], turn: s.lead, banner: null }, delay: 1600 };
      if (w === null) return { state: endHand(s, null, 0, 'Empatou as três vazas'), delay: 1600 };
      return { state: endHand(s, w, s.value, `${teamName(s, w)} ${vb(s, w, 'levou', 'levaram')} a mão`), delay: 1600 };
    }
    if (s.phase === 'handEnd') {
      const wt: Team | null = s.score[0] >= TC_TARGET ? 0 : s.score[1] >= TC_TARGET ? 1 : null;
      if (wt === null) return { state: deal(s, nextSeat(s, s.dealer)), delay: 2600 };
      let fin: TcState = { ...s, phase: 'over', over: true, winnerTeam: wt, banner: `🏆 ${teamName(s, wt)} ${s.teams[wt].length > 1 ? 'venceram' : 'venceu'} a partida!` };
      const winners = s.teams[wt];
      const share = Math.floor(s.pot / winners.length);
      winners.forEach((w, i) => {
        const amt = share + (i === 0 ? s.pot - share * winners.length : 0);
        if (amt) fin = coin(fin, w, amt, 'pote do Truco') as TcState;
      });
      return { state: fin, delay: 2600 };
    }
    return null;
  },

  waitingFor: (s) => (s.phase === 'play' ? [s.turn] : s.phase === 'call' && s.pending ? [s.pending.responder] : s.phase === 'onze' && s.onze ? [s.onze.decider] : []),

  bot(s, id) {
    const me = teamOf(s, id);
    if (s.phase === 'onze') {
      const cards = s.teams[me].flatMap((x) => s.hands[x] || []);
      const manilhas = cards.filter((c) => c.r === s.manilha).length;
      const strong = cards.filter((c) => power(c, s.manilha) >= 8).length;
      return { type: 'onze', play: manilhas >= 1 || strong >= 2 || Math.random() < 0.15 };
    }
    if (s.phase === 'call') {
      const p = handEval(s, id);
      if (p > 0.8 && s.pending!.to < TC_TARGET && Math.random() < 0.5) return { type: 'raise' };
      if (p > 0.42 || Math.random() < 0.12) return { type: 'accept' };
      return { type: 'run' };
    }
    if (!s.noTruco && s.value < TC_TARGET && s.raisedBy !== me) {
      const p = handEval(s, id);
      const chance = p > 0.85 ? 0.45 : p > 0.7 ? 0.14 : 0.025; // às vezes blefa
      if (Math.random() < chance) return { type: 'truco' };
    }
    return { type: 'play', ...pickCard(s, id) };
  },

  view(s, viewer) {
    const counts = Object.fromEntries(Object.entries(s.hands).map(([id, h]) => [id, h.length]));
    const mine = viewer ? s.hands[viewer] || [] : [];
    const own: TcCard[] = s.ferro ? mine.map((_, i) => ({ id: `b${i}`, r: '4', s: '♦', blind: true })) : mine;
    let partnerHand: TcCard[] | undefined;
    if (s.phase === 'onze' && s.onze && viewer && teamOf(s, viewer) === s.onze.team) {
      const partner = s.teams[s.onze.team].find((x) => x !== viewer);
      if (partner) partnerHand = s.hands[partner];
    }
    return {
      ...s, counts, partnerHand,
      hands: viewer ? { [viewer]: own } : {},
      trick: s.trick.map((p) => (p.covered ? { ...p, card: null } : p)),
    };
  },

  joinable: false,
  refund: (s) => {
    if (s.over || !s.pot) return s;
    let n: TcState = s;
    for (const seat of s.seats) {
      const back = s.paid[seat.id] || 0;
      if (back) n = coin(n, seat.id, back, 'aposta devolvida') as TcState;
    }
    return { ...n, pot: 0, over: true, banner: 'Partida interrompida — apostas devolvidas.' };
  },
};
