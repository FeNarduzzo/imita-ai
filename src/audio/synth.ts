// Sons gerados por código (pacote nativo do Imita Aí) e efeitos de sabotagem.
// Tudo em DSP puro sobre Float32Array, sem depender de Web Audio.

export const SYN_SR = 44100;

type Fn = (t: number) => number;
type Shape = 'sine' | 'tri' | 'saw' | 'square';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const wave = (shape: Shape, ph: number) => {
  const p = ph - Math.floor(ph);
  switch (shape) {
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'tri': return 4 * Math.abs(p - 0.5) - 1;
    case 'saw': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
  }
};

function env(t: number, dur: number, a = 0.01, r = 0.05): number {
  if (t < 0 || t > dur) return 0;
  if (t < a) return t / a;
  if (t > dur - r) return Math.max(0, (dur - t) / r);
  return 1;
}

class Track {
  data: Float32Array;
  sr: number;
  constructor(sr: number, sec: number) { this.sr = sr; this.data = new Float32Array(Math.ceil(sec * sr)); }
  tone(t0: number, dur: number, freq: Fn, shape: Shape, amp: Fn = () => 1) {
    const s0 = Math.floor(t0 * this.sr);
    const n = Math.floor(dur * this.sr);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < this.data.length; i++) {
      const t = i / this.sr;
      ph += freq(t) / this.sr;
      this.data[s0 + i] += wave(shape, ph) * amp(t);
    }
  }
  noise(t0: number, dur: number, amp: Fn, seed = 1) {
    const r = rng(seed);
    const s0 = Math.floor(t0 * this.sr);
    const n = Math.floor(dur * this.sr);
    for (let i = 0; i < n && s0 + i < this.data.length; i++) this.data[s0 + i] += r() * amp(i / this.sr);
  }
  mix(src: Float32Array, t0: number, gain = 1) {
    const s0 = Math.floor(t0 * this.sr);
    for (let i = 0; i < src.length && s0 + i < this.data.length; i++) this.data[s0 + i] += src[i] * gain;
  }
}

/** Filtro passa-banda (RBJ) com frequência variável no tempo. */
function bandpass(x: Float32Array, sr: number, fc: Fn, q: number): Float32Array {
  const y = new Float32Array(x.length);
  let b0 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) {
      const f = Math.min(sr * 0.45, Math.max(20, fc(i / sr)));
      const w = (2 * Math.PI * f) / sr;
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w)) / a0; a2 = (1 - alpha) / a0;
    }
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

function lowpass(x: Float32Array, sr: number, fc: number): Float32Array {
  const y = new Float32Array(x.length);
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let p = 0;
  for (let i = 0; i < x.length; i++) { p = (1 - a) * x[i] + a * p; y[i] = p; }
  return y;
}

type Vowel = [number, number];
const V: Record<string, Vowel> = { a: [800, 1200], e: [480, 1900], i: [300, 2300], o: [500, 880], u: [330, 760] };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Voz sintética: dente-de-serra passando por formantes. */
function voice(sr: number, dur: number, f0: Fn, vowels: Vowel | ((t: number) => Vowel), amp: Fn = (t) => env(t, dur, 0.03, 0.08)): Float32Array {
  const tr = new Track(sr, dur);
  tr.tone(0, dur, f0, 'saw', amp);
  const F = (t: number, k: 0 | 1) => (typeof vowels === 'function' ? vowels(t)[k] : vowels[k]);
  const a = bandpass(tr.data, sr, (t) => F(t, 0), 5);
  const b = bandpass(tr.data, sr, (t) => F(t, 1), 8);
  const c = bandpass(tr.data, sr, () => 2700, 10);
  const out = new Float32Array(tr.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a[i] + 0.55 * b[i] + 0.2 * c[i];
  return out;
}

const vowelPath = (seq: string[]): ((t: number) => Vowel) => (k: number) => {
  const pos = Math.max(0, Math.min(seq.length - 1, k * (seq.length - 1)));
  const i = Math.floor(pos);
  const f = pos - i;
  const A = V[seq[i]];
  const B = V[seq[Math.min(seq.length - 1, i + 1)]];
  return [lerp(A[0], B[0], f), lerp(A[1], B[1], f)];
};

export function normalize(x: Float32Array, peak = 0.85): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const vib = (f: number, rate = 5.5, depth = 0.015): Fn => (t) => f * (1 + depth * Math.sin(2 * Math.PI * rate * t));

function melody(sr: number, notes: [number, number][], shape: Shape, gap = 0.03): Float32Array {
  const total = notes.reduce((s, [, d]) => s + d, 0) + 0.1;
  const tr = new Track(sr, total);
  let t = 0;
  for (const [m, d] of notes) {
    const dd = d - gap;
    tr.tone(t, dd, vib(note(m), 5, 0.008), shape, (u) => env(u, dd, 0.015, 0.05));
    t += d;
  }
  return tr.data;
}

// ---------------------------------------------------------------- sons do pacote nativo

export interface SynthDef { id: string; name: string; emoji: string; level: 1 | 2 | 3; gen: (sr: number) => Float32Array }

export const SYNTHS: SynthDef[] = [
  {
    id: 'sirene', name: 'Sirene', emoji: '🚨', level: 1,
    gen: (sr) => { const d = 2.6; const t = new Track(sr, d); t.tone(0, d, (u) => 520 + 230 * Math.sin(2 * Math.PI * 0.62 * u - Math.PI / 2), 'tri', (u) => env(u, d, 0.05, 0.2)); return t.data; },
  },
  {
    id: 'fantasma', name: 'Fantasma', emoji: '👻', level: 1,
    gen: (sr) => voice(sr, 2.2, (t) => (t < 0.7 ? lerp(196, 262, t / 0.7) : lerp(262, 175, (t - 0.7) / 1.5)) * (1 + 0.03 * Math.sin(2 * Math.PI * 5.5 * t)), V.u, (t) => env(t, 2.2, 0.2, 0.5)),
  },
  {
    id: 'laser', name: 'Laser', emoji: '🔫', level: 1,
    gen: (sr) => { const tr = new Track(sr, 1.0); for (let k = 0; k < 3; k++) tr.tone(k * 0.27, 0.17, (u) => 1100 * Math.exp(-u * 8.5), 'sine', (u) => env(u, 0.17, 0.005, 0.03)); return tr.data; },
  },
  {
    id: 'boing', name: 'Boing', emoji: '🌀', level: 1,
    gen: (sr) => { const d = 1.1; const t = new Track(sr, d); t.tone(0, d, (u) => (180 + 260 * (1 - Math.exp(-u * 9))) * (1 + 0.12 * Math.exp(-u * 3) * Math.sin(2 * Math.PI * 9 * u)), 'tri', (u) => env(u, d, 0.01, 0.3)); return t.data; },
  },
  {
    id: 'cuco', name: 'Cuco', emoji: '🐦', level: 1,
    gen: (sr) => melody(sr, [[77, 0.26], [74, 0.42], [77, 0.26], [74, 0.5]], 'tri', 0.06),
  },
  {
    id: 'campainha', name: 'Campainha', emoji: '🔔', level: 1,
    gen: (sr) => {
      const tr = new Track(sr, 1.6);
      for (const [t0, f] of [[0, note(76)], [0.6, note(72)]] as const) {
        for (const [ratio, g] of [[1, 1], [2, 0.4], [2.76, 0.25], [5.4, 0.1]] as const) {
          tr.tone(t0, 0.95, () => f * ratio, 'sine', (u) => g * Math.exp(-u * 4) * Math.min(1, u / 0.004));
        }
      }
      return tr.data;
    },
  },
  {
    id: 'gota', name: 'Gota', emoji: '💧', level: 1,
    gen: (sr) => { const tr = new Track(sr, 1.0); for (let k = 0; k < 3; k++) tr.tone(k * 0.3, 0.12, (u) => 280 + 1100 * Math.min(1, u / 0.07), 'sine', (u) => env(u, 0.12, 0.003, 0.05)); return tr.data; },
  },
  {
    id: 'coruja', name: 'Coruja', emoji: '🦉', level: 2,
    gen: (sr) => {
      const tr = new Track(sr, 1.5);
      const parts: [number, number, number][] = [[0, 0.2, 340], [0.35, 0.6, 330], [1.05, 0.25, 300]];
      for (const [t0, d, f] of parts) tr.mix(voice(sr, d, (u) => f * (1 - 0.08 * (u / d)), V.u, (u) => env(u, d, 0.04, 0.08)), t0);
      return tr.data;
    },
  },
  {
    id: 'miado', name: 'Miado', emoji: '🐱', level: 2,
    gen: (sr) => { const d = 0.9; return voice(sr, d, (t) => (t < 0.3 ? lerp(480, 720, t / 0.3) : lerp(720, 420, (t - 0.3) / 0.6)), (t) => vowelPath(['i', 'a', 'o', 'u'])(t / d), (t) => env(t, d, 0.05, 0.2)); },
  },
  {
    id: 'latido', name: 'Latido', emoji: '🐶', level: 2,
    gen: (sr) => {
      const tr = new Track(sr, 0.75);
      for (const t0 of [0, 0.38]) {
        const d = 0.2;
        tr.mix(voice(sr, d, (u) => lerp(380, 250, u / d), (u) => vowelPath(['a', 'o', 'u'])(u / d), (u) => env(u, d, 0.01, 0.06)), t0);
        tr.noise(t0, 0.05, (u) => 0.25 * env(u, 0.05, 0.002, 0.03), 3);
      }
      return tr.data;
    },
  },
  {
    id: 'robo', name: 'Robô', emoji: '🤖', level: 2,
    gen: (sr) => { const tr = new Track(sr, 1.0); [880, 660, 988, 660, 1175, 880].forEach((f, k) => tr.tone(k * 0.15, 0.1, () => f, 'square', (u) => 0.5 * env(u, 0.1, 0.004, 0.01))); return lowpass(tr.data, sr, 3500); },
  },
  {
    id: 'ambulancia', name: 'Ambulância', emoji: '🚑', level: 2,
    gen: (sr) => { const tr = new Track(sr, 3.1); for (let k = 0; k < 8; k++) tr.tone(k * 0.38, 0.38, () => (k % 2 ? 466 : 622), 'tri', (u) => env(u, 0.38, 0.01, 0.01)); return tr.data; },
  },
  {
    id: 'melodia-alegre', name: 'Melodia alegre', emoji: '🎵', level: 2,
    gen: (sr) => melody(sr, [[72, 0.22], [74, 0.22], [76, 0.22], [79, 0.33], [76, 0.22], [72, 0.5]], 'tri'),
  },
  {
    id: 'gargalhada', name: 'Gargalhada', emoji: '😈', level: 2,
    gen: (sr) => {
      const tr = new Track(sr, 1.3);
      for (let k = 0; k < 5; k++) { const d = 0.14; tr.mix(voice(sr, d, (u) => lerp(300 - k * 18, 270 - k * 18, u / d), V.a, (u) => env(u, d, 0.01, 0.05)), k * 0.23); }
      return tr.data;
    },
  },
  {
    id: 'batuque', name: 'Batuque', emoji: '🥁', level: 2,
    gen: (sr) => {
      const beat = 0.24;
      const pattern = 'K.SKK.S.K.SK';
      const tr = new Track(sr, pattern.length * beat + 0.3);
      [...pattern].forEach((c, k) => {
        const t0 = k * beat;
        if (c === 'K') tr.tone(t0, 0.18, (u) => 45 + 90 * Math.exp(-u * 30), 'sine', (u) => Math.exp(-u * 18));
        if (c === 'S') { tr.noise(t0, 0.15, (u) => 0.5 * Math.exp(-u * 25), 7 + k); tr.tone(t0, 0.1, () => 190, 'tri', (u) => 0.4 * Math.exp(-u * 30)); }
      });
      return tr.data;
    },
  },
  {
    id: 'aeiou', name: 'A-E-I-O-U', emoji: '🗣️', level: 3,
    gen: (sr) => {
      const tr = new Track(sr, 2.0);
      ['a', 'e', 'i', 'o', 'u'].forEach((v, k) => { const d = 0.36; tr.mix(voice(sr, d, vib(note(57 + [0, 2, 4, 5, 7][k]), 5, 0.01), V[v], (u) => env(u, d, 0.03, 0.06)), k * 0.37); });
      return tr.data;
    },
  },
  {
    id: 'melodia-triste', name: 'Melodia triste', emoji: '🎻', level: 3,
    gen: (sr) => melody(sr, [[69, 0.42], [72, 0.22], [71, 0.22], [69, 0.55], [68, 0.3], [69, 0.6]], 'saw').map((v) => v * 0.6),
  },
  {
    id: 'escala-maluca', name: 'Escala maluca', emoji: '🎹', level: 3,
    gen: (sr) => melody(sr, [72, 76, 79, 84, 79, 76, 72, 67, 72, 76, 79, 84].map((m) => [m - 5, 0.11] as [number, number]), 'tri', 0.015),
  },
  {
    id: 'golfinho', name: 'Golfinho', emoji: '🐬', level: 3,
    gen: (sr) => {
      const tr = new Track(sr, 1.4);
      [0, 0.12, 0.2, 0.45, 0.55, 0.62, 0.9, 1.05].forEach((t0, k) => tr.tone(t0, 0.07, (u) => 700 + 350 * (u / 0.07) + k * 15, 'sine', (u) => env(u, 0.07, 0.004, 0.02)));
      return tr.data;
    },
  },
  {
    id: 'trem', name: 'Trem', emoji: '🚂', level: 3,
    gen: (sr) => {
      const tr = new Track(sr, 2.0);
      for (const f of [note(72), note(76)]) tr.tone(0, 0.7, () => f, 'tri', (u) => 0.5 * env(u, 0.7, 0.03, 0.15));
      for (let k = 0; k < 5; k++) tr.noise(0.85 + k * 0.22, 0.13, (u) => 0.45 * env(u, 0.13, 0.005, 0.08), 20 + k);
      return tr.data;
    },
  },
];

export function renderSynth(id: string, sr = SYN_SR): Float32Array | null {
  const def = SYNTHS.find((s) => s.id === id);
  if (!def) return null;
  return normalize(def.gen(sr));
}

// ---------------------------------------------------------------- sabotagens

export type EffectId = 'estouro' | 'eco' | 'pum' | 'esquilo' | 'monstro' | 'picotado' | 'interfone' | 'tremelique' | 'robo' | 'catedral' | 'sumico';

function resampleRate(x: Float32Array, rate: number): Float32Array {
  const n = Math.floor(x.length / rate);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * rate;
    const k = Math.floor(t);
    const f = t - k;
    y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f;
  }
  return y;
}

function fart(sr: number, dur: number): Float32Array {
  const r = rng(99);
  const tr = new Track(sr, dur);
  tr.tone(0, dur, (t) => 70 + 25 * Math.sin(2 * Math.PI * 7 * t) + 15 * r(), 'saw', (t) => env(t, dur, 0.02, 0.15) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 13 * t)));
  tr.noise(0, dur, (t) => 0.3 * env(t, dur, 0.02, 0.15), 5);
  return normalize(lowpass(tr.data, sr, 600), 0.8);
}

function schroeder(x: Float32Array, sr: number, tail: number): Float32Array {
  const out = new Float32Array(x.length + Math.floor(tail * sr));
  out.set(x);
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.floor(s * sr));
  const wet = new Float32Array(out.length);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const y = buf[p];
      buf[p] = out[i] + y * 0.84;
      wet[i] += y * 0.25;
      p = (p + 1) % d;
    }
  }
  for (const d of [Math.floor(0.005 * sr), Math.floor(0.0017 * sr)]) {
    const buf = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < wet.length; i++) {
      const b = buf[p];
      const y = -0.7 * wet[i] + b;
      buf[p] = wet[i] + 0.7 * y;
      wet[i] = y;
      p = (p + 1) % d;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i] * 0.55 + wet[i] * 0.9;
  return out;
}

/** Aplica uma sabotagem à gravação (amostras em `sr`). */
export function applyEffect(id: EffectId, x: Float32Array, sr: number, seed = 1): Float32Array {
  const r = rng(seed);
  let y: Float32Array;
  switch (id) {
    case 'estouro':
      y = x.map((v) => Math.tanh(v * 18) * 0.6);
      break;
    case 'eco': {
      const d = Math.floor(0.23 * sr);
      y = new Float32Array(x.length + d * 4);
      y.set(x);
      for (let i = d; i < y.length; i++) y[i] += y[i - d] * 0.55;
      break;
    }
    case 'pum':
      y = fart(sr, Math.max(0.8, Math.min(3, x.length / sr)));
      break;
    case 'esquilo':
      y = resampleRate(x, 1.6);
      break;
    case 'monstro':
      y = resampleRate(x, 0.68);
      break;
    case 'picotado': {
      y = x.slice();
      const chunk = Math.floor(0.09 * sr);
      for (let s = 0, c = 0; s < y.length; s += chunk, c++) {
        if (c % 2 === 1 || r() > 0.75) y.fill(0, s, Math.min(y.length, s + chunk));
      }
      break;
    }
    case 'interfone': {
      const bp = bandpass(x, sr, () => 1300, 1.2);
      y = new Float32Array(bp.length);
      let held = 0;
      for (let i = 0; i < bp.length; i++) {
        if (i % 5 === 0) held = Math.round(Math.tanh(bp[i] * 6) * 12) / 12;
        y[i] = held * 0.7 + r() * 0.03;
      }
      break;
    }
    case 'tremelique': {
      y = new Float32Array(x.length);
      const maxD = Math.floor(0.006 * sr);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const d = maxD * (0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * t));
        const k = i - d;
        const k0 = Math.floor(k);
        const s = k0 >= 0 ? x[k0] * (1 - (k - k0)) + (x[k0 + 1] || 0) * (k - k0) : 0;
        y[i] = s * (0.55 + 0.45 * Math.sin(2 * Math.PI * 11 * t));
      }
      break;
    }
    case 'robo': {
      y = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) y[i] = x[i] * Math.sin((2 * Math.PI * 95 * i) / sr) * 1.4;
      y = lowpass(y, sr, 3200);
      break;
    }
    case 'catedral':
      y = schroeder(x, sr, 2.2);
      break;
    case 'sumico': {
      y = x.slice();
      const len = Math.floor(y.length * 0.45);
      const start = Math.floor((y.length - len) * (0.3 + 0.4 * (r() * 0.5 + 0.5)));
      y.fill(0, start, start + len);
      break;
    }
  }
  return normalize(y, 0.85);
}
