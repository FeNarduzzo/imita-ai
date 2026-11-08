// Áudio compacto para mandar pela rede.
//  - Gravações: 22 kHz, μ-law 8 bits (~22 KB por segundo).
//  - Som original: 22 kHz, PCM 16 bits (~44 KB por segundo), com mais qualidade.
import { resample } from '../audio/analysis';

export const NET_SR = 22050;

export interface NetAudio { sr: number; kind: 'mulaw' | 'pcm16'; data: ArrayBuffer }

const BIAS = 0x84;
const CLIP = 32635;

function mulawByte(sample: number): number {
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(CLIP, s) + BIAS;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}

const MULAW_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exp = (u >> 4) & 0x07;
  const mant = u & 0x0f;
  const s = (((mant << 3) + BIAS) << exp) - BIAS;
  MULAW_TABLE[i] = (sign ? -s : s) / 32768;
}

const toNet = (x: Float32Array, sr: number) => (sr === NET_SR ? x : resample(x, sr, NET_SR));

export function encodeTake(x: Float32Array, sr: number): NetAudio {
  const y = toNet(x, sr);
  const out = new Uint8Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = mulawByte(y[i]);
  return { sr: NET_SR, kind: 'mulaw', data: out.buffer };
}

export function encodeTarget(x: Float32Array, sr: number): NetAudio {
  const y = toNet(x, sr);
  const out = new Int16Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, y[i])) * 32767);
  return { sr: NET_SR, kind: 'pcm16', data: out.buffer };
}

/** Aceita ArrayBuffer ou view (o PeerJS às vezes entrega Uint8Array). */
function bytes(d: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (d instanceof ArrayBuffer) return d;
  const v = d as ArrayBufferView;
  return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
}

export function decodeAudio(a: NetAudio): Float32Array {
  const buf = bytes(a.data);
  if (a.kind === 'mulaw') {
    const u = new Uint8Array(buf);
    const out = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++) out[i] = MULAW_TABLE[u[i]];
    return out;
  }
  const s = new Int16Array(buf);
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s[i] / 32768;
  return out;
}
