import { useMemo, useState } from 'react';
import { sfx } from '../audio/engine';
import { Character } from '../components/Character';
import { Seg, Sheet } from '../components/ui';
import {
  buy, CATEGORIES, getWallet, itemsOf, lookValue, NONE_ALLOWED, owns, randomLook, withItem,
  type Category, type Item, type Look, type Wallet,
} from '../game/character';
import type { Player } from '../game/model';
import { redeem } from '../game/promo';

const BUST_CATS: Category[] = ['hair', 'hairColor', 'face', 'hat', 'acc', 'skin'];

export function CoinPill({ coins }: { coins: number }) {
  return <span className="coin-pill" aria-label={`${coins} moedas`}>🪙 {coins}</span>;
}

/** Vestiário (roupas que você tem) e Loja (roupas para comprar com moedas). */
export function Wardrobe({ player, onSave, onClose, initialTab = 'closet' }: { player: Player; onSave: (look: Look) => void; onClose: () => void; initialTab?: 'closet' | 'shop' }) {
  const [look, setLook] = useState<Look>(() => player.look ?? randomLook());
  const [wallet, setWallet] = useState<Wallet>(() => getWallet(player.id));
  const [tab, setTab] = useState<'closet' | 'shop'>(initialTab);
  const [cat, setCat] = useState<Category>('top');
  const [trying, setTrying] = useState<Item | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  const preview = trying ? withItem(look, trying, cat) : look;
  const current = lookValue(look, cat);
  const items = useMemo(() => itemsOf(cat).filter((i) => (tab === 'closet' ? owns(wallet, i) : !owns(wallet, i))), [cat, tab, wallet]);
  const toBuy = useMemo(() => CATEGORIES.reduce((n, c) => n + itemsOf(c.cat).filter((i) => !owns(wallet, i)).length, 0), [wallet]);
  const dirty = JSON.stringify(look) !== JSON.stringify(player.look);

  const pickItem = (it: Item | null) => {
    sfx('click');
    setMsg(null);
    if (tab === 'closet') { setLook(withItem(look, it, cat)); setTrying(null); }
    else setTrying(it);
  };

  const doBuy = () => {
    if (!trying) return;
    const w = buy(player.id, trying);
    if (!w) { sfx('bad'); setMsg('Moedas insuficientes.'); return; }
    sfx('win');
    setWallet(w);
    setLook(withItem(look, trying, cat));
    setMsg(`✓ ${trying.name} é seu! Já está vestindo.`);
    setTrying(null);
  };

  const randomize = () => {
    sfx('pop');
    const pick = (c: Category) => {
      const list = itemsOf(c).filter((i) => owns(wallet, i));
      return list[Math.floor(Math.random() * list.length)];
    };
    let l = look;
    for (const c of ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'shoes'] as Category[]) l = withItem(l, pick(c), c);
    for (const c of ['hat', 'acc'] as Category[]) l = withItem(l, Math.random() < 0.5 ? pick(c) ?? null : null, c);
    setLook(l);
  };

  return (
    <div className="screen wardrobe">
      <div className="topbar">
        <button className="icon-btn" aria-label="Voltar" onClick={onClose}>←</button>
        <span className="round-chip">{tab === 'closet' ? 'Vestiário' : 'Loja'} de {player.name}</span>
        <CoinPill coins={wallet.coins} />
      </div>

      <div className="dressing">
        <div className="dressing-light" />
        <Character look={preview} pose={trying ? 'cheer' : 'idle'} className="dressing-char" title={`Personagem de ${player.name}`} />
        {tab === 'closet' && <button className="icon-btn dice" aria-label="Visual aleatório" onClick={randomize}>🎲</button>}
        <button className="icon-btn gift" aria-label="Resgatar código" onClick={() => setCodeOpen(true)}>🎁</button>
      </div>

      <Seg label="Vestiário ou loja" value={tab} onChange={(v) => { setTab(v); setTrying(null); setMsg(null); }} options={[{ v: 'closet', t: '👚 Vestiário' }, { v: 'shop', t: `🛍️ Loja (${toBuy})` }]} />

      <div className="cat-chips" role="tablist" aria-label="Categorias">
        {CATEGORIES.map((c) => (
          <button key={c.cat} role="tab" aria-selected={cat === c.cat} className={`chip ${cat === c.cat ? 'on' : ''}`} onClick={() => { sfx('click'); setCat(c.cat); setTrying(null); }}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="item-grid">
        {tab === 'closet' && NONE_ALLOWED.includes(cat) && (
          <button className={`item ${current === null ? 'on' : ''}`} onClick={() => pickItem(null)}>
            <div className="item-art none">🚫</div>
            <span>Nenhum</span>
          </button>
        )}
        {items.map((it) => {
          const on = tab === 'closet' ? current === it.id : trying?.id === it.id;
          const l = withItem(look, it, cat);
          return (
            <button key={it.id} className={`item ${on ? 'on' : ''}`} onClick={() => pickItem(it)}>
              <div className="item-art">
                {cat === 'hairColor' || cat === 'skin'
                  ? <span className="swatch" style={{ background: it.c1 }} />
                  : <Character look={l} view={BUST_CATS.includes(cat) ? 'bust' : 'full'} />}
              </div>
              <span>{it.name}</span>
              {tab === 'shop' && <span className="price">🪙 {it.price}</span>}
            </button>
          );
        })}
        {!items.length && <p className="small muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{tab === 'shop' ? 'Você já tem tudo desta categoria! 🎉' : 'Nada aqui ainda — dá uma olhada na loja.'}</p>}
      </div>

      {msg && <div className="small" style={{ textAlign: 'center', color: 'var(--lime)' }}>{msg}</div>}
      <div className="footer">
        {tab === 'shop' && trying ? (
          <button className="btn big pink" disabled={wallet.coins < trying.price} onClick={doBuy}>
            {wallet.coins >= trying.price ? `Comprar ${trying.name} · 🪙 ${trying.price}` : `Faltam 🪙 ${trying.price - wallet.coins}`}
          </button>
        ) : (
          <button className="btn big" onClick={() => { sfx('go'); onSave(look); }}>{dirty ? 'Salvar visual' : 'Pronto'}</button>
        )}
      </div>

      {codeOpen && <RedeemSheet pid={player.id} onClose={() => setCodeOpen(false)} onDone={(w) => setWallet(w)} />}
    </div>
  );
}

export function RedeemSheet({ pid, onClose, onDone }: { pid: string; onClose: () => void; onDone: (w: Wallet) => void }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await redeem(code, pid);
    setBusy(false);
    if (r.ok) { sfx('win'); onDone(r.wallet); setState({ ok: true, text: `🎉 ${r.label}: +🪙 ${r.coins}!` }); setCode(''); }
    else { sfx('bad'); setState({ ok: false, text: r.error }); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title-m">🎁 Resgatar código</h2>
      <p className="small muted" style={{ margin: 0 }}>Ganhou um código promocional? Digite aqui para receber moedas.</p>
      <input className="code-input" style={{ letterSpacing: '0.12em', fontSize: 24 }} value={code} maxLength={20} placeholder="CÓDIGO" autoCapitalize="characters"
        onChange={(e) => { setCode(e.target.value.toUpperCase()); setState(null); }} onKeyDown={(e) => e.key === 'Enter' && go()} aria-label="Código promocional" />
      {state && <div className={state.ok ? 'small' : 'error'} style={state.ok ? { color: 'var(--lime)', fontWeight: 600 } : undefined}>{state.text}</div>}
      <div className="row">
        <button className="btn ghost grow" onClick={onClose}>Fechar</button>
        <button className="btn pink grow" disabled={busy || code.trim().length < 4} onClick={go}>{busy ? '…' : 'Resgatar'}</button>
      </div>
    </Sheet>
  );
}
