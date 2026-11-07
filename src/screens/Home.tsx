import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, unlockAudio } from '../audio/engine';
import { deleteCustom, deleteImported, importFiles, loadPreview, type PackInfo } from '../audio/library';
import { Avatar, Logo, Seg, Sheet, Toggle, usePlayer } from '../components/ui';
import { EMOJIS, MAX_PLAYERS, newPlayer, TEAMS, type Player } from '../game/model';
import type { GameApi } from '../game/useGame';

export function Home({ api }: { api: GameApi }) {
  const { settings: s, setSettings, players, setPlayers, packs } = api;
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<PackInfo | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const teams = s.mode === 'teams';

  const onImport = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setImportNote(null);
    setImportMsg('Importando…');
    try {
      await unlockAudio();
      const r = await importFiles([...list], setImportMsg);
      await api.reloadPacks();
      api.addPacks(r.ids);
      setImportNote(r.packs
        ? `✓ ${r.packs} ${r.packs === 1 ? 'pacote' : 'pacotes'} com ${r.sounds} sons importados${r.skipped ? ` (${r.skipped} arquivos ignorados)` : ''}.`
        : 'Nenhum som encontrado nesses arquivos. Use um .zip de pacote ou arquivos de áudio (mp3, wav, m4a).');
    } catch (e) {
      setImportNote(`Não deu para importar: ${(e as Error).message}`);
    } finally {
      setImportMsg(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const solo = players.length === 1;

  const selected = useMemo(() => packs.filter((p) => s.packIds.includes(p.id)), [packs, s.packIds]);
  const soundCount = selected.reduce((n, p) => n + p.sounds.length, 0);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? packs.filter((p) => p.name.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)) : packs;
  }, [packs, query]);

  const updatePlayer = (id: string, patch: Partial<Player>) => setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const cycleEmoji = (p: Player) => {
    sfx('pop');
    const used = new Set(players.map((x) => x.emoji));
    let i = EMOJIS.indexOf(p.emoji);
    for (let k = 0; k < EMOJIS.length; k++) {
      i = (i + 1) % EMOJIS.length;
      if (!used.has(EMOJIS[i])) break;
    }
    updatePlayer(p.id, { emoji: EMOJIS[i] });
  };
  const togglePack = (id: string) => {
    sfx('click');
    setSettings({ packIds: s.packIds.includes(id) ? s.packIds.filter((x) => x !== id) : [...s.packIds, id] });
  };
  const needSounds = s.source !== 'players';
  const notEnough = needSounds && soundCount > 0 && soundCount < s.rounds;

  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <header className="row between">
        <Logo />
        <button className="icon-btn" aria-label="Configurações" onClick={() => setShowOptions(true)}>⚙️</button>
      </header>
      <p className="muted" style={{ margin: '-6px 0 0' }}>Ouça o som, passe o celular e imite melhor que a galera.</p>
      <InstallHint />

      {/* ------------------------------------------------ jogadores */}
      <section className="section">
        <div className="section-head">
          <h2>Jogadores</h2>
          <span className="caps">{players.length}/{MAX_PLAYERS}{solo ? ' · solo' : ''}</span>
        </div>
        <div className="stack">
          {players.map((p) => (
            <div className="player-row" key={p.id}>
              <button onClick={() => cycleEmoji(p)} aria-label={`Trocar bichinho de ${p.name}`}><Avatar p={p} /></button>
              <input
                className="name-input"
                value={p.name}
                maxLength={14}
                aria-label="Nome do jogador"
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && updatePlayer(p.id, { name: 'Sem nome' })}
              />
              {teams && (
                <button className="team-chip" style={{ color: TEAMS[p.team].color }} onClick={() => { sfx('click'); updatePlayer(p.id, { team: p.team ? 0 : 1 }); }}>
                  {TEAMS[p.team].emoji} {p.team ? 'Gelo' : 'Fogo'}
                </button>
              )}
              {players.length > 1 && (
                <button className="icon-btn" style={{ width: 38, height: 38, fontSize: 15 }} aria-label={`Remover ${p.name}`} onClick={() => setPlayers(players.filter((x) => x.id !== p.id))}>✕</button>
              )}
            </div>
          ))}
          {players.length < MAX_PLAYERS && (
            <button className="add-player" onClick={() => { sfx('pop'); setPlayers([...players, newPlayer(players)]); }}>+ Adicionar jogador</button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ modo */}
      <section className="section">
        <h2 className="title-m">Modo</h2>
        <div className="modes">
          <button className={`mode ${!teams ? 'on' : ''}`} onClick={() => { sfx('click'); setSettings({ mode: 'classic' }); }}>
            <span className="em">🎤</span><b>Clássico</b><span>Cada um por si. Maior pontuação vence.</span>
          </button>
          <button className={`mode ${teams ? 'on' : ''}`} onClick={() => { sfx('click'); setSettings({ mode: 'teams' }); }} disabled={solo} style={solo ? { opacity: 0.4 } : undefined}>
            <span className="em">🔥❄️</span><b>Times</b><span>Fogo contra Gelo. Pontos vão pro time.</span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ rodadas */}
      <section className="section">
        <div className="section-head"><h2>Rodadas</h2></div>
        <Seg label="Rodadas" value={s.rounds} onChange={(v) => setSettings({ rounds: v })} options={[3, 5, 8, 10, 12].map((v) => ({ v, t: v }))} />
      </section>

      {/* ------------------------------------------------ pacotes */}
      <section className="section">
        <div className="section-head">
          <h2>Pacotes de som</h2>
          <span className="caps">{soundCount} sons em jogo</span>
        </div>
        <div className="pack-tools">
          <input className="search" placeholder="Buscar pacote…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar pacote" />
          <button className="btn ghost sm" onClick={() => setSettings({ packIds: packs.map((p) => p.id) })}>Todos</button>
          <button className="btn ghost sm" onClick={() => setSettings({ packIds: [] })}>Nenhum</button>
        </div>
        {!api.packsLoaded ? (
          <div className="row" style={{ justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
        ) : (
          <div className="packs">
            {shown.map((p) => {
              const on = s.packIds.includes(p.id);
              return (
                <div key={p.id} className={`pack ${on ? 'on' : ''}`}>
                  <button style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => togglePack(p.id)} aria-pressed={on}>
                    {p.cover ? <img className="cover" src={p.cover} alt="" loading="lazy" /> : <div className="cover">{p.emoji || '🎧'}</div>}
                    <div className="meta">
                      <b>{p.name}</b>
                      <span>{p.sounds.length} sons{p.kind === 'builtin' ? ' · nativo' : p.kind === 'custom' ? ' · seus' : p.kind === 'imported' ? ' · no aparelho' : ''}</span>
                    </div>
                  </button>
                  <span className="check">{on ? '✓' : ''}</span>
                  <button className="listen" onClick={() => { unlockAudio(); setPreview(p); }}>▶ ouvir</button>
                </div>
              );
            })}
          </div>
        )}
        {notEnough && <p className="small faint" style={{ margin: 0 }}>Poucos sons para {s.rounds} rodadas: alguns vão se repetir.</p>}
        <input ref={fileRef} type="file" accept=".zip,application/zip,audio/*" multiple hidden onChange={(e) => onImport(e.target.files)} />
        <button className="add-player" disabled={!!importMsg} onClick={() => fileRef.current?.click()}>
          {importMsg || '＋ Importar pacotes (.zip ou áudios)'}
        </button>
        {importNote && <p className="small muted" style={{ margin: 0 }}>{importNote}</p>}
      </section>

      {/* ------------------------------------------------ regras */}
      <section className="section">
        <h2 className="title-m">Regras da partida</h2>
        <div className="card">
          <div className="rule col">
            <div><div className="label">Quem cria o som</div><div className="hint">Nos turnos de jogador, alguém grava o desafio e os outros imitam.</div></div>
            <Seg label="Quem cria o som" value={s.source} onChange={(v) => setSettings({ source: v })} options={[{ v: 'packs', t: 'Pacotes' }, { v: 'mixed', t: 'Misto' }, { v: 'players', t: 'Jogadores' }]} />
          </div>
          <div className="rule col">
            <div className="label">Dificuldade</div>
            <Seg label="Dificuldade" value={s.difficulty} onChange={(v) => setSettings({ difficulty: v })} options={[{ v: 'easy', t: 'Fácil' }, { v: 'normal', t: 'Normal' }, { v: 'hard', t: 'Difícil' }]} />
          </div>
          <div className="rule col">
            <div className="label">Ouvir antes de imitar</div>
            <Seg label="Ouvir antes de imitar" value={s.listens} onChange={(v) => setSettings({ listens: v })} options={[1, 2, 3].map((v) => ({ v, t: `${v}x` }))} />
          </div>
          <div className="rule">
            <div><div className="label">Roleta no fim da rodada</div><div className="hint">Quem fez menos pontos gira: sabotagens e bônus.</div></div>
            <Toggle label="Roleta" on={s.wheel} onChange={(v) => setSettings({ wheel: v })} />
          </div>
          <div className="rule">
            <div><div className="label">Sons misteriosos</div><div className="hint">Às vezes o nome do som fica escondido até o fim.</div></div>
            <Toggle label="Sons misteriosos" on={s.mystery} onChange={(v) => setSettings({ mystery: v })} />
          </div>
          <div className="rule col">
            <div className="label">Ordem da revelação</div>
            <Seg label="Ordem da revelação" value={s.order} onChange={(v) => setSettings({ order: v })} options={[{ v: 'fixed', t: 'Fixa' }, { v: 'random', t: 'Sorteada' }]} />
          </div>
          <div className="rule">
            <div><div className="label">Som junto na gravação</div><div className="hint">O original toca enquanto você imita. Use fone de ouvido.</div></div>
            <Toggle label="Som junto na gravação" on={s.along} onChange={(v) => setSettings({ along: v })} />
          </div>
        </div>
      </section>

      <div className="footer">
        {api.error && <div className="error" role="alert">{api.error}</div>}
        <button className="btn big pink" disabled={api.busy || !api.packsLoaded} onClick={() => { sfx('go'); api.startGame(); }}>
          {api.busy ? 'Preparando…' : 'COMEÇAR'}
        </button>
        <div className="small faint" style={{ textAlign: 'center' }}>
          {s.rounds} rodadas · {players.length} {players.length === 1 ? 'jogador' : 'jogadores'} · {selected.length} {selected.length === 1 ? 'pacote' : 'pacotes'}
        </div>
      </div>

      {preview && <PackPreview pack={preview} onClose={() => setPreview(null)} onDeleted={() => { setPreview(null); api.reloadPacks(); }} />}
      {showOptions && <Options api={api} onClose={() => setShowOptions(false)} />}
    </div>
  );
}

function PackPreview({ pack, onClose, onDeleted }: { pack: PackInfo; onClose: () => void; onDeleted: () => void }) {
  const player = usePlayer();
  const [cur, setCur] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const listen = async (id: string) => {
    const snd = pack.sounds.find((x) => x.id === id)!;
    if (cur === id && player.playing) { player.stop(); setCur(null); return; }
    setLoading(id);
    try {
      const buf = await loadPreview(snd);
      setCur(id);
      await player.start(buf);
    } finally {
      setLoading(null);
    }
  };
  return (
    <Sheet onClose={() => { player.stop(); onClose(); }}>
      <div className="row">
        {pack.cover ? <img src={pack.cover} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} /> : <div className="avatar l" style={{ ['--c' as string]: '#3a1f78' }}>{pack.emoji}</div>}
        <div className="grow">
          <h2 className="title-m">{pack.name}</h2>
          <div className="small muted">{pack.sounds.length} sons · {pack.author}</div>
        </div>
      </div>
      {pack.kind === 'imported' && (
        <button className="btn ghost sm" onClick={async () => { player.stop(); await deleteImported(pack.id); onDeleted(); }}>🗑️ Remover este pacote do aparelho</button>
      )}
      <div className="stack" style={{ gap: 6 }}>
        {pack.sounds.map((snd) => (
          <div key={snd.id} className="sound-row">
            {snd.image ? <img src={snd.image} alt="" loading="lazy" /> : <span className="em">{snd.emoji || '🔊'}</span>}
            <span className="nm">{snd.name}</span>
            {pack.kind === 'custom' && snd.src.kind === 'custom' && (
              <button className="icon-btn" style={{ width: 38, height: 38, fontSize: 15 }} aria-label={`Apagar ${snd.name}`}
                onClick={async () => { const key = snd.src.kind === 'custom' ? snd.src.key : ''; await deleteCustom(key); onDeleted(); }}>🗑️</button>
            )}
            <button className="btn cyan sm" style={{ minWidth: 52 }} onClick={() => listen(snd.id)} aria-label={`Ouvir ${snd.name}`}>
              {loading === snd.id ? '…' : cur === snd.id && player.playing ? '■' : '▶'}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Options({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const s = api.settings;
  return (
    <Sheet onClose={onClose}>
      <h2 className="title-m">Configurações</h2>
      <label className="stack" style={{ gap: 4 }}>
        <span className="row between"><b>Efeitos sonoros</b><span className="muted">{Math.round(s.sfx * 100)}%</span></span>
        <input className="range" type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => api.setSettings({ sfx: +e.target.value })} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="row between"><b>Sensibilidade do microfone</b><span className="muted">{Math.round(s.micGain * 100)}%</span></span>
        <input className="range" type="range" min={0.5} max={3} step={0.1} value={s.micGain} onChange={(e) => api.setSettings({ micGain: +e.target.value })} />
        <span className="small faint">Aumente se a imitação sair muito baixinha.</span>
      </label>
      <p className="small faint" style={{ margin: 0 }}>
        Os sons gravados pelos jogadores ficam em “Meus sons”. Pacotes da comunidade incluídos neste aparelho são para uso pessoal.
      </p>
      <button className="btn full" onClick={onClose}>Pronto</button>
    </Sheet>
  );
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('imita.installHint') === '1'; } catch { return false; }
  });
  const [prompt, setPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setPrompt(e as unknown as { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const native = 'Capacitor' in window || location.protocol !== 'https:';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (hidden || standalone || native || (!ios && !prompt)) return null;
  const close = () => {
    setHidden(true);
    try { localStorage.setItem('imita.installHint', '1'); } catch { /* ok */ }
  };
  return (
    <div className="card row" style={{ alignItems: 'flex-start', borderColor: 'rgba(61,224,245,0.45)', background: 'rgba(61,224,245,0.08)' }}>
      <span style={{ fontSize: 28 }}>📲</span>
      <div className="grow small" style={{ lineHeight: 1.4 }}>
        {ios ? (
          <><b>Instale no iPhone:</b> toque em <b>Compartilhar</b> (o quadrado com a seta ⬆️) e depois em <b>Adicionar à Tela de Início</b>. Ele abre em tela cheia e funciona offline.</>
        ) : (
          <><b>Instale o app</b> para jogar em tela cheia e offline.{' '}
            <button className="btn cyan sm" style={{ marginTop: 6 }} onClick={() => prompt?.prompt().then(close)}>Instalar</button></>
        )}
      </div>
      <button className="icon-btn" style={{ width: 34, height: 34, fontSize: 14 }} aria-label="Fechar aviso" onClick={close}>✕</button>
    </div>
  );
}
