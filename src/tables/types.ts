// Base comum das mesas de jogo (Blackjack, Duvido, Truco, Poker).
// Cada jogo é um "módulo" com regras puras; a mesa (offline ou online) roda o módulo,
// controla bots e manda para cada jogador só o que ele pode ver.
import type { Look } from '../game/character';

export type GameId = 'blackjack' | 'duvido' | 'truco' | 'poker' | 'tranca';

export interface SeatInfo {
  id: string;
  name: string;
  color: string;
  look?: Look;
  bot: boolean;
  /** Moedas disponíveis para apostar (carteira do jogador; bots têm banca própria). */
  bank: number;
}

export interface CoinEvent { id: number; seatId: string; delta: number; reason: string }

export type ConfigField =
  | { key: string; label: string; type: 'select'; options: { v: string | number; t: string }[]; hint?: string }
  | { key: string; label: string; type: 'toggle'; hint?: string };

export type Config = Record<string, string | number | boolean>;

/** Estado mínimo que toda mesa tem. */
export interface BaseState {
  seats: SeatInfo[];
  coinEvents: CoinEvent[];
  over: boolean;
  /** Mensagem curta para todos (ex.: "Ana pediu carta"). */
  banner: string | null;
  /** No fim da partida: quanto cada um levou do pote, a taxa da casa e o prêmio da vitória. */
  payout?: Payout | null;
}

// ---------------------------------------------------------------- economia das mesas
// Taxa da casa: 5% do que os vencedores levam do pote (arredonda para cima). Serve para que
// ninguém use as mesas para passar moedas de uma conta para outra de graça.
// Prêmio da vitória: moedas novas que o jogo dá a quem vence (pessoas, não bots), pequeno contra
// bots e o triplo quando há pelo menos uma pessoa de verdade do outro lado.
export const HOUSE_FEE = 0.05;
export const HUMAN_PRIZE_MULT = 3;
export const houseFee = (amount: number) => (amount > 0 ? Math.ceil(amount * HOUSE_FEE) : 0);

export interface Payout {
  /** Pote total antes da taxa. */
  pot: number;
  /** Taxa total que a casa ficou. */
  fee: number;
  /** Taxa de cada um (Poker: sobre o lucro de cada jogador). */
  feeBy: Record<string, number>;
  /** Quanto cada vencedor levou do pote, já sem a taxa. */
  share: Record<string, number>;
  /** Prêmio da vitória de cada vencedor. */
  prize: Record<string, number>;
}

/** Dá o prêmio da vitória aos vencedores que são pessoas (×3 se havia pessoa do outro lado). */
export function givePrize<S extends BaseState>(s: S, winners: string[], base: number, what: string): { s: S; prize: Record<string, number> } {
  let n: BaseState = s;
  const prize: Record<string, number> = {};
  const humanRival = s.seats.some((x) => !winners.includes(x.id) && !x.bot);
  for (const w of winners) {
    const seat = s.seats.find((x) => x.id === w);
    if (!seat || seat.bot || base <= 0) continue;
    const p = base * (humanRival ? HUMAN_PRIZE_MULT : 1);
    n = coin(n, w, p, `prêmio da vitória ${what}`);
    prize[w] = p;
  }
  return { s: n as S, prize };
}

/** Paga o pote aos vencedores (menos a taxa da casa, dividido igualmente) e dá o prêmio da vitória. */
export function payWinners<S extends BaseState>(s: S, winners: string[], pot: number, prizeBase: number, what: string): S {
  const fee = houseFee(pot);
  const net = pot - fee;
  const each = winners.length ? Math.floor(net / winners.length) : 0;
  let n: BaseState = s;
  const share: Record<string, number> = {};
  const feeBy: Record<string, number> = {};
  const feeEach = winners.length ? Math.floor(fee / winners.length) : 0;
  winners.forEach((w, i) => {
    const amt = each + (i === 0 ? net - each * winners.length : 0);
    share[w] = amt;
    feeBy[w] = feeEach + (i === 0 ? fee - feeEach * winners.length : 0);
    if (amt) n = coin(n, w, amt, `pote ${what}`);
  });
  const g = givePrize(n as S, winners, prizeBase, what);
  return { ...g.s, payout: { pot, fee, feeBy, share, prize: g.prize } };
}

export interface GameModule<S extends BaseState = BaseState, A = unknown, V = unknown> {
  id: GameId;
  title: string;
  emoji: string;
  minSeats: number;
  maxSeats: number;
  defaultConfig: Config;
  configFields: ConfigField[];
  init(config: Config, seats: SeatInfo[]): S;
  /** Aplica uma ação de um jogador. Retorna o novo estado ou um erro. */
  act(state: S, seatId: string, action: A): S | { error: string };
  /** Passos automáticos (dealer, fim de rodada…). Retorna o próximo estado e a espera em ms, ou null. */
  auto(state: S): { state: S; delay: number } | null;
  /** Quem precisa jogar agora. */
  waitingFor(state: S): string[];
  /** Jogada do bot. */
  bot(state: S, seatId: string): A | null;
  /** O que `seatId` pode ver (esconde as cartas dos outros). */
  view(state: S, seatId: string | null): V;
  /** Dá para entrar com a partida em andamento? (no Truco, não) */
  joinable: boolean;
  /** É um intervalo entre rodadas (dá para sentar gente nova)? */
  canAdmit?(state: S): boolean;
  addSeat?(state: S, seat: SeatInfo): S;
  removeSeat?(state: S, seatId: string): S;
  /** Número de lugares aceito? (ex.: Truco só 2 ou 4). Retorna a mensagem de erro, ou null. */
  seatCheck?(n: number): string | null;
  /** Etiqueta do lugar na sala de espera (ex.: "Dupla 1"). Com etiqueta, o líder pode trocar a ordem. */
  seatTag?(index: number, n: number): string | null;
  /** Partida interrompida no meio (líder voltou à sala ou fechou a mesa): devolve as apostas em jogo. */
  refund?(state: S): S;
}

export const isError = (x: unknown): x is { error: string } => !!x && typeof x === 'object' && 'error' in (x as object);

let evtSeq = Date.now();
export function coin(state: BaseState, seatId: string, delta: number, reason: string): BaseState {
  if (!delta) return state;
  return {
    ...state,
    seats: state.seats.map((s) => (s.id === seatId ? { ...s, bank: s.bank + delta } : s)),
    coinEvents: [...state.coinEvents.slice(-60), { id: ++evtSeq, seatId, delta, reason }],
  };
}

export const BOT_NAMES = ['Bia', 'Léo', 'Duda', 'Caio', 'Malu', 'Téo', 'Juju', 'Davi'];
