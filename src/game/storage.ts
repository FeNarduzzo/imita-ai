import { newPlayer, type Player, type Settings } from './model';
import { BUILTIN_ID } from '../audio/library';

const K = { settings: 'imita.settings.v1', players: 'imita.players.v1', recent: 'imita.recent.v1' };

export const DEFAULT_SETTINGS: Settings = {
  rounds: 5,
  packIds: [BUILTIN_ID],
  mode: 'classic',
  source: 'packs',
  difficulty: 'normal',
  wheel: true,
  along: false,
  order: 'fixed',
  mystery: true,
  listens: 2,
  sfx: 0.7,
  micGain: 1,
};

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sem armazenamento */ }
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(K.settings);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
export const saveSettings = (s: Settings) => write(K.settings, s);

export function loadPlayers(): Player[] {
  const p = read<Player[]>(K.players);
  if (p && Array.isArray(p) && p.length) return p;
  const a = newPlayer([], 'Jogador 1');
  return [a, newPlayer([a], 'Jogador 2')];
}
export const savePlayers = (p: Player[]) => write(K.players, p);

export function loadRecent(): string[] { return read<string[]>(K.recent) || []; }
export function pushRecent(ids: string[]) {
  const r = [...ids, ...loadRecent().filter((x) => !ids.includes(x))].slice(0, 120);
  write(K.recent, r);
}
