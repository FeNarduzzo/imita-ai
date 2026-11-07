/** Corta o silêncio do começo e do fim de uma gravação (mantém uma folguinha). */
export function trimSilence(x: Float32Array, sr: number): Float32Array {
  const hop = Math.floor(sr * 0.01);
  const n = Math.floor(x.length / hop);
  if (n < 3) return x;
  const rms = new Float32Array(n);
  let peak = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < hop; i++) s += x[f * hop + i] ** 2;
    rms[f] = Math.sqrt(s / hop);
    peak = Math.max(peak, rms[f]);
  }
  const thr = peak * 0.06;
  let a = 0;
  while (a < n - 1 && rms[a] < thr) a++;
  let b = n - 1;
  while (b > a && rms[b] < thr) b--;
  const start = Math.max(0, (a - 5) * hop);
  const end = Math.min(x.length, (b + 12) * hop);
  return x.slice(start, end);
}

export function peakLevel(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

/** Volume (RMS em dBFS) só dos trechos com som, ignorando o silêncio. */
export function activeLoudnessDb(x: Float32Array, sr: number): number {
  return levels(x, sr).loud;
}

/** loud = RMS dos trechos com som; floor = ruído de fundo (10% mais baixos), em dBFS. */
export function levels(x: Float32Array, sr: number): { loud: number; floor: number } {
  const frame = Math.max(1, Math.round(sr * 0.02));
  const n = Math.floor(x.length / frame);
  if (!n) return { loud: -120, floor: -120 };
  const e = new Float64Array(n);
  let max = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < frame; i++) s += x[f * frame + i] ** 2;
    e[f] = s / frame;
    if (e[f] > max) max = e[f];
  }
  let sum = 0;
  let cnt = 0;
  for (let f = 0; f < n; f++) if (e[f] >= max * 0.03) { sum += e[f]; cnt++; }
  const sorted = Array.from(e).sort((p, q) => p - q);
  const floor = 10 * Math.log10(sorted[Math.floor(n * 0.1)] + 1e-12);
  return { loud: cnt ? 10 * Math.log10(sum / cnt + 1e-12) : -120, floor };
}

/**
 * Deixa uma gravação de microfone no mesmo volume dos sons dos pacotes:
 * tira o grave/DC, sobe o volume até ~-16 dBFS (RMS dos trechos com som) e
 * passa por um limitador para não estourar. Gravações vazias continuam vazias.
 */
export function louden(x: Float32Array, sr: number, targetDb = -16, ceiling = 0.9): Float32Array {
  const n = x.length;
  const y = new Float32Array(n);
  // Passa-alta de 1 polo em ~70 Hz (remove DC e ronco de manuseio)
  const a = Math.exp((-2 * Math.PI * 70) / sr);
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    py = a * (py + x[i] - px);
    px = x[i];
    y[i] = py;
  }
  const { loud, floor } = levels(y, sr);
  if (loud < -75) return y;
  // Não deixa o ruído de fundo passar de ~-32 dBFS, e se não há voz clara acima do
  // ruído (ninguém falou) sobe no máximo 2x — senão o silêncio vira chiado.
  const noiseCap = Math.max(1, 10 ** ((-32 - floor) / 20));
  const clear = loud - floor >= 8;
  const gain = Math.max(1, Math.min(10 ** ((targetDb - loud) / 20), 10 ** (36 / 20), noiseCap, clear ? Infinity : 2));

  // Limitador por blocos de 2,5 ms com ataque antecipado e soltura suave
  const block = Math.max(1, Math.round(sr * 0.0025));
  const nb = Math.ceil(n / block);
  const g = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    let pk = 0;
    for (let i = b * block; i < Math.min(n, (b + 1) * block); i++) pk = Math.max(pk, Math.abs(y[i]));
    g[b] = pk * gain > ceiling ? ceiling / (pk * gain) : 1;
  }
  const release = block / (sr * 0.12);
  const attack = block / (sr * 0.01);
  for (let b = 1; b < nb; b++) g[b] = Math.min(g[b], g[b - 1] + release);
  for (let b = nb - 2; b >= 0; b--) g[b] = Math.min(g[b], g[b + 1] + attack);

  const out = new Float32Array(n);
  for (let b = 0; b < nb; b++) {
    const g0 = g[b];
    const g1 = b + 1 < nb ? Math.min(g[b + 1], g0 + release) : g0;
    const s0 = b * block;
    const len = Math.min(block, n - s0);
    for (let k = 0; k < len; k++) {
      const v = y[s0 + k] * gain * (g0 + ((g1 - g0) * k) / block);
      out[s0 + k] = v > 0.99 ? 0.99 : v < -0.99 ? -0.99 : v;
    }
  }
  return out;
}
