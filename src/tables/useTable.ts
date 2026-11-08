// Mesa de jogo: roda um módulo (Blackjack, Duvido, Truco, Poker) offline (você + bots)
// ou online (anfitrião + convidados). Toda sala tem código e um líder 👑 (transferível):
// só o líder escolhe o jogo, configura, mexe nos bots e começa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/engine';
import { addCoins, getWallet, randomLook, type Look } from '../game/character';
import { COLORS } from '../game/model';
import { cleanCode, GuestNet, HostNet, TABLE_PREFIX } from '../online/net';
import { MODULES } from './modules';
import { BOT_NAMES, isError, type BaseState, type Config, type GameId, type GameModule, type SeatInfo } from './types';

export interface RoomSeat extends SeatInfo { online: boolean; clientId?: string; profileId?: string }
export interface RoomPublic {
  code: string | null; // null = offline
  leaderId: string;
  hostSeatId: string;
  seats: RoomSeat[];
  gameId: GameId;
  config: Config;
  phase: 'lobby' | 'game';
  /** Deixa entrar com a partida em andamento (senta na próxima rodada). */
  allowLateJoin: boolean;
  /** Quem chegou no meio e espera a próxima rodada. */
  waiting: RoomSeat[];
}
export interface Self { id: string; name: string; color: string; look?: Look }

type Mode = 'offline' | 'host' | 'guest';
const BOT_BANK = 1000;
const uid = () => Math.random().toString(36).slice(2, 9);

function sessionClient(): string {
  const k = 'imita.tableclient.v1';
  try {
    let id = sessionStorage.getItem(k);
    if (!id) { id = uid() + uid(); sessionStorage.setItem(k, id); }
    return id;
  } catch { return uid(); }
}

export function useTable() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [view, setView] = useState<unknown>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const roomRef = useRef<RoomPublic | null>(null);
  const stateRef = useRef<BaseState | null>(null);
  const hostNet = useRef<HostNet | null>(null);
  const guestNet = useRef<GuestNet | null>(null);
  const seatByConn = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishRef = useRef<() => void>(() => {});
  const applied = useRef(new Set<number>());
  const selfRef = useRef<Self | null>(null);
  const myIdRef = useRef<string | null>(null);

  const mod = (id?: GameId) => MODULES[id || roomRef.current!.gameId] as GameModule<BaseState, unknown, unknown>;

  /** Credita/debita na carteira deste aparelho os eventos de moeda do meu lugar. */
  const applyCoins = useCallback((st: { coinEvents?: { id: number; seatId: string; delta: number }[] } | null) => {
    const me = myIdRef.current;
    const profile = selfRef.current?.id;
    if (!st?.coinEvents || !me || !profile) return;
    for (const e of st.coinEvents) {
      if (e.seatId !== me || applied.current.has(e.id)) continue;
      applied.current.add(e.id);
      addCoins(profile, e.delta);
    }
  }, []);

  // ---------------------------------------------------------------- anfitrião / offline

  /** Senta quem está esperando, se a partida está num intervalo entre rodadas. */
  const admitWaiting = () => {
    const r = roomRef.current;
    let st = stateRef.current;
    if (!r || !st || st.over || r.phase !== 'game' || !r.waiting.length) return;
    const m = mod();
    if (!m.joinable || !m.canAdmit?.(st) || !m.addSeat) return;
    let seats = r.seats;
    const still: RoomSeat[] = [];
    for (const w of r.waiting) {
      const info = { id: w.id, name: w.name, color: w.color, look: w.look, bot: false, bank: w.bank };
      if (seats.length < m.maxSeats) {
        st = m.addSeat(st, info);
        seats = [...seats, w];
      } else {
        const bot = seats.find((x) => x.bot);
        if (bot && m.removeSeat) {
          st = m.addSeat(m.removeSeat(st, bot.id), info);
          seats = seats.map((x) => (x.id === bot.id ? w : x));
        } else still.push(w);
      }
    }
    if (still.length !== r.waiting.length) {
      stateRef.current = { ...st, banner: 'Gente nova na mesa! 👋' };
      roomRef.current = { ...r, seats, waiting: still };
      sfx('pop');
    }
  };

  /** Interrompeu no meio? Devolve as apostas em jogo e avisa todo mundo antes de largar a partida. */
  const refundInPlay = () => {
    const st = stateRef.current;
    const m = roomRef.current && mod();
    if (!st || st.over || !m?.refund || roomRef.current?.phase !== 'game') return;
    const back = m.refund(st);
    if (back === st) return;
    stateRef.current = back;
    publishRef.current();
  };

  const publish = useCallback(() => {
    admitWaiting();
    const r = roomRef.current;
    if (!r) return;
    const st = stateRef.current;
    const m = mod();
    const seats = st ? r.seats.map((x) => ({ ...x, bank: st.seats.find((y) => y.id === x.id)?.bank ?? x.bank })) : r.seats;
    const pub: RoomPublic = { ...r, seats };
    roomRef.current = pub;
    setRoom(pub);
    const mine = st ? m.view(st, myIdRef.current) : null;
    setView(mine);
    applyCoins(st);
    if (hostNet.current) {
      for (const [connId, seatId] of seatByConn.current) {
        hostNet.current.send(connId, { t: 'troom', room: pub as unknown as Record<string, unknown>, view: (st ? m.view(st, seatId) : null) as Record<string, unknown> });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCoins]);
  publishRef.current = publish;

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const r = roomRef.current;
    const st = stateRef.current;
    if (!r || !st || r.phase !== 'game' || st.over) return;
    const m = mod();
    const waiting = m.waitingFor(st);
    const botId = waiting.find((id) => r.seats.find((x) => x.id === id)?.bot);
    if (botId) {
      timer.current = setTimeout(() => {
        const cur = stateRef.current;
        if (!cur || roomRef.current?.phase !== 'game') return;
        const action = m.bot(cur, botId);
        if (action) {
          const next = m.act(cur, botId, action);
          if (!isError(next)) stateRef.current = next;
        }
        publish();
        schedule();
      }, 650 + Math.random() * 700);
      return;
    }
    const step = m.auto(st);
    if (step) {
      timer.current = setTimeout(() => {
        stateRef.current = step.state;
        publish();
        schedule();
      }, step.delay);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish]);

  const hostAct = useCallback((seatId: string, action: unknown): string | null => {
    const st = stateRef.current;
    if (!st || roomRef.current?.phase !== 'game') return 'A partida não começou.';
    const next = mod().act(st, seatId, action);
    if (isError(next)) return next.error;
    stateRef.current = next;
    publish();
    schedule();
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, schedule]);

  const setRoomState = (patch: Partial<RoomPublic>) => {
    roomRef.current = { ...roomRef.current!, ...patch };
    publish();
  };

  const newBot = (taken: RoomSeat[]): RoomSeat => {
    const names = BOT_NAMES.filter((n) => !taken.some((s) => s.name === `${n} 🤖`));
    const color = COLORS.find((c) => !taken.some((s) => s.color === c)) || COLORS[taken.length % COLORS.length];
    return { id: uid(), name: `${names[0] || 'Bot'} 🤖`, color, look: randomLook(), bot: true, bank: BOT_BANK, online: true };
  };

  /** Comandos do líder (validados no anfitrião). */
  const hostCommand = useCallback((fromSeat: string, cmd: Record<string, unknown>): string | null => {
    const r = roomRef.current;
    if (!r) return 'Sem sala.';
    if (fromSeat !== r.leaderId) return 'Só o líder da sala pode fazer isso.';
    const m = mod();
    switch (cmd.cmd) {
      case 'game': {
        if (r.phase !== 'lobby') return 'Volte para a sala de espera para trocar de jogo.';
        const g = cmd.gameId as GameId;
        if (!MODULES[g]) return 'Jogo desconhecido.';
        const gm = MODULES[g]!;
        let seats = r.seats.slice(0, gm.maxSeats);
        while (seats.length < gm.minSeats) seats = [...seats, newBot(seats)];
        setRoomState({ gameId: g, config: { ...gm.defaultConfig }, seats, allowLateJoin: gm.joinable && r.allowLateJoin });
        return null;
      }
      case 'config':
        if (r.phase !== 'lobby') return 'Configure na sala de espera.';
        setRoomState({ config: { ...r.config, [cmd.key as string]: cmd.value as string | number | boolean } });
        return null;
      case 'addBot':
        if (r.phase !== 'lobby') return 'Só na sala de espera.';
        if (r.seats.length >= m.maxSeats) return 'A mesa está cheia.';
        setRoomState({ seats: [...r.seats, newBot(r.seats)] });
        return null;
      case 'remove': {
        const target = r.seats.find((s) => s.id === cmd.seatId);
        if (!target || target.id === r.hostSeatId) return 'Não dá para remover este lugar.';
        if (r.phase !== 'lobby' && !target.bot) return 'Só na sala de espera.';
        for (const [conn, sid] of seatByConn.current) if (sid === target.id) { hostNet.current?.send(conn, { t: 'kicked' }); seatByConn.current.delete(conn); }
        const seats = r.seats.filter((s) => s.id !== target.id);
        setRoomState({ seats, leaderId: r.leaderId === target.id ? r.hostSeatId : r.leaderId });
        return null;
      }
      case 'leader': {
        const target = r.seats.find((s) => s.id === cmd.seatId);
        if (!target || target.bot) return 'Escolha uma pessoa (não um bot).';
        setRoomState({ leaderId: target.id });
        return null;
      }
      case 'start': {
        if (r.phase !== 'lobby') return null;
        if (r.seats.length < m.minSeats) return `Precisa de pelo menos ${m.minSeats} lugares.`;
        if (r.seats.length > m.maxSeats) return `No máximo ${m.maxSeats} lugares.`;
        applied.current.clear();
        stateRef.current = m.init(r.config, r.seats.map(({ id, name, color, look, bot, bank }) => ({ id, name, color, look, bot, bank })));
        setRoomState({ phase: 'game' });
        sfx('go');
        schedule();
        return null;
      }
      case 'lobby': {
        refundInPlay();
        stateRef.current = null;
        if (timer.current) clearTimeout(timer.current);
        const room = roomRef.current!;
        const free = Math.max(0, m.maxSeats - room.seats.length);
        setRoomState({ phase: 'lobby', seats: [...room.seats.map((x) => (x.online || !x.clientId ? x : { ...x, bot: true })), ...room.waiting.slice(0, free)], waiting: room.waiting.slice(free) });
        return null;
      }
      case 'lateJoin':
        setRoomState({ allowLateJoin: !!cmd.value });
        return null;
    }
    return 'Comando desconhecido.';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const onHostMessage = useCallback((connId: string, msg: Record<string, unknown>) => {
    const r = roomRef.current;
    const net = hostNet.current;
    if (!r || !net) return;
    if (msg.t === 'hello') {
      const cid = String(msg.clientId || '');
      let seat = r.seats.find((s) => s.clientId === cid);
      let waitingSeat = r.waiting.find((s) => s.clientId === cid);
      if (!seat && !waitingSeat && r.phase !== 'lobby') {
        if (!mod().joinable) { net.send(connId, { t: 'reject', reason: `No ${mod().title} não dá para entrar com a partida em andamento. Espere a próxima.` }); return; }
        if (!r.allowLateJoin) { net.send(connId, { t: 'reject', reason: 'O líder fechou a mesa para quem chega no meio da partida.' }); return; }
        const color = COLORS.find((c) => !r.seats.some((s) => s.color === c)) || COLORS[(r.seats.length + r.waiting.length) % COLORS.length];
        waitingSeat = { id: uid(), name: String(msg.name || 'Jogador').slice(0, 14), color, look: msg.look as Look | undefined, bot: false, bank: Math.max(0, Number(msg.bank) || 0), online: true, clientId: cid };
        roomRef.current = { ...r, waiting: [...r.waiting, waitingSeat] };
      }
      if (waitingSeat) {
        seatByConn.current.set(connId, waitingSeat.id);
        net.send(connId, { t: 'welcome', you: waitingSeat.id });
        publish();
        return;
      }
      if (!seat) {
        if (r.phase !== 'lobby') { net.send(connId, { t: 'reject', reason: 'A partida já começou nesta mesa.' }); return; }
        if (r.seats.length >= mod().maxSeats) {
          const bot = r.seats.find((s) => s.bot);
          if (!bot) { net.send(connId, { t: 'reject', reason: 'A mesa está cheia.' }); return; }
          r.seats = r.seats.filter((s) => s.id !== bot.id);
        }
        const color = COLORS.find((c) => !r.seats.some((s) => s.color === c)) || COLORS[r.seats.length % COLORS.length];
        seat = { id: uid(), name: String(msg.name || 'Jogador').slice(0, 14), color, look: msg.look as Look | undefined, bot: false, bank: Math.max(0, Number(msg.bank) || 0), online: true, clientId: cid };
        roomRef.current = { ...r, seats: [...r.seats, seat] };
      } else {
        roomRef.current = { ...r, seats: r.seats.map((s) => (s.id === seat!.id ? { ...s, online: true } : s)) };
      }
      seatByConn.current.set(connId, seat.id);
      net.send(connId, { t: 'welcome', you: seat.id });
      sfx('pop');
      publish();
      return;
    }
    const seatId = seatByConn.current.get(connId);
    if (!seatId) return;
    let err: string | null = null;
    if (msg.t === 'act') err = hostAct(seatId, msg.action);
    else if (msg.t === 'cmd') err = hostCommand(seatId, msg);
    if (err) net.send(connId, { t: 'err', error: err });
  }, [publish, hostAct, hostCommand]);

  const onHostLeave = useCallback((connId: string) => {
    const seatId = seatByConn.current.get(connId);
    seatByConn.current.delete(connId);
    const r = roomRef.current;
    if (!seatId || !r) return;
    if (r.waiting.some((w) => w.id === seatId)) {
      roomRef.current = { ...r, waiting: r.waiting.filter((w) => w.id !== seatId) };
      publish();
      return;
    }
    if (r.phase === 'lobby') {
      const seats = r.seats.filter((s) => s.id !== seatId);
      roomRef.current = { ...r, seats, leaderId: r.leaderId === seatId ? r.hostSeatId : r.leaderId };
    } else {
      // Na partida, um bot assume o lugar de quem saiu
      roomRef.current = { ...r, seats: r.seats.map((s) => (s.id === seatId ? { ...s, online: false, bot: true, name: `${s.name} 🤖` } : s)), leaderId: r.leaderId === seatId ? r.hostSeatId : r.leaderId };
      if (stateRef.current) stateRef.current = { ...stateRef.current, seats: stateRef.current.seats.map((s) => (s.id === seatId ? { ...s, bot: true } : s)) };
      schedule();
    }
    publish();
  }, [publish, schedule]);

  useEffect(() => {
    if (!hostNet.current) return;
    hostNet.current.onMessage = (id, m) => onHostMessage(id, m);
    hostNet.current.onLeave = (id) => onHostLeave(id);
  }, [onHostMessage, onHostLeave]);

  const mySeat = (self: Self): RoomSeat => ({
    id: uid(), name: self.name, color: self.color, look: self.look, bot: false, bank: getWallet(self.id).coins, online: true, clientId: sessionClient(), profileId: self.id,
  });

  /** Mesa offline: você + bots, sem internet. */
  const openOffline = useCallback((gameId: GameId, self: Self) => {
    selfRef.current = self;
    setError(null);
    setEnded(null);
    const me = mySeat(self);
    const m = MODULES[gameId]!;
    let seats: RoomSeat[] = [me];
    const wanted = Math.max(m.minSeats, Math.min(m.maxSeats, gameId === 'blackjack' ? 3 : 4));
    while (seats.length < wanted) seats = [...seats, newBot(seats)];
    myIdRef.current = me.id;
    setMyId(me.id);
    roomRef.current = { code: null, leaderId: me.id, hostSeatId: me.id, seats, gameId, config: { ...m.defaultConfig }, phase: 'lobby', allowLateJoin: m.joinable, waiting: [] };
    stateRef.current = null;
    setMode('offline');
    publish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish]);

  /** Mesa online: este aparelho é o anfitrião. */
  const createRoom = useCallback(async (gameId: GameId, self: Self) => {
    selfRef.current = self;
    setError(null);
    setEnded(null);
    setConnecting('Abrindo a mesa…');
    const net = new HostNet(TABLE_PREFIX);
    try {
      const code = await net.open();
      hostNet.current = net;
      const me = mySeat(self);
      myIdRef.current = me.id;
      setMyId(me.id);
      const m = MODULES[gameId]!;
      let seats: RoomSeat[] = [me];
      while (seats.length < m.minSeats) seats = [...seats, newBot(seats)];
      roomRef.current = { code, leaderId: me.id, hostSeatId: me.id, seats, gameId, config: { ...m.defaultConfig }, phase: 'lobby', allowLateJoin: m.joinable, waiting: [] };
      stateRef.current = null;
      net.onMessage = (id, msg) => onHostMessage(id, msg);
      net.onLeave = (id) => onHostLeave(id);
      net.onError = (e) => setError(e);
      setMode('host');
      publish();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, onHostMessage, onHostLeave]);

  /** Entrar na mesa de outra pessoa pelo código. */
  const joinRoom = useCallback(async (code: string, self: Self) => {
    selfRef.current = self;
    setError(null);
    setEnded(null);
    const c = cleanCode(code);
    if (c.length !== 4) { setError('O código da mesa tem 4 letras.'); return; }
    setConnecting(`Entrando na mesa ${c}…`);
    const net = new GuestNet();
    net.onMessage = (m) => {
      if (m.t === 'welcome') { myIdRef.current = m.you as string; setMyId(m.you as string); setMode('guest'); setConnecting(null); }
      else if (m.t === 'troom') {
        roomRef.current = m.room as unknown as RoomPublic;
        setRoom(m.room as unknown as RoomPublic);
        setView(m.view);
        applyCoins(m.view as BaseState | null);
      } else if (m.t === 'err') { setToast(String(m.error)); sfx('bad'); }
      else if (m.t === 'reject') { setConnecting(null); setError(String(m.reason)); net.close(); }
      else if (m.t === 'kicked') setEnded('Você foi removido da mesa pelo líder.');
      else if (m.t === 'closed') setEnded('O anfitrião fechou a mesa.');
    };
    net.onClose = () => setEnded((e) => e || 'A conexão com a mesa caiu.');
    try {
      await net.join(c, TABLE_PREFIX);
      guestNet.current = net;
      net.send({ t: 'hello', clientId: sessionClient(), name: self.name, look: (self.look ?? null) as unknown as Record<string, unknown>, bank: getWallet(self.id).coins });
    } catch (e) {
      setConnecting(null);
      setError((e as Error).message);
    }
  }, [applyCoins]);

  // ---------------------------------------------------------------- ações de qualquer aparelho

  const act = useCallback((action: unknown) => {
    if (!myIdRef.current) return;
    if (mode === 'guest') { guestNet.current?.send({ t: 'act', action: action as Record<string, unknown> }); return; }
    const err = hostAct(myIdRef.current, action);
    if (err) { setToast(err); sfx('bad'); }
  }, [mode, hostAct]);

  const command = useCallback((cmd: Record<string, unknown>) => {
    if (!myIdRef.current) return;
    if (mode === 'guest') { guestNet.current?.send({ t: 'cmd', ...cmd }); return; }
    const err = hostCommand(myIdRef.current, cmd);
    if (err) { setToast(err); sfx('bad'); }
  }, [mode, hostCommand]);

  const leave = useCallback(() => {
    if (!guestNet.current) refundInPlay(); // offline ou anfitrião: quem fecha a mesa devolve as apostas
    if (timer.current) clearTimeout(timer.current);
    hostNet.current?.close();
    guestNet.current?.close();
    hostNet.current = null;
    guestNet.current = null;
    roomRef.current = null;
    stateRef.current = null;
    seatByConn.current.clear();
    applied.current.clear();
    setMode(null);
    setRoom(null);
    setView(null);
    setMyId(null);
    setEnded(null);
    setConnecting(null);
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => () => { hostNet.current?.close(); guestNet.current?.close(); if (timer.current) clearTimeout(timer.current); }, []);

  const isLeader = !!room && room.leaderId === myId;
  const isWaiting = !!room && !!myId && room.waiting?.some((w) => w.id === myId);
  return {
    mode, room, view, myId, isLeader, isWaiting, error, setError, connecting, ended, toast,
    openOffline, createRoom, joinRoom, act, command, leave,
  };
}

export type TableApi = ReturnType<typeof useTable>;
