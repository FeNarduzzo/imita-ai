// Níveis e XP. A conta oficial é feita no servidor (Supabase: level_for/title_for);
// aqui fica a mesma fórmula, só para desenhar barras e títulos na tela.

export type XpCategory = 'imitacao' | 'karaoke' | 'cartas' | 'social';

export const XP_CATEGORIES: { id: XpCategory; label: string; emoji: string; hint: string }[] = [
  { id: 'imitacao', label: 'Imitação', emoji: '🎤', hint: 'Partidas de imitar sons' },
  { id: 'karaoke', label: 'Karaokê', emoji: '🎶', hint: 'Cantar no palco' },
  { id: 'cartas', label: 'Cartas', emoji: '🃏', hint: 'Blackjack, Duvido, Truco…' },
  { id: 'social', label: 'Social', emoji: '🤝', hint: 'Jogar online com gente de verdade' },
];

/** XP(L) = k·L·(L−1). Categoria: k = 50 (nível 50 = 122.500 XP). Geral (soma de tudo): k = 120. */
export const CAT_K = 50;
export const TOTAL_K = 120;
export const MAX_LEVEL = 50;

export const xpForLevel = (level: number, k: number) => k * level * (level - 1);
export const levelFor = (xp: number, k: number) =>
  Math.min(MAX_LEVEL, Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / k)) / 2)));

export interface Title { min: number; name: string; emoji: string; color: string }
export const TITLES: Title[] = [
  { min: 1, name: 'Noob', emoji: '🐣', color: '#9aa4b8' },
  { min: 6, name: 'Aprendiz', emoji: '🌱', color: '#7cd992' },
  { min: 11, name: 'Amador', emoji: '🎈', color: '#4fd1ff' },
  { min: 16, name: 'Talento', emoji: '⭐', color: '#ffd23f' },
  { min: 21, name: 'Profissa', emoji: '🎯', color: '#ff8a3d' },
  { min: 31, name: 'Estrela', emoji: '🌟', color: '#ff5fa2' },
  { min: 41, name: 'Lenda', emoji: '👑', color: '#b07cff' },
  { min: 50, name: 'Mito', emoji: '🐐', color: '#ff4d4d' },
];
export const titleFor = (level: number): Title => [...TITLES].reverse().find((t) => level >= t.min) || TITLES[0];

/** Onde a pessoa está dentro do nível atual (para a barrinha). */
export function progress(xp: number, k: number) {
  const level = levelFor(xp, k);
  const cur = xpForLevel(level, k);
  const next = level >= MAX_LEVEL ? cur : xpForLevel(level + 1, k);
  const pct = level >= MAX_LEVEL ? 1 : (xp - cur) / Math.max(1, next - cur);
  return { level, title: titleFor(level), xpInLevel: xp - cur, xpToNext: Math.max(0, next - xp), pct: Math.max(0, Math.min(1, pct)) };
}

/** Moedas que o servidor paga ao subir para `level` (o nível geral). */
export const levelUpCoins = (level: number) => 10 * level + (TITLES.some((t) => t.min === level && level > 1) ? 100 : 0);

/**
 * XP por partida (o servidor limita a 200 por partida e 1.500 por dia em cada categoria,
 * e dá +50 na primeira vitória do dia).
 */
export const XP_RULES = {
  imitacao: { play: 20, perPlace: [40, 25, 15] as number[] },
  karaoke: { play: 20, perPlace: [40, 25, 15] as number[] },
  cartas: { play: 15, win: 20 },
  social: { onlineMatch: 10, hostBonus: 5 },
};
