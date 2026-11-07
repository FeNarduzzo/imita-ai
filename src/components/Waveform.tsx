import { useEffect, useRef } from 'react';

/** Envelope (0..1) de um áudio em `cols` colunas, com curva perceptiva. */
export function envelope(x: Float32Array, cols = 96): Float32Array {
  const out = new Float32Array(cols);
  if (!x.length) return out;
  const step = x.length / cols;
  let max = 0;
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * step);
    const b = Math.max(a + 1, Math.min(x.length, Math.floor((c + 1) * step)));
    let s = 0;
    let pk = 0;
    for (let i = a; i < b; i++) {
      const v = Math.abs(x[i]);
      s += v * v;
      if (v > pk) pk = v;
    }
    out[c] = Math.sqrt(s / (b - a)) * 0.6 + pk * 0.4;
    if (out[c] > max) max = out[c];
  }
  if (max > 0) for (let c = 0; c < cols; c++) out[c] = (out[c] / max) ** 0.7;
  return out;
}

export function envelopeOf(buf: AudioBuffer | null | undefined, cols = 96): Float32Array | null {
  return buf ? envelope(buf.getChannelData(0), cols) : null;
}

interface Props {
  /** Envelope do som (guia). */
  env?: Float32Array | null;
  /** Fração da largura ocupada pelo envelope (ex.: som de 3 s numa janela de 4 s = 0.75). */
  span?: number;
  /** Envelope ao vivo (voz sendo gravada), ocupando a largura toda. */
  live?: Float32Array | null;
  /** Posição do cursor, 0..1 da largura. */
  progress: number;
  /** Mostra o cursor. */
  cursor?: boolean;
  height?: number;
  label?: string;
}

/** Forma de onda espelhada com cursor que acompanha o som. */
export function Waveform({ env, span = 1, live, progress, cursor = true, height = 92, label }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    const maxH = mid - 5 * dpr;
    const p = Math.max(0, Math.min(1, progress));

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, mid - dpr / 2, w, dpr);

    const played = ctx.createLinearGradient(0, mid - maxH, 0, mid + maxH);
    played.addColorStop(0, '#ff4f9a');
    played.addColorStop(0.5, '#ffd23f');
    played.addColorStop(1, '#ff4f9a');

    const bar = (x: number, bw: number, amp: number) => {
      const bh = Math.max(2 * dpr, amp * maxH);
      const r = Math.min(bw / 2, bh);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, mid - bh, bw, bh * 2, r);
      else ctx.rect(x, mid - bh, bw, bh * 2);
      ctx.fill();
    };

    if (env && env.length) {
      const cols = env.length;
      const colW = (w * span) / cols;
      const bw = Math.max(1, colW * 0.62);
      for (let i = 0; i < cols; i++) {
        const x = i * colW + (colW - bw) / 2;
        const done = (i + 0.5) / cols * span <= p;
        ctx.fillStyle = done && !live ? played : live ? 'rgba(61,224,245,0.28)' : 'rgba(61,224,245,0.42)';
        bar(x, bw, env[i]);
      }
    }

    if (live && live.length) {
      const cols = live.length;
      const colW = w / cols;
      const bw = Math.max(1, colW * 0.5);
      ctx.fillStyle = played;
      for (let i = 0; i < cols; i++) if (live[i] > 0) bar(i * colW + (colW - bw) / 2, bw, live[i]);
    }

    if (cursor) {
      const x = Math.round(p * (w - 3 * dpr)) + 1.5 * dpr;
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 8 * dpr;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1.5 * dpr, 2 * dpr, 3 * dpr, h - 4 * dpr);
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      for (const y of [4 * dpr, h - 4 * dpr]) {
        ctx.beginPath();
        ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  return (
    <div className="wave-box" role="img" aria-label={label || 'Forma de onda do som'}>
      <canvas ref={ref} style={{ height }} />
    </div>
  );
}
