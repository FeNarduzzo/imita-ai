// Base comum das mesas de jogo (Blackjack, Duvido, Truco, Poker).
// Cada jogo é um "módulo" com regras puras; a mesa (offline ou online) roda o módulo,
// controla bots e manda para cada jogador só o que ele pode ver.
import type { Look } from '../game/character';

export type GameId = 'blackjack' | 'duvido' | 'truco' | 'poker';

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
