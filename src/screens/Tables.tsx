import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { sfx, unlockAudio } from '../audio/engine';
import { Card } from '../cards/Card';
import { cardName, RANK_NAMES, type Card as CardT } from '../cards/cards';
import { Character } from '../components/Character';
import { Avatar, Logo, Seg, Toggle } from '../components/ui';
import type { Look } from '../game/character';
import type { Player } from '../game/model';
import { handValue, type BjAction, type BjState } from '../tables/blackjack';
import { DV_NAMES, type DvCard, type DvRank, type DvState } from '../tables/duvido';
import { AVAILABLE, MODULES } from '../tables/modules';
import { handName, potTotal, score7, type PkAction, type PkState } from '../tables/poker';
import { hasCleanCanastra, isBlack3, isCanastra, isClean, isWild, teamOf as trTeamOf, TR_ORDER, type TrAction, type TrMeld, type TrState, type TrTeamScore } from '../tables/tranca';
import { nextValue, RAISE_NAMES, TC_TARGET, teamOf, type TcCard, type TcState, type Team } from '../tables/truco';
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

function SeatRow({ s, table, isHostSeat, tag, tagIdx, canMove }: { s: RoomSeat; table: TableApi; isHostSeat: boolean; tag?: string | null; tagIdx?: number; canMove?: boolean }) {
  const r = table.room!;
  const lead = r.leaderId === s.id;
  return (
    <div className="player-row" style={{ opacity: s.online ? 1 : 0.5 }}>
      <Avatar p={s} />
      <div className="grow" style={{ minWidth: 0 }}>
        <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead ? '👑 ' : ''}{s.name}{s.id === table.myId ? ' (você)' : ''}{tag && <span className={`seat-tag t${tagIdx}`}>{tag}</span>}</b>
        <span className="small faint">🪙 {s.bank}{s.bot ? ' · bot' : ''}</span>
      </div>
      {canMove && <button className="btn ghost sm" title="Subir um lugar" aria-label={`Subir ${s.name} um lugar`} onClick={() => { sfx('click'); table.command({ cmd: 'move', seatId: s.id }); }}>⇅</button>}
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
          {r.seats.some((_, i) => m.seatTag?.(i, r.seats.length)) && <span className="small faint">Lugares 1 e 3 jogam juntos contra 2 e 4{leader ? ' — use ⇅ para escolher a dupla' : ''}.</span>}
          {r.seats.map((s, i) => {
            const tag = m.seatTag?.(i, r.seats.length) ?? null;
            return <SeatRow key={s.id} s={s} table={table} isHostSeat={s.id === r.hostSeatId} tag={tag} tagIdx={i % 2} canMove={leader && !!tag && i > 0} />;
          })}
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
    case 'truco': return <TrucoTable table={table} onQuit={onQuit} />;
    case 'poker': return <PokerTable table={table} onQuit={onQuit} />;
    case 'tranca': return <TrancaTable table={table} onQuit={onQuit} />;
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

/** Anel tracejado com setas no sentido em que a vez anda. */
function OrderRing({ n, rx = 38, ry = 37, cy = 47 }: { n: number; rx?: number; ry?: number; cy?: number }) {
  const arrows = Array.from({ length: n }, (_, k) => {
    const t = Math.PI / 2 - ((k + 0.5) / n) * Math.PI * 2;
    const x = 50 + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    const rot = (Math.atan2(-ry * Math.cos(t), rx * Math.sin(t)) * 180) / Math.PI;
    return <polygon key={k} points="-2.6,-2 2.6,0 -2.6,2" transform={`translate(${x} ${y}) rotate(${rot})`} />;
  });
  return (
    <svg className="dv-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="50" cy={cy} rx={rx} ry={ry} />
      <g>{arrows}</g>
    </svg>
  );
}

function circlePos(n: number, meIdx: number) {
  return Array.from({ length: n }, (_, i) => {
    const k = (i - meIdx + n) % n; // eu sempre embaixo
    const ang = Math.PI / 2 - (k / n) * Math.PI * 2; // a vez anda para a direita (anti-horário), como no Truco
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
  const order = v.seats.map((s) => s.id);
  const nextAliveAfter = (id: string) => {
    const i = order.indexOf(id);
    for (let k = 1; k <= order.length; k++) { const x = order[(i + k) % order.length]; if (v.p[x] && !v.p[x].out) return x; }
    return id;
  };
  const nextId = v.phase === 'play' ? nextAliveAfter(v.turn) : null;
  const nextName = nextId && nextId !== v.turn ? (nextId === me ? 'você' : v.seats.find((s) => s.id === nextId)?.name) : null;
  const revealing = v.phase === 'reveal' || v.phase === 'pump';
  const roles = (id: string) => {
    const out: { t: string; c: string }[] = [];
    if (revealing && v.reveal) {
      if (v.reveal.by === id) out.push({ t: 'jogou', c: 'played' });
      if (v.reveal.challenger === id) out.push({ t: 'duvidou 🤨', c: 'doubt' });
      return out;
    }
    if (v.phase !== 'play') return out;
    if (v.turn === id) out.push({ t: 'na vez', c: 'turn' });
    if (v.lastPlay?.by === id) out.push({ t: `jogou ${v.lastPlay.count}`, c: 'played' });
    if (nextId === id && id !== v.turn) out.push({ t: 'próximo', c: 'next' });
    return out;
  };
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
        <OrderRing n={v.seats.length} />
        {v.seats.map((s, i) => {
          const pl = v.p[s.id];
          if (!pl) return null;
          const active = v.turn === s.id && v.phase === 'play';
          return (
            <div key={s.id} className={`dv-seat ${active ? 'active' : ''} ${pl.out ? 'out' : ''}`} style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
              <Balloon pumps={pl.pumps} max={v.config.balloon} color={s.color} out={pl.out} popping={v.phase === 'pump' && v.pump?.id === s.id} />
              <Avatar p={s} size="s" />
              <span className="seat-name">{r.leaderId === s.id ? '👑 ' : ''}{s.id === me ? 'Você' : s.name}</span>
              <span className="dv-roles">{roles(s.id).map((x) => <span key={x.c} className={`dv-role ${x.c}`}>{x.t}</span>)}</span>
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
            ) : <div className="status">{v.phase === 'play' ? `Vez de ${turnName}${nextName ? ` · depois: ${nextName}` : ''}` : '…'}</div>}
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

// ---------------------------------------------------------------- mesa do Truco

// Eu sempre embaixo; a vez anda no sentido anti-horário: direita, frente, esquerda.
const TC_SEAT = [{ x: 50, y: 85 }, { x: 87, y: 50 }, { x: 50, y: 14 }, { x: 13, y: 50 }];
const TC_PLAY = [{ x: 50, y: 63 }, { x: 68, y: 49 }, { x: 50, y: 35 }, { x: 32, y: 49 }];
const tcSpot = (n: number, k: number) => (n === 2 ? [0, 2][k] : k);

export function TrucoTable({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const v = table.view as TcState | null;
  const me = table.myId!;
  const [sel, setSel] = useState<string | null>(null);
  const [cover, setCover] = useState(false);
  const us: Team = v ? teamOf(v, me) : 0;
  useEffect(() => { setSel(null); setCover(false); }, [v?.handNo, v?.tricks.length, v?.turn, v?.phase]);
  useEffect(() => {
    if (!v?.banner) return;
    if (v.phase === 'call') sfx('go');
    else if (v.phase === 'trickEnd') sfx('pop');
    else if (v.phase === 'handEnd') sfx(v.lastHand?.team == null ? 'tock' : v.lastHand.team === us ? 'win' : 'bad');
    else if (v.phase === 'over') sfx(v.winnerTeam === us ? 'win' : 'bad');
    else if (v.phase === 'onze') sfx('reveal');
    else sfx('click');
  }, [v?.banner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <div className="screen center"><div className="spinner" /></div>;

  const n = v.seats.length;
  const them = (1 - us) as Team;
  const name = (id: string) => (id === me ? 'Você' : v.seats.find((s) => s.id === id)?.name || '?');
  const names = (t: Team) => v.teams[t].map(name).join(' e ');
  const label = (t: Team) => (n === 2 ? name(v.teams[t][0]) : t === us ? 'Nós' : 'Eles');
  const plural = (t: Team) => n === 4 || (n === 2 && t === us);
  const hand = v.hands[me] || [];
  const myTurn = v.phase === 'play' && v.turn === me;
  const canTruco = myTurn && !v.noTruco && v.value < TC_TARGET && v.raisedBy !== us;
  const canCover = myTurn && v.config.coberta && v.tricks.length > 0 && !v.ferro;
  const bank = v.seats.find((s) => s.id === me)?.bank ?? r.seats.find((s) => s.id === me)?.bank ?? 0;
  const meIdx = Math.max(0, v.seats.findIndex((s) => s.id === me));
  const spotOf = (id: string) => tcSpot(n, (v.seats.findIndex((s) => s.id === id) - meIdx + n) % n);
  const fullTrick = v.trick.length === n && (v.phase === 'trickEnd' || v.phase === 'handEnd');
  const trickWinner = fullTrick ? v.tricksBy[v.tricksBy.length - 1] : null;
  const dot = (i: number) => { const t = v.tricks[i]; return t === undefined ? '' : t === -1 ? 'tie' : t === us ? 'us' : 'them'; };
  const pend = v.phase === 'call' ? v.pending : null;
  const onze = v.phase === 'onze' ? v.onze : null;
  const partner = n === 4 ? v.teams[us].find((x) => x !== me) : undefined;
  const raiseLabel = (val: number) => `${RAISE_NAMES[nextValue(val)] || 'DOZE'}!`;

  const play = (id: string) => { sfx('click'); table.act({ type: 'play', id, covered: cover && canCover }); setSel(null); };
  const tap = (id: string) => { if (!myTurn) return; if (sel === id) play(id); else { sfx('tock'); setSel(id); } };
  const handView = (cards: TcCard[], interactive: boolean, size = 62, dim = false) => (
    <div className="tc-hand">
      {cards.map((c) => (c.blind
        ? <button key={c.id} className={`tc-blind ${sel === c.id ? 'sel' : ''}`} aria-label="Carta escondida (mão de ferro)" disabled={!interactive} onClick={() => tap(c.id)}><Card hidden size={size} /></button>
        : <Card key={c.id} card={c} size={size} highlight={sel === c.id} className={`${c.r === v.manilha ? 'manilha' : ''} ${dim ? 'dim' : ''}`} onClick={interactive ? () => tap(c.id) : undefined} />))}
      {!cards.length && <span className="small faint">Sem cartas na mão.</span>}
    </div>
  );

  let controls: React.ReactNode;
  if (v.phase === 'over') {
    const won = v.winnerTeam === us;
    controls = (
      <div className="stack" style={{ alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <div className="title-m">{won ? (n === 4 ? '🏆 Sua dupla venceu!' : '🏆 Você venceu!') : `🏆 ${names(them)} ${n === 4 ? 'venceram' : 'venceu'}`}</div>
        {v.pot > 0 && <div className="small">{won ? `Pote de 🪙 ${v.pot}${n === 4 ? ' dividido entre vocês dois' : ' é seu'}!` : `O pote de 🪙 ${v.pot} ficou com eles.`}</div>}
        {table.isLeader ? <button className="btn big pink" onClick={() => table.command({ cmd: 'lobby' })}>Nova partida</button> : <div className="status">Esperando o líder 👑…</div>}
      </div>
    );
  } else if (onze) {
    const mine = onze.team === us;
    controls = mine ? (
      <div className="tc-call">
        <div className="tc-call-title">Mão de onze!</div>
        <div className="small">{onze.decider === me ? `${n === 4 ? 'Sua dupla tem' : 'Você tem'} 11. Jogar vale 3 pontos; correr dá 1 ponto para ${label(them)}.` : `${name(onze.decider)} decide se vocês jogam.`}</div>
        {handView(hand, false, 52)}
        {v.partnerHand && partner && <><div className="caps">Cartas de {name(partner)}</div>{handView(v.partnerHand, false, 52)}</>}
        {onze.decider === me && (
          <div className="row">
            <button className="btn lime grow" onClick={() => table.act({ type: 'onze', play: true })}>Jogar (vale 3)</button>
            <button className="btn red grow" onClick={() => table.act({ type: 'onze', play: false })}>Correr</button>
          </div>
        )}
      </div>
    ) : (
      <>
        {handView(hand, false, 62, true)}
        <div className="status">{label(onze.team)} {plural(onze.team) ? 'estão' : 'está'} com 11 e decidindo se joga…</div>
      </>
    );
  } else if (pend) {
    controls = pend.responder === me ? (
      <div className="tc-call">
        <div className="tc-call-title">{name(pend.by)} pediu {RAISE_NAMES[pend.to]}!</div>
        <div className="small">Aceitar: a mão passa a valer {pend.to}. Correr: {label(pend.team)} {plural(pend.team) ? 'ganham' : 'ganha'} {v.value}.</div>
        {handView(hand, false, 52)}
        <div className="row">
          <button className="btn lime grow" onClick={() => table.act({ type: 'accept' })}>Aceitar</button>
          <button className="btn red grow" onClick={() => table.act({ type: 'run' })}>Correr</button>
          {pend.to < TC_TARGET && <button className="btn pink grow" onClick={() => table.act({ type: 'raise' })}>{raiseLabel(pend.to)}</button>}
        </div>
      </div>
    ) : (
      <>
        {handView(hand, false, 62)}
        <div className="status">{name(pend.by)} pediu {RAISE_NAMES[pend.to]}! Esperando {name(pend.responder)} responder…</div>
      </>
    );
  } else {
    controls = (
      <>
        {handView(hand, myTurn, 62, v.phase === 'play' && !myTurn)}
        {myTurn ? (
          <div className="row">
            <button className="btn red grow" disabled={!canTruco} onClick={() => table.act({ type: 'truco' })}>{v.value < TC_TARGET ? raiseLabel(v.value) : 'Vale 12'}</button>
            <button className="btn cyan grow" disabled={!sel} onClick={() => sel && play(sel)}>{cover && canCover ? 'Jogar coberta' : 'Jogar carta'}</button>
          </div>
        ) : <div className="status">{v.phase === 'play' ? `Vez de ${name(v.turn)}…` : '…'}</div>}
        {canCover && (
          <div className="row between tc-cover">
            <span className="small">🂠 Jogar coberta (não vale nada, mas esconde o jogo)</span>
            <Toggle label="Jogar coberta" on={cover} onChange={setCover} />
          </div>
        )}
        <div className="small faint" style={{ textAlign: 'center' }}>
          {v.ferro ? 'Mão de ferro: ninguém vê as próprias cartas. Boa sorte!' : `Manilha ${RANK_NAMES[v.manilha]}: ♣ Zap › ♥ Copeta › ♠ Espadilha › ♦ Pica-fumo`}
          {myTurn ? ' · toque 2× na carta para jogar' : ''}
        </div>
      </>
    );
  }

  return (
    <div className="screen table-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">🃏 Mão {v.handNo}{r.code ? ` · ${r.code}` : ''}</span>
        <CoinPill coins={bank} />
      </div>

      <div className="tc-score" aria-label={`Placar: ${label(us)} ${v.score[us]}, ${label(them)} ${v.score[them]}`}>
        <div className="tc-team us">
          <span className="caps">{label(us)}</span>
          <b>{v.score[us]}</b>
          {n === 4 && <span className="small faint">{names(us)}</span>}
        </div>
        <div className="tc-mid">
          <span className={`tc-value ${v.value > 1 ? 'up' : ''}`} key={v.value}>{v.ferro ? 'Mão de ferro' : `Vale ${v.value}`}</span>
          <div className="tc-dots" aria-label="Vazas desta mão">{[0, 1, 2].map((i) => <span key={i} className={`tc-dot ${dot(i)}`} />)}</div>
          <span className="small faint">até {TC_TARGET}</span>
        </div>
        <div className="tc-team them">
          <span className="caps">{label(them)}</span>
          <b>{v.score[them]}</b>
          {n === 4 && <span className="small faint">{names(them)}</span>}
        </div>
      </div>

      <div className="tc-banner-line">{v.banner && <div className="dv-banner" key={`${v.handNo}-${v.banner}`}>{v.banner}</div>}</div>

      <div className="felt tc-felt">
        <div className="tc-vira" aria-label={`Vira: ${cardName(v.vira)}. Manilha: ${RANK_NAMES[v.manilha]}`}>
          <span className="tc-vira-label">Vira</span>
          <Card card={v.vira} size={38} />
          <span className="tc-manilha">Manilha: {RANK_NAMES[v.manilha]}</span>
        </div>
        {v.seats.map((s) => {
          const spot = spotOf(s.id);
          const p = TC_SEAT[spot];
          const active = (v.phase === 'play' && v.turn === s.id) || pend?.responder === s.id || onze?.decider === s.id;
          const count = v.counts?.[s.id] ?? 0;
          return (
            <div key={s.id} className={`tc-seat ${active ? 'active' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {spot !== 0 && <div className="tc-backs" aria-label={`${count} cartas`}>{Array.from({ length: count }, (_, j) => <span key={j} />)}</div>}
              <Avatar p={s} size="s" />
              <span className="seat-name">{r.leaderId === s.id ? '👑 ' : ''}{name(s.id)}</span>
              <span className="tc-tags">
                {v.mao === s.id && <span className="tc-tag">mão</span>}
                {s.id === partner && <span className="tc-tag partner">parceiro</span>}
              </span>
            </div>
          );
        })}
        {v.trick.map((p) => {
          const q = TC_PLAY[spotOf(p.seat)];
          return (
            <div key={`${v.handNo}-${p.seat}-${p.card?.id ?? 'coberta'}`} className={`tc-played ${trickWinner === p.seat ? 'win' : ''}`} style={{ left: `${q.x}%`, top: `${q.y}%` }}>
              {p.card ? <Card card={p.card} size={46} className={p.card.r === v.manilha ? 'manilha' : ''} /> : <Card hidden size={46} />}
              {p.covered && <span className="tc-covered">coberta</span>}
            </div>
          );
        })}
      </div>

      <div className="bj-controls">
        {controls}
        {table.isLeader && v.phase !== 'over' && <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => table.command({ cmd: 'lobby' })}>⚙️ Voltar à sala para configurar</button>}
        {table.toast && <div className="error">{table.toast}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mesa de Poker

const PK_RX = 40;
const PK_RY = 38;
const PK_CY = 46;
function pkPos(n: number, k: number) {
  const t = Math.PI / 2 - (k / n) * Math.PI * 2; // eu embaixo; a vez anda para a direita, como nas outras mesas
  return { x: 50 + Math.cos(t) * PK_RX, y: PK_CY + Math.sin(t) * PK_RY };
}
const fmt = (n: number) => n.toLocaleString('pt-BR');

export function PokerTable({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const v = table.view as PkState | null;
  const me = table.myId!;
  const [raise, setRaise] = useState(0);
  const [raising, setRaising] = useState(false);
  useEffect(() => { setRaising(false); setRaise(0); }, [v?.turn, v?.street, v?.handNo]);
  useEffect(() => {
    if (!v?.banner) return;
    if (v.phase === 'showdown') sfx(v.results?.some((x) => x.id === me && x.won > 0) ? 'win' : 'reveal');
    else if (v.phase === 'over') sfx(v.winner === me ? 'win' : 'bad');
    else if (/ALL-IN|aumentou|apostou/.test(v.banner)) sfx('go');
    else if (/desistiu/.test(v.banner)) sfx('tock');
    else if (/Flop|Turn|River|Mão/.test(v.banner)) sfx('pop');
    else sfx('click');
  }, [v?.banner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <div className="screen center"><div className="spinner" /></div>;

  const n = v.seats.length;
  const name = (id: string) => (id === me ? 'Você' : v.seats.find((s) => s.id === id)?.name || '?');
  const mine = v.p[me];
  const bank = v.seats.find((s) => s.id === me)?.bank ?? r.seats.find((s) => s.id === me)?.bank ?? r.waiting?.find((s) => s.id === me)?.bank ?? 0;
  const meIdx = Math.max(0, v.seats.findIndex((s) => s.id === me));
  const kOf = (id: string) => (v.seats.findIndex((s) => s.id === id) - meIdx + n) % n;
  const myTurn = v.phase === 'bet' && v.turn === me;
  const toCall = mine ? Math.max(0, v.currentBet - mine.bet) : 0;
  const max = mine ? mine.bet + mine.stack : 0;
  const minTo = Math.min(max, v.currentBet + v.minRaise);
  const canRaise = myTurn && max > v.currentBet;
  const pot = potTotal(v);
  const order = v.seats.map((s) => s.id);
  const nextTurn = (() => {
    if (!v.turn) return null;
    const i = order.indexOf(v.turn);
    for (let k = 1; k < n; k++) { const id = order[(i + k) % n]; const q = v.p[id]; if (q && !q.folded && !q.out && !q.allIn) return id; }
    return null;
  })();
  const winners = new Set((v.results || []).filter((x) => x.won > 0).map((x) => x.id));
  const bestIds = new Set((v.results || []).flatMap((x) => x.best));
  const myScore = mine && mine.cards.length ? score7([...mine.cards, ...v.board]) : null;
  const raiseVal = Math.min(max, Math.max(minTo, raise || minTo));
  const quick = [
    { t: 'Mín', to: minTo },
    { t: '½ pote', to: v.currentBet + Math.round(pot / 2) },
    { t: 'Pote', to: v.currentBet + pot },
  ].map((q) => ({ ...q, to: Math.min(max, Math.max(minTo, q.to)) }));
  const act = (a: PkAction) => { table.act(a); setRaising(false); };

  let controls: React.ReactNode;
  if (v.phase === 'over') {
    const cash = v.cashout?.[me] ?? 0;
    controls = (
      <div className="stack" style={{ alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <div className="title-m">{v.winner ? (v.winner === me ? '🏆 Você ficou com todas as fichas!' : `🏆 ${name(v.winner)} ficou com todas as fichas`) : 'Mesa encerrada'}</div>
        <div className="small">{v.practice ? 'Era treino: nenhuma moeda mudou.' : cash ? `Suas ${fmt(cash)} fichas viraram 🪙 ${fmt(cash)}.` : 'Você terminou sem fichas.'}</div>
        {table.isLeader ? <button className="btn big pink" onClick={() => table.command({ cmd: 'lobby' })}>Nova partida</button> : <div className="status">Esperando o líder 👑…</div>}
      </div>
    );
  } else if (!mine || mine.out) {
    controls = <div className="status">{table.isWaiting ? 'Você entra na próxima mão.' : mine?.out ? 'Você ficou sem fichas — assista até o fim.' : 'Assistindo…'}</div>;
  } else {
    controls = (
      <>
        <div className="pk-mine">
          <div className="pk-hole">
            {mine.cards.map((c) => <Card key={c.id} card={c} size={58} highlight={bestIds.has(c.id) && winners.has(me)} />)}
          </div>
          <div className="pk-info">
            <span className="caps">Suas fichas</span>
            <b className="pk-stack">🟡 {fmt(mine.stack)}</b>
            {myScore && !mine.folded && <span className="small pk-handname">{handName(myScore)}</span>}
            {mine.folded && <span className="small faint">Você desistiu desta mão</span>}
          </div>
        </div>
        {myTurn ? (
          <>
            <div className="row">
              <button className="btn red grow" onClick={() => act({ type: 'fold' })}>Desistir</button>
              {toCall > 0
                ? <button className="btn cyan grow" onClick={() => act({ type: 'call' })}>{toCall >= mine.stack ? `Pagar tudo (${fmt(mine.stack)})` : `Pagar ${fmt(toCall)}`}</button>
                : <button className="btn cyan grow" onClick={() => act({ type: 'check' })}>Passar</button>}
              <button className="btn pink grow" disabled={!canRaise} onClick={() => { setRaising((x) => !x); setRaise(minTo); }}>{v.currentBet ? 'Aumentar' : 'Apostar'}</button>
            </div>
            {raising && canRaise && (
              <div className="pk-raise">
                <div className="row" style={{ gap: 6 }}>
                  {quick.map((q) => <button key={q.t} className={`btn ghost sm grow ${raiseVal === q.to ? 'on' : ''}`} onClick={() => setRaise(q.to)}>{q.t}</button>)}
                  <button className={`btn ghost sm grow ${raiseVal === max ? 'on' : ''}`} onClick={() => setRaise(max)}>All-in</button>
                </div>
                <input type="range" className="pk-slider" min={minTo} max={max} step={Math.max(1, v.sb)} value={raiseVal} aria-label="Valor do aumento"
                  onChange={(e) => { const x = Number(e.target.value); setRaise(x >= max - v.sb / 2 ? max : x); }} />
                <button className="btn lime full" onClick={() => act(raiseVal >= max ? { type: 'allin' } : { type: 'raise', to: raiseVal })}>
                  {raiseVal >= max ? `ALL-IN (${fmt(max)})` : v.currentBet ? `Aumentar para ${fmt(raiseVal)}` : `Apostar ${fmt(raiseVal)}`}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="status">
            {v.phase === 'bet' && v.turn ? `Vez de ${name(v.turn)}${nextTurn && nextTurn !== v.turn ? ` · depois: ${nextTurn === me ? 'você' : name(nextTurn)}` : ''}` : v.phase === 'showdown' ? 'Próxima mão já vem…' : '…'}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen table-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">♠️ Mão {v.handNo} · {v.sb}/{v.bb}{r.code ? ` · ${r.code}` : ''}</span>
        {v.practice ? <span className="badge yellow">Treino</span> : <CoinPill coins={bank} />}
      </div>
      <WaitingBanner table={table} />
      <div className="tc-banner-line">{v.banner && <div className="dv-banner" key={`${v.handNo}-${v.banner}`}>{v.banner}</div>}</div>

      <div className="felt pk-felt">
        <OrderRing n={n} rx={PK_RX} ry={PK_RY} cy={PK_CY} />
        <div className="pk-center">
          <span className="pk-pot">{v.phase === 'showdown' && v.pots.length > 1
            ? v.pots.map((p, i) => `${i ? 'Paralelo' : 'Pote'} ${fmt(p.amount)}`).join(' · ')
            : `Pote ${fmt(v.phase === 'showdown' ? v.pots.reduce((a, p) => a + p.amount, 0) : pot)}`}</span>
          <div className="pk-board">
            {Array.from({ length: 5 }, (_, i) => v.board[i]
              ? <Card key={v.board[i].id} card={v.board[i]} size={34} highlight={bestIds.has(v.board[i].id)} />
              : <span key={`e${i}`} className="pk-slot" />)}
          </div>
        </div>
        {v.seats.map((s) => {
          const q = v.p[s.id];
          if (!q) return null;
          const k = kOf(s.id);
          const pos = pkPos(n, k);
          const bet = { x: 50 + (pos.x - 50) * 0.5, y: PK_CY + (pos.y - PK_CY) * 0.5 };
          const active = v.phase === 'bet' && v.turn === s.id;
          const res = v.results?.find((x) => x.id === s.id);
          return (
            <div key={s.id}>
              <div className={`pk-seat ${active ? 'active' : ''} ${q.folded && !q.out ? 'folded' : ''} ${q.out ? 'out' : ''} ${winners.has(s.id) ? 'winner' : ''}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                {k !== 0 && !q.out && !q.folded && (
                  <div className="pk-cards">
                    {q.cards.length
                      ? q.cards.map((c) => <Card key={c.id} card={c} size={24} highlight={bestIds.has(c.id) && winners.has(s.id)} />)
                      : Array.from({ length: q.count ?? 0 }, (_, j) => <span key={j} className="pk-back" />)}
                  </div>
                )}
                <Avatar p={s} size="s" />
                <span className="seat-name">{r.leaderId === s.id ? '👑 ' : ''}{name(s.id)}</span>
                <span className="pk-chips">🟡 {fmt(q.stack)}</span>
                <span className="pk-tags">
                  {v.button === s.id && <span className="pk-btn" title="Botão (dealer)">D</span>}
                  {v.sbSeat === s.id && v.handNo > 0 && <span className="tc-tag">SB</span>}
                  {v.bbSeat === s.id && v.handNo > 0 && <span className="tc-tag">BB</span>}
                  {active && <span className="dv-role turn">na vez</span>}
                  {res && res.won > 0 ? <span className="dv-role played">+{fmt(res.won)}</span> : q.last && !active ? <span className={`pk-last ${q.last === 'desistiu' ? 'fold' : q.last === 'all-in' ? 'allin' : ''}`}>{q.last}</span> : null}
                </span>
                {res?.name && v.showCards && <span className="pk-hand-tag">{res.name}</span>}
              </div>
              {q.bet > 0 && <span className="pk-bet" style={{ left: `${bet.x}%`, top: `${bet.y}%` }}>🟡 {fmt(q.bet)}</span>}
            </div>
          );
        })}
      </div>

      <div className="bj-controls">
        {controls}
        {table.isLeader && v.phase !== 'over' && <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => table.command({ cmd: 'lobby' })}>⚙️ {v.practice ? 'Encerrar a mesa' : 'Encerrar e trocar fichas por moedas'}</button>}
        {table.toast && <div className="error">{table.toast}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mesa da Tranca

const RANK_LABEL: Partial<Record<string, string>> = { A: 'Ás', K: 'Rei', Q: 'Dama', J: 'Valete', B3: '3 pretos' };

function MeldChip({ m, onClick, can }: { m: TrMeld; onClick?: () => void; can?: boolean }) {
  const can7 = isCanastra(m);
  const clean = isClean(m);
  const face = m.cards.find((c) => !isWild(c)) || m.cards[0];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`tr-meld ${can7 ? (clean ? 'limpa' : 'suja') : ''} ${can ? 'can' : ''}`} onClick={onClick} aria-label={`Jogo de ${RANK_LABEL[m.rank] || m.rank}: ${m.cards.length} cartas${can7 ? (clean ? ', canastra limpa' : ', canastra suja') : ''}`}>
      <Card card={face} size={30} />
      <span className="tr-meld-n">×{m.cards.length}</span>
      {!clean && <span className="tr-meld-wild">2</span>}
      {can7 && <span className="tr-meld-tag">{clean ? 'LIMPA' : 'SUJA'}</span>}
      {can && <span className="tr-meld-plus">+</span>}
    </Tag>
  );
}

const sortHand = (cards: CardT[]) => [...cards].sort((a, b) => TR_ORDER.indexOf(a.r) - TR_ORDER.indexOf(b.r) || a.s.localeCompare(b.s));

export function TrancaTable({ table, onQuit }: { table: TableApi; onQuit: () => void }) {
  const r = table.room!;
  const v = table.view as TrState | null;
  const me = table.myId!;
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { setSel([]); }, [v?.turn, v?.phase, v?.handNo]);
  useEffect(() => {
    if (!v?.banner) return;
    const b = v.banner;
    if (/bateu|LIMPA|venceu|venceram/.test(b)) sfx('win');
    else if (/morto|3 vermelho/.test(b)) sfx('reveal');
    else if (/trancado/.test(b)) sfx('tock');
    else if (/pegou o lixo|canastra/.test(b)) sfx('go');
    else sfx('pop');
  }, [v?.banner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <div className="screen center"><div className="spinner" /></div>;

  const n = v.seats.length;
  const us = trTeamOf(v, me);
  const them = (1 - us) as 0 | 1;
  const name = (id: string) => (id === me ? 'Você' : v.seats.find((s) => s.id === id)?.name || '?');
  const label = (t: 0 | 1) => (n === 2 ? name(v.teams[t][0]) : t === us ? 'Nós' : 'Eles');
  const hand = sortHand(v.hands[me] || []);
  const myTurn = (v.phase === 'draw' || v.phase === 'play') && v.turn === me;
  const picked = hand.filter((c) => sel.includes(c.id));
  const top = v.pile[0] ?? null;
  const locked = !!top && (isBlack3(top) || isWild(top));
  const ownMelds = v.melds[us];
  const sameMeld = top ? ownMelds.find((m) => m.rank === top.r) : undefined;
  const pairForTop = top ? hand.filter((c) => !isWild(c) && c.r === top.r) : [];
  const takeAction: TrAction | null = !top || locked ? null
    : sameMeld ? { type: 'take', to: sameMeld.id }
    : pairForTop.length >= 2 ? { type: 'take', with: (picked.length === 2 && picked.every((c) => c.r === top.r && !isWild(c)) ? picked : pairForTop).slice(0, 2).map((c) => c.id) }
    : null;
  const bank = v.seats.find((s) => s.id === me)?.bank ?? r.seats.find((s) => s.id === me)?.bank ?? 0;
  const order = v.seats.map((s) => s.id);
  const nextId = order[(order.indexOf(v.turn) + 1) % n];
  const partner = n === 4 ? v.teams[us].find((x) => x !== me) : undefined;
  const opponents = v.teams[them];
  const mortoOk = (t: 0 | 1) => v.mortos[t] === null;
  const toggle = (id: string) => { sfx('click'); setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id])); };
  const act = (a: TrAction) => { table.act(a); setSel([]); };

  const teamBox = (t: 0 | 1) => (
    <div className={`tc-team ${t === us ? 'us' : 'them'}`}>
      <span className="caps">{label(t)}</span>
      <b>{fmtPts(v.score[t])}</b>
      <span className="small faint tr-team-info">
        {v.red3[t] > 0 && <span title="3 vermelhos">🔴×{v.red3[t]} </span>}
        {mortoOk(t) ? 'morto ✓' : `morto ${v.mortoCounts?.[t] ?? ''}`}
      </span>
    </div>
  );

  const seatChip = (id: string) => (
    <div key={id} className={`tr-seat ${v.turn === id && (v.phase === 'draw' || v.phase === 'play') ? 'active' : ''}`}>
      <Avatar p={v.seats.find((s) => s.id === id)!} size="s" />
      <div className="tr-seat-txt">
        <b className="seat-name">{r.leaderId === id ? '👑 ' : ''}{name(id)}</b>
        <span className="small">🂠 {v.counts?.[id] ?? 0}{id === partner ? ' · parceiro' : ''}</span>
      </div>
    </div>
  );

  const detailRow = (k: keyof TrTeamScore, txt: string) => {
    const d = v.lastHand!.detail;
    const f = (x: number) => (x > 0 ? `+${x}` : String(x));
    return <tr key={k}><td>{txt}</td><td>{f(d[us][k])}</td><td>{f(d[them][k])}</td></tr>;
  };

  let controls: React.ReactNode;
  if (v.phase === 'over') {
    const won = v.winnerTeam === us;
    controls = (
      <div className="stack" style={{ alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <div className="title-m">{won ? (n === 4 ? '🏆 Sua dupla venceu!' : '🏆 Você venceu!') : `🏆 ${label(them)} ${n === 4 ? 'venceram' : 'venceu'}`}</div>
        <div className="small">{fmtPts(v.score[us])} × {fmtPts(v.score[them])}{v.pot > 0 ? (won ? ` · pote de 🪙 ${v.pot}${n === 4 ? ' dividido entre vocês' : ' é seu'}!` : ` · o pote de 🪙 ${v.pot} ficou com eles`) : ''}</div>
        {table.isLeader ? <button className="btn big pink" onClick={() => table.command({ cmd: 'lobby' })}>Nova partida</button> : <div className="status">Esperando o líder 👑…</div>}
      </div>
    );
  } else if (v.phase === 'handEnd' && v.lastHand) {
    controls = (
      <div className="tc-call">
        <div className="tc-call-title">{v.lastHand.batida === null ? 'Fim da mão' : v.lastHand.batida === us ? (n === 4 ? 'Vocês bateram! 🎉' : 'Você bateu! 🎉') : `${label(them)} ${n === 4 ? 'bateram' : 'bateu'}`}</div>
        <table className="tr-score-table">
          <thead><tr><th /><th>{label(us)}</th><th>{label(them)}</th></tr></thead>
          <tbody>
            {detailRow('mesa', 'Cartas na mesa')}
            {detailRow('canastras', 'Canastras')}
            {detailRow('red3', '3 vermelhos')}
            {detailRow('morto', 'Morto')}
            {detailRow('batida', 'Batida')}
            {detailRow('mao', 'Cartas na mão')}
            {detailRow('total', 'Total da mão')}
          </tbody>
        </table>
        <span className="small faint">Próxima mão já vem…</span>
      </div>
    );
  } else {
    const canMeld = myTurn && v.phase === 'play' && picked.length >= 3;
    controls = (
      <>
        <div className="tr-hand" aria-label="Sua mão">
          {hand.map((c) => (
            <Card key={c.id} card={c} size={40} highlight={sel.includes(c.id)} className={`${c.id === v.drawn ? 'tr-new' : ''} ${isWild(c) ? 'tr-wild' : ''}`} onClick={() => toggle(c.id)} />
          ))}
          {!hand.length && <span className="small faint">Sem cartas.</span>}
        </div>
        {myTurn && v.phase === 'draw' && (
          <div className="row">
            <button className="btn cyan grow" onClick={() => act({ type: 'draw' })}>Comprar do monte</button>
            <button className="btn pink grow" disabled={!takeAction} onClick={() => takeAction && act(takeAction)}>Pegar o lixo{v.pileCount ? ` (${v.pileCount})` : ''}</button>
          </div>
        )}
        {myTurn && v.phase === 'play' && (
          <div className="row">
            <button className="btn lime grow" disabled={!canMeld} onClick={() => act({ type: 'meld', ids: sel })}>Baixar jogo{picked.length >= 3 ? ` (${picked.length})` : ''}</button>
            <button className="btn red grow" disabled={picked.length !== 1} onClick={() => act({ type: 'discard', id: sel[0] })}>Descartar</button>
          </div>
        )}
        {!myTurn && <div className="status">Vez de {name(v.turn)}{nextId && nextId !== v.turn ? ` · depois: ${nextId === me ? 'você' : name(nextId)}` : ''}</div>}
        <div className="small faint" style={{ textAlign: 'center' }}>
          {myTurn && v.phase === 'draw'
            ? (locked ? 'Lixo trancado: compre do monte.' : top && !takeAction ? `Para pegar o lixo: 2 cartas ${RANK_LABEL[top.r] || top.r} na mão ou um jogo de ${RANK_LABEL[top.r] || top.r} na mesa.` : 'Compre do monte ou pegue o lixo inteiro.')
            : myTurn ? 'Escolha cartas e baixe um jogo, toque num jogo seu para encaixar, e descarte 1 para passar a vez.'
            : `Para bater: morto ${mortoOk(us) ? '✓' : '✗'} · canastra limpa ${hasCleanCanastra(v, us) ? '✓' : '✗'}`}
        </div>
      </>
    );
  }

  return (
    <div className="screen table-screen tr-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Sair da mesa" onClick={onQuit}>✕</button>
        <span className="round-chip">♣️ Mão {v.handNo}{r.code ? ` · ${r.code}` : ''}</span>
        <CoinPill coins={bank} />
      </div>

      <div className="tc-score" aria-label={`Placar: ${label(us)} ${v.score[us]}, ${label(them)} ${v.score[them]}`}>
        {teamBox(us)}
        <div className="tc-mid"><span className="tc-value">até {fmtPts(v.config.target)}</span></div>
        {teamBox(them)}
      </div>
      <div className="tc-banner-line">{v.banner && <div className="dv-banner" key={`${v.handNo}-${v.banner}`}>{v.banner}</div>}</div>

      <div className="tr-table">
        <div className="tr-row">{opponents.map(seatChip)}</div>
        <div className="tr-melds them" aria-label="Jogos deles">
          {v.melds[them].length ? v.melds[them].map((m) => <MeldChip key={m.id} m={m} />) : <span className="small faint">{label(them)}: nenhum jogo ainda</span>}
        </div>
        <div className="tr-center">
          <div className="tr-pile">
            <Card hidden size={40} />
            <span className="small">Monte {v.stockCount ?? 0}</span>
          </div>
          <div className={`tr-pile ${locked ? 'locked' : ''}`}>
            {top ? <Card card={top} size={40} /> : <span className="pk-slot" style={{ width: 40, height: 57 }} />}
            <span className="small">{locked ? '🔒 ' : ''}Lixo {v.pileCount ?? 0}</span>
          </div>
          <div className="tr-pile tr-mortos">
            <span className="small faint">Mortos</span>
            <span className="small">{label(us)}: {mortoOk(us) ? 'pego' : v.mortoCounts?.[us]}</span>
            <span className="small">{label(them)}: {mortoOk(them) ? 'pego' : v.mortoCounts?.[them]}</span>
          </div>
        </div>
        <div className="tr-melds us" aria-label="Seus jogos">
          {ownMelds.length
            ? ownMelds.map((m) => {
              const can = myTurn && v.phase === 'play' && picked.length > 0 && m.rank !== 'B3';
              return <MeldChip key={m.id} m={m} can={can} onClick={can ? () => act({ type: 'add', meld: m.id, ids: sel }) : undefined} />;
            })
            : <span className="small faint">{n === 4 ? 'Sua dupla' : 'Você'}: nenhum jogo ainda</span>}
        </div>
        {partner && <div className="tr-row">{seatChip(partner)}</div>}
      </div>

      <div className="bj-controls">
        {controls}
        {table.isLeader && v.phase !== 'over' && <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => table.command({ cmd: 'lobby' })}>⚙️ Voltar à sala para configurar</button>}
        {table.toast && <div className="error">{table.toast}</div>}
      </div>
    </div>
  );
}

const fmtPts = (n: number) => n.toLocaleString('pt-BR');
