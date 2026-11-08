import { useCallback, useEffect, useRef, useState } from 'react';
import { checkMic, setSfxVolume, sfx, unlockAudio } from '../audio/engine';
import { BUILTIN_ID, loadPacks, loadSound, saveCustom, type LoadedSound, type PackInfo, type SoundInfo } from '../audio/library';
import { scoreAttempt } from '../audio/scorer';
import { trimSilence } from '../audio/util';
import {
  addTake, ANCHORS, applyWheelState, buildRound, EMPTY_SCORE, endRoundState, makePlan, newGame, patchTake as patchTakeState,
  pickAnchors, revealState, validateStart,
} from './engine';
import { addCoins, rewardFor } from './character';
import type { GameState, Phase, Player, Settings, SlotId, Take } from './model';
import { loadPlayers, loadRecent, loadSettings, pushRecent, savePlayers, saveSettings } from './storage';

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
    const anchors = pickAnchors(anchorPool.current, sound?.id);
    anchorLoads.current = anchors.map((a) => loadSound(a).catch(() => null));
    const round = buildRound(g, idx, anchors);
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
    const pool = packs.filter((p) => s.packIds.includes(p.id)).flatMap((p) => p.sounds);
    const invalid = validateStart(s, ps, pool.length);
    if (invalid) return setError(invalid);
    setBusy(true);
    await unlockAudio();
    const micErr = await checkMic();
    setBusy(false);
    if (micErr) return setError(micErr);

    const plan = makePlan(s, ps, pool, new Set(loadRecent()));
    pushRecent(plan.filter((x): x is SoundInfo => !!x).map((x) => x.id));
    const builtin = packs.find((p) => p.id === BUILTIN_ID)?.sounds || [];
    anchorPool.current = pool.length >= ANCHORS + 1 ? pool : [...pool, ...builtin];

    const g = newGame(s, ps, plan);
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
    update((s) => patchTakeState(s, pid, patch));
  }, [update]);

  const submitTake = useCallback((samples: Float32Array, sr: number) => {
    const g = gameRef.current!;
    const r = g.round;
    const pid = r.order[r.turn];
    const next = update((s) => {
      const added = addTake(s, pid, samples, sr).g;
      return { ...added, round: { ...added.round, turn: added.round.turn + 1 } };
    })!;

    const target = targetRef.current;
    const anchorsReady = Promise.race([Promise.all(anchorLoads.current), new Promise((res) => setTimeout(res, 5000))]);
    (async () => {
      if (!target) throw new Error('Som original indisponível');
      const t = await target;
      await anchorsReady;
      const score = await scoreAttempt(t.info.id, r.anchorIds, samples, sr, g.settings.difficulty);
      patchTake(pid, { score });
    })().catch((e) => {
      patchTake(pid, { error: (e as Error).message, score: EMPTY_SCORE });
    });

    setPhase(next.round.turn < next.round.order.length ? 'handoff' : 'allDone');
  }, [update, patchTake]);

  const startReveal = useCallback(() => {
    update((s) => revealState(s, 0));
    sfx('reveal');
    setPhase('reveal');
  }, [update]);

  const endRound = useCallback(() => {
    update((s) => endRoundState(s));
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
      const ranking = [...g.players].sort((a, b) => (g.totals[b.id] || 0) - (g.totals[a.id] || 0));
      const rewards: Record<string, number> = {};
      ranking.forEach((p, i) => { rewards[p.id] = rewardFor(g.totals[p.id] || 0, i); addCoins(p.id, rewards[p.id]); });
      update((s) => ({ ...s, rewards }));
      setPhase('final');
    } else if (g.settings.wheel) setPhase('wheel');
    else beginRound(nextIdx);
  }, [beginRound, update]);

  const applyWheel = useCallback((slotId: SlotId, targetId?: string) => {
    const g = gameRef.current!;
    update((s) => applyWheelState(s, slotId, targetId));
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
