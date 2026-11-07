import { useCallback, useEffect, useRef, useState } from 'react';
import { checkMic, setSfxVolume, sfx, unlockAudio } from '../audio/engine';
import { BUILTIN_ID, loadPacks, loadSound, saveCustom, type LoadedSound, type PackInfo, type SoundInfo } from '../audio/library';
import { scoreAttempt } from '../audio/scorer';
import { trimSilence } from '../audio/util';
import {
  pointsFor, shuffle, SLOTS,
  type GameState, type Phase, type Player, type RoundState, type Settings, type SlotId, type Take,
} from './model';
import { loadPlayers, loadRecent, loadSettings, pushRecent, savePlayers, saveSettings } from './storage';

const ANCHORS = 5;

export function useGame() {
  const [phase, setPhase] = useState<Phase>('home');
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [packsLoaded, setPacksLoaded] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [players, setPlayersState] = useState<Player[]>(loadPlayers);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gameRef = useRef<GameState | null>(null);
  const targetRef = useRef<Promise<LoadedSound> | null>(null);
  const anchorPool = useRef<SoundInfo[]>([]);
  const anchorLoads = useRef<Promise<unknown>[]>([]);

  const update = useCallback((fn: (g: GameState) => GameState) => {
    if (!gameRef.current) return null;
    const next = fn(gameRef.current);
    gameRef.current = next;
    setGame(next);
    return next;
  }, []);

  useEffect(() => setSfxVolume(settings.sfx), [settings.sfx]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const s = { ...prev, ...patch };
      saveSettings(s);
      return s;
    });
  }, []);

  const addPacks = useCallback((ids: string[]) => {
    setSettingsState((prev) => {
      const s = { ...prev, packIds: [...new Set([...prev.packIds, ...ids])] };
      saveSettings(s);
      return s;
    });
  }, []);

  const setPlayers = useCallback((p: Player[]) => {
    savePlayers(p);
    setPlayersState(p);
  }, []);

  const reloadPacks = useCallback(async () => {
    const list = await loadPacks();
    setPacks(list);
    setPacksLoaded(true);
    setSettingsState((prev) => {
      const ids = prev.packIds.filter((id) => list.some((p) => p.id === id));
      const s = { ...prev, packIds: ids.length ? ids : [BUILTIN_ID] };
      saveSettings(s);
      return s;
    });
  }, []);

  useEffect(() => { reloadPacks(); }, [reloadPacks]);

  // ---------------------------------------------------------------- rodadas

  const beginRound = useCallback((idx: number) => {
    const g = gameRef.current!;
    const sound = g.plan[idx];
    const ps = g.players;
    const n = ps.length;
    const creatorId = sound === null ? ps[idx % n].id : undefined;
    const order = ps.map((_, k) => ps[(k + idx) % n].id).filter((id) => id !== creatorId);
    const mystery = g.settings.mystery && sound !== null && idx > 0 && Math.random() < 0.25;
    const anchors = shuffle(anchorPool.current.filter((s) => s.id !== sound?.id)).slice(0, ANCHORS);
    anchorLoads.current = anchors.map((a) => loadSound(a).catch(() => null));
    const round: RoundState = {
      index: idx, sound, creatorId, mystery, order, turn: 0, takes: {},
      anchorIds: anchors.map((a) => a.id), revealOrder: [], revealIdx: 0,
    };
    update((s) => ({ ...s, round }));
    if (sound) {
      targetRef.current = loadSound(sound);
      targetRef.current.catch(() => {});
      setPhase('draw');
    } else {
      targetRef.current = null;
      setPhase('create');
    }
  }, [update]);

  const startGame = useCallback(async () => {
    setError(null);
    const s = settings;
    const ps = players;
    const sel = packs.filter((p) => s.packIds.includes(p.id));
    const pool = sel.flatMap((p) => p.sounds);
    const solo = ps.length === 1;
    if (!ps.length) return setError('Adicione pelo menos um jogador.');
    if (s.source !== 'packs' && solo) return setError('No modo solo os desafios vêm dos pacotes. Mude “Quem cria o som” para “Pacotes”.');
    if (s.source !== 'players' && !pool.length) return setError('Escolha pelo menos um pacote de som.');
    if (s.mode === 'teams' && (ps.length < 2 || !ps.some((p) => p.team === 0) || !ps.some((p) => p.team === 1))) {
      return setError('No modo Times, cada time precisa de pelo menos um jogador.');
    }
    setBusy(true);
    await unlockAudio();
    const micErr = await checkMic();
    setBusy(false);
    if (micErr) return setError(micErr);

    const recent = new Set(loadRecent());
    const ordered = [...shuffle(pool.filter((x) => !recent.has(x.id))), ...shuffle(pool.filter((x) => recent.has(x.id)))];
    const plan: (SoundInfo | null)[] = [];
    let k = 0;
    for (let r = 0; r < s.rounds; r++) {
      const byPlayer = s.source === 'players' || (s.source === 'mixed' && r % 2 === 1);
      if (byPlayer && ps.length >= 2) plan.push(null);
      else plan.push(ordered[k++ % ordered.length]);
    }
    pushRecent(plan.filter((x): x is SoundInfo => !!x).map((x) => x.id));
    const builtin = packs.find((p) => p.id === BUILTIN_ID)?.sounds || [];
    anchorPool.current = pool.length >= ANCHORS + 1 ? pool : [...pool, ...builtin];

    const zero = Object.fromEntries(ps.map((p) => [p.id, 0]));
    const g: GameState = {
      settings: { ...s, mode: solo ? 'classic' : s.mode },
      players: ps.map((p) => ({ ...p })),
      plan,
      round: { index: 0, sound: null, mystery: false, order: [], turn: 0, takes: {}, anchorIds: [], revealOrder: [], revealIdx: 0 },
      totals: { ...zero },
      teamTotals: [0, 0],
      pending: {},
      streak: { ...zero },
      bestStreak: { ...zero },
      history: [],
      best: null,
      sabotaged: 0,
      takes: 0,
    };
    gameRef.current = g;
    setGame(g);
    beginRound(0);
  }, [settings, players, packs, beginRound]);

  const afterDraw = useCallback(() => setPhase('handoff'), []);

  const setChallenge = useCallback(async (raw: Float32Array, sr: number, opts: { name?: string; save?: boolean }) => {
    const g = gameRef.current!;
    const creator = g.players.find((p) => p.id === g.round.creatorId)!;
    const samples = trimSilence(raw, sr);
    const name = (opts.name || '').trim() || `Desafio de ${creator.name}`;
    const info: SoundInfo = { id: `temp/${Date.now()}`, name, packId: 'temp', emoji: '🎙️', src: { kind: 'temp', samples, sr } };
    if (opts.save) {
      saveCustom({ id: Math.random().toString(36).slice(2, 10), name, createdAt: Date.now(), sr, samples, by: creator.name }).catch(() => {});
    }
    update((s) => ({ ...s, round: { ...s.round, sound: info } }));
    targetRef.current = loadSound(info);
    targetRef.current.catch(() => {});
    setPhase('handoff');
  }, [update]);

  const toListen = useCallback(() => setPhase('listen'), []);
  const toRecord = useCallback(() => setPhase('record'), []);

  const patchTake = useCallback((pid: string, patch: Partial<Take>) => {
    update((s) => {
      const t = s.round.takes[pid];
      if (!t) return s;
      const nt = { ...t, ...patch };
      nt.points = pointsFor(nt);
      return { ...s, round: { ...s.round, takes: { ...s.round.takes, [pid]: nt } } };
    });
  }, [update]);

  const submitTake = useCallback((samples: Float32Array, sr: number) => {
    const g = gameRef.current!;
    const r = g.round;
    const pid = r.order[r.turn];
    const pend = g.pending[pid] || {};
    const take: Take = { playerId: pid, samples, sr, score: null, sabotage: pend.sabotage, bonus: pend.bonus, mult: pend.mult, points: 0 };
    const pending = { ...g.pending };
    if (pend.swapWith) pending[pid] = { swapWith: pend.swapWith };
    else delete pending[pid];
    const next = update((s) => ({ ...s, pending, round: { ...s.round, takes: { ...s.round.takes, [pid]: take }, turn: s.round.turn + 1 } }))!;

    const target = targetRef.current;
    const anchorsReady = Promise.race([Promise.all(anchorLoads.current), new Promise((res) => setTimeout(res, 5000))]);
    (async () => {
      if (!target) throw new Error('Som original indisponível');
      const t = await target;
      await anchorsReady;
      const score = await scoreAttempt(t.info.id, r.anchorIds, samples, sr, g.settings.difficulty);
      patchTake(pid, { score });
    })().catch((e) => {
      patchTake(pid, { error: (e as Error).message, score: { total: 0, content: 0, pitch: 0, rhythm: 0, usesPitch: false, silent: true, longBonus: 0, chart: { target: [], attempt: [] }, raw: { cost: 0, base: 0, rel: 0, pitchErr: 0, envCorr: 0, durRatio: 0, warp: 1 } } });
    });

    setPhase(next.round.turn < next.round.order.length ? 'handoff' : 'allDone');
  }, [update, patchTake]);

  const startReveal = useCallback(() => {
    const g = gameRef.current!;
    const takes = { ...g.round.takes };
    const pending = { ...g.pending };
    for (const pid of g.round.order) {
      const other = pending[pid]?.swapWith;
      if (!other) continue;
      const a = takes[pid];
      const b = takes[other];
      if (a && b) {
        const swap = (x: Take, y: Take, owner: string): Take => {
          const t: Take = { ...y, playerId: owner, swappedWith: x === a ? other : pid };
          t.points = pointsFor(t);
          return t;
        };
        takes[pid] = swap(a, b, pid);
        takes[other] = swap(b, a, other);
      }
      const rest = { ...pending[pid] };
      delete rest.swapWith;
      if (Object.keys(rest).length) pending[pid] = rest;
      else delete pending[pid];
    }
    const revealOrder = g.settings.order === 'random' ? shuffle(g.round.order) : g.round.order.slice();
    update((s) => ({ ...s, pending, round: { ...s.round, takes, revealOrder, revealIdx: 0 } }));
    sfx('reveal');
    setPhase('reveal');
  }, [update]);

  const endRound = useCallback(() => {
    const g = gameRef.current!;
    const r = g.round;
    const pts: Record<string, number> = {};
    for (const pid of r.order) pts[pid] = r.takes[pid]?.points ?? 0;
    if (r.creatorId) {
      const vals = r.order.map((p) => pts[p]);
      pts[r.creatorId] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 0.5) : 0;
    }
    const max = Math.max(0, ...r.order.map((p) => pts[p]));
    const winners = max > 0 ? r.order.filter((p) => pts[p] === max) : [];
    const totals = { ...g.totals };
    const streak = { ...g.streak };
    const bestStreak = { ...g.bestStreak };
    for (const p of g.players) {
      totals[p.id] = (totals[p.id] || 0) + (pts[p.id] || 0);
      if (winners.includes(p.id)) streak[p.id] = (streak[p.id] || 0) + 1;
      else if (r.order.includes(p.id)) streak[p.id] = 0;
      bestStreak[p.id] = Math.max(bestStreak[p.id] || 0, streak[p.id] || 0);
    }
    const teamTotals: [number, number] = [...g.teamTotals];
    if (g.settings.mode === 'teams') {
      for (const t of [0, 1] as const) {
        const members = g.players.filter((p) => p.team === t && pts[p.id] !== undefined);
        if (members.length) teamTotals[t] += Math.round(members.reduce((a, p) => a + pts[p.id], 0) / members.length);
      }
    }
    let best = g.best;
    for (const pid of r.order) {
      if (!best || pts[pid] > best.points) best = { playerId: pid, points: pts[pid], soundName: r.sound?.name || '' };
    }
    const low = Math.min(...r.order.map((p) => pts[p]));
    const losers = r.order.filter((p) => pts[p] === low);
    const spinnerId = losers[Math.floor(Math.random() * losers.length)];
    const sabotaged = g.sabotaged + r.order.filter((p) => r.takes[p]?.sabotage).length;
    update((s) => ({
      ...s, totals, streak, bestStreak, teamTotals, best, sabotaged, takes: s.takes + r.order.length,
      history: [...s.history, { index: r.index, soundName: r.sound?.name || '', points: pts, winners }],
      round: { ...s.round, spinnerId },
    }));
    setPhase('roundEnd');
  }, [update]);

  const nextReveal = useCallback(() => {
    const g = gameRef.current!;
    if (g.round.revealIdx + 1 >= g.round.revealOrder.length) endRound();
    else update((s) => ({ ...s, round: { ...s.round, revealIdx: s.round.revealIdx + 1 } }));
  }, [update, endRound]);

  const continueAfterRound = useCallback(() => {
    const g = gameRef.current!;
    const nextIdx = g.round.index + 1;
    if (nextIdx >= g.plan.length) {
      sfx('win');
      setPhase('final');
    } else if (g.settings.wheel) setPhase('wheel');
    else beginRound(nextIdx);
  }, [beginRound]);

  const applyWheel = useCallback((slotId: SlotId, targetId?: string) => {
    const g = gameRef.current!;
    const spinner = g.round.spinnerId!;
    const slot = SLOTS.find((s) => s.id === slotId)!;
    const pending = { ...g.pending };
    const add = (pid: string, patch: object) => { pending[pid] = { ...(pending[pid] || {}), ...patch }; };
    const solo = g.players.length === 1;
    if (slot.kind === 'sabotage') {
      const victim = solo ? spinner : targetId;
      if (victim) add(victim, { sabotage: { effect: slot.id, by: spinner } });
    } else if (slot.kind === 'bonus') add(spinner, { bonus: (pending[spinner]?.bonus || 0) + 15 });
    else if (slot.kind === 'mult') add(spinner, { mult: 1.5 });
    else if (slot.kind === 'swap' && targetId) add(spinner, { swapWith: targetId });
    update((s) => ({ ...s, pending }));
    beginRound(g.round.index + 1);
  }, [update, beginRound]);

  const toMenu = useCallback(() => {
    gameRef.current = null;
    setGame(null);
    setPhase('home');
    reloadPacks();
  }, [reloadPacks]);

  const getTarget = useCallback(() => targetRef.current, []);

  return {
    phase, packs, packsLoaded, settings, setSettings, addPacks, players, setPlayers, game, error, setError, busy,
    reloadPacks, startGame, afterDraw, setChallenge, toListen, toRecord, submitTake, startReveal, nextReveal,
    endRound, continueAfterRound, applyWheel, toMenu, getTarget,
  };
}

export type GameApi = ReturnType<typeof useGame>;
