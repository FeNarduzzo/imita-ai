import { Blackjack } from './blackjack';
import { Duvido } from './duvido';
import { Poker } from './poker';
import { Tranca } from './tranca';
import { Truco } from './truco';
import type { GameId, GameModule } from './types';

/** Jogos de mesa disponíveis. */
export const MODULES: Partial<Record<GameId, GameModule<any, any, any>>> & Record<'blackjack', GameModule<any, any, any>> = {
  blackjack: Blackjack,
  duvido: Duvido,
  truco: Truco,
  poker: Poker,
  tranca: Tranca,
};

export const AVAILABLE: GameId[] = Object.keys(MODULES) as GameId[];
