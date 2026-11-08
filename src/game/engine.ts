// Regras da partida em funções puras (sem React, sem áudio).
// Usadas pelo jogo local (passa o celular) e pelo anfitrião do modo online.
import type { ScoreResult } from '../audio/analysis';
import type { SoundInfo } from '../audio/library';
import { pointsFor, shuffle, SLOTS, type GameState, type Player, type RoundState, type Settings, type SlotId, type Take } from './model';

export const ANCHORS = 5;

export const EMPTY_SCORE: ScoreResult = {
  total: 0, content: 0, pitch: 0, rhythm: 0, usesPitch: false, silent: true, longBonus: 0,
  chart: { target: [], attempt: [] }, raw: { cost: 0, base: 0, rel: 0, pitchErr: 0, envCorr: 0, durRatio: 0, warp: 1 },
};

/** Valida o início da partida. Retorna a mensagem de erro, ou null se dá para começar. */
export function validateStart(s: Settings, ps: Player[], poolSize: number, online = false): string | null {
  const solo = ps.length === 1;
  if (!ps.length) return 'Adicione pelo menos um jogador.';
  if (online && ps.length < 2) return 'Espere pelo menos mais uma pessoa entrar na sala.';
  if (s.source !== 'packs' && solo) return 'No modo solo os desafios vêm dos pacotes. Mude “Quem cria o som” para “Pacotes”.';
  if (s.source !== 'players' && !poolSize) return 'Escolha pelo menos um pacote de som.';
  if (s.mode === 'teams' && (ps.length < 2 || !ps.some((p) => p.team === 0) || !ps.some((p) => p.team === 1))) {
    return 'No modo Times, cada time precisa de pelo menos um jogador.';
  }
  return null;
}

/** Sorteia os sons das rodadas (null = rodada em que um jogador cria o som). */
export function makePlan(s: Settings, ps: Player[], pool: SoundInfo[], recent: Set<string>): (SoundInfo | null)[] {
  const ordered = [...shuffle(pool.filter((x) => !recent.has(x.id))), ...shuffle(pool.filter((x) => recent.has(x.id)))];
  const plan: (SoundInfo | null)[] = [];
  let k = 0;
  for (let r = 0; r < s.rounds; r++) {
    const byPlayer = s.source === 'players' || (s.source === 'mixed' && r % 2 === 1);
    if (byPlayer && ps.length >= 2) plan.push(null);
    else plan.push(ordered.length ? ordered[k++ % ordered.length] : null);
  }
  return plan;
}

export function newGame(s: Settings, ps: Player[], plan: (SoundInfo | null)[]): GameState {
  const solo = ps.length === 1;
  const zero = Object.fromEntries(ps.map((p) => [p.id, 0]));
  return {
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
}

/** Monta a rodada `idx`: quem cria o som, ordem de quem imita, som misterioso e sons de referência. */
export function buildRound(g: GameState, idx: number, anchors: SoundInfo[]): RoundState {
  const sound = g.plan[idx];
  const ps = g.players;
  const n = ps.length;
  const creatorId = sound === null ? ps[idx % n].id : undefined;
  const order = ps.map((_, k) => ps[(k + idx) % n].id).filter((id) => id !== creatorId);
  const mystery = g.settings.mystery && sound !== null && idx > 0 && Math.random() < 0.25;
  return {
    index: idx, sound, creatorId, mystery, order, turn: 0, takes: {},
    anchorIds: anchors.map((a) => a.id), revealOrder: [], revealIdx: 0,
  };
}

export function pickAnchors(pool: SoundInfo[], exclude?: string): SoundInfo[] {
  return shuffle(pool.filter((s) => s.id !== exclude)).slice(0, ANCHORS);
}

/** Registra a imitação de `pid` (consome sabotagem/bônus pendentes). */
export function addTake(g: GameState, pid: string, samples: Float32Array, sr: number): { g: GameState; take: Take } {
  const pend = g.pending[pid] || {};
  const take: Take = { playerId: pid, samples, sr, score: null, sabotage: pend.sabotage, bonus: pend.bonus, mult: pend.mult, points: 0 };
  const pending = { ...g.pending };
  if (pend.swapWith) pending[pid] = { swapWith: pend.swapWith };
  else delete pending[pid];
  return { g: { ...g, pending, round: { ...g.round, takes: { ...g.round.takes, [pid]: take } } }, take };
}

export function patchTake(g: GameState, pid: string, patch: Partial<Take>): GameState {
  const t = g.round.takes[pid];
  if (!t) return g;
  const nt = { ...t, ...patch };
  nt.points = pointsFor(nt);
  return { ...g, round: { ...g.round, takes: { ...g.round.takes, [pid]: nt } } };
}

/** Prepara a revelação: aplica trocas da roleta e define a ordem. */
export function revealState(g: GameState, startIdx = 0): GameState {
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
  const withTakes = g.round.order.filter((p) => takes[p]);
  const revealOrder = g.settings.order === 'random' ? shuffle(withTakes) : withTakes;
  return { ...g, pending, round: { ...g.round, takes, revealOrder, revealIdx: startIdx } };
}

/** Fecha a rodada: pontos, sequências, times, melhor imitação e quem gira a roleta. */
export function endRoundState(g: GameState): GameState {
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
  return {
    ...g, totals, streak, bestStreak, teamTotals, best, sabotaged, takes: g.takes + r.order.length,
    history: [...g.history, { index: r.index, soundName: r.sound?.name || '', points: pts, winners }],
    round: { ...g.round, spinnerId },
  };
}

/** Aplica o resultado da roleta às próximas imitações. */
export function applyWheelState(g: GameState, slotId: SlotId, targetId?: string): GameState {
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
  return { ...g, pending };
}
