// Conexão entre aparelhos: WebRTC (PeerJS). O servidor público do PeerJS só apresenta os
// aparelhos; o jogo e os áudios vão direto de um para o outro.
import Peer, { type DataConnection } from 'peerjs';

// v2 (versão 1.1): salas com líder 👑, entrada no meio e sinal de vida. Versões diferentes não se misturam.
export const ROOM_PREFIX = 'imita-ai-sala-v2-';
export const TABLE_PREFIX = 'imita-ai-mesa-v2-';
/** Sinal de vida: cada lado manda um "ping" a cada 4 s; 30 s sem nada = a outra ponta saiu. */
const BEAT_MS = 4000;
const GONE_MS = 30000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export const makeCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

type Msg = Record<string, unknown> & { t: string };

function friendly(err: unknown): string {
  const type = (err as { type?: string }).type;
  switch (type) {
    case 'peer-unavailable': return 'Sala não encontrada. Confira o código (e se a sala ainda está aberta).';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Sem conexão com o servidor de salas. Verifique a internet e tente de novo.';
    case 'browser-incompatible': return 'Este navegador não suporta jogar online.';
    default: return (err as Error)?.message || 'Falha na conexão.';
  }
}

export class HostNet {
  peer: Peer | null = null;
  code = '';
  constructor(private prefix = ROOM_PREFIX) {}
  private conns = new Map<string, DataConnection>();
  private seen = new Map<string, number>();
  private beat: ReturnType<typeof setInterval> | null = null;
  onMessage: (connId: string, msg: Msg) => void = () => {};
  onJoin: (connId: string) => void = () => {};
  onLeave: (connId: string) => void = () => {};
  onError: (msg: string) => void = () => {};

  open(): Promise<string> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = makeCode();
        const peer = new Peer(this.prefix + code, { debug: 0 });
        peer.on('open', () => {
          this.peer = peer;
          this.code = code;
          peer.on('connection', (conn) => this.accept(conn));
          peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ok */ } });
          resolve(code);
        });
        peer.on('error', (err) => {
          const type = (err as { type?: string }).type;
          if (!this.peer && type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
          if (!this.peer) { peer.destroy(); reject(new Error(friendly(err))); return; }
          if (type !== 'peer-unavailable') this.onError(friendly(err));
        });
      };
      attempt();
    });
  }

  private accept(conn: DataConnection) {
    conn.on('open', () => {
      this.conns.set(conn.connectionId, conn);
      this.seen.set(conn.connectionId, Date.now());
      this.startBeat();
      this.onJoin(conn.connectionId);
    });
    conn.on('data', (d) => {
      this.seen.set(conn.connectionId, Date.now());
      if ((d as Msg)?.t === 'ping') return;
      this.onMessage(conn.connectionId, d as Msg);
    });
    const gone = () => this.drop(conn.connectionId);
    conn.on('close', gone);
    conn.on('error', gone);
  }

  private drop(connId: string) {
    this.seen.delete(connId);
    if (this.conns.delete(connId)) this.onLeave(connId);
  }

  /** Celular que fechou de repente não avisa que saiu: sem sinal de vida por 30 s, conta como saída. */
  private startBeat() {
    if (this.beat) return;
    this.beat = setInterval(() => {
      const now = Date.now();
      for (const [id, c] of [...this.conns]) {
        if (now - (this.seen.get(id) ?? now) > GONE_MS) {
          try { c.close(); } catch { /* ok */ }
          this.drop(id);
        } else if (c.open) c.send({ t: 'ping' });
      }
    }, BEAT_MS);
  }

  send(connId: string, msg: Msg) {
    const c = this.conns.get(connId);
    if (c?.open) c.send(msg);
  }

  broadcast(msg: Msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  close() {
    this.broadcast({ t: 'closed' });
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    setTimeout(() => this.peer?.destroy(), 150);
    this.conns.clear();
    this.seen.clear();
  }
}

export class GuestNet {
  peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private lastSeen = Date.now();
  private beat: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  onMessage: (msg: Msg) => void = () => {};
  onClose: () => void = () => {};

  private lost() {
    if (this.closed) return;
    this.closed = true;
    if (this.beat) clearInterval(this.beat);
    this.onClose();
  }

  join(code: string, prefix = ROOM_PREFIX): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let done = false;
      const fail = (e: unknown) => {
        if (done) return;
        done = true;
        peer.destroy();
        reject(new Error(friendly(e)));
      };
      const timer = setTimeout(() => fail(new Error('A sala não respondeu. Confira o código e tente de novo.')), 15000);
      peer.on('error', (e) => { if (!done) { clearTimeout(timer); fail(e); } });
      peer.on('open', () => {
        const conn = peer.connect(prefix + cleanCode(code), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.lastSeen = Date.now();
          // Sinal de vida para o anfitrião, e o anfitrião sumido por 30 s = sala caiu.
          this.beat = setInterval(() => {
            if (Date.now() - this.lastSeen > GONE_MS) { try { conn.close(); } catch { /* ok */ } this.lost(); return; }
            if (conn.open) conn.send({ t: 'ping' });
          }, BEAT_MS);
          resolve();
        });
        conn.on('data', (d) => {
          this.lastSeen = Date.now();
          if ((d as Msg)?.t === 'ping') return;
          this.onMessage(d as Msg);
        });
        conn.on('close', () => this.lost());
        conn.on('error', () => this.lost());
      });
    });
  }

  send(msg: Msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    if (this.beat) clearInterval(this.beat);
    try { this.conn?.close(); } catch { /* ok */ }
    setTimeout(() => this.peer?.destroy(), 150);
  }
}
