import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { play, sfx, type Playing } from '../audio/engine';
import type { Player } from '../game/model';

export function Logo({ big = false }: { big?: boolean }) {
  return (
    <div className={`logo ${big ? 'logo-big' : ''}`}>
      <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 14c0-5 4-9 9-9h26c5 0 9 4 9 9v20c0 5-4 9-9 9H30l-11 11v-11c-5 0-9-4-9-9z" fill="#ff4f9a" />
        <path d="M10 14c0-5 4-9 9-9h26c5 0 9 4 9 9v20c0 5-4 9-9 9H30l-11 11v-11c-5 0-9-4-9-9z" fill="none" stroke="#1b0b33" strokeWidth="2" opacity=".25" />
        <g fill="#ffd23f">
          <rect x="18" y="20" width="5" height="10" rx="2.5" />
          <rect x="26" y="14" width="5" height="22" rx="2.5" />
          <rect x="34" y="17" width="5" height="16" rx="2.5" />
          <rect x="42" y="21" width="5" height="8" rx="2.5" />
        </g>
      </svg>
      <span className="logo-text">Imita <b>Aí!</b></span>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => { sfx('click'); onChange(!on); }}
    />
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; t: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => { sfx('click'); onChange(o.v); }}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ p, size = '' }: { p: Pick<Player, 'emoji' | 'color'>; size?: '' | 's' | 'l' | 'xl' }) {
  return <div className={`avatar ${size}`} style={{ ['--c' as string]: p.color }}>{p.emoji}</div>;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, body, yes, onYes, onNo }: { title: string; body: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <Sheet onClose={onNo}>
      <h2 className="title-m">{title}</h2>
      <p className="muted" style={{ margin: 0 }}>{body}</p>
      <div className="row">
        <button className="btn ghost grow" onClick={onNo}>Voltar</button>
        <button className="btn pink grow" onClick={onYes}>{yes}</button>
      </div>
    </Sheet>
  );
}

/** Toca um AudioBuffer com controle de progresso (0..1). */
export function usePlayer() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cur = useRef<Playing | null>(null);
  const raf = useRef(0);
  const stop = () => {
    cur.current?.stop();
    cur.current = null;
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  useEffect(() => stop, []);
  const start = (buf: AudioBuffer, gain = 1): Promise<void> => {
    stop();
    const p = play(buf, gain);
    cur.current = p;
    setPlaying(true);
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1000 / p.duration);
      setProgress(k);
      if (k < 1 && cur.current === p) raf.current = requestAnimationFrame(tick);
    };
    tick();
    return p.ended.then(() => {
      if (cur.current === p) { cur.current = null; setPlaying(false); setProgress(1); }
    });
  };
  return { start, stop, progress, playing };
}

export function Ring({ value, size = 196, stroke = 10, color = 'var(--yellow)', track = 'rgba(255,255,255,0.08)' }: { value: number; size?: number; stroke?: number; color?: string; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
    </svg>
  );
}

export function PitchChart({ target, attempt }: { target: number[]; attempt: number[] }) {
  const W = 320;
  const H = 96;
  const paths = useMemo(() => {
    const all = [...target, ...attempt].filter((v) => Number.isFinite(v));
    if (all.length < 4) return null;
    const lo = Math.min(-6, ...all);
    const hi = Math.max(6, ...all);
    const n = Math.max(target.length, 2);
    const mk = (arr: number[]) => {
      let d = '';
      let pen = false;
      arr.forEach((v, i) => {
        if (!Number.isFinite(v)) { pen = false; return; }
        const x = (i / (n - 1)) * W;
        const y = H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
        d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
        pen = true;
      });
      return d;
    };
    return { t: mk(target), a: mk(attempt) };
  }, [target, attempt]);
  if (!paths) return null;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Curva de tom: original e imitação">
      <path d={paths.t} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={paths.a} fill="none" stroke="var(--pink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Confetti({ n = 70 }: { n?: number }) {
  const bits = useMemo(() => Array.from({ length: n }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    dur: 2.2 + Math.random() * 2,
    color: ['#ff4f9a', '#ffd23f', '#3de0f5', '#9ef01a', '#ff8a3d', '#b388ff'][i % 6],
    rot: Math.random() * 360,
  })), [n]);
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}

export function useCountUp(target: number, ms = 1100, run = true) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return; }
    let raf = 0;
    const t0 = performance.now();
    let lastTick = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const val = Math.round(target * e);
      setV(val);
      if (val - lastTick >= 7) { lastTick = val; sfx('tock'); }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, ms, run]);
  return v;
}
