import type { Difficulty, ScoreResult } from './analysis';

const worker = new Worker(new URL('./scorer.worker.ts', import.meta.url), { type: 'module' });
const pendingTargets = new Map<string, { resolve: () => void; reject: (e: Error) => void }[]>();
const ready = new Set<string>();
const pendingScores = new Map<number, { resolve: (r: ScoreResult) => void; reject: (e: Error) => void }>();
let nextId = 1;

worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'target') {
    ready.add(m.id);
    pendingTargets.get(m.id)?.forEach((p) => p.resolve());
    pendingTargets.delete(m.id);
  } else if (m.type === 'scored') {
    if (import.meta.env.DEV) console.debug('[nota]', m.ms + 'ms', m.result);
    pendingScores.get(m.reqId)?.resolve(m.result);
    pendingScores.delete(m.reqId);
  } else if (m.type === 'error') {
    const err = new Error(m.message);
    if (m.reqId) { pendingScores.get(m.reqId)?.reject(err); pendingScores.delete(m.reqId); }
    if (m.id) { pendingTargets.get(m.id)?.forEach((p) => p.reject(err)); pendingTargets.delete(m.id); }
  }
};

/** Envia um som original para o worker analisar (uma vez por id). */
export function registerTarget(id: string, samples: Float32Array, sr: number): Promise<void> {
  if (ready.has(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const list = pendingTargets.get(id);
    if (list) { list.push({ resolve, reject }); return; }
    pendingTargets.set(id, [{ resolve, reject }]);
    worker.postMessage({ type: 'target', id, samples, sr });
  });
}

export function isRegistered(id: string) { return ready.has(id); }

export function scoreAttempt(targetId: string, anchorIds: string[], samples: Float32Array, sr: number, difficulty: Difficulty): Promise<ScoreResult> {
  const reqId = nextId++;
  return new Promise((resolve, reject) => {
    pendingScores.set(reqId, { resolve, reject });
    worker.postMessage({ type: 'score', reqId, targetId, anchorIds, samples, sr, difficulty });
  });
}
