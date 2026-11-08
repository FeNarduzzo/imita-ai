import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { sfx, unlockAudio } from '../audio/engine';
import { Card } from '../cards/Card';
import { Character } from '../components/Character';
import { Avatar, Logo, Seg, Toggle } from '../components/ui';
import type { Look } from '../game/character';
import type { Player } from '../game/model';
import { handValue, type BjAction, type BjState } from '../tables/blackjack';
import { DV_NAMES, type DvCard, type DvRank, type DvState } from '../tables/duvido';
import { AVAILABLE, MODULES } from '../tables/modules';
import type { GameId } from '../tables/types';
import type { RoomSeat, Self, TableApi } from '../tables/useTable';
import { CoinPill } from './Wardrobe';

const PUBLIC_URL = 'https://fenarduzzo.github.io/imita-ai/';
const tableLink = (code: string) => `${location.hostname.endsWith('github.io') ? `${location.origin}${location.pathname}` : PUBLIC_URL}#mesa=${code}`;

export const toSelf = (p: Player): Self => ({ id: p.id, name: p.name, color: p.color, look: p.look });

// ---------------------------------------------------------------- criar / entrar (online)

export function TableHub({ self, table, initialCode, onBack }: { self: Player; table: TableApi; initialCode?: string; onBack: () => void }) {
  const [code, setCode] = useState(initialCode || '');
  const [game, setGame] = useState<GameId>('blackjack');
  const busy = !!table.connecting;
  return (
    <div className="screen">
      <div className="row between">
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}>←</button>
        <Logo />
        <span style={{ width: 44 }} />
      </div>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <h1 className="title-l">Mesas de cartas</h1>
        <p className="muted" style={{ margin: 0 }}>Cada um no seu celular. Quem cria a mesa vira o líder 👑 e configura tudo.</p>
      </div>
      <section className="card row">
        <Avatar p={self} size="l" />
        <div className="grow"><div className="caps">Você senta como</div><b className="title-m">{self.name}</b></div>
      </section>
      <section className="card stack">
        <div className="caps">Criar mesa</div>
        <Seg label="Jogo" value={game} onChange={setGame} options={AVAILABLE.map((g) => ({ v: g, t: `${MODULES[g]!.emoji} ${MODULES[g]!.title}` }))} />
        <button className="btn pink full" disabled={busy} onClick={() => { unlockAudio(); sfx('go'); table.createRoom(game, toSelf(self)); }}>✨ Criar mesa</button>
      </section>
      <section className="card stack">
        <div className="caps">Entrar com código</div>
        <input className="code-input" value={code} placeholder="CÓDIGO" maxLength={4} autoCapitalize="characters" aria-label="Código da mesa"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
        <button className="btn cyan full" disabled={busy || code.length !== 4} onClick={() => { unlockAudio(); sfx('go'); table.joinRoom(code, toSelf(self)); }}>Entrar</button>
      </section>
      {table.connecting && <div className="row muted" style={{ justifyContent: 'center' }}><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> {table.connecting}</div>}
      {table.error && <div className="error" role="alert">{table.error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- sala de espera

function SeatRow({ s, table, isHostSeat }: { s: RoomSeat; table: TableApi; isHostSeat: boolean }) {
  const r = table.room!;
  const lead = r.leaderId === s.id;
  return (
    <div className="player-row" style={{ opacity: s.online ? 1 : 0.5 }}>
      <Avatar p={s} />
      <div className="grow" style={{ minWidth: 0 }}>
        <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead ? '👑 ' : ''}{s.name}{s.id === table.myId ? ' (você)' : ''}</b>
        <span className="small faint">🪙 {s.bank}{s.bot ? ' · bot' : ''}</span>
      </div>
      {table.isLeader && !s.bot && !lead && <button className="btn ghost sm" title="Passar a liderança" onClick={() => table.command({ cmd: 'leader', seatId: s.id })}>👑</button>}
      {table.isLeader && !isHostSeat && s.id !== table.myId && <button className="icon-btn" style={{ width: 38, height: 38, fontSize: 14 }} aria-label={`Remover ${s.name}`} onClick={() => table.command({ cmd: 'remove', seatId: s.id })}>✕</button>}
    </div>
  );
}

export function TableLobby({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const m = MODULES[r.gameId]!;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!r.code) return;
    QRCode.toDataURL(tableLink(r.code), { margin: 1, width: 300, color: { dark: '#150a2e', light: '#ffffff' } }).then(setQr).catch(() => {});
  }, [r.code]);
  const leader = table.isLeader;
  const leaderName = r.seats.find((s) => s.id === r.leaderId)?.name;
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">{r.code ? 'Mesa online' : 'Mesa offline'}</span>
        <span style={{ width: 44 }} />
      </div>

      {r.code && (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="caps">Código da mesa</div>
          <div className="room-code">{r.code}</div>
          {qr && <img className="room-qr" style={{ width: 140, height: 140 }} src={qr} alt={`QR code da mesa ${r.code}`} />}
          <span className="small faint">Os outros vão em Salão → Online → Mesas de cartas e digitam o código.</span>
        </div>
      )}

      <section className="card stack">
        <div className="row between"><div className="caps">Jogo</div>{!leader && <span className="small faint">👑 {leaderName} escolhe</span>}</div>
        {leader
          ? <Seg label="Jogo" value={r.gameId} onChange={(g) => table.command({ cmd: 'game', gameId: g })} options={AVAILABLE.map((g) => ({ v: g, t: `${MODULES[g]!.emoji} ${MODULES[g]!.title}` }))} />
          : <b className="title-m">{m.emoji} {m.title}</b>}
        {table.mode !== 'offline' && <div className="rule" style={{ borderTop: 0, padding: '4px 0' }}>
          <div>
            <div className="label" style={{ fontWeight: 600 }}>Deixar entrar com a partida em andamento</div>
            <div className="hint small faint">{m.joinable ? 'Quem chega no meio assiste e senta na próxima rodada.' : `No ${m.title} não dá: times e lugares ficam fixos até o fim.`}</div>
          </div>
          {m.joinable && (leader
            ? <Toggle label="Entrar no meio" on={r.allowLateJoin} onChange={(v) => table.command({ cmd: 'lateJoin', value: v })} />
            : <b>{r.allowLateJoin ? 'Sim' : 'Não'}</b>)}
        </div>}
        {m.configFields.map((f) => (
          <div key={f.key} className="rule col" style={{ borderTop: 0, padding: '4px 0' }}>
            <div className="row between">
              <span className="label" style={{ fontWeight: 600 }}>{f.label}</span>
              {f.type === 'toggle' && (leader
                ? <Toggle label={f.label} on={!!r.config[f.key]} onChange={(v) => table.command({ cmd: 'config', key: f.key, value: v })} />
                : <b>{r.config[f.key] ? 'Sim' : 'Não'}</b>)}
            </div>
            {f.type === 'select' && (leader
              ? <Seg label={f.label} value={r.config[f.key] as string | number} onChange={(v) => table.command({ cmd: 'config', key: f.key, value: v })} options={f.options} />
              : <b>{f.options.find((o) => o.v === r.config[f.key])?.t}</b>)}
            {f.hint && <span className="hint small faint">{f.hint}</span>}
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-head"><h2>Na mesa</h2><span className="caps">{r.seats.length}/{m.maxSeats}</span></div>
        <div className="stack" style={{ gap: 8 }}>
          {r.seats.map((s) => <SeatRow key={s.id} s={s} table={table} isHostSeat={s.id === r.hostSeatId} />)}
          {leader && r.seats.length < m.maxSeats && <button className="add-player" onClick={() => { sfx('pop'); table.command({ cmd: 'addBot' }); }}>+ Adicionar bot 🤖</button>}
        </div>
      </section>

      <div className="grow" />
      {table.toast && <div className="error">{table.toast}</div>}
      {leader
        ? <button className="btn big pink" onClick={() => table.command({ cmd: 'start' })}>COMEÇAR {m.emoji}</button>
        : <div className="row muted" style={{ justifyContent: 'center', minHeight: 64 }}><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> Esperando 👑 {leaderName} começar…</div>}
    </div>
  );
}

// ---------------------------------------------------------------- mesa de Blackjack

const DEALER: Look = { skin: '#f3c29c', hair: 'hair-short', hairColor: '#2a1c14', face: 'face-cool', top: 'top-tee-black', bottom: 'bot-black', shoes: 'shoe-boots', hat: null, acc: 'acc-necklace' };
const CHIPS = [5, 10, 25, 50, 100];
const RESULT: Record<string, string> = { blackjack: 'BLACKJACK!', win: 'Ganhou', push: 'Empate', lose: 'Perdeu', bust: 'Estourou' };

function seatPositions(n: number): { x: number; y: number }[] {
  // Lugares num arco (meia-lua), da esquerda para a direita
  if (n === 1) return [{ x: 50, y: 78 }];
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const ang = Math.PI * (0.92 - 0.84 * t);
    return { x: 50 + Math.cos(ang) * 40, y: 52 + Math.sin(ang) * 30 };
  });
}

export function BlackjackTable({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const v = table.view as (BjState & { shoeCount: number }) | null;
  const me = table.myId!;
  const [bet, setBet] = useState(0);
  const mySeat = r.seats.find((s) => s.id === me);
  const bank = v?.seats.find((s) => s.id === me)?.bank ?? mySeat?.bank ?? r.waiting?.find((s) => s.id === me)?.bank ?? 0;
  const myState = v?.st[me];
  useEffect(() => { if (v?.phase === 'bet' && myState && !myState.ready) setBet((b) => (b ? Math.min(b, bank) : Math.min(myState.bet || 0, bank))); }, [v?.phase, v?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (v?.banner) sfx(v.phase === 'settle' ? 'reveal' : 'pop'); }, [v?.banner]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => {
    // Você no meio do arco
    const others = r.seats.filter((s) => s.id !== me);
    const half = Math.floor(others.length / 2);
    return [...others.slice(0, half), ...(mySeat ? [mySeat] : []), ...others.slice(half)];
  }, [r.seats, me, mySeat]);
  if (!v) return <div className="screen center"><div className="spinner" /></div>;
  const pos = seatPositions(order.length);
  const dealerVal = handValue(v.dealer).total;
  const myTurn = v.phase === 'play' && v.turn === me;
  const hand = myTurn ? myState!.hands[myState!.cur] : null;
  const canDouble = !!hand && hand.cards.length === 2 && bank >= hand.bet;
  const canSplit = !!hand && hand.cards.length === 2 && myState!.hands.length === 1 && bank >= hand.bet
    && (['J', 'Q', 'K', '10'].includes(hand.cards[0].r) ? ['J', 'Q', 'K', '10'].includes(hand.cards[1].r) : hand.cards[0].r === hand.cards[1].r);
  const doAct = (a: BjAction) => { sfx('click'); table.act(a); };
  const turnName = r.seats.find((s) => s.id === v.turn)?.name;

  return (
    <div className="screen table-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">🂡 Rodada {v.round}{r.code ? ` · ${r.code}` : ''}</span>
        <CoinPill coins={bank} />
      </div>

      <WaitingBanner table={table} />
      <div className="felt bj">
        <div className="dealer">
          <Character look={DEALER} view="bust" className="dealer-char" />
          <div className="hand">
            {v.dealer.map((c) => <Card key={c.id} card={c} size={44} />)}
            {v.holeHidden && v.dealer.length === 1 && <Card hidden size={44} />}
          </div>
          {v.dealer.length > 0 && <span className="hand-val">{v.holeHidden ? '?' : dealerVal}</span>}
        </div>
        <div className="felt-text">BLACKJACK PAGA {v.config.pay === '3:2' ? '3 PARA 2' : '6 PARA 5'} · DEALER {v.config.hitSoft17 ? 'PEDE' : 'PARA'} NO 17</div>
        {v.banner && <div className="felt-banner" key={v.banner + v.round}>{v.banner}</div>}

        {order.map((s, i) => {
          const st = v.st[s.id];
          const isMe = s.id === me;
          const active = v.turn === s.id;
          return (
            <div key={s.id} className={`bj-seat ${isMe ? 'me' : ''} ${active ? 'active' : ''}`} style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
              <div className="bj-hands">
                {st?.hands.map((h, k) => (
                  <div key={k} className={`hand ${st.hands.length > 1 && st.cur === k && active ? 'cur' : ''}`}>
                    {h.cards.map((c, j) => <Card key={c.id} card={c} size={isMe ? 38 : 30} style={{ marginLeft: j ? (isMe ? -22 : -18) : 0 }} />)}
                    {h.cards.length > 0 && <span className="hand-val sm">{handValue(h.cards).total}</span>}
                    {h.result && <span className={`result ${h.result}`}>{RESULT[h.result]}{h.payout ? ` +${h.payout}` : ''}</span>}
                  </div>
                ))}
              </div>
              <div className="bet-spot" aria-label="Aposta">{(st?.hands.reduce((a, h) => a + h.bet, 0) || st?.bet) ? <span className="chip-stack">🪙 {st.hands.reduce((a, h) => a + h.bet, 0) || st.bet}</span> : null}</div>
              <Avatar p={s} size="s" />
              <span className="seat-name">{r.leaderId === s.id ? '👑 ' : ''}{isMe ? 'Você' : s.name}</span>
            </div>
          );
        })}
      </div>

      <div className="bj-controls">
        {v.phase === 'bet' && myState && !myState.ready && (
          <>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              {CHIPS.filter((c) => c <= v.config.maxBet).map((c) => (
                <button key={c} className={`poker-chip c${c}`} disabled={bet + c > Math.min(bank, v.config.maxBet)} onClick={() => { sfx('tock'); setBet(bet + c); }}>{c}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn ghost sm" onClick={() => setBet(0)}>Limpar</button>
              <button className="btn ghost sm" onClick={() => doAct({ type: 'bet', amount: 0 })}>Pular rodada</button>
              <button className="btn pink grow" disabled={bet < v.config.minBet || bet > bank} onClick={() => doAct({ type: 'bet', amount: bet })}>Apostar 🪙 {bet}</button>
            </div>
            {bank < v.config.minBet && <div className="small faint" style={{ textAlign: 'center' }}>Sem moedas para a aposta mínima. Ganhe mais na Imitação ou use um código 🎁.</div>}
          </>
        )}
        {v.phase === 'bet' && myState?.ready && <div className="status">{myState.bet ? `Você apostou 🪙 ${myState.bet}.` : 'Você pulou esta rodada.'} Esperando os outros…</div>}
        {myTurn && (
          <div className="bj-actions">
            <button className="btn cyan" onClick={() => doAct({ type: 'hit' })}>Pedir</button>
            <button className="btn" onClick={() => doAct({ type: 'stand' })}>Parar</button>
            <button className="btn ghost" disabled={!canDouble} onClick={() => doAct({ type: 'double' })}>Dobrar</button>
            <button className="btn ghost" disabled={!canSplit} onClick={() => doAct({ type: 'split' })}>Dividir</button>
          </div>
        )}
        {v.phase === 'play' && !myTurn && <div className="status">Vez de {turnName}…</div>}
        {v.phase === 'dealer' && <div className="status">Dealer jogando…</div>}
        {v.phase === 'settle' && <div className="status">Próxima rodada já já…</div>}
        {table.isLeader && <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => table.command({ cmd: 'lobby' })}>⚙️ Voltar à sala para configurar</button>}
        {table.toast && <div className="error">{table.toast}</div>}
      </div>
    </div>
  );
}

export function WaitingBanner({ table }: { table: TableApi }) {
  if (!table.isWaiting) return null;
  return <div className="waiting-banner">👀 Você está assistindo — senta na mesa assim que a rodada atual terminar.</div>;
}

export function TableGame({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  switch (table.room?.gameId) {
    case 'blackjack': return <BlackjackTable table={table} onQuit={onQuit} />;
    case 'duvido': return <DuvidoTable table={table} onQuit={onQuit} />;
    default: return <div className="screen center">Jogo em breve.</div>;
  }
}

// ---------------------------------------------------------------- mesa do Duvido

const DV_EMOJI: Record<DvRank, string> = { K: '👑', Q: '👸', A: '⭐', C: '🃏' };

function DvCardView({ c, hidden, size = 54, selected, onClick }: { c?: DvCard; hidden?: boolean; size?: number; selected?: boolean; onClick?: () => void }) {
  if (hidden || !c) return <Card hidden size={size} />;
  return (
    <button className={`card face dv ${c.r === 'C' ? 'joker' : ''} ${selected ? 'hl' : ''}`} style={{ width: size, height: size * 1.42 }} onClick={onClick} aria-pressed={selected} aria-label={DV_NAMES[c.r]}>
      <span className="dv-emoji" style={{ fontSize: size * 0.48 }}>{DV_EMOJI[c.r]}</span>
      <span className="dv-name" style={{ fontSize: size * 0.2 }}>{DV_NAMES[c.r].toUpperCase()}</span>
    </button>
  );
}

function Balloon({ pumps, max, color, out, popping }: { pumps: number; max: number; color: string; out: boolean; popping?: boolean }) {
  if (out) return <span className="balloon-pop" aria-label="Balão estourado">💥</span>;
  const scale = 0.55 + (pumps / Math.max(1, max)) * 0.75;
  return (
    <span className={`balloon ${popping ? 'pumping' : ''}`} style={{ ['--c' as string]: color, transform: `scale(${scale})` }} aria-label={`Balão: ${pumps} enchidas`}>
      <span className="balloon-knot" />
    </span>
  );
}

function circlePos(n: number, meIdx: number) {
  return Array.from({ length: n }, (_, i) => {
    const k = (i - meIdx + n) % n; // eu sempre embaixo
    const ang = Math.PI / 2 + (k / n) * Math.PI * 2;
    return { x: 50 + Math.cos(ang) * 38, y: 47 + Math.sin(ang) * 37 };
  });
}

export function DuvidoTable({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const v = table.view as DvState | null;
  const me = table.myId!;
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { setSel([]); }, [v?.round, v?.turn, v?.phase]);
  useEffect(() => {
    if (!v?.banner) return;
    if (v.phase === 'reveal') sfx(v.reveal?.lied ? 'bad' : 'reveal');
    else if (v.phase === 'pump') sfx('tock');
    else if (v.phase === 'next' || v.phase === 'over') sfx(v.pump?.popped ? 'bad' : 'pop');
    else sfx('click');
  }, [v?.banner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <div className="screen center"><div className="spinner" /></div>;
  const mine = v.p[me];
  const myTurn = v.phase === 'play' && v.turn === me;
  const canDoubt = myTurn && !!v.lastPlay && v.lastPlay.by !== me;
  const canPlay = myTurn && !!mine?.hand.length;
  const bank = v.seats.find((s) => s.id === me)?.bank ?? r.seats.find((s) => s.id === me)?.bank ?? r.waiting?.find((s) => s.id === me)?.bank ?? 0;
  const meIdx = Math.max(0, v.seats.findIndex((s) => s.id === me));
  const pos = circlePos(v.seats.length, meIdx);
  const showCards = v.phase === 'reveal' || v.phase === 'pump' || v.phase === 'next' || v.phase === 'over';
  const turnName = v.seats.find((s) => s.id === v.turn)?.name;
  const toggle = (id: string) => { sfx('click'); setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= v.config.maxPlay ? x : [...x, id])); };

  return (
    <div className="screen table-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">🤥 Rodada {v.round}{r.code ? ` · ${r.code}` : ''}</span>
        <CoinPill coins={bank} />
      </div>
      <WaitingBanner table={table} />

      <div className="dv-tablecard">
        <span className="small muted">Carta da mesa</span>
        <b>{DV_EMOJI[v.table]} {DV_NAMES[v.table].toUpperCase()}</b>
        {v.pot > 0 && <span className="badge yellow">Pote 🪙 {v.pot}</span>}
      </div>

      <div className="felt dv-felt">
        {v.seats.map((s, i) => {
          const pl = v.p[s.id];
          if (!pl) return null;
          const active = v.turn === s.id && v.phase === 'play';
          return (
            <div key={s.id} className={`dv-seat ${active ? 'active' : ''} ${pl.out ? 'out' : ''}`} style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
              <Balloon pumps={pl.pumps} max={v.config.balloon} color={s.color} out={pl.out} popping={v.phase === 'pump' && v.pump?.id === s.id} />
              <Avatar p={s} size="s" />
              <span className="seat-name">{r.leaderId === s.id ? '👑 ' : ''}{s.id === me ? 'Você' : s.name}</span>
              {!pl.out && <span className="small">🂠 ×{pl.handCount ?? pl.hand.length}</span>}
            </div>
          );
        })}
        <div className="dv-center">
          {v.lastPlay ? (
            <div className="hand">
              {(showCards ? v.lastPlay.cards : Array.from({ length: v.lastPlay.count })).map((c, k) => (
                <DvCardView key={k} c={showCards ? (c as DvCard) : undefined} hidden={!showCards} size={44} />
              ))}
            </div>
          ) : <span className="small faint">Mesa vazia</span>}
          {v.reveal && showCards && <span className={`stamp ${v.reveal.lied ? 'lie' : 'truth'}`}>{v.reveal.lied ? 'MENTIRA!' : 'VERDADE!'}</span>}
          <span className="small faint">{v.pile} {v.pile === 1 ? 'carta' : 'cartas'} na pilha</span>
          {v.banner && <div className="dv-banner" key={v.banner}>{v.banner}</div>}
        </div>
      </div>

      <div className="bj-controls">
        {v.phase === 'over' ? (
          <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
            <div className="title-m">🏆 {v.seats.find((s) => s.id === v.winner)?.name} venceu{v.pot ? ` e levou 🪙 ${v.pot}` : ''}!</div>
            {table.isLeader ? <button className="btn big pink" onClick={() => table.command({ cmd: 'lobby' })}>Nova partida</button> : <div className="status">Esperando o líder 👑…</div>}
          </div>
        ) : mine && !mine.out ? (
          <>
            <div className="dv-hand">
              {mine.hand.map((c) => <DvCardView key={c.id} c={c} size={58} selected={sel.includes(c.id)} onClick={canPlay ? () => toggle(c.id) : undefined} />)}
              {!mine.hand.length && <span className="small faint">Sem cartas — na sua vez, só dá para duvidar.</span>}
            </div>
            {myTurn ? (
              <div className="row">
                <button className="btn red grow" disabled={!canDoubt} onClick={() => { sfx('bad'); table.act({ type: 'doubt' }); }}>DUVIDO! 🤨</button>
                <button className="btn cyan grow" disabled={!canPlay || !sel.length} onClick={() => { table.act({ type: 'play', ids: sel }); }}>
                  Jogar {sel.length || ''} {sel.length === 1 ? 'carta' : 'cartas'}
                </button>
              </div>
            ) : <div className="status">{v.phase === 'play' ? `Vez de ${turnName}…` : '…'}</div>}
            {myTurn && <div className="small faint" style={{ textAlign: 'center' }}>Escolha até {v.config.maxPlay} cartas. Você diz que todas são {DV_NAMES[v.table]} — pode ser verdade… ou não 😏</div>}
          </>
        ) : (
          <div className="status">{mine?.out ? '💥 Seu balão estourou — assista ao fim da partida.' : 'Assistindo…'}</div>
        )}
        {table.isLeader && v.phase !== 'over' && <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => table.command({ cmd: 'lobby' })}>⚙️ Voltar à sala para configurar</button>}
        {table.toast && <div className="error">{table.toast}</div>}
      </div>
    </div>
  );
}
