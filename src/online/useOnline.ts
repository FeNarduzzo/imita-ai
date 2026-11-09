// Modo online: um aparelho é o ANFITRIÃO (comanda a partida, guarda os áudios, dá as notas)
// e os outros são CONVIDADOS (recebem o estado e mandam as próprias gravações).
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkMic, mono, sfx, toBuffer, unlockAudio } from '../audio/engine';
import { BUILTIN_ID, loadSound, type LoadedSound, type SoundInfo } from '../audio/library';
import { scoreAttempt } from '../audio/scorer';
import { trimSilence } from '../audio/util';
import {
  addTake, ANCHORS, applyWheelState, buildRound, EMPTY_SCORE, endRoundState, makePlan, newGame, patchTake,
  pickAnchors, revealState, validateStart,
} from '../game/engine';
import { addCoins, rewardFor, type Look } from '../game/character';
import { XP_RULES } from '../game/levels';
import { reportXp } from '../game/progress';
import { EFFECT_NAMES, newPlayer, SLOTS, shuffle, type GameState, type Mode, type Player, type SlotId } from '../game/model';
import { loadRecent, pushRecent } from '../game/storage';
import type { GameApi } from '../game/useGame';
import { decodeAudio, encodeTake, encodeTarget, type NetAudio } from './codec';
import { cleanCode, GuestNet, HostNet } from './net';

export type OnlinePhase = 'lobby' | 'draw' | 'create' | 'play' | 'reveal' | 'roundEnd' | 'wheel' | 'final';
export type RecMode = 'together' | 'turns';
export interface Seat extends Player { clientId: string; online: boolean }
export interface SoundMeta { name: string; emoji?: string; image?: string | null }
export interface Me { name: string; emoji: string; look?: Look; profileId?: string }
/** Regras da partida online, escolhidas pelo líder da sala. */
export interface OnlineConfig { rounds: number; mode: Mode; packIds: string[]; wheel: boolean; mystery: boolean }
export const ROUND_OPTIONS = [3, 5, 8, 10, 12];

/** Estado que o anfitrião replica para todos. */
export interface Shared {
  code: string;
  /** O aparelho que roda a sala (dá as notas e manda os áudios). */
  hostId: string;
  /** Quem comanda a sala: escolhe as regras, começa e avança. Pode passar a coroa 👑 para outra pessoa. */
  leaderId: string;
  config: OnlineConfig;
  /** Pacotes que o anfitrião tem (o líder escolhe entre eles). */
  packs: { id: string; name: string; count: number }[];
  /** Quem chega com a partida em andamento assiste e entra no começo da próxima rodada. */
  allowLateJoin: boolean;
  waiting: Seat[];
  phase: OnlinePhase;
  recMode: RecMode;
  seats: Seat[];
  game: GameState | null;
  active: string[];
  submitted: string[];
  decoys: SoundMeta[];
  soundSeq: number;
  note: string | null;
  waitingSince: number;
}

const MAX_SEATS = 10;
const ME_KEY = 'imita.me.v1';
const CLIENT_KEY = 'imita.client.v1';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ok */ } },
};

export function loadMe(fallback?: Player): Me {
  try {
    const m = JSON.parse(store.get(ME_KEY) || 'null');
    if (m?.name) return m;
  } catch { /* ok */ }
  return { name: fallback?.name || 'Jogador', emoji: fallback?.emoji || '🦊' };
}
export const saveMe = (m: Me) => store.set(ME_KEY, JSON.stringify(m));

/** Identifica esta aba (sobrevive a recarregar a página, não é dividido entre abas). */
function clientId(): string {
  let id: string | null = null;
  try { id = sessionStorage.getItem(CLIENT_KEY); } catch { /* ok */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    try { sessionStorage.setItem(CLIENT_KEY, id); } catch { /* ok */ }
  }
  return id;
}

/** Tira os áudios do estado antes de mandar pela rede. */
function strip(g: GameState): GameState {
  const meta = (s: SoundInfo | null): SoundInfo | null => (s ? { id: s.id, name: s.name, packId: s.packId, emoji: s.emoji, duration: s.duration, image: null, src: { kind: 'synth', synth: '' } } : null);
  const takes = Object.fromEntries(Object.entries(g.round.takes).map(([k, t]) => [k, { ...t, samples: undefined }]));
  return JSON.parse(JSON.stringify({ ...g, plan: g.plan.map(meta), round: { ...g.round, sound: meta(g.round.sound), takes } }));
}

async function imageDataUrl(src?: string | null): Promise<string | null> {
  if (!src) return null;
  try {
    const blob = await (await fetch(src)).blob();
    if (blob.size > 120_000) return null;
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => res(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function useOnline(local: GameApi) {
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [stage, setStage] = useState<'listen' | 'record'>('listen');
  const [hostGame, setHostGame] = useState<GameState | null>(null);
  const [takeAudio, setTakeAudio] = useState<Record<string, { samples: Float32Array; sr: number }>>({});
  const [targetMeta, setTargetMeta] = useState<SoundMeta | null>(null);

  const targetRef = useRef<Promise<LoadedSound> | null>(null);
  const meRef = useRef<Me | null>(null);
  const hostNet = useRef<HostNet | null>(null);
  const guestNet = useRef<GuestNet | null>(null);
  const sharedRef = useRef<Shared | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const seatByConn = useRef(new Map<string, string>());
  const anchorPool = useRef<SoundInfo[]>([]);
  const anchorLoads = useRef<Promise<unknown>[]>([]);
  const scoring = useRef(new Map<string, Promise<void>>());
  const takesNet = useRef<Record<string, NetAudio>>({});
  const targetMsg = useRef<Record<string, unknown> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const localRef = useRef(local);
  localRef.current = local;

  // ---------------------------------------------------------------- anfitrião

  const publish = useCallback((patch: Partial<Shared> = {}) => {
    const cur = sharedRef.current;
    if (!cur) return;
    const g = gameRef.current;
    const s: Shared = { ...cur, ...patch, game: g ? strip(g) : null };
    sharedRef.current = s;
    setShared(s);
    setHostGame(g ? { ...g } : null);
    hostNet.current?.broadcast({ t: 'state', shared: s });
  }, []);

  const seatOnline = (pid: string) => sharedRef.current?.seats.find((x) => x.id === pid)?.online !== false;

  const distributeTarget = useCallback(async (loaded: LoadedSound, info: SoundInfo, seq: number) => {
    const audio = encodeTarget(mono(loaded.buffer), loaded.buffer.sampleRate);
    const meta: SoundMeta = { name: info.name, emoji: info.emoji, image: await imageDataUrl(info.image) };
    targetMsg.current = { t: 'target', seq, meta, audio };
    setTargetMeta(meta);
    hostNet.current?.broadcast(targetMsg.current as { t: string });
  }, []);

  const startReveal = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current = revealState(gameRef.current, -1);
    const items = Object.entries(takesNet.current).map(([pid, audio]) => ({ pid, audio }));
    hostNet.current?.broadcast({ t: 'takes', round: gameRef.current.round.index, items });
    sfx('reveal');
    publish({ phase: 'reveal' });
  }, [publish]);

  const checkComplete = useCallback(() => {
    const s = sharedRef.current;
    const g = gameRef.current;
    if (!s || !g || s.phase !== 'play') return;
    const missing = g.round.order.filter((p) => !s.submitted.includes(p) && seatOnline(p));
    if (s.recMode === 'turns') {
      const current = s.active[0];
      if (current && (s.submitted.includes(current) || !seatOnline(current))) {
        const next = missing[0];
        if (next) { publish({ active: [next], waitingSince: Date.now() }); return; }
      } else if (current) return;
    }
    if (missing.length) return;
    const round = g.round.index;
    Promise.all([...scoring.current.values()]).then(() => {
      if (gameRef.current?.round.index === round && sharedRef.current?.phase === 'play') startReveal();
    });
  }, [publish, startReveal]);

  const receiveTake = useCallback((pid: string, samples: Float32Array, sr: number, net: NetAudio) => {
    const s = sharedRef.current;
    const g0 = gameRef.current;
    if (!s || !g0 || s.phase !== 'play' || s.submitted.includes(pid) || !g0.round.order.includes(pid)) return;
    gameRef.current = addTake(g0, pid, samples, sr).g;
    takesNet.current[pid] = net;
    const r = gameRef.current.round;
    const difficulty = gameRef.current.settings.difficulty;
    const job = (async () => {
      try {
        const t = await targetRef.current!;
        await Promise.race([Promise.all(anchorLoads.current), new Promise((res) => setTimeout(res, 5000))]);
        const score = await scoreAttempt(t.info.id, r.anchorIds, samples, sr, difficulty);
        if (gameRef.current?.round.index === r.index) gameRef.current = patchTake(gameRef.current, pid, { score });
      } catch (e) {
        if (gameRef.current?.round.index === r.index) gameRef.current = patchTake(gameRef.current, pid, { score: EMPTY_SCORE, error: (e as Error).message });
      }
      publish();
    })();
    scoring.current.set(pid, job);
    publish({ submitted: [...s.submitted, pid] });
    checkComplete();
  }, [publish, checkComplete]);

  const startPlay = useCallback(() => {
    const g = gameRef.current;
    const s = sharedRef.current;
    if (!g || !s) return;
    scoring.current.clear();
    takesNet.current = {};
    const online = g.round.order.filter(seatOnline);
    const active = s.recMode === 'together' ? online : online.slice(0, 1);
    publish({ phase: 'play', active, submitted: [], waitingSince: Date.now() });
    if (!online.length) startReveal();
  }, [publish, startReveal]);

  /** Quem chegou no meio da partida entra agora, no começo da rodada, com 0 pontos. */
  const admitWaiting = () => {
    const s = sharedRef.current;
    const g = gameRef.current;
    if (!s || !g || !s.waiting.length) return;
    const enter = s.waiting.filter((w) => w.online).slice(0, Math.max(0, MAX_SEATS - s.seats.length));
    if (!enter.length) return;
    const players = [...g.players];
    const totals = { ...g.totals };
    const streak = { ...g.streak };
    const bestStreak = { ...g.bestStreak };
    const seats = [...s.seats];
    for (const w of enter) {
      const t0 = players.filter((p) => p.team === 0).length;
      const t1 = players.filter((p) => p.team === 1).length;
      const team: 0 | 1 = g.settings.mode === 'teams' ? (t0 <= t1 ? 0 : 1) : w.team;
      seats.push({ ...w, team });
      players.push({ id: w.id, name: w.name, emoji: w.emoji, color: w.color, team, look: w.look });
      totals[w.id] = 0;
      streak[w.id] = 0;
      bestStreak[w.id] = 0;
    }
    gameRef.current = { ...g, players, totals, streak, bestStreak };
    const ids = new Set(enter.map((w) => w.id));
    sharedRef.current = { ...s, seats, waiting: s.waiting.filter((w) => !ids.has(w.id)), note: `👋 ${enter.map((w) => w.name).join(', ')} ${enter.length > 1 ? 'entraram' : 'entrou'} na partida!` };
  };

  const beginRound = useCallback((idx: number) => {
    admitWaiting();
    const g = gameRef.current!;
    const sound = g.plan[idx];
    const anchors = pickAnchors(anchorPool.current, sound?.id);
    anchorLoads.current = anchors.map((a) => loadSound(a).catch(() => null));
    gameRef.current = { ...g, round: buildRound(g, idx, anchors) };
    const seq = (sharedRef.current?.soundSeq || 0) + 1;
    setTakeAudio({});
    if (sound) {
      targetRef.current = loadSound(sound);
      const decoys = shuffle(anchorPool.current.filter((x) => x.id !== sound.id)).slice(0, 14).map((x) => ({ name: x.name, emoji: x.emoji }));
      publish({ phase: 'draw', decoys, soundSeq: seq, active: [], submitted: [] });
      const t0 = Date.now();
      targetRef.current.then(async (loaded) => {
        await distributeTarget(loaded, sound, seq);
        timers.current.push(setTimeout(() => startPlay(), Math.max(0, 3400 - (Date.now() - t0))));
      }).catch(() => {
        // Som com problema: pula para a próxima rodada
        setError(`Não deu para carregar "${sound.name}". Pulando a rodada.`);
        timers.current.push(setTimeout(() => {
          if (idx + 1 < g.plan.length) beginRound(idx + 1);
          else publish({ phase: 'final' });
        }, 1200));
      });
    } else {
      targetRef.current = null;
      setTargetMeta(null);
      publish({ phase: 'create', soundSeq: seq, active: [gameRef.current.round.creatorId!], submitted: [] });
    }
  }, [publish, distributeTarget, startPlay]);

  const receiveChallenge = useCallback((pid: string, raw: Float32Array, sr: number, name?: string) => {
    const g = gameRef.current;
    const s = sharedRef.current;
    if (!g || !s || s.phase !== 'create' || g.round.creatorId !== pid) return;
    const creator = g.players.find((p) => p.id === pid);
    const samples = trimSilence(raw, sr);
    const info: SoundInfo = { id: `online/${Date.now()}`, name: (name || '').trim() || `Desafio de ${creator?.name}`, packId: 'temp', emoji: '🎙️', src: { kind: 'temp', samples, sr } };
    gameRef.current = { ...g, round: { ...g.round, sound: info } };
    targetRef.current = loadSound(info);
    targetRef.current.then(async (loaded) => {
      await distributeTarget(loaded, info, s.soundSeq);
      startPlay();
    });
  }, [distributeTarget, startPlay]);

  const nextReveal = useCallback(() => {
    const g = gameRef.current;
    if (!g || sharedRef.current?.phase !== 'reveal') return;
    if (g.round.revealIdx + 1 >= g.round.revealOrder.length) {
      gameRef.current = endRoundState(g);
      publish({ phase: 'roundEnd' });
    } else {
      gameRef.current = { ...g, round: { ...g.round, revealIdx: g.round.revealIdx + 1 } };
      publish();
    }
  }, [publish]);

  const continueAfterRound = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const nextIdx = g.round.index + 1;
    if (nextIdx >= g.plan.length) { sfx('win'); publish({ phase: 'final', note: null }); }
    else if (g.settings.wheel && g.round.spinnerId && seatOnline(g.round.spinnerId)) publish({ phase: 'wheel', note: null });
    else { publish({ note: null }); beginRound(nextIdx); }
  }, [publish, beginRound]);

  const receiveWheel = useCallback((pid: string, slotId: SlotId, targetId?: string) => {
    const g = gameRef.current;
    if (!g || sharedRef.current?.phase !== 'wheel' || g.round.spinnerId !== pid) return;
    gameRef.current = applyWheelState(g, slotId, targetId);
    const slot = SLOTS.find((x) => x.id === slotId);
    const who = (id?: string) => g.players.find((p) => p.id === id)?.name || '';
    let note = '';
    if (slot?.kind === 'sabotage') note = `😈 ${who(pid)} sabotou ${who(targetId)}: ${EFFECT_NAMES[slot.id as keyof typeof EFFECT_NAMES]}`;
    else if (slot?.kind === 'swap') note = `🔄 ${who(pid)} vai trocar a gravação com ${who(targetId)}`;
    else if (slot) note = `${slot.emoji} ${who(pid)} ganhou ${slot.title}`;
    publish({ note });
    beginRound(g.round.index + 1);
  }, [publish, beginRound]);

  /** Começa a partida com as regras escolhidas pelo líder. Devolve o erro (ou null). */
  const hostStart = useCallback(async (): Promise<string | null> => {
    let s = sharedRef.current;
    const L = localRef.current;
    if (!s || (s.phase !== 'lobby' && s.phase !== 'final')) return null;
    setError(null);
    // Quem estava esperando entra já na nova partida.
    if (s.waiting.length) {
      s = { ...s, seats: [...s.seats, ...s.waiting.filter((w) => w.online)].slice(0, MAX_SEATS), waiting: [] };
      sharedRef.current = s;
    }
    const seats = s.seats.filter((x) => x.online);
    const settings = { ...L.settings, ...s.config };
    const pool = L.packs.filter((p) => settings.packIds.includes(p.id)).flatMap((p) => p.sounds);
    const players: Player[] = seats.map(({ id, name, emoji, color, team, look }) => ({ id, name, emoji, color, team, look }));
    const invalid = validateStart(settings, players, pool.length, true);
    if (invalid) { setError(invalid); return invalid; }
    await unlockAudio();
    const micErr = await checkMic();
    if (micErr) { setError(micErr); return `O anfitrião precisa liberar o microfone: ${micErr}`; }
    const plan = makePlan(settings, players, pool, new Set(loadRecent()));
    pushRecent(plan.filter((x): x is SoundInfo => !!x).map((x) => x.id));
    const builtin = L.packs.find((p) => p.id === BUILTIN_ID)?.sounds || [];
    anchorPool.current = pool.length >= ANCHORS + 1 ? pool : [...pool, ...builtin];
    gameRef.current = newGame(settings, players, plan);
    sharedRef.current = { ...s, seats };
    beginRound(0);
    return null;
  }, [beginRound]);

  /** Anfitrião: segue a rodada sem quem não gravou. */
  const hostSkip = useCallback(() => {
    const s = sharedRef.current;
    const g = gameRef.current;
    if (!s || !g || s.phase !== 'play') return;
    publish({ submitted: [...new Set([...s.submitted, ...g.round.order])], active: [] });
    Promise.all([...scoring.current.values()]).then(() => startReveal());
  }, [publish, startReveal]);

  /** Comandos do líder (validados aqui no anfitrião). Devolve o erro para mostrar, ou null. */
  const hostCommand = useCallback(async (from: string, cmd: Record<string, unknown>): Promise<string | null> => {
    const s = sharedRef.current;
    if (!s) return 'Sem sala.';
    if (from !== s.leaderId) return 'Só o líder da sala 👑 pode fazer isso.';
    const setup = s.phase === 'lobby' || s.phase === 'final';
    switch (cmd.cmd) {
      case 'config': {
        if (!setup) return 'Mude as regras antes de começar.';
        const c = { ...s.config, ...(cmd.config as Partial<OnlineConfig>) };
        const have = new Set(s.packs.map((p) => p.id));
        publish({
          config: {
            rounds: ROUND_OPTIONS.includes(Number(c.rounds)) ? Number(c.rounds) : s.config.rounds,
            mode: c.mode === 'teams' ? 'teams' : 'classic',
            packIds: (Array.isArray(c.packIds) ? c.packIds : s.config.packIds).filter((id) => have.has(id)),
            wheel: !!c.wheel,
            mystery: !!c.mystery,
          },
        });
        return null;
      }
      case 'recMode':
        if (!setup) return 'Mude antes de começar.';
        publish({ recMode: cmd.value === 'turns' ? 'turns' : 'together' });
        return null;
      case 'team':
        if (!setup) return null;
        publish({ seats: s.seats.map((x) => (x.id === cmd.seatId ? { ...x, team: x.team ? 0 : 1 } : x)) });
        return null;
      case 'lateJoin':
        publish({ allowLateJoin: !!cmd.value });
        return null;
      case 'leader': {
        const target = s.seats.find((x) => x.id === cmd.seatId && x.online);
        if (!target) return 'Essa pessoa não está na sala.';
        publish({ leaderId: target.id, note: `👑 ${target.name} agora é o líder da sala` });
        return null;
      }
      case 'start':
        return hostStart();
      case 'next':
        nextReveal();
        return null;
      case 'continue':
        continueAfterRound();
        return null;
      case 'skip':
        hostSkip();
        return null;
    }
    return 'Comando desconhecido.';
  }, [publish, hostStart, nextReveal, continueAfterRound, hostSkip]);

  const onHostMessage = useCallback((connId: string, msg: Record<string, unknown>) => {
    const s = sharedRef.current;
    if (!s) return;
    const net = hostNet.current!;
    if (msg.t === 'hello') {
      const cid = String(msg.clientId || '');
      let seat = s.seats.find((x) => x.clientId === cid);
      let waitingSeat = s.waiting.find((x) => x.clientId === cid);
      if (!seat && !waitingSeat && s.phase !== 'lobby') {
        // Partida em andamento: entra na fila e senta no começo da próxima rodada.
        if (!s.allowLateJoin) { net.send(connId, { t: 'reject', reason: 'O líder fechou a sala para quem chega no meio da partida.' }); return; }
        if (s.seats.length + s.waiting.length >= MAX_SEATS) { net.send(connId, { t: 'reject', reason: 'A sala está cheia.' }); return; }
        const base = newPlayer([...s.seats, ...s.waiting], String(msg.name || 'Jogador').slice(0, 14));
        waitingSeat = { ...base, look: (msg.look as Look | undefined) ?? base.look, clientId: cid, online: true };
        publish({ waiting: [...s.waiting, waitingSeat] });
      } else if (waitingSeat) {
        publish({ waiting: s.waiting.map((x) => (x.id === waitingSeat!.id ? { ...x, online: true } : x)) });
      }
      if (waitingSeat) {
        seatByConn.current.set(connId, waitingSeat.id);
        net.send(connId, { t: 'welcome', you: waitingSeat.id, shared: sharedRef.current as unknown as Record<string, unknown> });
        sfx('pop');
        return;
      }
      if (!seat) {
        if (s.seats.length >= MAX_SEATS) { net.send(connId, { t: 'reject', reason: 'A sala está cheia.' }); return; }
        const base = newPlayer(s.seats, String(msg.name || 'Jogador').slice(0, 14));
        const emoji = s.seats.some((x) => x.emoji === msg.emoji) ? base.emoji : String(msg.emoji || base.emoji);
        seat = { ...base, emoji, look: (msg.look as Look | undefined) ?? base.look, clientId: cid, online: true };
        publish({ seats: [...s.seats, seat] });
      } else {
        publish({ seats: s.seats.map((x) => (x.id === seat!.id ? { ...x, online: true } : x)) });
      }
      seatByConn.current.set(connId, seat.id);
      net.send(connId, { t: 'welcome', you: seat.id, shared: sharedRef.current as unknown as Record<string, unknown> });
      if (targetMsg.current && sharedRef.current?.phase !== 'lobby') net.send(connId, targetMsg.current as { t: string });
      if (sharedRef.current?.phase === 'reveal' && gameRef.current) {
        const items = Object.entries(takesNet.current).map(([pid, audio]) => ({ pid, audio }));
        net.send(connId, { t: 'takes', round: gameRef.current.round.index, items });
      }
      sfx('pop');
      return;
    }
    const pid = seatByConn.current.get(connId);
    if (!pid) return;
    if (msg.t === 'cmd') {
      hostCommand(pid, msg).then((err) => { if (err) net.send(connId, { t: 'toast', text: err }); });
      return;
    }
    const round = gameRef.current?.round.index;
    if (msg.t === 'take' && msg.round === round) {
      const audio = msg.audio as NetAudio;
      receiveTake(pid, decodeAudio(audio), audio.sr, audio);
    } else if (msg.t === 'challenge' && msg.round === round) {
      const audio = msg.audio as NetAudio;
      receiveChallenge(pid, decodeAudio(audio), audio.sr, msg.name as string | undefined);
    } else if (msg.t === 'wheel' && msg.round === round) {
      receiveWheel(pid, msg.slot as SlotId, msg.target as string | undefined);
    }
  }, [publish, receiveTake, receiveChallenge, receiveWheel, hostCommand]);

  const onHostLeave = useCallback((connId: string) => {
    const pid = seatByConn.current.get(connId);
    seatByConn.current.delete(connId);
    const s = sharedRef.current;
    if (!pid || !s) return;
    // Se o líder sair, a coroa volta para o anfitrião.
    if (s.leaderId === pid) publish({ leaderId: s.hostId, note: '👑 O líder saiu: o anfitrião voltou a comandar a sala' });
    if (s.waiting.some((x) => x.id === pid)) { publish({ waiting: sharedRef.current!.waiting.filter((x) => x.id !== pid) }); return; }
    if (s.phase === 'lobby') publish({ seats: sharedRef.current!.seats.filter((x) => x.id !== pid) });
    else {
      publish({ seats: s.seats.map((x) => (x.id === pid ? { ...x, online: false } : x)) });
      if (s.phase === 'play') checkComplete();
      if (s.phase === 'wheel' && gameRef.current?.round.spinnerId === pid) continueSkipWheel();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, checkComplete]);

  const continueSkipWheel = () => {
    const g = gameRef.current;
    if (!g) return;
    publish({ note: null });
    beginRound(g.round.index + 1);
  };

  const createRoom = useCallback(async (me: Me) => {
    meRef.current = me;
    setError(null);
    setEnded(null);
    saveMe(me);
    setConnecting('Criando a sala…');
    const net = new HostNet();
    try {
      const code = await net.open();
      hostNet.current = net;
      const base = newPlayer([], me.name);
      const hostSeat: Seat = { ...base, emoji: me.emoji, look: me.look ?? base.look, clientId: clientId(), online: true };
      const L = localRef.current;
      const s: Shared = {
        code, hostId: hostSeat.id, leaderId: hostSeat.id,
        config: { rounds: L.settings.rounds, mode: L.settings.mode, packIds: L.settings.packIds, wheel: L.settings.wheel, mystery: L.settings.mystery },
        packs: L.packs.filter((p) => p.sounds.length).map((p) => ({ id: p.id, name: p.name, count: p.sounds.length })),
        allowLateJoin: true, waiting: [],
        phase: 'lobby', recMode: 'together', seats: [hostSeat], game: null,
        active: [], submitted: [], decoys: [], soundSeq: 0, note: null, waitingSince: 0,
      };
      sharedRef.current = s;
      setShared(s);
      setMyId(hostSeat.id);
      setRole('host');
      net.onMessage = (id, m) => onHostMessage(id, m);
      net.onLeave = (id) => onHostLeave(id);
      net.onError = (m) => setError(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }, [onHostMessage, onHostLeave]);

  // Mantém os callbacks do anfitrião atualizados
  useEffect(() => {
    if (!hostNet.current) return;
    hostNet.current.onMessage = (id, m) => onHostMessage(id, m);
    hostNet.current.onLeave = (id) => onHostLeave(id);
  }, [onHostMessage, onHostLeave]);

  // ---------------------------------------------------------------- convidado

  const joinRoom = useCallback(async (code: string, me: Me) => {
    meRef.current = me;
    setError(null);
    setEnded(null);
    saveMe(me);
    const c = cleanCode(code);
    if (c.length !== 4) { setError('O código da sala tem 4 letras.'); return; }
    setConnecting(`Entrando na sala ${c}…`);
    const net = new GuestNet();
    net.onMessage = (m) => {
      if (m.t === 'welcome') {
        setMyId(m.you as string);
        sharedRef.current = m.shared as unknown as Shared;
        setShared(m.shared as unknown as Shared);
        setRole('guest');
        setConnecting(null);
      } else if (m.t === 'state') {
        sharedRef.current = m.shared as unknown as Shared;
        setShared(m.shared as unknown as Shared);
      } else if (m.t === 'target') {
        const audio = m.audio as NetAudio;
        const meta = m.meta as SoundMeta;
        const samples = decodeAudio(audio);
        const info: SoundInfo = { id: `net/${m.seq}`, name: meta.name, packId: 'online', emoji: meta.emoji, image: meta.image, src: { kind: 'temp', samples, sr: audio.sr } };
        targetRef.current = Promise.resolve({ info, buffer: toBuffer(samples, audio.sr) });
        setTargetMeta(meta);
      } else if (m.t === 'takes') {
        const items = m.items as { pid: string; audio: NetAudio }[];
        const map: Record<string, { samples: Float32Array; sr: number }> = {};
        for (const it of items) map[it.pid] = { samples: decodeAudio(it.audio), sr: it.audio.sr };
        setTakeAudio(map);
      } else if (m.t === 'toast') {
        setError(String(m.text || ''));
      } else if (m.t === 'reject') {
        setConnecting(null);
        setError(String(m.reason || 'Não deu para entrar.'));
        net.close();
      } else if (m.t === 'closed') {
        setEnded('O anfitrião encerrou a sala.');
      }
    };
    net.onClose = () => setEnded((e) => e || 'A conexão com a sala caiu.');
    try {
      await net.join(c);
      guestNet.current = net;
      net.send({ t: 'hello', clientId: clientId(), name: me.name, emoji: me.emoji, look: (me.look ?? null) as unknown as Record<string, unknown> });
    } catch (e) {
      setConnecting(null);
      setError((e as Error).message);
    }
  }, []);

  // ---------------------------------------------------------------- ações de qualquer aparelho

  const isHost = role === 'host';
  const roundIdx = shared?.game?.round.index ?? -1;

  const submitTake = useCallback((samples: Float32Array, sr: number) => {
    if (!myId) return;
    sfx('pop');
    if (isHost) receiveTake(myId, samples, sr, encodeTake(samples, sr));
    else guestNet.current?.send({ t: 'take', round: roundIdx, audio: encodeTake(samples, sr) as unknown as Record<string, unknown> });
  }, [myId, isHost, receiveTake, roundIdx]);

  const submitChallenge = useCallback((samples: Float32Array, sr: number, opts: { name?: string }) => {
    if (!myId) return;
    if (isHost) receiveChallenge(myId, samples, sr, opts.name);
    else guestNet.current?.send({ t: 'challenge', round: roundIdx, name: opts.name || '', audio: encodeTake(samples, sr) as unknown as Record<string, unknown> });
  }, [myId, isHost, receiveChallenge, roundIdx]);

  const sendWheel = useCallback((slot: SlotId, target?: string) => {
    if (!myId) return;
    if (isHost) receiveWheel(myId, slot, target);
    else guestNet.current?.send({ t: 'wheel', round: roundIdx, slot, target: target ?? null });
  }, [myId, isHost, receiveWheel, roundIdx]);

  const isLeader = !!shared && !!myId && shared.leaderId === myId;
  const isWaiting = !!shared && !!myId && shared.waiting.some((w) => w.id === myId);

  /** Ação do líder: no anfitrião roda aqui mesmo; num convidado vai como pedido para o anfitrião. */
  const command = useCallback((cmd: Record<string, unknown>) => {
    if (!myId) return;
    if (isHost) hostCommand(myId, cmd).then((err) => { if (err) setError(err); });
    else guestNet.current?.send({ t: 'cmd', ...cmd });
  }, [myId, isHost, hostCommand]);

  const setRecMode = useCallback((value: RecMode) => command({ cmd: 'recMode', value }), [command]);
  const toggleTeam = useCallback((seatId: string) => command({ cmd: 'team', seatId }), [command]);
  const setConfig = useCallback((config: Partial<OnlineConfig>) => command({ cmd: 'config', config }), [command]);
  const setLateJoin = useCallback((value: boolean) => command({ cmd: 'lateJoin', value }), [command]);
  const passLeader = useCallback((seatId: string) => command({ cmd: 'leader', seatId }), [command]);
  const leaderStart = useCallback(() => { setError(null); command({ cmd: 'start' }); }, [command]);
  const leaderNext = useCallback(() => command({ cmd: 'next' }), [command]);
  const leaderContinue = useCallback(() => command({ cmd: 'continue' }), [command]);
  const skipMissing = useCallback(() => command({ cmd: 'skip' }), [command]);

  const leave = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    hostNet.current?.close();
    guestNet.current?.close();
    hostNet.current = null;
    guestNet.current = null;
    sharedRef.current = null;
    gameRef.current = null;
    targetRef.current = null;
    targetMsg.current = null;
    seatByConn.current.clear();
    setRole(null);
    setShared(null);
    setHostGame(null);
    setMyId(null);
    setTakeAudio({});
    setTargetMeta(null);
    setEnded(null);
    setConnecting(null);
  }, []);

  useEffect(() => () => { hostNet.current?.close(); guestNet.current?.close(); }, []);

  const credited = useRef<string | null>(null);
  const [myReward, setMyReward] = useState<number | null>(null);
  useEffect(() => {
    const g = shared?.game;
    if (shared?.phase !== 'final' || !g || !myId) return;
    const key = `${shared.code}-${g.history.length}-${shared.soundSeq}`;
    if (credited.current === key) return;
    credited.current = key;
    const ranking = [...g.players].sort((a, b) => (g.totals[b.id] || 0) - (g.totals[a.id] || 0));
    const place = ranking.findIndex((p) => p.id === myId);
    const reward = rewardFor(g.totals[myId] || 0, place);
    const pid = meRef.current?.profileId;
    if (pid) {
      addCoins(pid, reward, 'imitação online', `on-${key}`);
      reportXp(pid, 'imitacao', XP_RULES.imitacao.play + (XP_RULES.imitacao.perPlace[place] || 0), place === 0 && ranking.length > 1, `on-${key}`);
      // Social: jogar online com gente de verdade (quem abriu a sala ganha um pouco mais).
      reportXp(pid, 'social', XP_RULES.social.onlineMatch + (role === 'host' ? XP_RULES.social.hostBonus : 0), false, `on-${key}-s`);
    }
    setMyReward(reward);
  }, [shared, myId]);

  // Volta para "ouvir" a cada nova vez de gravar
  const activeKey = shared ? `${shared.phase}-${roundIdx}-${shared.active.join(',')}` : '';
  useEffect(() => { setStage('listen'); }, [activeKey]);

  // ---------------------------------------------------------------- visão para as telas

  /** Estado do jogo como as telas esperam (com os áudios das imitações e a imagem do som). */
  let view: GameState | null = null;
  if (shared?.game) {
    const base = isHost && hostGame ? hostGame : shared.game;
    const takes = isHost && hostGame ? base.round.takes : Object.fromEntries(Object.entries(base.round.takes).map(([k, t]) => [k, { ...t, samples: takeAudio[k]?.samples || new Float32Array(1), sr: takeAudio[k]?.sr || 22050 }]));
    const sound = base.round.sound ? { ...base.round.sound, image: targetMeta?.image ?? base.round.sound.image, emoji: base.round.sound.emoji || targetMeta?.emoji } : null;
    view = {
      ...base,
      players: shared.seats.map(({ id, name, emoji, color, team, look }) => ({ id, name, emoji, color, team, look })),
      settings: { ...base.settings, micGain: local.settings.micGain, along: false },
      round: { ...base.round, sound, takes },
    };
  }

  const takesReady = !shared?.game || isHost || Object.keys(shared.game.round.takes).every((k) => takeAudio[k]);

  return {
    role, isHost, shared, myId, view, stage, setStage, connecting, error, setError, ended, targetMeta, takesReady, myReward,
    getTarget: () => targetRef.current,
    isLeader, isWaiting, setConfig, setLateJoin, passLeader,
    createRoom, joinRoom, leave, hostStart: leaderStart, setRecMode, toggleTeam, skipMissing,
    nextReveal: leaderNext, continueAfterRound: leaderContinue, submitTake, submitChallenge, sendWheel,
  };
}

export type OnlineApi = ReturnType<typeof useOnline>;
