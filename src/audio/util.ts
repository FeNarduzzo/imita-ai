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
