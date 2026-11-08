import { useState } from 'react';
import { sfx } from '../audio/engine';
import { Character } from '../components/Character';
import { Logo, Seg } from '../components/ui';
import { getWallet } from '../game/character';
import type { Player } from '../game/model';
import { CoinPill, RedeemSheet } from './Wardrobe';

export type Dest = 'imitacao' | 'imitacao-online' | 'imitacao-wifi' | 'blackjack' | 'duvido' | 'truco' | 'poker' | 'cartas-online' | 'cartas-wifi';
type Tab = 'offline' | 'online' | 'wifi';

interface GameCard { dest: Dest; title: string; sub: string; art: string; tint: string; ready: boolean }

const GAMES: Record<Tab, GameCard[]> = {
  offline: [
    { dest: 'imitacao', title: 'Imitação', sub: 'Passa o celular: ouça, imite e ganhe nota', art: '🎤', tint: '#ff4f9a', ready: true },
    { dest: 'blackjack', title: 'Blackjack', sub: 'Você contra o dealer, apostando moedas', art: '🂡', tint: '#2ec4b6', ready: true },
    { dest: 'duvido', title: 'Duvido!', sub: 'Jogo do mentiroso: blefe e não estoure o balão', art: '🤥', tint: '#ff5d5d', ready: true },
    { dest: 'truco', title: 'Truco Paulista', sub: 'Com vira, 1x1 ou 2x2', art: '🃏', tint: '#ff8a3d', ready: true },
    { dest: 'poker', title: 'Poker', sub: "Texas Hold'em, até 6", art: '♠️', tint: '#7b5cff', ready: true },
  ],
  online: [
    { dest: 'imitacao-online', title: 'Imitação online', sub: 'Cada um no próprio celular, sala com código', art: '🌐', tint: '#ff4f9a', ready: true },
    { dest: 'cartas-online', title: 'Mesas de cartas', sub: 'Mesa com código e líder 👑 que configura tudo', art: '🃏', tint: '#2ec4b6', ready: true },
  ],
  wifi: [
    { dest: 'imitacao-wifi', title: 'Imitação na Wi-Fi', sub: 'Sem internet: conecta lendo QR codes', art: '📶', tint: '#ff4f9a', ready: false },
    { dest: 'cartas-wifi', title: 'Cartas na Wi-Fi', sub: 'Mesas na rede de casa, sem internet', art: '🃏', tint: '#2ec4b6', ready: false },
  ],
};

export function Salao({ self, players, onSwitchSelf, account, onDress, onOpen }: {
  self: Player;
  players: Player[];
  /** Só sem conta: trocar quem é o dono do aparelho. Com conta, o dono é quem está logado. */
  onSwitchSelf?: () => void;
  account?: { name: string; onOpen: () => void };
  onDress: (p: Player, tab?: 'closet' | 'shop') => void;
  onOpen: (d: Dest) => void;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('imita.tab') as Tab) || 'offline'; } catch { return 'offline'; }
  });
  const [coins, setCoins] = useState(() => getWallet(self.id).coins);
  const [codeOpen, setCodeOpen] = useState(false);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('imita.tab', t); } catch { /* ok */ } };

  return (
    <div className="screen salao">
      <header className="row between">
        <Logo />
        <div className="row" style={{ gap: 8 }}>
          {account && (
            <button className="account-chip" onClick={() => { sfx('click'); account.onOpen(); }} aria-label={`Minha conta: ${account.name}`}>
              👤 <span>{account.name}</span>
            </button>
          )}
          <CoinPill coins={coins} />
        </div>
      </header>

      <section className="profile-card">
        <button className="profile-char" onClick={() => onDress(self)} aria-label="Abrir vestiário">
          {self.look && <Character look={self.look} pose="idle" />}
        </button>
        <div className="stack grow" style={{ gap: 6, minWidth: 0 }}>
          <div className="caps">Você</div>
          <div className="title-m" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{self.name}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={() => onDress(self, 'closet')}>👚 Vestiário</button>
            <button className="btn ghost sm" onClick={() => onDress(self, 'shop')}>🛍️ Loja</button>
            <button className="btn ghost sm" onClick={() => setCodeOpen(true)}>🎁 Código</button>
          </div>
          {onSwitchSelf && players.length > 1 && <button className="link-btn" onClick={() => { sfx('click'); onSwitchSelf(); }}>Não é você? Trocar perfil</button>}
        </div>
      </section>

      <Seg label="Onde jogar" value={tab} onChange={pick} options={[{ v: 'offline', t: '📱 Offline' }, { v: 'online', t: '🌐 Online' }, { v: 'wifi', t: '📶 Wi-Fi' }]} />
      <p className="small muted" style={{ margin: '-4px 0 0' }}>
        {tab === 'offline' && 'Num aparelho só, sem precisar de internet.'}
        {tab === 'online' && 'Cada um no seu celular, de qualquer lugar, pela internet.'}
        {tab === 'wifi' && 'Cada um no seu celular, todos na mesma rede Wi-Fi — funciona mesmo sem internet.'}
      </p>

      <div className="game-grid">
        {GAMES[tab].map((gc) => (
          <button key={gc.dest} className={`game-card ${gc.ready ? '' : 'soon'}`} style={{ ['--t' as string]: gc.tint }} disabled={!gc.ready}
            onClick={() => { sfx('go'); onOpen(gc.dest); }}>
            <span className="game-art">{gc.art}</span>
            <b>{gc.title}</b>
            <span className="small">{gc.sub}</span>
            {!gc.ready && <span className="badge soon-badge">Em breve</span>}
          </button>
        ))}
      </div>

      {codeOpen && <RedeemSheet pid={self.id} onClose={() => setCodeOpen(false)} onDone={(w) => setCoins(w.coins)} />}
    </div>
  );
}
