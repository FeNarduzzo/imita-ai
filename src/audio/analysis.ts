// Análise de áudio pura (sem DOM/Web Audio): roda no navegador e no Node.
// Compara uma imitação com o som original em três eixos:
//   conteúdo  – timbre/fonemas via MFCC alinhados por DTW
//   tom       – contorno melódico (YIN), tolerante a oitava e tonalidade
//   ritmo     – envelope de volume e duração

export const SR = 16000;
const WIN = 400; // 25 ms
const NFFT = 512;
const HOP = 160; // 10 ms
export const FRAME_SEC = HOP / SR;
const NMEL = 26;
const NCEP = 13;
const MAX_FRAMES = 1000; // 10 s

export type Difficulty = 'easy' | 'normal' | 'hard';

// ---------------------------------------------------------------- resample

export function resample(x: Float32Array, from: number, to = SR): Float32Array {
  if (from === to) return x.slice();
  const ratio = to / from;
  const outLen = Math.max(1, Math.floor(x.length * ratio));
  const out = new Float32Array(outLen);
  const fc = Math.min(1, ratio) * 0.92;
  const half = Math.ceil(10 / fc);
  for (let n = 0; n < outLen; n++) {
    const t = n / ratio;
    const k0 = Math.floor(t);
    let acc = 0;
    let wsum = 0;
    const lo = Math.max(0, k0 - half + 1);
    const hi = Math.min(x.length - 1, k0 + half);
    for (let k = lo; k <= hi; k++) {
      const d = t - k;
      const arg = Math.PI * fc * d;
      const sinc = Math.abs(d) < 1e-9 ? 1 : Math.sin(arg) / arg;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / half);
      const h = sinc * w;
      acc += x[k] * h;
      wsum += h;
    }
    out[n] = wsum !== 0 ? acc / wsum : 0;
  }
  return out;
}

// ---------------------------------------------------------------- tables

const hamming = new Float32Array(WIN);
for (let i = 0; i < WIN; i++) hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1));

const rev = new Uint16Array(NFFT);
{
  const bits = Math.log2(NFFT);
  for (let i = 0; i < NFFT; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
}
const twCos = new Float32Array(NFFT / 2);
const twSin = new Float32Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) {
  twCos[i] = Math.cos((-2 * Math.PI * i) / NFFT);
  twSin[i] = Math.sin((-2 * Math.PI * i) / NFFT);
}

function fft(re: Float32Array, im: Float32Array) {
  for (let i = 0; i < NFFT; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const halfSize = size >> 1;
    const step = NFFT / size;
    for (let start = 0; start < NFFT; start += size) {
      for (let k = 0; k < halfSize; k++) {
        const wr = twCos[k * step];
        const wi = twSin[k * step];
        const a = start + k;
        const b = a + halfSize;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

const hz2mel = (f: number) => 2595 * Math.log10(1 + f / 700);
const mel2hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
const NBINS = NFFT / 2 + 1;
type MelBank = { start: number; w: Float32Array }[];
function buildMelBank(warp: number): MelBank {
  const bank: MelBank = [];
  const lo = hz2mel(60);
  const hi = hz2mel(7600);
  const pts: number[] = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.min(SR / 2 - 1, mel2hz(lo + ((hi - lo) * i) / (NMEL + 1)) * warp));
  const bin = (f: number) => (f * NFFT) / SR;
  for (let m = 0; m < NMEL; m++) {
    const a = bin(pts[m]);
    const b = bin(pts[m + 1]);
    const c = bin(pts[m + 2]);
    const start = Math.max(0, Math.floor(a));
    const end = Math.min(NBINS - 1, Math.ceil(c));
    const w = new Float32Array(Math.max(1, end - start + 1));
    for (let k = start; k <= end; k++) {
      let v = 0;
      if (k > a && k <= b) v = (k - a) / (b - a);
      else if (k > b && k < c) v = (c - k) / (c - b);
      w[k - start] = Math.max(0, v);
    }
    bank.push({ start, w });
  }
  return bank;
}
// Fatores de "tamanho de voz" (VTLN): a imitação é testada em cada um
export const WARPS = [0.86, 0.93, 1, 1.07, 1.15];
const melBanks = WARPS.map(buildMelBank);
const BASE_WARP = WARPS.indexOf(1);
const lifter = new Float32Array(NCEP);
for (let k = 0; k < NCEP; k++) lifter[k] = 1 + 11 * Math.sin((Math.PI * k) / 22);
const dct: Float32Array[] = [];
for (let k = 0; k < NCEP; k++) {
  const row = new Float32Array(NMEL);
  for (let m = 0; m < NMEL; m++) row[m] = Math.cos((Math.PI * k * (m + 0.5)) / NMEL);
  dct.push(row);
}

// ---------------------------------------------------------------- pitch (YIN)

const YIN_W = 320;
const TAU_MIN = Math.floor(SR / 1100);
const TAU_MAX = Math.floor(SR / 65);
const yinD = new Float32Array(TAU_MAX + 2);

/** Retorna [freqHz, aperiodicidade] ou [0, 1] quando não há tom. */
function yin(x: Float32Array, start: number): [number, number] {
  if (start + YIN_W + TAU_MAX + 1 > x.length) return [0, 1];
  for (let tau = 1; tau <= TAU_MAX + 1; tau++) {
    let s = 0;
    for (let j = 0; j < YIN_W; j++) {
      const d = x[start + j] - x[start + j + tau];
      s += d * d;
    }
    yinD[tau] = s;
  }
  let running = 0;
  yinD[0] = 1;
  for (let tau = 1; tau <= TAU_MAX + 1; tau++) {
    running += yinD[tau];
    yinD[tau] = running > 0 ? (yinD[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = TAU_MIN; t <= TAU_MAX; t++) {
    if (yinD[t] < 0.15) {
      while (t + 1 <= TAU_MAX && yinD[t + 1] < yinD[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = TAU_MIN;
    for (let t = TAU_MIN + 1; t <= TAU_MAX; t++) if (yinD[t] < yinD[best]) best = t;
    if (yinD[best] > 0.3) return [0, yinD[best]];
    tau = best;
  }
  const a = yinD[tau - 1];
  const b = yinD[tau];
  const c = yinD[tau + 1];
  const den = a - 2 * b + c;
  const shift = Math.abs(den) > 1e-12 ? (a - c) / (2 * den) : 0;
  const tf = tau + Math.max(-1, Math.min(1, shift));
  return [SR / tf, b];
}

// ---------------------------------------------------------------- features

export interface Features {
  frames: number;
  feat: Float32Array[]; // vetores por quadro para o DTW (voz neutra)
  featWarps: Float32Array[][]; // imitação: um conjunto por fator de voz
  env: Float32Array; // envelope 0..1 (dB relativos ao pico, janela de 40 dB)
  pitch: Float32Array; // semitons (MIDI) ou NaN
  voicedFrac: number;
  duration: number; // segundos (sem silêncio nas pontas)
  peakDb: number;
  silent: boolean;
}

const FEAT_DIMS = 2 * (NCEP - 1) + 1; // 12 cepstrais + 12 deltas + energia

export function analyze(x: Float32Array, isAttempt = false): Features {
  const nAll = Math.max(1, Math.floor((x.length - WIN) / HOP) + 1);
  const dbAll = new Float32Array(nAll);
  for (let f = 0; f < nAll; f++) {
    let s = 0;
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) {
      const v = x[o + i] || 0;
      s += v * v;
    }
    dbAll[f] = 10 * Math.log10(s / WIN + 1e-10);
  }
  const sorted = Array.from(dbAll).sort((a, b) => a - b);
  const floor = sorted[Math.floor(nAll * 0.1)];
  const peak = sorted[nAll - 1];
  const silent = isAttempt ? peak < -60 : peak < -80;
  const thr = Math.min(Math.max(peak - 35, floor + 8), peak - 6);
  let s = 0;
  while (s < nAll - 1 && dbAll[s] < thr) s++;
  let e = nAll - 1;
  while (e > s && dbAll[e] < thr) e--;
  s = Math.max(0, s - 2);
  e = Math.min(nAll - 1, e + 3);
  if (e - s + 1 > MAX_FRAMES) e = s + MAX_FRAMES - 1;
  if (e - s + 1 < 8) e = Math.min(nAll - 1, s + 7);
  const n = e - s + 1;

  // Espectro de potência por quadro (compartilhado entre os fatores de voz)
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const power: Float32Array[] = [];
  for (let f = s; f <= e; f++) {
    re.fill(0);
    im.fill(0);
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) {
      const cur = x[o + i] || 0;
      const prev = o + i > 0 ? x[o + i - 1] || 0 : 0;
      re[i] = (cur - 0.97 * prev) * hamming[i];
    }
    fft(re, im);
    const p = new Float32Array(NBINS);
    for (let k = 0; k < NBINS; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    power.push(p);
  }

  const env = new Float32Array(n);
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rel = dbAll[s + i] - peak;
    env[i] = Math.max(0, 1 + rel / 40);
    energy[i] = Math.max(-4, rel / 10);
  }
  const featWarps = isAttempt
    ? melBanks.map((bank) => cepFeatures(power, bank, energy))
    : [cepFeatures(power, melBanks[BASE_WARP], energy)];

  // Tom (a cada 2 quadros)
  const pitch = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i += 2) {
    const f = s + i;
    if (dbAll[f] < peak - 28) continue;
    const [hz, ap] = yin(x, f * HOP);
    if (hz > 0 && ap < 0.3) {
      const midi = 69 + 12 * Math.log2(hz / 440);
      pitch[i] = midi;
      if (i + 1 < n) pitch[i + 1] = midi;
    }
  }
  cleanPitch(pitch);
  let voiced = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(pitch[i])) voiced++;

  return {
    frames: n,
    feat: isAttempt ? featWarps[BASE_WARP] : featWarps[0],
    featWarps,
    env,
    pitch,
    voicedFrac: voiced / n,
    duration: n * FRAME_SEC,
    peakDb: peak,
    silent,
  };
}

export const TUNE = { deltaW: 1, energyW: 0.8, nUse: 12, varNorm: true };

function cepFeatures(power: Float32Array[], bank: MelBank, energy: Float32Array): Float32Array[] {
  const n = power.length;
  const mel: Float32Array[] = [];
  let melMax = 1e-12;
  for (const p of power) {
    const m = new Float32Array(NMEL);
    for (let k = 0; k < NMEL; k++) {
      const { start, w } = bank[k];
      let acc = 0;
      for (let j = 0; j < w.length; j++) acc += p[start + j] * w[j];
      m[k] = acc;
      if (acc > melMax) melMax = acc;
    }
    mel.push(m);
  }
  // Piso relativo: silêncio digital e ruído de sala viram o mesmo "chão".
  const melFloor = melMax * 1e-5;
  const D = NCEP - 1;
  const ceps = mel.map((m) => {
    const lm = new Float32Array(NMEL);
    for (let k = 0; k < NMEL; k++) lm[k] = Math.log(m[k] + melFloor);
    const c = new Float32Array(D);
    for (let k = 1; k < NCEP; k++) {
      let acc = 0;
      const row = dct[k];
      for (let j = 0; j < NMEL; j++) acc += row[j] * lm[j];
      c[k - 1] = acc * lifter[k];
    }
    return c;
  });
  // CMVN por gravação (remove diferença de microfone/canal)
  const mean = new Float32Array(D);
  const sd = new Float32Array(D);
  for (const c of ceps) for (let d = 0; d < D; d++) mean[d] += c[d] / n;
  for (const c of ceps) for (let d = 0; d < D; d++) sd[d] += ((c[d] - mean[d]) ** 2) / n;
  for (let d = 0; d < D; d++) sd[d] = TUNE.varNorm ? Math.sqrt(sd[d]) + 1e-3 : 8;
  for (const c of ceps) for (let d = 0; d < D; d++) c[d] = d < TUNE.nUse ? (c[d] - mean[d]) / sd[d] : 0;

  const out: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(FEAT_DIMS);
    const c = ceps[i];
    for (let d = 0; d < D; d++) {
      v[d] = c[d];
      let delta = 0;
      for (let k = 1; k <= 2; k++) {
        const a = ceps[Math.min(n - 1, i + k)];
        const b = ceps[Math.max(0, i - k)];
        delta += k * (a[d] - b[d]);
      }
      v[D + d] = (delta / 10) * TUNE.deltaW;
    }
    v[2 * D] = energy[i] * TUNE.energyW;
    out.push(v);
  }
  return out;
}

function cleanPitch(p: Float32Array) {
  const n = p.length;
  // Remove trechos com tom muito curtos (< 40 ms)
  let i = 0;
  while (i < n) {
    if (Number.isNaN(p[i])) { i++; continue; }
    let j = i;
    while (j < n && !Number.isNaN(p[j])) j++;
    if (j - i < 4) for (let k = i; k < j; k++) p[k] = NaN;
    i = j;
  }
  // Corrige saltos de oitava e aplica mediana de 5
  const out = p.slice();
  for (let k = 0; k < n; k++) {
    if (Number.isNaN(p[k])) continue;
    const win: number[] = [];
    for (let d = -2; d <= 2; d++) {
      const v = p[k + d];
      if (k + d >= 0 && k + d < n && !Number.isNaN(v)) win.push(v);
    }
    win.sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    let v = p[k];
    while (v - med > 9) v -= 12;
    while (med - v > 9) v += 12;
    out[k] = Math.abs(v - med) > 3 ? med : v;
  }
  p.set(out);
}

// ---------------------------------------------------------------- DTW

function dist(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let d = 0; d < a.length; d++) {
    const v = a[d] - b[d];
    s += v * v;
  }
  return Math.sqrt(s / a.length);
}

interface DtwResult { cost: number; pathT: Int32Array; pathA: Int32Array }

export function dtw(A: Float32Array[], B: Float32Array[], band = 0.4): DtwResult {
  const n = A.length;
  const m = B.length;
  const INF = 1e30;
  const D = new Float64Array(n * m).fill(INF);
  const dir = new Uint8Array(n * m);
  const w = Math.max(Math.ceil(band * Math.max(n, m)), Math.abs(n - m) + 2);
  for (let i = 0; i < n; i++) {
    const center = n > 1 ? (i * (m - 1)) / (n - 1) : 0;
    const j0 = Math.max(0, Math.floor(center - w));
    const j1 = Math.min(m - 1, Math.ceil(center + w));
    for (let j = j0; j <= j1; j++) {
      const c = dist(A[i], B[j]);
      if (i === 0 && j === 0) { D[0] = 2 * c; continue; }
      let best = INF;
      let bd = 0;
      if (i > 0 && j > 0 && D[(i - 1) * m + j - 1] + 2 * c < best) { best = D[(i - 1) * m + j - 1] + 2 * c; bd = 0; }
      if (i > 0 && D[(i - 1) * m + j] + c < best) { best = D[(i - 1) * m + j] + c; bd = 1; }
      if (j > 0 && D[i * m + j - 1] + c < best) { best = D[i * m + j - 1] + c; bd = 2; }
      D[i * m + j] = best;
      dir[i * m + j] = bd;
    }
  }
  const pt: number[] = [];
  const pa: number[] = [];
  let i = n - 1;
  let j = m - 1;
  while (i >= 0 && j >= 0) {
    pt.push(i);
    pa.push(j);
    if (i === 0 && j === 0) break;
    const d = dir[i * m + j];
    if (i === 0) j--;
    else if (j === 0) i--;
    else if (d === 0) { i--; j--; }
    else if (d === 1) i--;
    else j--;
  }
  pt.reverse();
  pa.reverse();
  return { cost: D[n * m - 1] / (n + m), pathT: Int32Array.from(pt), pathA: Int32Array.from(pa) };
}

// ---------------------------------------------------------------- score

export interface ScoreResult {
  total: number; // 0..100
  content: number;
  pitch: number;
  rhythm: number;
  usesPitch: boolean;
  silent: boolean;
  longBonus: number;
  chart: { target: number[]; attempt: number[] }; // contornos relativos (semitons), NaN = sem tom
  raw: { cost: number; base: number; rel: number; pitchErr: number; envCorr: number; durRatio: number; warp: number };
}

export const TUNING: Record<Difficulty, { r0: number; r1: number; tol: number; gamma: number }> = {
  easy: { r0: 0.0, r1: 0.22, tol: 6.5, gamma: 0.8 },
  normal: { r0: 0.02, r1: 0.26, tol: 5, gamma: 1 },
  hard: { r0: 0.04, r1: 0.3, tol: 3.5, gamma: 1.2 },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = vals.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function resampleCurve(src: Float32Array, len: number): Float32Array {
  const out = new Float32Array(len);
  const n = src.length;
  for (let i = 0; i < len; i++) {
    const t = (i * (n - 1)) / (len - 1 || 1);
    const k = Math.floor(t);
    const f = t - k;
    out[i] = src[k] * (1 - f) + (src[Math.min(n - 1, k + 1)] ?? src[k]) * f;
  }
  return out;
}

function pearson(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  if (da < 1e-9 || db < 1e-9) return da < 1e-9 && db < 1e-9 ? 1 : 0;
  return num / Math.sqrt(da * db);
}

/** Junta quadros de 2 em 2 para acelerar o DTW em sons longos. */
function decimate(f: Float32Array[], k: number): Float32Array[] {
  if (k === 1) return f;
  const out: Float32Array[] = [];
  for (let i = 0; i < f.length; i += k) {
    const v = new Float32Array(f[i].length);
    let c = 0;
    for (let j = i; j < Math.min(f.length, i + k); j++, c++) for (let d = 0; d < v.length; d++) v[d] += f[j][d];
    for (let d = 0; d < v.length; d++) v[d] /= c;
    out.push(v);
  }
  return out;
}

/**
 * Compara o original (t) com a imitação (a). `anchors` são outros sons usados
 * como referência: a imitação precisa ficar mais perto do original do que deles.
 */
export function compare(t: Features, a: Features, difficulty: Difficulty = 'normal', anchors: Features[] = []): ScoreResult {
  const usesPitch = t.voicedFrac > 0.15;
  if (a.silent) {
    return {
      total: 0, content: 0, pitch: 0, rhythm: 0, usesPitch, silent: true, longBonus: 0,
      chart: { target: [], attempt: [] }, raw: { cost: 9, base: 9, rel: 0, pitchErr: 99, envCorr: 0, durRatio: 0, warp: 1 },
    };
  }
  const tune = TUNING[difficulty];
  const k = Math.max(t.frames, a.frames) > 420 ? 2 : 1;
  const tf = decimate(t.feat, k);

  // Conteúdo: melhor fator de voz, comparado com os sons de referência
  let best = dtw(tf, decimate(a.featWarps[0], k));
  let bestW = 0;
  for (let w = 1; w < a.featWarps.length; w++) {
    const r = dtw(tf, decimate(a.featWarps[w], k));
    if (r.cost < best.cost) { best = r; bestW = w; }
  }
  const { cost, pathT, pathA } = best;
  const af = decimate(a.featWarps[bestW], k);
  const baseCosts = anchors.filter((x) => x !== t).map((x) => {
    const kk = Math.max(x.frames, a.frames) > 420 ? 2 : 1;
    return dtw(decimate(x.feat, kk), kk === k ? af : decimate(a.featWarps[bestW], kk)).cost;
  });
  const base = baseCosts.length ? median(baseCosts) : 1.0;
  const rel = 1 - cost / Math.max(base, 1e-6);
  const content = clamp01((rel - tune.r0) / (tune.r1 - tune.r0));

  // Tom: contorno relativo à mediana de cada um, ao longo do alinhamento
  const tv: number[] = [];
  const av: number[] = [];
  for (let i = 0; i < t.frames; i++) if (!Number.isNaN(t.pitch[i])) tv.push(t.pitch[i]);
  for (let i = 0; i < a.frames; i++) if (!Number.isNaN(a.pitch[i])) av.push(a.pitch[i]);
  const tMed = median(tv);
  const aMed = median(av);
  let errSum = 0, both = 0, tVoiced = 0;
  const chartT = new Float32Array(t.frames).fill(NaN);
  const chartA = new Float32Array(t.frames).fill(NaN);
  for (let q = 0; q < pathT.length; q++) {
    const i = Math.min(t.frames - 1, pathT[q] * k);
    const j = Math.min(a.frames - 1, pathA[q] * k);
    const pt = t.pitch[i];
    const pa = a.pitch[j];
    if (!Number.isNaN(pt)) {
      tVoiced++;
      if (!Number.isNaN(pa)) {
        let d = Math.abs(pt - tMed - (pa - aMed));
        d = Math.min(d, Math.abs(d - 12) + 1.5); // tolerância de oitava
        errSum += d;
        both++;
      }
    }
    for (let z = 0; z < k && i + z < t.frames; z++) {
      if (!Number.isNaN(t.pitch[i + z])) chartT[i + z] = t.pitch[i + z] - tMed;
      if (!Number.isNaN(pa)) chartA[i + z] = pa - aMed;
    }
  }
  const pitchErr = both ? errSum / both : 99;
  const coverage = tVoiced ? both / tVoiced : 0;
  const pitch = usesPitch ? clamp01(1 - pitchErr / tune.tol) * (0.45 + 0.55 * coverage) : 0;

  // Ritmo: envelope em tempo normalizado + duração
  const L = 64;
  const envCorr = pearson(resampleCurve(t.env, L), resampleCurve(a.env, L));
  const durRatio = Math.min(t.duration, a.duration) / Math.max(t.duration, a.duration);
  const rhythm = 0.65 * clamp01((envCorr - 0.15) / 0.65) + 0.35 * clamp01((durRatio - 0.35) / 0.5);

  // Pesos: quanto mais "cantado" o original, mais o tom pesa
  const wPitch = usesPitch ? 0.15 + 0.2 * clamp01((t.voicedFrac - 0.15) / 0.5) : 0;
  const wRhythm = 0.2;
  const wContent = 1 - wPitch - wRhythm;
  let total = wContent * content + wPitch * pitch + wRhythm * rhythm;
  // Sem conteúdo parecido, tom e ritmo valem menos (barulho aleatório não pontua)
  total *= 0.45 + 0.55 * clamp01(content * 1.8);
  total = clamp01(total) ** tune.gamma;

  // Bônus para sons longos (mais difíceis)
  const longBonus = Math.round(6 * clamp01((t.duration - 2.5) / 4) * total);

  const down = (c: Float32Array) => {
    const out: number[] = [];
    const step = Math.max(1, Math.floor(c.length / 90));
    for (let i = 0; i < c.length; i += step) out.push(c[i]);
    return out;
  };

  return {
    total: Math.min(100, Math.round(total * 100) + longBonus),
    content: Math.round(content * 100),
    pitch: Math.round(pitch * 100),
    rhythm: Math.round(rhythm * 100),
    usesPitch,
    silent: false,
    longBonus,
    chart: { target: down(chartT), attempt: down(chartA) },
    raw: { cost, base, rel, pitchErr, envCorr, durRatio, warp: WARPS[bestW] },
  };
}
