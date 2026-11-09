// Preparo das músicas do karaokê, tudo no próprio aparelho:
//  - tirar a voz: o que está no centro do estéreo (normalmente a voz) sai; os lados ficam,
//    e o grave do centro (baixo e bumbo) volta, para não ficar sem peso;
//  - linha da melodia: o tom da faixa da voz (150–1100 Hz do centro), a cada 20 ms.
import { decodeData } from '../audio/engine';
import { hzToMidi, yin } from './pitch';
import type { Melody } from './store';

const MELODY_SR = 8000;
const HOP = 0.02;
const WIN = 512;

const OfflineCtx = (): typeof OfflineAudioContext =>
  window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

export async function decodeSong(blob: Blob): Promise<AudioBuffer> {
  try {
    return await decodeData(await blob.arrayBuffer());
  } catch {
    throw new Error('Não deu para abrir esse arquivo de música. Tente um MP3, M4A ou WAV.');
  }
}

/** A música tem estéreo de verdade? (em mono não dá para separar a voz) */
export function isStereo(b: AudioBuffer): boolean {
  if (b.numberOfChannels < 2) return false;
  const l = b.getChannelData(0);
  const r = b.getChannelData(1);
  let side = 0;
  let mid = 0;
  for (let i = 0; i < l.length; i += 64) {
    side += Math.abs(l[i] - r[i]);
    mid += Math.abs(l[i] + r[i]);
  }
  return side > mid * 0.04;
}

/** Versão sem voz (karaokê). Em música mono, devolve a original. */
export async function instrumental(b: AudioBuffer): Promise<AudioBuffer> {
  if (!isStereo(b)) return b;
  const ctx = new (OfflineCtx())(2, b.length, b.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = b;
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  src.connect(split);
  const gain = (v: number) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // lado = (E − D)/2 → esquerda; −lado → direita
  const sideL = gain(1);
  const sideR = gain(1);
  const lPos = gain(0.5); const rNeg = gain(-0.5);
  const lNeg = gain(-0.5); const rPos = gain(0.5);
  split.connect(lPos, 0); split.connect(rNeg, 1);
  split.connect(lNeg, 0); split.connect(rPos, 1);
  lPos.connect(sideL); rNeg.connect(sideL);
  lNeg.connect(sideR); rPos.connect(sideR);
  // grave do centro (baixo/bumbo) volta nos dois lados
  const mid = gain(1);
  const ml = gain(0.5); const mr = gain(0.5);
  split.connect(ml, 0); split.connect(mr, 1);
  ml.connect(mid); mr.connect(mid);
  const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 140; lp1.Q.value = 0.7;
  const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 140; lp2.Q.value = 0.7;
  mid.connect(lp1).connect(lp2);
  const out = gain(1.4);
  sideL.connect(merge, 0, 0);
  sideR.connect(merge, 0, 1);
  lp2.connect(merge, 0, 0);
  lp2.connect(merge, 0, 1);
  merge.connect(out).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

/** Mistura da versão sem voz com a original (voz guia baixinha). */
export async function guideMix(b: AudioBuffer, inst: AudioBuffer, voice = 0.35): Promise<AudioBuffer> {
  const ctx = new (OfflineCtx())(2, b.length, b.sampleRate);
  const a = ctx.createBufferSource(); a.buffer = inst;
  const o = ctx.createBufferSource(); o.buffer = b;
  const ga = ctx.createGain(); ga.gain.value = 1 - voice * 0.5;
  const go = ctx.createGain(); go.gain.value = voice;
  a.connect(ga).connect(ctx.destination);
  o.connect(go).connect(ctx.destination);
  a.start(); o.start();
  return ctx.startRendering();
}

/** Faixa da voz (centro, 150–1100 Hz) em mono e 8 kHz, para achar a melodia. */
async function voiceBand(b: AudioBuffer): Promise<Float32Array> {
  const len = Math.ceil(b.duration * MELODY_SR);
  const ctx = new (OfflineCtx())(1, len, MELODY_SR);
  const src = ctx.createBufferSource();
  src.buffer = b;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  src.connect(hp).connect(lp).connect(ctx.destination); // o contexto mono soma E+D = centro
  src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/** Linha da melodia (tom a cada 20 ms). `onProgress` vai de 0 a 1. */
export async function extractMelody(b: AudioBuffer, onProgress?: (p: number) => void): Promise<Melody> {
  const x = await voiceBand(b);
  const hopN = Math.round(HOP * MELODY_SR);
  const frames = Math.max(0, Math.floor((x.length - WIN) / hopN));
  const midi = new Float32Array(frames).fill(NaN);
  // nível de referência para ignorar trechos sem voz
  let peak = 0;
  for (let i = 0; i < x.length; i += 32) peak = Math.max(peak, Math.abs(x[i]));
  const floor = (peak * 0.04) ** 2;
  for (let f = 0; f < frames; f++) {
    const seg = x.subarray(f * hopN, f * hopN + WIN);
    let e = 0;
    for (let i = 0; i < seg.length; i++) e += seg[i] * seg[i];
    if (e / seg.length > floor) {
      const hz = yin(seg, MELODY_SR, 80, 1000, 0.12);
      if (hz) midi[f] = hzToMidi(hz);
    }
    if (f % 400 === 0) {
      onProgress?.(f / frames);
      await new Promise((r) => setTimeout(r, 0)); // não trava a tela
    }
  }
  // mediana de 5 quadros: tira saltos soltos de oitava/ruído
  const out = new Float32Array(frames).fill(NaN);
  const win: number[] = [];
  for (let f = 0; f < frames; f++) {
    win.length = 0;
    for (let k = -2; k <= 2; k++) { const v = midi[f + k]; if (v === v && v !== undefined) win.push(v); }
    if (win.length >= 3 && midi[f] === midi[f]) {
      win.sort((p, q) => p - q);
      out[f] = win[win.length >> 1];
    }
  }
  onProgress?.(1);
  return { hop: HOP, midi: out };
}
