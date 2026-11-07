// Áudio do jogo.
//
// Dois motores separados de propósito:
//  - REPRODUÇÃO (sons, imitações, efeitos): nunca encosta no microfone, é tratado como mídia
//    de jogo e passa por um compressor que deixa tudo mais alto sem distorcer.
//  - GRAVAÇÃO (Mic): contexto próprio, aberto só durante a gravação e fechado em seguida.
// No iPhone, usar o microfone joga a página no modo "chamada" (volume de ligação). Por isso,
// ao fechar o microfone a sessão volta para "playback" e o motor de reprodução é recriado.

type AC = typeof AudioContext;
const AudioCtor = (): AC => window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxVolume = 0.7;
let micsOpen = 0;

type SessionType = 'playback' | 'play-and-record' | 'auto';

/** Tipo da sessão de áudio (Safari/iOS 16.4+). "playback" = mídia, não chamada. */
export function setAudioSession(type: SessionType) {
  if (type === 'playback' && micsOpen > 0) return;
  const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (!s) return;
  try { if (s.type !== type) s.type = type; } catch { /* não suportado */ }
}

function buildPlayback(): AudioContext {
  setAudioSession('playback');
  const c = new (AudioCtor())({ latencyHint: 'playback' });
  // Saída: volume geral -> compressor (mais alto e sem estourar) -> alto-falante
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const g = c.createGain();
  g.gain.value = 1.6;
  g.connect(comp).connect(c.destination);
  ctx = c;
  master = g;
  return c;
}

export function audio(): AudioContext {
  if (!ctx || ctx.state === 'closed') return buildPlayback();
  return ctx;
}

/**
 * Garante o áudio tocando como mídia. Deve ser chamado num toque/clique (o iOS só libera
 * o áudio dentro de um gesto) — main.tsx faz isso em todo toque na tela.
 */
export function unlockAudio(): Promise<void> {
  setAudioSession('playback');
  const c = audio();
  if (c.state === 'running') return Promise.resolve();
  try {
    // Truque do iOS: tocar um buffer vazio dentro do gesto destrava o contexto.
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch { /* ok */ }
  return c.resume().catch(() => {});
}

/** Recria o motor de reprodução (depois do microfone, o iOS deixa o antigo em modo chamada). */
function resetPlayback() {
  const old = ctx;
  ctx = null;
  master = null;
  if (old && old.state !== 'closed') old.close().catch(() => {});
  buildPlayback();
}

export function setSfxVolume(v: number) { sfxVolume = v; }

export function toBuffer(x: Float32Array, sr: number): AudioBuffer {
  const b = audio().createBuffer(1, Math.max(1, x.length), sr);
  b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
  return b;
}

export function mono(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0).slice();
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}

export async function decodeUrl(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return decodeData(await res.arrayBuffer());
}

export function decodeData(data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const p = audio().decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

export interface Playing { stop(): void; ended: Promise<void>; startedAt: number; duration: number }

export function play(buf: AudioBuffer, gain = 1): Playing {
  const c = audio();
  setAudioSession('playback');
  if (c.state !== 'running') c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master!);
  let done!: () => void;
  const ended = new Promise<void>((r) => (done = r));
  src.onended = () => done();
  // Se o contexto ainda não estiver tocando (sem gesto), não trava a tela esperando o fim.
  const guard = setTimeout(() => done(), (buf.duration + 1.5) * 1000);
  ended.then(() => clearTimeout(guard));
  const startedAt = c.currentTime;
  src.start();
  return {
    stop: () => { try { src.stop(); } catch { /* já parou */ } done(); },
    ended,
    startedAt,
    duration: buf.duration,
  };
}

// ---------------------------------------------------------------- efeitos de interface

type Sfx = 'tick' | 'go' | 'pop' | 'reveal' | 'win' | 'tock' | 'bad' | 'click';

export function sfx(name: Sfx) {
  if (sfxVolume <= 0) return;
  const c = audio();
  if (c.state !== 'running') return;
  const t = c.currentTime;
  const tone = (f: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, f2?: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t + start);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + start + dur);
    g.gain.setValueAtTime(0.0001, t + start);
    g.gain.exponentialRampToValueAtTime(vol * sfxVolume, t + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.connect(g).connect(master!);
    o.start(t + start);
    o.stop(t + start + dur + 0.02);
  };
  switch (name) {
    case 'tick': tone(660, 0, 0.09, 'triangle', 0.2); break;
    case 'go': tone(990, 0, 0.18, 'triangle', 0.22); tone(1320, 0.06, 0.2, 'triangle', 0.16); break;
    case 'pop': tone(420, 0, 0.08, 'sine', 0.2, 880); break;
    case 'click': tone(1200, 0, 0.03, 'square', 0.05); break;
    case 'tock': tone(300, 0, 0.04, 'square', 0.06); break;
    case 'reveal': tone(523, 0, 0.12, 'triangle'); tone(659, 0.08, 0.12, 'triangle'); tone(784, 0.16, 0.22, 'triangle'); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.2)); break;
    case 'bad': tone(300, 0, 0.35, 'sawtooth', 0.1, 120); break;
  }
}

export function vibrate(ms: number | number[]) {
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
}

// ---------------------------------------------------------------- microfone

export class Mic {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private proc: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private counted = false;
  level = 0;
  gain = 1;
  sampleRate = 48000;
  /** Nível de cada bloco gravado (2048 amostras), para desenhar a voz no tempo certo. */
  chunkLevels: number[] = [];
  readonly chunkSize = 2048;

  async open(echoCancellation = false) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este aparelho não dá acesso ao microfone.');
    micsOpen++;
    this.counted = true;
    setAudioSession('play-and-record');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // Sem processamento de chamada (eco/ruído/ganho automático): o volume da gravação é
        // ajustado depois, em louden().
        audio: { echoCancellation, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      // Contexto só para gravar — o de reprodução não encosta no microfone.
      const c = new (AudioCtor())();
      this.ctx = c;
      if (c.state !== 'running') await c.resume().catch(() => {});
      this.sampleRate = c.sampleRate;
      const src = c.createMediaStreamSource(this.stream);
      const proc = c.createScriptProcessor(this.chunkSize, 1, 1);
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        let s = 0;
        for (let i = 0; i < d.length; i++) s += d[i] * d[i];
        this.level = Math.sqrt(s / d.length) * this.gain;
        if (this.recording) {
          this.chunkLevels.push(this.level);
          const copy = new Float32Array(d.length);
          for (let i = 0; i < d.length; i++) copy[i] = d[i] * this.gain;
          this.chunks.push(copy);
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      src.connect(proc);
      proc.connect(sink).connect(c.destination);
      this.proc = proc;
    } catch (e) {
      this.close();
      throw e;
    }
  }

  start() {
    this.chunks = [];
    this.chunkLevels = [];
    this.recording = true;
  }

  stop(): Float32Array {
    this.recording = false;
    const n = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    this.chunks = [];
    return out;
  }

  close() {
    this.recording = false;
    if (this.proc) this.proc.onaudioprocess = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    const wasOpen = this.counted;
    if (this.counted) { micsOpen = Math.max(0, micsOpen - 1); this.counted = false; }
    this.stream = null;
    this.ctx = null;
    this.proc = null;
    this.level = 0;
    if (wasOpen && micsOpen === 0) {
      // Sai do modo chamada: sessão de mídia e motor de reprodução novo.
      setAudioSession('playback');
      resetPlayback();
    }
  }
}

/** Pede a permissão do microfone uma vez, no início da partida. */
export async function checkMic(): Promise<string | null> {
  try {
    const m = new Mic();
    await m.open();
    m.close();
    return null;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permissão do microfone negada. Libere o microfone nas configurações do aparelho.';
    if (name === 'NotFoundError') return 'Nenhum microfone encontrado neste aparelho.';
    return (e as Error).message || 'Microfone indisponível.';
  }
}
