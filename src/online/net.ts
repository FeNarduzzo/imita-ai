// Conexão entre aparelhos: WebRTC (PeerJS). O servidor público do PeerJS só apresenta os
// aparelhos; o jogo e os áudios vão direto de um para o outro.
import Peer, { type DataConnection } from 'peerjs';

const ROOM_PREFIX = 'imita-ai-sala-v1-';
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
  private conns = new Map<string, DataConnection>();
  onMessage: (connId: string, msg: Msg) => void = () => {};
  onJoin: (connId: string) => void = () => {};
  onLeave: (connId: string) => void = () => {};
  onError: (msg: string) => void = () => {};

  open(): Promise<string> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = makeCode();
        const peer = new Peer(ROOM_PREFIX + code, { debug: 0 });
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
      this.onJoin(conn.connectionId);
    });
    conn.on('data', (d) => this.onMessage(conn.connectionId, d as Msg));
    const gone = () => {
      if (this.conns.delete(conn.connectionId)) this.onLeave(conn.connectionId);
    };
    conn.on('close', gone);
    conn.on('error', gone);
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
    setTimeout(() => this.peer?.destroy(), 150);
    this.conns.clear();
  }
}

export class GuestNet {
  peer: Peer | null = null;
  private conn: DataConnection | null = null;
  onMessage: (msg: Msg) => void = () => {};
  onClose: () => void = () => {};

  join(code: string): Promise<void> {
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
        const conn = peer.connect(ROOM_PREFIX + cleanCode(code), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        });
        conn.on('data', (d) => this.onMessage(d as Msg));
        conn.on('close', () => this.onClose());
        conn.on('error', () => this.onClose());
      });
    });
  }

  send(msg: Msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    try { this.conn?.close(); } catch { /* ok */ }
    setTimeout(() => this.peer?.destroy(), 150);
  }
}
