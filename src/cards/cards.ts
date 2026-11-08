// Baralho comum (francês): usado no Blackjack, Poker e Truco.
export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export interface Card { r: Rank; s: Suit; id: string }

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (s: Suit) => s === '♥' || s === '♦';
export const SUIT_NAMES: Record<Suit, string> = { '♠': 'espadas', '♥': 'copas', '♦': 'ouros', '♣': 'paus' };
export const RANK_NAMES: Record<Rank, string> = {
  A: 'Ás', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10', J: 'Valete', Q: 'Dama', K: 'Rei',
};
export const cardName = (c: Card) => `${RANK_NAMES[c.r]} de ${SUIT_NAMES[c.s]}`;

/** Número aleatório seguro (o embaralhamento não deve ser previsível). */
function rand(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `decks` baralhos de 52 cartas (ou só as cartas de `ranks`), embaralhados. */
export function makeDeck(decks = 1, ranks: Rank[] = RANKS): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of ranks) out.push({ r, s, id: `${d}${r}${s}` });
  return shuffle(out);
}
