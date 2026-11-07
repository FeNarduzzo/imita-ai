import type { Difficulty, ScoreResult } from '../audio/analysis';
import type { EffectId } from '../audio/synth';
import type { SoundInfo } from '../audio/library';

export type Mode = 'classic' | 'teams';
export type Source = 'packs' | 'mixed' | 'players';

export interface Settings {
  rounds: number;
  packIds: string[];
  mode: Mode;
  source: Source;
  difficulty: Difficulty;
  wheel: boolean;
  along: boolean;
  order: 'fixed' | 'random';
  mystery: boolean;
  listens: number;
  sfx: number;
  micGain: number;
}

export interface Player { id: string; name: string; emoji: string; color: string; team: 0 | 1 }

export type SlotId = EffectId | 'troca' | 'bonus' | 'mult';
export interface Slot { id: SlotId; title: string; emoji: string; desc: string; descSolo: string; kind: 'sabotage' | 'swap' | 'bonus' | 'mult'; color: string }

export interface Pending { sabotage?: { effect: EffectId; by: string }; bonus?: number; mult?: number; swapWith?: string }

export interface Take {
  playerId: string;
  samples: Float32Array;
  sr: number;
  score: ScoreResult | null;
  error?: string;
  sabotage?: { effect: EffectId; by: string };
  bonus?: number;
  mult?: number;
  swappedWith?: string;
  points: number;
}

export interface RoundState {
  index: number;
  sound: SoundInfo | null;
  creatorId?: string;
  mystery: boolean;
  order: string[];
  turn: number;
  takes: Record<string, Take>;
  anchorIds: string[];
  revealOrder: string[];
  revealIdx: number;
  spinnerId?: string;
}

export interface RoundSummary { index: number; soundName: string; points: Record<string, number>; winners: string[] }

export interface GameState {
  settings: Settings;
  players: Player[];
  plan: (SoundInfo | null)[]; // null = rodada criada por jogador
  round: RoundState;
  totals: Record<string, number>;
  teamTotals: [number, number];
  pending: Record<string, Pending>;
  streak: Record<string, number>;
  bestStreak: Record<string, number>;
  history: RoundSummary[];
  best: { playerId: string; points: number; soundName: string } | null;
  sabotaged: number;
  takes: number;
}

export type Phase = 'home' | 'draw' | 'create' | 'handoff' | 'listen' | 'record' | 'allDone' | 'reveal' | 'roundEnd' | 'wheel' | 'final';

// ---------------------------------------------------------------- jogadores

export const EMOJIS = ['🦊', '🐸', '🐱', '🐶', '🐼', '🐵', '🦁', '🐷', '🐙', '🦄', '🐔', '🐧', '🐨', '🦖', '🐝', '🦉'];
export const COLORS = ['#ff4f9a', '#ffd23f', '#3de0f5', '#9ef01a', '#ff8a3d', '#b388ff', '#ff5d5d', '#2ee6b6', '#5b8cff', '#ffb4a2', '#c6ff7a', '#ff7ae0'];
export const TEAMS = [
  { name: 'Time Fogo', emoji: '🔥', color: '#ff6b3d' },
  { name: 'Time Gelo', emoji: '❄️', color: '#4fc3ff' },
] as const;

export const MAX_PLAYERS = 12;

export function newPlayer(existing: Player[], name?: string): Player {
  const used = new Set(existing.map((p) => p.color));
  const usedE = new Set(existing.map((p) => p.emoji));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[existing.length % COLORS.length];
  const emoji = EMOJIS.find((e) => !usedE.has(e)) || EMOJIS[existing.length % EMOJIS.length];
  const t0 = existing.filter((p) => p.team === 0).length;
  const t1 = existing.length - t0;
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: (name || `Jogador ${existing.length + 1}`).slice(0, 14),
    emoji,
    color,
    team: t0 <= t1 ? 0 : 1,
  };
}

// ---------------------------------------------------------------- roleta

export const SLOTS: Slot[] = [
  { id: 'estouro', title: 'Estouro', emoji: '💥', kind: 'sabotage', color: '#ff5d5d', desc: 'A próxima imitação da vítima vai chiar de tão alta.', descSolo: 'Sua próxima imitação vai chiar de tão alta.' },
  { id: 'bonus', title: '+15', emoji: '⭐', kind: 'bonus', color: '#ffd23f', desc: 'Sua próxima imitação ganha 15 pontos extras.', descSolo: 'Sua próxima imitação ganha 15 pontos extras.' },
  { id: 'eco', title: 'Eco', emoji: '🏔️', kind: 'sabotage', color: '#5b8cff', desc: 'A próxima imitação da vítima vai se repetir sozinha, como num cânion.', descSolo: 'Sua próxima imitação vai se repetir sozinha.' },
  { id: 'pum', title: 'Pum', emoji: '💨', kind: 'sabotage', color: '#9ef01a', desc: 'Na hora de tocar, a imitação da vítima vira um pum.', descSolo: 'Na hora de tocar, sua imitação vira um pum.' },
  { id: 'esquilo', title: 'Esquilo', emoji: '🐿️', kind: 'sabotage', color: '#ff8a3d', desc: 'A próxima imitação da vítima vai sair fininha e acelerada.', descSolo: 'Sua próxima imitação vai sair fininha e acelerada.' },
  { id: 'troca', title: 'Troca', emoji: '🔄', kind: 'swap', color: '#2ee6b6', desc: 'Escolha alguém: na próxima rodada vocês trocam gravações e notas.', descSolo: '' },
  { id: 'picotado', title: 'Picotado', emoji: '✂️', kind: 'sabotage', color: '#ff7ae0', desc: 'A próxima imitação da vítima vai sair cheia de buracos.', descSolo: 'Sua próxima imitação vai sair cheia de buracos.' },
  { id: 'mult', title: 'x1,5', emoji: '🚀', kind: 'mult', color: '#c6ff7a', desc: 'Sua próxima imitação vale uma vez e meia.', descSolo: 'Sua próxima imitação vale uma vez e meia.' },
  { id: 'interfone', title: 'Interfone', emoji: '📟', kind: 'sabotage', color: '#b388ff', desc: 'A próxima imitação da vítima vai tocar como interfone de prédio.', descSolo: 'Sua próxima imitação vai tocar como interfone.' },
  { id: 'robo', title: 'Robô', emoji: '🤖', kind: 'sabotage', color: '#3de0f5', desc: 'A próxima imitação da vítima ganha voz de robô.', descSolo: 'Sua próxima imitação ganha voz de robô.' },
  { id: 'catedral', title: 'Catedral', emoji: '⛪', kind: 'sabotage', color: '#ffb4a2', desc: 'A próxima imitação da vítima vai ecoar numa igreja gigante.', descSolo: 'Sua próxima imitação vai ecoar numa igreja gigante.' },
  { id: 'sumico', title: 'Sumiço', emoji: '🕳️', kind: 'sabotage', color: '#ff4f9a', desc: 'Um pedaço inteiro da próxima imitação da vítima some.', descSolo: 'Um pedaço inteiro da sua próxima imitação some.' },
];

export const EFFECT_NAMES: Record<EffectId, string> = {
  estouro: 'Estouro', eco: 'Eco', pum: 'Pum', esquilo: 'Esquilo', monstro: 'Monstro', picotado: 'Picotado',
  interfone: 'Interfone', tremelique: 'Tremelique', robo: 'Robô', catedral: 'Catedral', sumico: 'Sumiço',
};

// ---------------------------------------------------------------- utilidades

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function pointsFor(t: Take): number {
  if (!t.score) return 0;
  let base = t.score.total;
  if (t.sabotage) base = Math.round(base / 2);
  return Math.round(base * (t.mult ?? 1)) + (t.bonus ?? 0);
}

export function ratingLabel(score: number): { text: string; emoji: string } {
  if (score >= 90) return { text: 'Lendário!', emoji: '🏆' };
  if (score >= 75) return { text: 'Mandou muito!', emoji: '🔥' };
  if (score >= 60) return { text: 'Bem parecido!', emoji: '😎' };
  if (score >= 45) return { text: 'Chegou perto', emoji: '👀' };
  if (score >= 30) return { text: 'Hmm… mais ou menos', emoji: '🤔' };
  if (score >= 15) return { text: 'Isso foi um espirro?', emoji: '🤧' };
  return { text: 'Nada a ver!', emoji: '🙈' };
}
