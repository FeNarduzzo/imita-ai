// Worker de análise: guarda as características dos sons originais e dá as notas.
import { analyze, compare, resample, type Difficulty, type Features } from './analysis';

const targets = new Map<string, Features>();

type Msg =
  | { type: 'target'; id: string; samples: Float32Array; sr: number }
  | { type: 'score'; reqId: number; targetId: string; anchorIds: string[]; samples: Float32Array; sr: number; difficulty: Difficulty };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'target') {
      if (!targets.has(m.id)) targets.set(m.id, analyze(resample(m.samples, m.sr)));
      self.postMessage({ type: 'target', id: m.id });
    } else {
      const t = targets.get(m.targetId);
      if (!t) throw new Error('Som original não carregado');
      const t0 = performance.now();
      const a = analyze(resample(m.samples, m.sr), true);
      const anchors = m.anchorIds.map((id) => targets.get(id)).filter((x): x is Features => !!x && x !== t);
      const result = compare(t, a, m.difficulty, anchors);
      self.postMessage({ type: 'scored', reqId: m.reqId, result, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', reqId: (m as { reqId?: number }).reqId, id: (m as { id?: string }).id, message: (err as Error).message });
  }
};
