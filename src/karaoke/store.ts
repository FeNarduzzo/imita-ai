// Músicas do karaokê: ficam só neste aparelho (IndexedDB). O jogo não traz nenhuma música:
// cada pessoa importa os próprios arquivos (e, se quiser, cola a letra).

export const STYLES = [
  { id: 'pop', name: 'Pop', emoji: '🎤' },
  { id: 'sertanejo', name: 'Sertanejo', emoji: '🤠' },
  { id: 'funk', name: 'Funk', emoji: '🔊' },
  { id: 'rock', name: 'Rock', emoji: '🎸' },
  { id: 'forro', name: 'Forró', emoji: '🪗' },
  { id: 'pagode', name: 'Pagode/Samba', emoji: '🥁' },
  { id: 'rap', name: 'Rap/Trap', emoji: '🎧' },
  { id: 'mpb', name: 'MPB', emoji: '🌴' },
  { id: 'gospel', name: 'Gospel', emoji: '🙏' },
  { id: 'outro', name: 'Outro', emoji: '🎶' },
] as const;
export type StyleId = (typeof STYLES)[number]['id'];
export const styleOf = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[STYLES.length - 1];

/** Linha da melodia: um tom (MIDI) a cada `hop` segundos; NaN = sem voz naquele instante. */
export interface Melody { hop: number; midi: Float32Array }

export interface Song {
  id: string;
  title: string;
  artist: string;
  style: StyleId;
  createdAt: number;
  duration: number;
  /** O arquivo original, do jeito que veio. */
  audio: Blob;
  /** Letra colada ou de um arquivo .lrc/.txt (opcional). */
  lyrics: string;
  melody: Melody | null;
  /** false = música em mono: não dá para tirar a voz. */
  stereo: boolean;
  /** Melhor nota de cada cantor nesta música. */
  best: Record<string, number>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Este aparelho não consegue guardar músicas.'));
    const req = indexedDB.open('imita-ai-karaoke', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('songs')) req.result.createObjectStore('songs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction('songs', mode).objectStore('songs'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listSongs(): Promise<Song[]> {
  const all = await tx<Song[]>('readonly', (s) => s.getAll() as IDBRequest<Song[]>);
  return all.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}
export const getSong = (id: string) => tx<Song | undefined>('readonly', (s) => s.get(id) as IDBRequest<Song | undefined>);
export const saveSong = (song: Song) => tx('readwrite', (s) => s.put(song));
export const deleteSong = (id: string) => tx('readwrite', (s) => s.delete(id));

// ---------------------------------------------------------------- letra

export interface LyricLine { t: number | null; text: string }

/**
 * Lê a letra. Formato .lrc ("[01:23.45] texto") vira linhas com tempo; texto comum vira
 * linhas sem tempo (a tela distribui pelo tamanho da música).
 */
export function parseLyrics(raw: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    if (tags.length) {
      for (const m of tags) out.push({ t: Number(m[1]) * 60 + Number(m[2].replace(',', '.')), text });
    } else if (text && !/^\[[a-z]+:/i.test(line)) {
      out.push({ t: null, text });
    }
  }
  const timed = out.filter((l) => l.t != null);
  return timed.length ? timed.sort((a, b) => a.t! - b.t!) : out;
}

/** Linha atual da letra (e a próxima) no tempo `t`. Letra sem tempo é espalhada pela música. */
export function lyricAt(lines: LyricLine[], t: number, duration: number): { now: string; next: string } {
  if (!lines.length) return { now: '', next: '' };
  if (lines[0].t == null) {
    const per = duration / lines.length;
    const i = Math.min(lines.length - 1, Math.max(0, Math.floor(t / per)));
    return { now: lines[i].text, next: lines[i + 1]?.text ?? '' };
  }
  let i = -1;
  for (let k = 0; k < lines.length; k++) if ((lines[k].t ?? 0) <= t) i = k;
  return { now: i >= 0 ? lines[i].text : '', next: lines[i + 1]?.text ?? '' };
}
