// Calibração da nota: compara cada som dos pacotes com versões "imitadas"
// (processadas, com outra voz, TTS) e com sons sem relação.
// Uso: node scripts/calibrate.ts [pastaTTS] [dificuldade]
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { analyze, compare, resample, type Features, type Difficulty } from '../src/audio/analysis.ts';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ttsDir = process.argv[2] || '';
const diff = (process.argv[3] || 'normal') as Difficulty;
const root = path.resolve(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(path.join(root, 'public/packs/index.json'), 'utf8'));
const all: { id: string; name: string; file: string; duration: number }[] = index.packs.flatMap((p: any) => p.sounds);

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function decode(args: string[]): Float32Array {
  const buf = execFileSync(FFMPEG, ['-v', 'error', ...args, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return resample(new Float32Array(f), 44100);
}

const PHONE = 'adelay=300,apad=pad_dur=0.8,highpass=f=150,lowpass=f=3800,volume=0.3';
const noiseMix = (chain: string) => [
  '-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.004:d=20',
  '-filter_complex', `[0]${chain}[v];[v][1]amix=inputs=2:duration=first:normalize=0`,
];

const cats: Record<string, number[]> = {};
const costs: Record<string, number[]> = {};
let anchors: Features[] = [];
const push = (k: string, t: Features, a: Features) => {
  const r = compare(t, a, diff, anchors);
  (cats[k] ||= []).push(r.total);
  (costs[k] ||= []).push(r.raw.rel);
  return r;
};

const sample = all.filter((s) => s.duration > 0.4).sort(() => rnd() - 0.5).slice(0, 36);
const cache = new Map<string, Features>();
const feat = (file: string) => {
  if (!cache.has(file)) cache.set(file, analyze(decode(['-i', path.join(root, 'public', file)])));
  return cache.get(file)!;
};

anchors = all.filter((s) => !sample.includes(s) && s.duration > 0.8 && s.duration < 5).sort(() => rnd() - 0.5).slice(0, 5).map((s) => feat(s.file));
const t0 = Date.now();
for (const s of sample) {
  const file = path.join(root, 'public', s.file);
  const T = feat(s.file);
  push('1 próprio', T, T);
  push('2 celular', T, analyze(decode(['-i', file, ...noiseMix(PHONE)]), true));
  push('3b voz (formantes)', T, analyze(decode(['-i', file, ...noiseMix(`rubberband=pitch=0.75:tempo=0.9:formant=preserved,${PHONE}`)]), true));
  push('3 outra voz', T, analyze(decode(['-i', file, ...noiseMix(`rubberband=pitch=0.7:tempo=0.88,${PHONE}`)]), true));
  for (let k = 0; k < 3; k++) {
    const o = all[Math.floor(rnd() * all.length)];
    if (o.id !== s.id) push('6 outro som', T, analyze(decode(['-i', path.join(root, 'public', o.file), '-af', PHONE]), true));
  }
  push('7 ruído', T, analyze(decode(['-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.05:d=2.5']), true));
}

if (ttsDir && existsSync(ttsDir)) {
  const withTts = all.filter((s) => existsSync(path.join(ttsDir, s.id.replace('/', '__') + '.wav')));
  for (const s of withTts.slice(0, 50)) {
    const T = feat(s.file);
    const same = path.join(ttsDir, s.id.replace('/', '__') + '.wav');
    push('4 TTS mesma frase', T, analyze(decode(['-i', same, ...noiseMix(PHONE)]), true));
    const other = withTts[Math.floor(rnd() * withTts.length)];
    if (other.id !== s.id) {
      const o = path.join(ttsDir, other.id.replace('/', '__') + '.wav');
      push('5 TTS outra frase', T, analyze(decode(['-i', o, ...noiseMix(PHONE)]), true));
    }
  }
}

const pct = (v: number[], p: number) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`dificuldade=${diff}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log('categoria'.padEnd(20), 'n'.padStart(3), '  p10  p50  p90 |   rel p10  p50  p90');
for (const k of Object.keys(cats).sort()) {
  const v = cats[k];
  const c = costs[k];
  console.log(k.padEnd(20), String(v.length).padStart(3), String(pct(v, 0.1)).padStart(5), String(pct(v, 0.5)).padStart(4), String(pct(v, 0.9)).padStart(4),
    '|', pct(c, 0.1).toFixed(2).padStart(9), pct(c, 0.5).toFixed(2).padStart(4), pct(c, 0.9).toFixed(2).padStart(4));
}
