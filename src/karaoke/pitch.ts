// Tom (frequência fundamental) pelo método YIN — usado na linha da melodia e na voz ao vivo.

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
export const noteName = (midi: number) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];

/**
 * Tom de um trecho curto (≈ 30–60 ms). Devolve Hz, ou null se não houver voz/nota clara.
 * `minHz`/`maxHz`: faixa de voz cantada (80 Hz grave masculino até ~1000 Hz agudo).
 */
export function yin(buf: Float32Array, sr: number, minHz = 80, maxHz = 1000, threshold = 0.15): number | null {
  const tauMin = Math.max(2, Math.floor(sr / maxHz));
  const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(buf.length / 2));
  const w = buf.length - tauMax;
  if (w <= 16 || tauMax <= tauMin) return null;
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (energy / buf.length < 2e-6) return null;
  const cm = new Float32Array(tauMax + 1);
  cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    run += s;
    cm[tau] = run > 0 ? (s * tau) / run : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cm[tau] < threshold) {
      while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 1) return null;
  const a = cm[best - 1];
  const b = cm[best];
  const c = best + 1 <= tauMax ? cm[best + 1] : cm[best];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (a - c) / (2 * den) : 0;
  return sr / (best + (Math.abs(shift) < 1 ? shift : 0));
}

/** Reduz a taxa de amostragem por um fator inteiro (média simples, suficiente para voz). */
export function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += x[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

/** Diferença em semitons ignorando a oitava (homem pode cantar música de mulher e vice-versa). */
export function pitchError(sung: number, target: number): number {
  const d = (((sung - target) % 12) + 12) % 12;
  return Math.min(d, 12 - d);
}
