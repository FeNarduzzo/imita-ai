import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { sfx, unlockAudio } from '../audio/engine';
import { Avatar, Logo, Seg } from '../components/ui';
import { EMOJIS, TEAMS, type GameState } from '../game/model';
import type { GameApi } from '../game/useGame';
import { loadMe, type Me, type OnlineApi } from '../online/useOnline';
import { Final, Reveal, RoundEnd, Wheel } from './Results';
import { Create, Draw, Listen, Record, TopBar } from './Turn';

const PUBLIC_URL = 'https://fenarduzzo.github.io/imita-ai/';

export function roomLink(code: string) {
  const base = location.hostname.endsWith('github.io') ? `${location.origin}${location.pathname}` : PUBLIC_URL;
  return `${base}#sala=${code}`;
}

// ---------------------------------------------------------------- criar / entrar

export function OnlineHub({ api, online, initialCode, onBack }: { api: GameApi; online: OnlineApi; initialCode?: string; onBack: () => void }) {
  const [me, setMe] = useState<Me>(() => loadMe(api.players[0]));
  const [code, setCode] = useState(initialCode || '');
  const busy = !!online.connecting;
  const cycle = () => {
    sfx('pop');
    const i = EMOJIS.indexOf(me.emoji);
    setMe({ ...me, emoji: EMOJIS[(i + 1) % EMOJIS.length] });
  };
  const named = { ...me, name: me.name.trim() || 'Jogador' };
  return (
    <div className="screen">
      <div className="row between">
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}>←</button>
        <Logo />
        <span style={{ width: 44 }} />
      </div>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <h1 className="title-l">Jogar online</h1>
        <p className="muted" style={{ margin: 0 }}>Cada um no próprio celular. Funciona melhor com todo mundo no mesmo Wi-Fi.</p>
      </div>

      <section className="card stack">
        <div className="caps">Você</div>
        <div className="player-row">
          <button onClick={cycle} aria-label="Trocar bichinho"><Avatar p={{ emoji: me.emoji, color: '#ff4f9a' }} /></button>
          <input className="name-input" value={me.name} maxLength={14} aria-label="Seu nome" onChange={(e) => setMe({ ...me, name: e.target.value })} />
        </div>
      </section>

      <button className="btn big pink" disabled={busy} onClick={() => { unlockAudio(); sfx('go'); online.createRoom(named); }}>
        ✨ Criar sala
      </button>

      <div className="row" style={{ gap: 10, color: 'var(--faint)' }}>
        <span className="grow" style={{ height: 1, background: 'var(--line)' }} />ou entre numa sala<span className="grow" style={{ height: 1, background: 'var(--line)' }} />
      </div>

      <section className="card stack">
        <input
          className="code-input"
          value={code}
          placeholder="CÓDIGO"
          inputMode="text"
          autoCapitalize="characters"
          maxLength={4}
          aria-label="Código da sala"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
        <button className="btn cyan full" disabled={busy || code.length !== 4} onClick={() => { unlockAudio(); sfx('go'); online.joinRoom(code, named); }}>
          Entrar
        </button>
      </section>

      {online.connecting && <div className="row muted" style={{ justifyContent: 'center' }}><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> {online.connecting}</div>}
      {online.error && <div className="error" role="alert">{online.error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- sala de espera

export function Lobby({ api, online, onQuit }: { api: GameApi; online: OnlineApi; onQuit: () => void }) {
  const s = online.shared!;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = roomLink(s.code);
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#150a2e', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [link]);
  const share = async () => {
    const text = `Bora jogar Imita Aí! Sala ${s.code}: ${link}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Imita Aí!', text, url: link }); return; }
    } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ok */ }
  };
  const st = api.settings;
  const packs = api.packs.filter((p) => st.packIds.includes(p.id));
  const sounds = packs.reduce((n, p) => n + p.sounds.length, 0);
  const teams = online.isHost ? st.mode === 'teams' : false;
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da sala" onClick={onQuit}>✕</button>
        <span className="round-chip">{online.isHost ? 'Você é o anfitrião' : 'Sala de espera'}</span>
        <span style={{ width: 44 }} />
      </div>

      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="caps">Código da sala</div>
        <div className="room-code">{s.code}</div>
        {qr && <img className="room-qr" src={qr} alt={`QR code para entrar na sala ${s.code}`} />}
        <button className="btn ghost sm" onClick={share}>{copied ? '✓ Link copiado' : '🔗 Compartilhar link'}</button>
        <span className="small faint">Os outros abrem o Imita Aí!, tocam em “Jogar online” e digitam o código — ou leem o QR.</span>
      </div>

      <section className="section">
        <div className="section-head"><h2>Na sala</h2><span className="caps">{s.seats.length}/10</span></div>
        <div className="stack" style={{ gap: 8 }}>
          {s.seats.map((p) => (
            <div key={p.id} className="player-row" style={{ opacity: p.online ? 1 : 0.45 }}>
              <Avatar p={p} />
              <b className="grow">{p.name}{p.id === online.myId ? ' (você)' : ''}</b>
              {p.id === s.hostId && <span className="badge yellow">anfitrião</span>}
              {teams && (
                <button className="team-chip" style={{ color: TEAMS[p.team].color }} onClick={() => online.toggleTeam(p.id)}>
                  {TEAMS[p.team].emoji} {p.team ? 'Gelo' : 'Fogo'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="label" style={{ fontWeight: 600 }}>Gravação</div>
        {online.isHost ? (
          <Seg label="Gravação" value={s.recMode} onChange={(v) => online.setRecMode(v)} options={[{ v: 'together', t: 'Todos juntos' }, { v: 'turns', t: 'Um de cada vez' }]} />
        ) : (
          <b>{s.recMode === 'together' ? 'Todos juntos' : 'Um de cada vez'}</b>
        )}
        <span className="small faint">
          {s.recMode === 'together'
            ? 'Todo mundo imita ao mesmo tempo, cada um no seu celular. Ideal quando cada um está num lugar.'
            : 'Um imita por vez enquanto os outros ficam quietos. Use quando estiverem na mesma sala.'}
        </span>
      </section>

      {online.isHost && (
        <p className="small muted" style={{ margin: 0 }}>
          {st.rounds} rodadas · {packs.length} {packs.length === 1 ? 'pacote' : 'pacotes'} ({sounds} sons) · {st.mode === 'teams' ? 'Times' : 'Clássico'} — as regras vêm da tela inicial.
        </p>
      )}

      <div className="grow" />
      {online.error && <div className="error" role="alert">{online.error}</div>}
      {online.isHost ? (
        <button className="btn big pink" disabled={s.seats.filter((x) => x.online).length < 2} onClick={() => { sfx('go'); online.hostStart(); }}>
          {s.seats.length < 2 ? 'Esperando alguém entrar…' : `COMEÇAR (${s.seats.length} jogadores)`}
        </button>
      ) : (
        <div className="row muted" style={{ justifyContent: 'center', minHeight: 64 }}><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> Esperando o anfitrião começar…</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- partida

function Waiting({ g, online, onQuit, title, emoji }: { g: GameState; online: OnlineApi; onQuit: () => void; title: string; emoji: string }) {
  const s = online.shared!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const showList = s.phase === 'play';
  const anyOffline = g.round.order.some((pid) => !s.submitted.includes(pid) && s.seats.find((x) => x.id === pid)?.online === false);
  const canSkip = online.isHost && s.phase === 'play' && (anyOffline || now - s.waitingSince > 25000);
  return (
    <div className="screen">
      <TopBar g={g} onQuit={onQuit} />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 64 }} className="bob">{emoji}</div>
        <h1 className="title-m" style={{ maxWidth: 320 }}>{title}</h1>
        {showList && (
          <div className="stack" style={{ width: '100%', gap: 8 }}>
            {g.round.order.map((pid) => {
              const p = g.players.find((x) => x.id === pid)!;
              const seat = s.seats.find((x) => x.id === pid);
              const done = s.submitted.includes(pid);
              const now2 = s.active.includes(pid) && !done;
              return (
                <div key={pid} className="player-row" style={{ opacity: seat?.online === false ? 0.45 : 1 }}>
                  <Avatar p={p} size="s" />
                  <b className="grow" style={{ textAlign: 'left' }}>{p.name}{pid === online.myId ? ' (você)' : ''}</b>
                  <span className="small">{done ? '✅ gravou' : seat?.online === false ? '📴 saiu' : now2 ? '🎙️ gravando…' : '⏳ esperando'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {canSkip && <button className="btn ghost full" onClick={online.skipMissing}>Continuar sem quem falta</button>}
    </div>
  );
}

export function OnlineGame({ api, online, onQuit }: { api: GameApi; online: OnlineApi; onQuit: () => void }) {
  const s = online.shared!;
  const view = online.view;
  const me = online.myId!;
  const adapter = useMemo(() => ({
    ...api,
    getTarget: online.getTarget,
    toRecord: () => online.setStage('record'),
    submitTake: online.submitTake,
    setChallenge: (x: Float32Array, sr: number, opts: { name?: string }) => online.submitChallenge(x, sr, opts),
    nextReveal: online.nextReveal,
    continueAfterRound: online.continueAfterRound,
    applyWheel: online.sendWheel,
    toMenu: onQuit,
    startGame: online.hostStart,
    afterDraw: () => {},
  }) as unknown as GameApi, [api, online, onQuit]);

  if (!view) return <div className="screen center"><div className="spinner" /></div>;
  const mine: GameState = { ...view, round: { ...view.round, order: [me], turn: 0 } };
  const nameOf = (id?: string) => view.players.find((p) => p.id === id)?.name || 'alguém';
  const host = { host: online.isHost };
  const r = view.round;
  const key = `${s.phase}-${r.index}-${online.stage}-${s.active.join(',')}-${s.soundSeq}`;

  let screen;
  switch (s.phase) {
    case 'draw':
      screen = (
        <>
          {s.note && <div className="note-toast">{s.note}</div>}
          <Draw api={adapter} g={view} onQuit={onQuit} decoys={s.decoys} auto />
        </>
      );
      break;
    case 'create':
      screen = r.creatorId === me
        ? <Create api={adapter} g={view} onQuit={onQuit} />
        : <Waiting g={view} online={online} onQuit={onQuit} emoji="🎙️" title={`${nameOf(r.creatorId)} está criando o desafio…`} />;
      break;
    case 'play': {
      const myTurn = s.active.includes(me) && !s.submitted.includes(me);
      if (myTurn && online.stage === 'listen') screen = <Listen api={adapter} g={mine} onQuit={onQuit} />;
      else if (myTurn) screen = <Record api={adapter} g={mine} onQuit={onQuit} />;
      else if (s.submitted.includes(me) || !r.order.includes(me)) {
        screen = <Waiting g={view} online={online} onQuit={onQuit} emoji="✅" title={s.recMode === 'turns' && s.active[0] ? `Vez de ${nameOf(s.active[0])} — silêncio! 🤫` : 'Esperando os outros gravarem…'} />;
      } else {
        screen = <Waiting g={view} online={online} onQuit={onQuit} emoji="🤫" title={`Vez de ${nameOf(s.active[0])} — fiquem em silêncio!`} />;
      }
      break;
    }
    case 'reveal':
      screen = online.takesReady
        ? <Reveal api={adapter} g={view} onQuit={onQuit} online={host} />
        : <Waiting g={view} online={online} onQuit={onQuit} emoji="📡" title="Recebendo as imitações…" />;
      break;
    case 'roundEnd':
      screen = <RoundEnd api={adapter} g={view} onQuit={onQuit} readOnly={!online.isHost} />;
      break;
    case 'wheel':
      screen = r.spinnerId === me
        ? <Wheel api={adapter} g={view} onQuit={onQuit} />
        : <Waiting g={view} online={online} onQuit={onQuit} emoji="🎡" title={`${nameOf(r.spinnerId)} está girando a roleta…`} />;
      break;
    case 'final':
      screen = <Final api={adapter} g={view} online={host} />;
      break;
    default:
      screen = null;
  }
  return <div key={key} style={{ display: 'contents' }}>{screen}</div>;
}

export function Ended({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="screen center" style={{ gap: 16 }}>
      <div style={{ fontSize: 64 }}>📴</div>
      <h1 className="title-m">{message}</h1>
      <button className="btn big pink" onClick={onBack}>Voltar ao menu</button>
    </div>
  );
}
