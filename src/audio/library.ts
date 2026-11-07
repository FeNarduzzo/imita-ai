// Pacotes de som: nativo (gerado por código), da comunidade (public/packs) e "Meus sons" (IndexedDB).
import { SYNTHS, renderSynth, SYN_SR } from './synth';
import { decodeData, decodeUrl, mono, toBuffer } from './engine';
import { registerTarget } from './scorer';

export type PackKind = 'builtin' | 'community' | 'custom' | 'imported';

export type SoundSrc =
  | { kind: 'file'; url: string }
  | { kind: 'synth'; synth: string }
  | { kind: 'custom'; key: string }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'temp'; samples: Float32Array; sr: number };

export interface SoundInfo {
  id: string;
  name: string;
  packId: string;
  image?: string | null;
  emoji?: string;
  duration?: number;
  src: SoundSrc;
}

export interface PackInfo {
  id: string;
  name: string;
  author: string;
  cover?: string | null;
  emoji?: string;
  kind: PackKind;
  sounds: SoundInfo[];
}

export const BUILTIN_ID = 'imita-ai';
export const CUSTOM_ID = 'meus-sons';
let objectUrls: string[] = [];

export async function loadPacks(): Promise<PackInfo[]> {
  const builtin: PackInfo = {
    id: BUILTIN_ID,
    name: 'Sons do Imita Aí',
    author: 'Imita Aí',
    emoji: '🎛️',
    kind: 'builtin',
    sounds: SYNTHS.map((s) => ({ id: `${BUILTIN_ID}/${s.id}`, name: s.name, packId: BUILTIN_ID, emoji: s.emoji, src: { kind: 'synth', synth: s.id } })),
  };
  const packs: PackInfo[] = [builtin];
  try {
    const res = await fetch('packs/index.json');
    if (res.ok) {
      const j = await res.json();
      for (const p of j.packs || []) {
        packs.push({
          id: p.id,
          name: p.name,
          author: p.author,
          cover: p.cover,
          kind: 'community',
          sounds: (p.sounds || []).map((s: { id: string; name: string; file: string; image?: string | null; duration?: number }) => ({
            id: s.id, name: s.name, packId: p.id, image: s.image, duration: s.duration, src: { kind: 'file', url: s.file },
          })),
        });
      }
    }
  } catch {
    /* sem pacotes da comunidade */
  }
  const imported = await listImported().catch(() => [] as ImportedPack[]);
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls = [];
  const url = (b?: Blob | null) => {
    if (!b) return null;
    const u = URL.createObjectURL(b);
    objectUrls.push(u);
    return u;
  };
  for (const p of imported) {
    packs.push({
      id: p.id,
      name: p.name,
      author: p.author || 'importado',
      cover: url(p.cover),
      emoji: '📦',
      kind: 'imported',
      sounds: p.sounds.map((snd) => ({ id: `${p.id}/${snd.id}`, name: snd.name, packId: p.id, image: url(snd.image), emoji: '🔊', duration: snd.duration, src: { kind: 'blob', blob: snd.audio } })),
    });
  }
  const custom = await listCustom().catch(() => []);
  if (custom.length) {
    packs.push({
      id: CUSTOM_ID,
      name: 'Meus sons',
      author: 'Gravados aqui',
      emoji: '🎙️',
      kind: 'custom',
      sounds: custom.map((c) => ({ id: `${CUSTOM_ID}/${c.id}`, name: c.name, packId: CUSTOM_ID, emoji: '🎙️', duration: c.samples.length / c.sr, src: { kind: 'custom', key: c.id } })),
    });
  }
  return packs;
}

// ---------------------------------------------------------------- carregar e analisar

export interface LoadedSound { info: SoundInfo; buffer: AudioBuffer }
const cache = new Map<string, Promise<LoadedSound>>();

async function bufferFor(info: SoundInfo): Promise<AudioBuffer> {
  const src = info.src;
  switch (src.kind) {
    case 'file': return decodeUrl(src.url);
    case 'synth': return toBuffer(renderSynth(src.synth)!, SYN_SR);
    case 'temp': return toBuffer(src.samples, src.sr);
    case 'blob': return decodeData(await src.blob.arrayBuffer());
    case 'custom': {
      const rec = await getCustom(src.key);
      if (!rec) throw new Error('Som não encontrado');
      return toBuffer(rec.samples, rec.sr);
    }
  }
}

/** Carrega o áudio e manda o worker analisar (resultado em cache por id). */
export function loadSound(info: SoundInfo): Promise<LoadedSound> {
  let p = cache.get(info.id);
  if (!p) {
    p = (async () => {
      const buffer = await bufferFor(info);
      await registerTarget(info.id, mono(buffer), buffer.sampleRate);
      return { info, buffer };
    })();
    p.catch(() => cache.delete(info.id));
    cache.set(info.id, p);
  }
  return p;
}

/** Só o áudio, para pré-escutar sem analisar. */
const previewCache = new Map<string, Promise<AudioBuffer>>();
export function loadPreview(info: SoundInfo): Promise<AudioBuffer> {
  let p = previewCache.get(info.id);
  if (!p) {
    p = bufferFor(info);
    p.catch(() => previewCache.delete(info.id));
    previewCache.set(info.id, p);
  }
  return p;
}

// ---------------------------------------------------------------- Meus sons (IndexedDB)

export interface CustomRec { id: string; name: string; createdAt: number; sr: number; samples: Float32Array; by?: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Sem armazenamento'));
    const req = indexedDB.open('imita-ai', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sounds')) db.createObjectStore('sounds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = 'sounds'): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listCustom(): Promise<CustomRec[]> {
  const all = await tx<CustomRec[]>('readonly', (s) => s.getAll() as IDBRequest<CustomRec[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export const getCustom = (id: string) => tx<CustomRec | undefined>('readonly', (s) => s.get(id) as IDBRequest<CustomRec | undefined>);
export const saveCustom = (rec: CustomRec) => tx('readwrite', (s) => s.put(rec));
export const deleteCustom = (id: string) => tx('readwrite', (s) => s.delete(id));

// ---------------------------------------------------------------- pacotes importados no aparelho

export interface ImportedSound { id: string; name: string; audio: Blob; image?: Blob | null; duration?: number }
export interface ImportedPack { id: string; name: string; author?: string; cover?: Blob | null; createdAt: number; sounds: ImportedSound[] }

export async function listImported(): Promise<ImportedPack[]> {
  const all = await tx<ImportedPack[]>('readonly', (s) => s.getAll() as IDBRequest<ImportedPack[]>, 'packs');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
export const deleteImported = (id: string) => tx('readwrite', (s) => s.delete(id), 'packs');
const putImported = (p: ImportedPack) => tx('readwrite', (s) => s.put(p), 'packs');

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};
const ext = (n: string) => (n.split('.').pop() || '').toLowerCase();
const isAudio = (n: string) => !!MIME[ext(n)]?.startsWith('audio/');
const baseName = (n: string) => (n.split('/').pop() || n).replace(/\.[^.]+$/, '');
const prettyName = (n: string) => {
  const t = baseName(n).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Som';
};
const rid = () => Math.random().toString(36).slice(2, 9);

type Files = Map<string, Uint8Array>;
const blobOf = (files: Files, name: string | null | undefined): Blob | null => {
  if (!name) return null;
  const data = files.get(name);
  return data ? new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[ext(name)] || 'application/octet-stream' }) : null;
};

interface DraftSound { name: string; audio: Blob | null; image?: Blob | null }
interface Draft { name: string; author?: string; cover?: Blob | null; sounds: DraftSound[] }

function draftsFromZip(files: Files, zipName: string): Draft[] {
  const names = [...files.keys()];
  const drafts: Draft[] = [];
  // 1) Formato exportado pelo Imita Aí (packs/index.json)
  const indexName = names.find((n) => /(^|\/)index\.json$/.test(n));
  if (indexName) {
    const root = indexName.slice(0, indexName.length - 'index.json'.length).replace(/packs\/$/, '');
    const idx = JSON.parse(new TextDecoder().decode(files.get(indexName)));
    const find = (f?: string | null) => (f ? (files.has(root + f) ? root + f : names.find((n) => n.endsWith(f)) || null) : null);
    for (const p of idx.packs || []) {
      const sounds: DraftSound[] = (p.sounds || []).map((x: { name: string; file: string; image?: string }) => ({ name: x.name, audio: blobOf(files, find(x.file)), image: blobOf(files, find(x.image)) }));
      if (sounds.some((x) => x.audio)) drafts.push({ name: p.name, author: p.author, cover: blobOf(files, find(p.cover)), sounds });
    }
    if (drafts.length) return drafts;
  }
  // 2) Formato da Oficina: pastas com theme.json
  for (const t of names.filter((n) => /(^|\/)theme\.json$/.test(n))) {
    const dir = t.slice(0, t.length - 'theme.json'.length);
    const theme = JSON.parse(new TextDecoder().decode(files.get(t)).replace(/^﻿/, ''));
    const sounds: DraftSound[] = (theme.sounds || []).map((x: { name?: string; file: string; image?: string }) => ({
      name: (x.name || prettyName(x.file)).trim(), audio: blobOf(files, dir + x.file), image: blobOf(files, x.image ? dir + x.image : null),
    }));
    if (sounds.some((x) => x.audio)) drafts.push({ name: String(theme.name || baseName(dir.replace(/\/$/, '')) || 'Pacote').trim(), author: theme.author, cover: blobOf(files, theme.defaultImage ? dir + theme.defaultImage : null), sounds });
  }
  if (drafts.length) return drafts;
  // 3) Zip só com áudios
  const audios = names.filter(isAudio);
  if (audios.length) drafts.push({ name: prettyName(zipName), sounds: audios.map((n) => ({ name: prettyName(n), audio: blobOf(files, n) })) });
  return drafts;
}

export interface ImportResult { packs: number; sounds: number; skipped: number; ids: string[] }

/** Importa .zip (pacotes) ou arquivos de áudio soltos para o armazenamento do aparelho. */
export async function importFiles(list: File[], onProgress?: (msg: string) => void): Promise<ImportResult> {
  const { unzipSync } = await import('fflate');
  const drafts: Draft[] = [];
  const loose: File[] = [];
  for (const f of list) {
    if (ext(f.name) === 'zip') {
      onProgress?.(`Abrindo ${f.name}…`);
      const raw = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => !e.name.startsWith('__MACOSX/') && !e.name.endsWith('/') });
      drafts.push(...draftsFromZip(new Map(Object.entries(raw)), f.name));
    } else if (isAudio(f.name) || f.type.startsWith('audio/')) loose.push(f);
  }
  if (loose.length) {
    drafts.push({ name: `Importados ${new Date().toLocaleDateString('pt-BR')}`, sounds: loose.map((f) => ({ name: prettyName(f.name), audio: f })) });
  }
  const existing = await listImported().catch(() => [] as ImportedPack[]);
  const res: ImportResult = { packs: 0, sounds: 0, skipped: 0, ids: [] };
  for (const d of drafts) {
    const ok: ImportedSound[] = [];
    for (let i = 0; i < d.sounds.length; i++) {
      onProgress?.(`${d.name}: ${i + 1}/${d.sounds.length}`);
      const snd = d.sounds[i];
      if (!snd.audio) { res.skipped++; continue; }
      try {
        const buf = await decodeData(await snd.audio.arrayBuffer());
        if (buf.duration < 0.2) throw new Error('curto demais');
        ok.push({ id: rid(), name: snd.name.slice(0, 60), audio: snd.audio, image: snd.image || null, duration: Math.round(buf.duration * 100) / 100 });
      } catch {
        res.skipped++;
      }
    }
    if (!ok.length) continue;
    const old = existing.find((p) => p.name === d.name);
    const id = old?.id || `imp-${rid()}`;
    await putImported({ id, name: d.name, author: d.author, cover: d.cover || null, createdAt: Date.now(), sounds: ok });
    res.packs++;
    res.sounds += ok.length;
    res.ids.push(id);
  }
  return res;
}
