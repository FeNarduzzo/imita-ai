import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, toBuffer, vibrate } from '../audio/engine';
import type { LoadedSound } from '../audio/library';
import { applyEffect } from '../audio/synth';
import { louden } from '../audio/util';
import { Avatar, Confetti, PitchChart, Ring, useCountUp, usePlayer } from '../components/ui';
import { envelopeOf, Waveform } from '../components/Waveform';
import { EFFECT_NAMES, ratingLabel, SLOTS, TEAMS, type GameState, type Player, type Slot } from '../game/model';
import type { GameApi } from '../game/useGame';
import { TopBar } from './Turn';

const byId = (g: GameState, id: string) => g.players.find((p) => p.id === id) as Player;

// ---------------------------------------------------------------- revelação

export function Reveal({ api, g, onQuit, online }: { api: GameApi; g: GameState; onQuit: () => void; online?: { host: boolean } }) {
  const r = g.round;
  const [localStep, setStep] = useState<'original' | 'take'>('original');
  const step = online ? (r.revealIdx < 0 ? 'original' : 'take') : localStep;
  const guestWait = !!online && !online.host;
  const [target, setTarget] = useState<LoadedSound | null>(null);
  const [showScore, setShowScore] = useState(false);
  const player = usePlayer();
  const pid = r.revealOrder[r.revealIdx];
  const take = r.takes[pid];
  const p = byId(g, pid);
  const last = r.revealIdx + 1 >= r.revealOrder.length;

  const buffer = useMemo(() => {
    if (!take) return null;
    const x = take.sabotage ? applyEffect(take.sabotage.effect, take.samples, take.sr, r.index * 31 + r.revealIdx) : take.samples;
    return toBuffer(louden(x, take.sr), take.sr);
  }, [take, r.index, r.revealIdx]);

  useEffect(() => {
    let alive = true;
    api.getTarget()?.then((t) => {
      if (!alive) return;
      setTarget(t);
      player.start(t.buffer);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 'take' || !buffer) return;
    setShowScore(false);
    let alive = true;
    const t0 = performance.now();
    player.start(buffer).then(() => {
      const wait = Math.max(0, 700 - (performance.now() - t0));
      setTimeout(() => {
        if (!alive) return;
        setShowScore(true);
        if (take?.sabotage) { sfx('bad'); vibrate([80, 40, 80]); }
      }, wait);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, buffer]);

  const targetEnv = useMemo(() => envelopeOf(target?.buffer), [target]);
  const takeEnv = useMemo(() => envelopeOf(buffer), [buffer]);
  const score = take?.score;
  const shown = useCountUp(take?.points ?? 0, 1200, showScore);
  useEffect(() => {
    if (showScore && score && !take?.sabotage) {
      if (take.points >= 75) sfx('win');
      else sfx('reveal');
    }
  }, [showScore, score, take]);

  if (step === 'original') {
    return (
      <div className="screen">
        <TopBar g={g} onQuit={onQuit} />
        <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <div className="caps">{r.mystery ? 'O som misterioso era…' : 'Relembrando o original'}</div>
          <div className="sound-card">
            {r.sound?.image ? <img className="art" src={r.sound.image} alt="" /> : <div className="art">{r.sound?.emoji || '🔊'}</div>}
            <div className="sname">{r.sound?.name}</div>
          </div>
          {targetEnv && <Waveform env={targetEnv} progress={player.playing ? player.progress : 1} cursor={player.playing} label="Forma de onda do original" />}
          <button className="play-big" disabled={!target} onClick={() => target && (player.playing ? player.stop() : player.start(target.buffer))} aria-label="Ouvir o original">
            <Ring value={player.playing ? player.progress : 0} size={196} stroke={8} color="var(--cyan)" />
            {player.playing ? '🔊' : '▶'}
          </button>
        </div>
        <button className="btn big pink" disabled={guestWait} onClick={() => { player.stop(); if (online) api.nextReveal(); else setStep('take'); }}>
          {guestWait ? 'O anfitrião comanda a revelação…' : 'Ouvir as imitações →'}
        </button>
      </div>
    );
  }

  const rating = ratingLabel(take?.points ?? 0);
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} label={`Imitação ${r.revealIdx + 1} de ${r.revealOrder.length}`} />
      <div key={`h-${pid}`} className="row" style={{ justifyContent: 'center', gap: 12, animation: 'enter .35s both' }}>
        <Avatar p={p} size="l" />
        <div>
          <div className="title-m">{p.name}</div>
          {g.settings.mode === 'teams' && <div className="small" style={{ color: TEAMS[p.team].color }}>{TEAMS[p.team].emoji} {TEAMS[p.team].name}</div>}
        </div>
      </div>
      <div key={`b-${pid}`} className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', animation: 'enter .35s both' }}>
        {!showScore ? (
          <>
            {takeEnv && <Waveform env={takeEnv} progress={player.playing ? player.progress : 1} cursor={player.playing} height={120} label={`Imitação de ${p.name}`} />}
            <b>{player.playing ? 'Tocando a imitação…' : 'Calculando…'}</b>
            <button className="btn ghost sm" onClick={() => { player.stop(); setShowScore(true); }}>Pular</button>
          </>
        ) : (
          <>
            {take?.sabotage && (
              <div className="sabotage-banner">😈 SABOTADO por {byId(g, take.sabotage.by).name}: {EFFECT_NAMES[take.sabotage.effect]} · nota ÷2</div>
            )}
            <div className="score-ring">
              <Ring value={shown / 100} size={190} stroke={14} color={p.color} />
              <div className="num"><div>{shown}<small>pontos</small></div></div>
            </div>
            <div className="rating" key={pid}>{score?.silent ? '🙉 Não ouvi nada!' : `${rating.emoji} ${rating.text}`}</div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              {take?.bonus ? <span className="badge yellow">⭐ +{take.bonus}</span> : null}
              {take?.mult ? <span className="badge lime">🚀 x{String(take.mult).replace('.', ',')}</span> : null}
              {take?.swappedWith ? <span className="badge cyan">🔄 Trocou com {byId(g, take.swappedWith).name}</span> : null}
              {score && score.longBonus > 0 ? <span className="badge">⏱️ Som longo +{score.longBonus}</span> : null}
            </div>
            {score && !score.silent && (
              <div className="card" style={{ width: '100%' }}>
                <div className="bars">
                  <Bar label="Fala/Timbre" v={score.content} color="var(--pink)" />
                  {score.usesPitch && <Bar label="Tom" v={score.pitch} color="var(--cyan)" />}
                  <Bar label="Ritmo" v={score.rhythm} color="var(--yellow)" />
                </div>
                {score.usesPitch && score.chart.target.length > 4 && (
                  <>
                    <PitchChart target={score.chart.target} attempt={score.chart.attempt} />
                    <div className="row small faint" style={{ justifyContent: 'center', gap: 14 }}>
                      <span>━ original</span><span style={{ color: 'var(--pink)' }}>━ imitação</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="row">
        <button className="btn ghost sm" disabled={!target} onClick={() => target && player.start(target.buffer)}>▶ Original</button>
        <button className="btn ghost sm" disabled={!buffer} onClick={() => buffer && player.start(buffer)}>▶ De novo</button>
        <button className="btn pink grow" disabled={!showScore || guestWait} onClick={() => { player.stop(); api.nextReveal(); }}>{guestWait ? 'Aguarde…' : last ? 'Ver ranking' : 'Próximo →'}</button>
      </div>
    </div>
  );
}

function Bar({ label, v, color }: { label: string; v: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(v), 60); return () => clearTimeout(t); }, [v]);
  return (
    <div className="bar-row">
      <span style={{ textAlign: 'left' }}>{label}</span>
      <div className="bar"><i style={{ width: `${w}%`, background: color }} /></div>
      <span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------- fim da rodada

export function RoundEnd({ api, g, onQuit, readOnly }: { api: GameApi; g: GameState; onQuit: () => void; readOnly?: boolean }) {
  const h = g.history[g.history.length - 1];
  const last = g.round.index + 1 >= g.plan.length;
  const sorted = [...g.players].sort((a, b) => (g.totals[b.id] || 0) - (g.totals[a.id] || 0));
  useEffect(() => { sfx('reveal'); }, []);
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="caps">Fim da rodada {g.round.index + 1}</div>
        <h1 className="title-l">
          {h.winners.length ? `${h.winners.map((id) => byId(g, id).name).join(' e ')} ${h.winners.length > 1 ? 'levaram' : 'levou'}!` : 'Ninguém pontuou!'}
        </h1>
      </div>
      {g.settings.mode === 'teams' && <TeamsScore g={g} />}
      <div className="rank-list">
        {sorted.map((p, i) => {
          const pts = h.points[p.id];
          const streak = g.streak[p.id] || 0;
          return (
            <div key={p.id} className={`rank ${i === 0 ? 'first' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="pos">{i + 1}</span>
              <Avatar p={p} />
              <div style={{ minWidth: 0 }}>
                <div className="nm">{p.name} {streak >= 2 && <span title="Sequência">🔥{streak}</span>}</div>
                <div className="sub">{p.id === g.round.creatorId ? 'criou o desafio' : pts === undefined ? '—' : `rodada: ${pts} pts`}</div>
              </div>
              <div className="pts">{g.totals[p.id] || 0}{pts ? <small>+{pts}</small> : null}</div>
            </div>
          );
        })}
      </div>
      <div className="grow" />
      <button className="btn big pink" disabled={readOnly} onClick={() => { sfx('pop'); api.continueAfterRound(); }}>
        {readOnly ? 'Aguardando o anfitrião…' : last ? 'Resultado final 🏆' : g.settings.wheel ? 'Roleta! 🎡' : 'Próxima rodada →'}
      </button>
    </div>
  );
}

function TeamsScore({ g }: { g: GameState }) {
  return (
    <div className="teams-score">
      {[0, 1].map((t) => (
        <div key={t} className="team-box" style={{ ['--c' as string]: TEAMS[t].color, order: t ? 3 : 1 }}>
          <div>{TEAMS[t].emoji} {TEAMS[t].name}</div>
          <b>{g.teamTotals[t]}</b>
        </div>
      ))}
      <span className="faint" style={{ order: 2, fontWeight: 700 }}>×</span>
    </div>
  );
}

// ---------------------------------------------------------------- roleta

export function Wheel({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const solo = g.players.length === 1;
  const slots = useMemo(() => (solo ? SLOTS.filter((s) => s.kind !== 'swap') : SLOTS), [solo]);
  const spinner = byId(g, g.round.spinnerId!);
  const [rot, setRot] = useState(0);
  const [result, setResult] = useState<Slot | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const seg = 360 / slots.length;

  const spin = () => {
    if (spinning || result) return;
    setSpinning(true);
    sfx('go');
    const idx = Math.floor(Math.random() * slots.length);
    const center = idx * seg + seg / 2 + (Math.random() - 0.5) * seg * 0.6;
    setRot(360 * 6 - center);
    let t = 0;
    for (let i = 0; i < 34; i++) {
      t += 30 + i * i * 0.28;
      timers.current.push(setTimeout(() => sfx('tock'), t));
    }
    timers.current.push(setTimeout(() => {
      setSpinning(false);
      setResult(slots[idx]);
      sfx(slots[idx].kind === 'sabotage' ? 'bad' : 'win');
      vibrate(80);
    }, 4300));
  };

  const needsTarget = !!result && !solo && (result.kind === 'sabotage' || result.kind === 'swap');
  const candidates = g.players.filter((p) => {
    if (p.id === spinner.id) return false;
    if (g.settings.mode === 'teams' && result?.kind === 'sabotage') return p.team !== spinner.team;
    return true;
  });

  const R = 150;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    return `M${R},${R} L${R + R * Math.cos(a0)},${R + R * Math.sin(a0)} A${R},${R} 0 0 1 ${R + R * Math.cos(a1)},${R + R * Math.sin(a1)} Z`;
  };

  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} label="Roleta" />
      <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
        <Avatar p={spinner} size="l" />
        <div>
          <div className="title-m">{solo ? 'Gire a roleta!' : `${spinner.name} gira!`}</div>
          <div className="small muted">{solo ? 'Pode vir bônus… ou bomba.' : 'Quem fez menos pontos na rodada.'}</div>
        </div>
      </div>
      <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {!result ? (
          <div className="wheel-wrap">
            <div className="wheel-pointer" />
            <svg viewBox="-6 -6 312 312" onClick={spin} style={{ cursor: 'pointer' }} role="img" aria-label="Roleta de sabotagens e bônus">
              <circle cx={R} cy={R} r={R + 5} fill="#2a1460" stroke="#ffd23f" strokeWidth="4" />
              <g className="wheel-disc" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.85, 0.18, 1)' : 'none' }}>
                {slots.map((s, i) => {
                  const mid = ((i + 0.5) * seg - 90) * (Math.PI / 180);
                  const x = R + R * 0.7 * Math.cos(mid);
                  const y = R + R * 0.7 * Math.sin(mid);
                  return (
                    <g key={s.id}>
                      <path d={arc(i)} fill={s.color} stroke="#1b0b33" strokeWidth="2" opacity={i % 2 ? 0.92 : 1} />
                      <text x={x} y={y} fontSize="24" textAnchor="middle" dominantBaseline="central" transform={`rotate(${(i + 0.5) * seg} ${x} ${y})`}>{s.emoji}</text>
                    </g>
                  );
                })}
                <circle cx={R} cy={R} r={30} fill="#1b0b33" stroke="#ffd23f" strokeWidth="4" />
                <text x={R} y={R} fontSize="22" textAnchor="middle" dominantBaseline="central">🎡</text>
              </g>
            </svg>
          </div>
        ) : (
          <div className="slot-card card" style={{ borderColor: result.color }}>
            <div className="em">{result.emoji}</div>
            <h2 className="title-l" style={{ color: result.color }}>{result.title}</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>{solo ? result.descSolo : result.desc}</p>
            {result.kind === 'sabotage' && <p className="small faint" style={{ margin: '6px 0 0' }}>A nota da vítima vale metade.</p>}
          </div>
        )}
        {needsTarget && (
          <>
            <div className="caps">{result!.kind === 'swap' ? 'Trocar com quem?' : 'Escolha a vítima'}</div>
            <div className="target-grid">
              {(candidates.length ? candidates : g.players.filter((p) => p.id !== spinner.id)).map((p) => (
                <button key={p.id} className={`target ${targetId === p.id ? 'on' : ''}`} onClick={() => { sfx('click'); setTargetId(p.id); }}>
                  <Avatar p={p} />{p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {!result ? (
        <button className="btn big pink" disabled={spinning} onClick={spin}>{spinning ? 'Girando…' : 'GIRAR 🎡'}</button>
      ) : (
        <button className="btn big" disabled={needsTarget && !targetId} onClick={() => { sfx('pop'); api.applyWheel(result.id, targetId ?? undefined); }}>
          {needsTarget ? (result.kind === 'swap' ? 'Trocar!' : 'Sabotar! 😈') : 'Próxima rodada →'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- final

export function Final({ api, g, online }: { api: GameApi; g: GameState; online?: { host: boolean } }) {
  const sorted = [...g.players].sort((a, b) => (g.totals[b.id] || 0) - (g.totals[a.id] || 0));
  const podium = [sorted[1], sorted[0], sorted[2]];
  const heights = [96, 140, 70];
  const colors = ['#d9d4ff', 'var(--yellow)', '#ffb27a'];
  const streakBest = [...g.players].sort((a, b) => (g.bestStreak[b.id] || 0) - (g.bestStreak[a.id] || 0))[0];
  const teams = g.settings.mode === 'teams';
  const tie = g.teamTotals[0] === g.teamTotals[1];
  const teamWin = g.teamTotals[0] > g.teamTotals[1] ? 0 : 1;
  return (
    <div className="screen">
      <Confetti />
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <div className="caps">Resultado final</div>
        <h1 className="title-xl">{teams ? (tie ? 'Empate!' : `${TEAMS[teamWin].emoji} ${TEAMS[teamWin].name} venceu!`) : `${sorted[0].name} venceu!`}</h1>
      </div>
      {teams && <TeamsScore g={g} />}
      <div className="podium">
        {podium.map((p, i) => p ? (
          <div className="col" key={p.id}>
            <Avatar p={p} size={i === 1 ? 'l' : ''} />
            <div className="nm">{p.name}</div>
            <div className="pt">{g.totals[p.id] || 0} pts</div>
            <div className="step" style={{ height: heights[i], background: colors[i], animationDelay: `${[0.3, 0.6, 0][i]}s` }}>{[2, 1, 3][i]}</div>
          </div>
        ) : <div className="col" key={i} />)}
      </div>
      {sorted.length > 3 && (
        <div className="rank-list">
          {sorted.slice(3).map((p, i) => (
            <div key={p.id} className="rank">
              <span className="pos">{i + 4}</span><Avatar p={p} /><div className="nm">{p.name}</div><div className="pts">{g.totals[p.id] || 0}</div>
            </div>
          ))}
        </div>
      )}
      <div className="stats">
        {g.best && (
          <div className="stat"><span>Melhor imitação</span><b>{byId(g, g.best.playerId).name} · {g.best.points}</b><span>{g.best.soundName}</span></div>
        )}
        <div className="stat"><span>Gravações sabotadas</span><b>{g.sabotaged}/{g.takes}</b><span>😈 {g.sabotaged ? 'teve treta' : 'paz total'}</span></div>
        {(g.bestStreak[streakBest.id] || 0) >= 2 && (
          <div className="stat"><span>Maior sequência</span><b>🔥 {g.bestStreak[streakBest.id]} seguidas</b><span>{streakBest.name}</span></div>
        )}
        <div className="stat"><span>Rodadas</span><b>{g.plan.length}</b><span>{g.players.length} {g.players.length === 1 ? 'jogador' : 'jogadores'}</span></div>
      </div>
      <div className="grow" />
      <div className="row">
        <button className="btn ghost grow" onClick={api.toMenu}>{online ? (online.host ? 'Encerrar sala' : 'Sair da sala') : 'Menu'}</button>
        {(!online || online.host) && <button className="btn pink grow" onClick={() => { sfx('go'); api.startGame(); }}>Jogar de novo</button>}
      </div>
    </div>
  );
}
