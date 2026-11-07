import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, play, sfx, toBuffer, vibrate, type Playing } from '../audio/engine';
import type { LoadedSound, SoundInfo } from '../audio/library';
import { peakLevel, trimSilence } from '../audio/util';
import { Avatar, Ring, usePlayer } from '../components/ui';
import { shuffle, TEAMS, type GameState, type Player } from '../game/model';
import type { GameApi } from '../game/useGame';

export function TopBar({ g, onQuit, label }: { g: GameState; onQuit: () => void; label?: string }) {
  return (
    <div className="topbar">
      <button className="icon-btn" aria-label="Sair da partida" onClick={onQuit}>✕</button>
      <span className="round-chip">{label ?? `Rodada ${g.round.index + 1} de ${g.plan.length}`}</span>
      <span style={{ width: 44 }} />
    </div>
  );
}

function SoundArt({ s, mystery, size = 132 }: { s: SoundInfo | null; mystery: boolean; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.55 };
  if (mystery || !s) return <div className="art" style={style}>❓</div>;
  if (s.image) return <img className="art" style={style} src={s.image} alt="" />;
  return <div className="art" style={style}>{s.emoji || '🔊'}</div>;
}

// ---------------------------------------------------------------- sorteio

export function Draw({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const items = useMemo(() => {
    const pool = api.packs.filter((p) => g.settings.packIds.includes(p.id)).flatMap((p) => p.sounds);
    const decoys = shuffle(pool.filter((x) => x.id !== r.sound?.id)).slice(0, 14);
    return [...decoys, r.sound];
  }, [api.packs, g.settings.packIds, r.sound]);
  const [go, setGo] = useState(false);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setGo(true), 250);
    const ticks: ReturnType<typeof setTimeout>[] = [];
    let t = 250;
    for (let i = 0; i < items.length - 1; i++) {
      t += 40 + i * i * 1.6;
      ticks.push(setTimeout(() => sfx('tick'), t));
    }
    const t2 = setTimeout(() => { setLanded(true); sfx('reveal'); vibrate(30); }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); ticks.forEach(clearTimeout); };
  }, [items.length]);

  const H = 150;
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
        <div>
          <div className="caps">Rodada {r.index + 1}</div>
          <h1 className="title-l" style={{ marginTop: 6 }}>{landed ? (r.mystery ? 'Som misterioso!' : 'O som é…') : 'Sorteando um som…'}</h1>
        </div>
        <div className="reel" aria-live="polite">
          <div style={{ transform: `translateY(${go ? -(items.length - 1) * H : 0}px)`, transition: go ? 'transform 2.2s cubic-bezier(0.12, 0.8, 0.2, 1)' : 'none' }}>
            {items.map((s, i) => {
              const hide = i === items.length - 1 && r.mystery;
              return (
                <div className="reel-item" key={i}>
                  {hide ? <span className="em">❓</span> : s?.image ? <img src={s.image} alt="" /> : <span className="em">{s?.emoji || '🔊'}</span>}
                  <b>{hide ? '???' : s?.name}</b>
                </div>
              );
            })}
          </div>
        </div>
        {landed && r.mystery && <p className="muted" style={{ margin: 0 }}>O nome só aparece na revelação. Boa sorte!</p>}
      </div>
      <button className="btn big" disabled={!landed} onClick={() => { sfx('pop'); api.afterDraw(); }}>Bora!</button>
    </div>
  );
}

// ---------------------------------------------------------------- vez de alguém

export function Handoff({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const p = g.players.find((x) => x.id === r.order[r.turn])!;
  const streak = g.streak[p.id] || 0;
  useEffect(() => { sfx('pop'); vibrate([20, 40, 20]); }, [p.id]);
  return (
    <div className="screen handoff" style={{ ['--c' as string]: p.color }}>
      <TopBar g={g} onQuit={onQuit} label={`Vez ${r.turn + 1} de ${r.order.length}`} />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div className="caps">Passe o celular para</div>
        <div className="bob"><Avatar p={p} size="xl" /></div>
        <div className="name">{p.name}</div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {g.settings.mode === 'teams' && <span className="badge" style={{ color: TEAMS[p.team].color }}>{TEAMS[p.team].emoji} {TEAMS[p.team].name}</span>}
          {streak >= 2 && <span className="badge yellow">🔥 Sequência de {streak}</span>}
        </div>
        <p className="muted" style={{ margin: 0, maxWidth: 300 }}>Ouça o som com atenção e depois imite do jeito mais parecido que conseguir.</p>
      </div>
      <button className="btn big pink" onClick={() => { sfx('go'); api.toListen(); }}>Sou eu! 🎤</button>
    </div>
  );
}

// ---------------------------------------------------------------- ouvir

export function Listen({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const p = g.players.find((x) => x.id === r.order[r.turn])!;
  const [snd, setSnd] = useState<LoadedSound | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const player = usePlayer();
  const max = g.settings.listens;

  const listen = async (s: LoadedSound) => {
    if (player.playing) return;
    setCount((c) => c + 1);
    await player.start(s.buffer);
  };

  useEffect(() => {
    let alive = true;
    api.getTarget()?.then((s) => {
      if (!alive) return;
      setSnd(s);
      listen(s);
    }).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRecord = count > 0 && !player.playing;
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="row" style={{ justifyContent: 'center' }}>
        <Avatar p={p} size="s" /><b>{p.name}</b>
      </div>
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', gap: 26 }}>
        <div className="sound-card">
          <SoundArt s={r.sound} mystery={r.mystery} />
          <div className="sname">{r.mystery ? 'Som misterioso' : r.sound?.name}</div>
          {r.creatorId && !r.sound?.name.startsWith('Desafio de') && <span className="badge pink">🎙️ criado por {g.players.find((x) => x.id === r.creatorId)?.name}</span>}
        </div>
        {err ? <div className="error">{err}</div> : (
          <button className="play-big" disabled={!snd || player.playing || count >= max} onClick={() => snd && listen(snd)} aria-label="Ouvir o som">
            <Ring value={player.playing ? player.progress : 0} size={196} stroke={8} color="var(--cyan)" track="rgba(255,255,255,0.06)" />
            {!snd ? <div className="spinner" /> : player.playing ? '🔊' : '▶'}
          </button>
        )}
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <div className="dots">{Array.from({ length: max }, (_, i) => <i key={i} className={i < count ? 'on' : ''} />)}</div>
          <span className="small muted">{count >= max ? 'Acabaram as escutas' : `Pode ouvir ${max - count} ${max - count === 1 ? 'vez' : 'vezes'}`}</span>
        </div>
      </div>
      <button className="btn big pink" disabled={!canRecord} onClick={() => { player.stop(); sfx('go'); api.toRecord(); }}>
        🎙️ Gravar minha imitação
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- gravar

function useWave(mic: React.RefObject<Mic | null>, active: boolean) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    if (!active) return;
    const hist: number[] = [];
    let raf = 0;
    const draw = () => {
      const l = Math.min(1, (mic.current?.level || 0) * 6);
      hist.push(l);
      if (hist.length > 64) hist.shift();
      setLvl(l);
      const c = canvas.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth * dpr;
        const h = c.clientHeight * dpr;
        if (c.width !== w) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);
        const bw = w / 64;
        hist.forEach((v, i) => {
          const bh = Math.max(4 * dpr, v * h);
          ctx.fillStyle = `rgba(255, ${Math.round(79 + 131 * v)}, ${Math.round(154 - 91 * v)}, ${0.35 + 0.65 * (i / 64)})`;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh, bw * 0.3);
            ctx.fill();
          } else {
            ctx.fillRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh);
          }
        });
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, mic]);
  return { canvas, lvl };
}

export function Record({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const p = g.players.find((x) => x.id === r.order[r.turn])!;
  const mic = useRef<Mic | null>(null);
  const [stage, setStage] = useState<'open' | 3 | 2 | 1 | 'go' | 'rec' | 'done'>('open');
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [maxSec, setMaxSec] = useState(4);
  const along = useRef<Playing | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const { canvas, lvl } = useWave(mic, stage !== 'open' && stage !== 'done');

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    (async () => {
      try {
        const target = await api.getTarget();
        const dur = target ? target.buffer.duration : 3;
        const limit = Math.min(10, Math.max(2.5, dur + 1.3));
        setMaxSec(limit);
        const m = new Mic();
        m.gain = g.settings.micGain;
        await m.open(g.settings.along);
        if (!alive) { m.close(); return; }
        mic.current = m;
        const steps: (3 | 2 | 1 | 'go')[] = [3, 2, 1, 'go'];
        steps.forEach((s, i) => timers.push(setTimeout(() => {
          if (!alive) return;
          setStage(s);
          sfx(s === 'go' ? 'go' : 'tick');
          if (s === 'go') vibrate(60);
        }, i * 700)));
        timers.push(setTimeout(() => {
          if (!alive) return;
          m.start();
          if (g.settings.along && target) along.current = play(target.buffer, 0.9);
          setStage('rec');
          const t0 = performance.now();
          const tick = () => {
            const e = (performance.now() - t0) / 1000;
            setElapsed(e);
            if (e >= limit) finish();
            else raf = requestAnimationFrame(tick);
          };
          tick();
        }, 4 * 700 - 250));
        let finished = false;
        const finish = () => {
          if (finished || !alive) return;
          finished = true;
          cancelAnimationFrame(raf);
          along.current?.stop();
          const samples = m.stop();
          const sr = m.sampleRate;
          m.close();
          setStage('done');
          sfx('pop');
          api.submitTake(samples, sr);
        };
        stopRef.current = finish;
      } catch (e) {
        setErr((e as Error).message || 'Não deu para abrir o microfone.');
      }
    })();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      along.current?.stop();
      mic.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counting = stage === 3 || stage === 2 || stage === 1 || stage === 'go';
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="row" style={{ justifyContent: 'center' }}><Avatar p={p} size="s" /><b>{p.name}</b></div>
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', gap: 22, textAlign: 'center' }}>
        {err ? <div className="error">{err}</div> : counting ? (
          <>
            <div className="caps">Prepare-se…</div>
            <div key={String(stage)} className={`countdown ${stage === 'go' ? 'go' : ''}`}>{stage === 'go' ? 'VAI!' : stage}</div>
          </>
        ) : (
          <>
            <div className="mic-orb" style={{ ['--lvl' as string]: lvl }}>🎙️</div>
            <div className="row" style={{ gap: 8 }}>
              {stage === 'rec' ? <><span className="rec-dot" /><b>Gravando… imite agora!</b></> : <span className="muted">{stage === 'open' ? 'Abrindo o microfone…' : 'Pronto!'}</span>}
            </div>
          </>
        )}
        <canvas ref={canvas} className="wave" />
        <div className="progress"><i style={{ width: `${Math.min(100, (elapsed / maxSec) * 100)}%` }} /></div>
      </div>
      <button className="btn big" disabled={stage !== 'rec' || elapsed < 0.6} onClick={() => stopRef.current()}>Terminei ✋</button>
    </div>
  );
}

// ---------------------------------------------------------------- criar desafio

export function Create({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const p = g.players.find((x) => x.id === r.creatorId)!;
  const mic = useRef<Mic | null>(null);
  const [stage, setStage] = useState<'intro' | 'rec' | 'review'>('intro');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ samples: Float32Array; sr: number; buf: AudioBuffer } | null>(null);
  const [name, setName] = useState('');
  const [save, setSave] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const player = usePlayer();
  const stopRef = useRef<() => void>(() => {});
  const { canvas, lvl } = useWave(mic, stage === 'rec');
  const LIMIT = 6;

  useEffect(() => () => mic.current?.close(), []);

  const record = async () => {
    setMsg(null);
    player.stop();
    try {
      const m = new Mic();
      m.gain = g.settings.micGain;
      await m.open();
      mic.current = m;
      sfx('go');
      m.start();
      setStage('rec');
      const t0 = performance.now();
      let raf = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        const raw = m.stop();
        const sr = m.sampleRate;
        m.close();
        mic.current = null;
        const samples = trimSilence(raw, sr);
        if (peakLevel(samples) < 0.02 || samples.length < sr * 0.3) {
          setStage('intro');
          setMsg('Não deu pra ouvir nada. Chegue mais perto do microfone e tente de novo.');
          return;
        }
        const buf = toBuffer(samples, sr);
        setClip({ samples, sr, buf });
        setStage('review');
        player.start(buf);
      };
      stopRef.current = finish;
      const tick = () => {
        const e = (performance.now() - t0) / 1000;
        setElapsed(e);
        if (e >= LIMIT) finish();
        else raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="screen handoff" style={{ ['--c' as string]: p.color }}>
      <TopBar g={g} onQuit={onQuit} />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        {stage === 'intro' && (
          <>
            <div className="caps">Desafio criado por jogador</div>
            <div className="bob"><Avatar p={p} size="xl" /></div>
            <h1 className="title-l">{p.name}, crie o som!</h1>
            <p className="muted" style={{ margin: 0, maxWidth: 320 }}>Grave um som de até {LIMIT} segundos: um bicho, um bordão, uma musiquinha. Os outros vão ter que imitar. Você ganha metade da média deles.</p>
            {msg && <div className="error">{msg}</div>}
          </>
        )}
        {stage === 'rec' && (
          <>
            <div className="mic-orb" style={{ ['--lvl' as string]: lvl }}>🎙️</div>
            <div className="row"><span className="rec-dot" /><b>Gravando o desafio…</b></div>
            <canvas ref={canvas} className="wave" />
            <div className="progress"><i style={{ width: `${(elapsed / LIMIT) * 100}%` }} /></div>
          </>
        )}
        {stage === 'review' && clip && (
          <>
            <h1 className="title-l">Ficou bom?</h1>
            <button className="play-big" onClick={() => (player.playing ? player.stop() : player.start(clip.buf))} aria-label="Ouvir o desafio">
              <Ring value={player.playing ? player.progress : 0} size={196} stroke={8} color="var(--cyan)" />
              {player.playing ? '■' : '▶'}
            </button>
            <input className="search" style={{ width: '100%', height: 48, fontSize: 17 }} maxLength={32} placeholder="Nome do som (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
              <span>Salvar em “Meus sons”</span>
              <button className={`toggle ${save ? 'on' : ''}`} role="switch" aria-checked={save} onClick={() => setSave(!save)} />
            </label>
          </>
        )}
      </div>
      {stage === 'intro' && <button className="btn big pink" onClick={record}>🎙️ Gravar desafio</button>}
      {stage === 'rec' && <button className="btn big" disabled={elapsed < 0.5} onClick={() => stopRef.current()}>Parar ✋</button>}
      {stage === 'review' && clip && (
        <div className="row">
          <button className="btn ghost grow" onClick={record}>Gravar de novo</button>
          <button className="btn pink grow" onClick={() => { player.stop(); api.setChallenge(clip.samples, clip.sr, { name, save }); }}>Usar este</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- todos gravaram

export function AllDone({ api, g, onQuit }: { api: GameApi; g: GameState; onQuit: () => void }) {
  const r = g.round;
  const done = r.order.filter((pid) => r.takes[pid]?.score).length;
  const ready = done === r.order.length;
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div style={{ fontSize: 72 }} className="bob">🎉</div>
        <h1 className="title-l">Todo mundo gravou!</h1>
        <p className="muted" style={{ margin: 0 }}>Coloque o celular no meio da galera: agora a gente ouve todas as imitações.</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {r.order.map((pid) => {
            const pl = g.players.find((x) => x.id === pid) as Player;
            const ok = !!r.takes[pid]?.score;
            return <div key={pid} style={{ opacity: ok ? 1 : 0.4, transition: 'opacity .3s' }}><Avatar p={pl} /></div>;
          })}
        </div>
        {!ready && <div className="row muted"><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> Analisando {done}/{r.order.length}…</div>}
      </div>
      <button className="btn big pink" disabled={!ready} onClick={api.startReveal}>Revelar! 🥁</button>
    </div>
  );
}
