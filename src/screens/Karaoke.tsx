// Karaokê: cada um importa as próprias músicas (nada vem embutido no jogo), canta no palco
// e ganha nota pela afinação em cima da linha da melodia.
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkMic, Mic, play, sfx, unlockAudio, vibrate, type Playing } from '../audio/engine';
import { Ring, Seg, Sheet } from '../components/ui';
import { addCoins } from '../game/character';
import { XP_RULES } from '../game/levels';
import type { Player } from '../game/model';
import { eventKey, reportXp } from '../game/progress';
import { decodeSong, extractMelody, guideMix, instrumental, isStereo } from '../karaoke/analyze';
import { decimate, hzToMidi, noteName, pitchError, yin } from '../karaoke/pitch';
import { deleteSong, listSongs, lyricAt, parseLyrics, saveSong, STYLES, styleOf, type Song, type StyleId } from '../karaoke/store';
import { StageDeco, StageStar } from './Turn';
import './karaoke.css';

type Mode = 'karaoke' | 'guide' | 'original';
const MODE_NAMES: Record<Mode, string> = { karaoke: '🎤 Sem voz', guide: '🗣️ Voz guia', original: '🎵 Original' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MIN_SING_SEC = 30;

function rating(score: number) {
  if (score >= 90) return '🌟 Superstar!';
  if (score >= 75) return '🔥 Mandou bem!';
  if (score >= 55) return '🎶 Afinadinho';
  if (score >= 35) return '🙂 Quase lá';
  return '🙈 Bora treinar';
}

// ---------------------------------------------------------------- importar

function ImportSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (s: Song) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [style, setStyle] = useState<StyleId>('pop');
  const [lyrics, setLyrics] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setErr(null);
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    const parts = base.split(' - ');
    if (parts.length >= 2 && !title) { setArtist(parts[0].trim()); setTitle(parts.slice(1).join(' - ').trim()); }
    else if (!title) setTitle(base);
  };
  const loadLyrics = async (f: File | undefined) => {
    if (!f) return;
    try { setLyrics(await f.text()); } catch { setErr('Não deu para ler esse arquivo de letra.'); }
  };
  const go = async () => {
    if (!file) return;
    setErr(null);
    setBusy(0);
    try {
      const buf = await decodeSong(file);
      if (buf.duration > 15 * 60) throw new Error('Música longa demais (máximo 15 minutos).');
      const melody = await extractMelody(buf, (p) => setBusy(p));
      const song: Song = {
        id: `k-${Date.now().toString(36)}`, title: title.trim() || 'Sem título', artist: artist.trim(), style,
        createdAt: Date.now(), duration: buf.duration, audio: file, lyrics, melody, stereo: isStereo(buf), best: {},
      };
      await saveSong(song);
      sfx('win');
      onSaved(song);
    } catch (e) {
      setErr((e as Error).message || 'Não deu para importar.');
      setBusy(null);
    }
  };
  return (
    <Sheet onClose={busy == null ? onClose : () => {}}>
      <h2 className="title-m" style={{ margin: 0 }}>🎶 Importar música</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Escolha um arquivo de música do aparelho (MP3, M4A, WAV…). Ela fica guardada só aqui, não vai para a internet.
        Use músicas que são suas.
      </p>
      <label className="btn ghost" style={{ cursor: 'pointer' }}>
        {file ? `🎵 ${file.name}` : '📂 Escolher arquivo de música'}
        <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <label className="auth-field"><span className="auth-label">Nome da música</span>
        <input className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </label>
      <label className="auth-field"><span className="auth-label">Artista (opcional)</span>
        <input className="auth-input" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={60} />
      </label>
      <div className="auth-field"><span className="auth-label">Estilo</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {STYLES.map((s) => (
            <button key={s.id} type="button" className={`pack-chip ${style === s.id ? 'on' : ''}`} aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.emoji} {s.name}</button>
          ))}
        </div>
      </div>
      <label className="auth-field"><span className="auth-label">Letra (opcional)</span>
        <textarea className="auth-input k-lyrics-input" value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={5}
          placeholder={'Cole a letra aqui, uma linha por verso.\nCom tempo (formato .lrc): [00:12.50] primeira linha'} />
      </label>
      <label className="link-btn" style={{ cursor: 'pointer' }}>
        📄 Carregar letra de um arquivo .lrc ou .txt
        <input type="file" accept=".lrc,.txt,text/plain" hidden onChange={(e) => loadLyrics(e.target.files?.[0])} />
      </label>
      {busy != null && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small">Preparando: separando a voz e achando a melodia… {Math.round(busy * 100)}%</span>
          <div className="lvl-bar"><div style={{ width: `${Math.round(busy * 100)}%`, background: 'var(--pink)' }} /></div>
        </div>
      )}
      {err && <div className="error" role="alert">{err}</div>}
      <div className="row">
        <button className="btn ghost grow" disabled={busy != null} onClick={onClose}>Cancelar</button>
        <button className="btn pink grow" disabled={!file || busy != null} onClick={go}>{busy != null ? 'Preparando…' : 'Adicionar'}</button>
      </div>
    </Sheet>
  );
}

function LyricsSheet({ song, onClose, onSaved }: { song: Song; onClose: () => void; onSaved: (s: Song) => void }) {
  const [text, setText] = useState(song.lyrics);
  const save = async () => { const s = { ...song, lyrics: text }; await saveSong(s); onSaved(s); };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title-m" style={{ margin: 0 }}>📝 Letra de “{song.title}”</h2>
      <textarea className="auth-input k-lyrics-input" value={text} onChange={(e) => setText(e.target.value)} rows={10}
        placeholder={'Uma linha por verso.\nCom tempo (formato .lrc): [00:12.50] primeira linha'} />
      <label className="link-btn" style={{ cursor: 'pointer' }}>
        📄 Carregar de um arquivo .lrc ou .txt
        <input type="file" accept=".lrc,.txt,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      </label>
      <div className="row">
        <button className="btn ghost grow" onClick={onClose}>Cancelar</button>
        <button className="btn cyan grow" onClick={save}>Salvar</button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- cantar

/** Pista da melodia: notas da música (barras) e a voz de quem canta (pontos), rolando no tempo. */
function PitchLane({ song, t, sung, color }: { song: Song; t: number; sung: { t: number; m: number }[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const range = useMemo(() => {
    const v = [...(song.melody?.midi ?? [])].filter((x) => x === x).sort((a, b) => a - b);
    if (v.length < 10) return { lo: 52, hi: 76 };
    const lo = v[Math.floor(v.length * 0.05)] - 2;
    const hi = v[Math.floor(v.length * 0.95)] + 2;
    return { lo, hi: Math.max(hi, lo + 12) };
  }, [song]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    if (c.width !== w) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const past = 1.5;
    const ahead = 4.5;
    const x = (time: number) => ((time - (t - past)) / (past + ahead)) * w;
    const y = (m: number) => h - ((m - range.lo) / (range.hi - range.lo)) * h;
    const fold = (m: number, ref2: number) => { let v = m; while (v - ref2 > 6) v -= 12; while (ref2 - v > 6) v += 12; return v; };
    // linhas de cada nota
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = dpr;
    for (let m = Math.ceil(range.lo); m <= range.hi; m++) { ctx.beginPath(); ctx.moveTo(0, y(m)); ctx.lineTo(w, y(m)); ctx.stroke(); }
    // notas da música
    const mel = song.melody;
    if (mel) {
      const i0 = Math.max(0, Math.floor((t - past) / mel.hop));
      const i1 = Math.min(mel.midi.length - 1, Math.ceil((t + ahead) / mel.hop));
      ctx.fillStyle = 'rgba(255, 247, 236, 0.55)';
      const bh = Math.max(4 * dpr, h / (range.hi - range.lo) * 0.7);
      for (let i = i0; i <= i1; i++) {
        const m = mel.midi[i];
        if (m !== m) continue;
        ctx.fillRect(x(i * mel.hop), y(m) - bh / 2, Math.max(1, x((i + 1) * mel.hop) - x(i * mel.hop)) + 0.5, bh);
      }
    }
    // voz de quem canta (dobrada para a oitava da música)
    ctx.fillStyle = color;
    for (const p of sung) {
      if (p.t < t - past) continue;
      const target = mel ? mel.midi[Math.floor(p.t / mel.hop)] : NaN;
      const m = fold(p.m, target === target ? target : (range.lo + range.hi) / 2);
      ctx.beginPath();
      ctx.arc(x(p.t), y(m), 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    // agora
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(x(t), 0); ctx.lineTo(x(t), h); ctx.stroke();
  }, [song, t, sung, color, range]);
  return <canvas ref={ref} className="k-lane" aria-label="Linha da melodia e a sua voz" />;
}

interface Result { score: number; sungSec: number; best: boolean; coins: number }

function Sing({ song, singer, mode, onDone, onQuit }: { song: Song; singer: Player; mode: Mode; onDone: (r: Result) => void; onQuit: () => void }) {
  const [phase, setPhase] = useState<'prep' | 'count' | 'sing'>('prep');
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [t, setT] = useState(0);
  const [lvl, setLvl] = useState(0);
  const [score, setScore] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const sung = useRef<{ t: number; m: number }[]>([]);
  const stopRef = useRef<() => void>(() => {});
  const lines = useMemo(() => parseLyrics(song.lyrics), [song.lyrics]);

  useEffect(() => {
    let alive = true;
    let mic: Mic | null = null;
    let playing: Playing | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const counters: ReturnType<typeof setTimeout>[] = [];
    let voiced = 0;
    let credit = 0;
    let sungTicks = 0;
    let finished = false;
    const finish = () => {
      if (finished || !alive) return;
      finished = true;
      if (timer) clearInterval(timer);
      playing?.stop();
      mic?.close();
      const final = voiced ? Math.round(Math.min(100, (100 * credit / voiced) * 1.2)) : 0;
      onDone({ score: final, sungSec: sungTicks * 0.05, best: false, coins: 0 });
    };
    stopRef.current = finish;
    (async () => {
      try {
        await unlockAudio();
        const raw = await decodeSong(song.audio);
        const inst = mode === 'original' || !song.stereo ? raw : await instrumental(raw);
        const buf = mode === 'guide' && song.stereo ? await guideMix(raw, inst) : inst;
        if (!alive) return;
        const micErr = await checkMic(); // mensagem em português se o microfone estiver bloqueado
        if (micErr) throw new Error(micErr);
        mic = new Mic();
        await mic.open(true); // com cancelamento de eco: o celular toca a música enquanto escuta
        if (!alive) { mic.close(); return; }
        setPhase('count');
        [3, 2, 1].forEach((n, i) => counters.push(setTimeout(() => { if (alive) { setCount(n); sfx('tick'); } }, i * 700)));
        counters.push(setTimeout(() => {
          if (!alive) return;
          setPhase('sing');
          sfx('go');
          vibrate(40);
          playing = play(buf, 1);
          playing.ended.then(finish);
          const t0 = performance.now();
          const factor = Math.max(1, Math.round((mic!.sampleRate || 48000) / 16000));
          // O laço usa relógio, não animação: continua mesmo se a tela atrasar.
          timer = setInterval(() => {
            const now = (performance.now() - t0) / 1000;
            setT(now);
            setLvl(Math.min(1, Math.sqrt(mic!.level) * 2.2));
            const target = song.melody?.midi[Math.floor(now / (song.melody?.hop || 0.02))];
            let m: number | null = null;
            const chunk = mic!.latest;
            if (chunk && mic!.level > 0.01) {
              const hz = yin(decimate(chunk, factor), (mic!.sampleRate || 48000) / factor, 80, 1000, 0.15);
              if (hz) m = hzToMidi(hz);
            }
            if (m != null) {
              sungTicks++;
              sung.current.push({ t: now, m });
              if (sung.current.length > 400) sung.current.splice(0, sung.current.length - 400);
              setNote(noteName(m));
            } else setNote(null);
            if (target !== undefined && target === target) {
              voiced++;
              if (m != null) {
                const e = pitchError(m, target);
                credit += e <= 0.75 ? 1 : e <= 1.5 ? 0.5 : 0;
              }
              setScore(Math.round(Math.min(100, (100 * credit / voiced) * 1.2)));
            }
          }, 50);
        }, 3 * 700));
      } catch (e) {
        if (alive) setErr((e as Error).message || 'Não deu para começar.');
      }
    })();
    return () => {
      alive = false;
      counters.forEach(clearTimeout);
      if (timer) clearInterval(timer);
      playing?.stop();
      mic?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ly = lyricAt(lines, t, song.duration);
  return (
    <div className="screen k-sing">
      <StageDeco />
      <div className="topbar">
        <button className="icon-btn" aria-label="Parar de cantar" onClick={() => (phase === 'sing' ? stopRef.current() : onQuit())}>✕</button>
        <span className="round-chip k-title">{song.title}</span>
        <span className="round-chip">🎯 {score}</span>
      </div>
      {err ? (
        <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <div className="error" role="alert">{err}</div>
          <button className="btn ghost" onClick={onQuit}>Voltar</button>
        </div>
      ) : (
        <>
          <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <StageStar p={singer} pose={phase === 'sing' ? 'sing' : 'idle'} lvl={phase === 'sing' ? lvl : 0} size="m" />
            {phase === 'prep' && <div className="row muted"><div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> Preparando a música…</div>}
            {phase === 'count' && <div key={count} className="countdown">{count}</div>}
            {phase === 'sing' && (
              <div className="k-lyrics" aria-live="polite">
                <div className="now">{ly.now || (lines.length ? '…' : '🎵')}</div>
                <div className="next">{ly.next}</div>
              </div>
            )}
          </div>
          <PitchLane song={song} t={t} sung={sung.current} color={singer.color} />
          <div className="row between small">
            <span className="faint">{fmt(t)} / {fmt(song.duration)}</span>
            <span>{note ? `🎙️ ${note}` : '🎙️ —'}</span>
          </div>
          <div className="lvl-bar"><div style={{ width: `${Math.min(100, (t / song.duration) * 100)}%`, background: 'var(--yellow)' }} /></div>
          <button className="btn big" disabled={phase !== 'sing'} onClick={() => stopRef.current()}>Terminar ✋</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tela principal

export function Karaoke({ players, self, onBack }: { players: Player[]; self: Player; onBack: () => void }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<StyleId | 'all'>('all');
  const [importing, setImporting] = useState(false);
  const [lyricsOf, setLyricsOf] = useState<Song | null>(null);
  const [pick, setPick] = useState<Song | null>(null);
  const [singerId, setSingerId] = useState(self.id);
  const [mode, setMode] = useState<Mode>('karaoke');
  const [singing, setSinging] = useState(false);
  const [result, setResult] = useState<(Result & { song: Song; singer: Player }) | null>(null);
  const [confirmDel, setConfirmDel] = useState<Song | null>(null);

  const reload = () => listSongs().then(setSongs).catch((e) => setErr((e as Error).message));
  useEffect(() => { reload(); }, []);

  const singer = players.find((p) => p.id === singerId) ?? self;
  const shown = (songs ?? []).filter((s) => filter === 'all' || s.style === filter);
  const usedStyles = STYLES.filter((st) => songs?.some((s) => s.style === st.id));

  const done = async (r: Result) => {
    const song = pick!;
    setSinging(false);
    const prev = song.best[singer.name] ?? 0;
    const best = r.score > prev && r.sungSec >= Math.min(MIN_SING_SEC, song.duration * 0.5);
    const updated = best ? { ...song, best: { ...song.best, [singer.name]: r.score } } : song;
    if (best) { await saveSong(updated).catch(() => {}); reload(); }
    // Moedas e XP só contam com um tempo mínimo cantando (e só para quem tem conta: o servidor confere).
    let coins = 0;
    if (r.sungSec >= Math.min(MIN_SING_SEC, song.duration * 0.5)) {
      const key = eventKey('karaoke');
      coins = Math.round(r.score / 10) + 3;
      addCoins(singer.id, coins, 'karaokê', key);
      reportXp(singer.id, 'karaoke', XP_RULES.karaoke.play + Math.round(r.score / 2.5), r.score >= 70, key);
    }
    sfx(r.score >= 75 ? 'win' : 'reveal');
    setPick(updated);
    setResult({ ...r, best, coins, song: updated, singer });
  };

  if (singing && pick) return <Sing song={pick} singer={singer} mode={mode} onDone={done} onQuit={() => setSinging(false)} />;

  if (result) {
    const shownScore = result.score;
    return (
      <div className="screen k-sing">
        <StageDeco />
        <div className="grow stack" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          <div className="caps">{result.singer.name} cantou “{result.song.title}”</div>
          <StageStar p={result.singer} pose={shownScore >= 55 ? 'cheer' : 'idle'} size="m" />
          <div className="score-ring">
            <Ring value={shownScore / 100} size={170} stroke={12} color={result.singer.color} />
            <div className="num"><div>{shownScore}<small>pontos</small></div></div>
          </div>
          <div className="rating">{rating(shownScore)}</div>
          {result.best && <span className="badge yellow">🏆 Novo recorde de {result.singer.name}!</span>}
          {result.coins > 0 && <span className="small coin-gain">+🪙 {result.coins}</span>}
          {result.sungSec < Math.min(MIN_SING_SEC, result.song.duration * 0.5) && <span className="small faint">Cante pelo menos {MIN_SING_SEC} segundos para valer recorde, moedas e XP.</span>}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn big pink" onClick={() => { setResult(null); setSinging(true); }}>🎤 Cantar de novo</button>
          <div className="row">
            <button className="btn ghost grow" onClick={() => { setResult(null); }}>Outra pessoa canta</button>
            <button className="btn ghost grow" onClick={() => { setResult(null); setPick(null); }}>Músicas</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="row between">
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}>←</button>
        <h1 className="title-m" style={{ margin: 0 }}>🎶 Karaokê</h1>
        <button className="btn pink sm" onClick={() => setImporting(true)}>+ Música</button>
      </div>
      {err && <div className="error">{err}</div>}
      {!songs && !err && <div className="spinner" style={{ alignSelf: 'center' }} />}
      {songs && !songs.length && (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <div style={{ fontSize: 48 }}>🎤</div>
          <b>Nenhuma música ainda</b>
          <p className="small muted" style={{ margin: 0 }}>
            O jogo não vem com músicas: importe as suas (MP3, M4A, WAV…). Elas ficam guardadas só neste aparelho.
            O jogo tira a voz para virar karaokê e mostra a linha da melodia para você cantar afinado.
          </p>
          <button className="btn big pink" onClick={() => setImporting(true)}>📂 Importar música</button>
        </div>
      )}
      {songs && songs.length > 0 && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`pack-chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Todas ({songs.length})</button>
            {usedStyles.map((st) => (
              <button key={st.id} className={`pack-chip ${filter === st.id ? 'on' : ''}`} onClick={() => setFilter(st.id)}>
                {st.emoji} {st.name} ({songs.filter((s) => s.style === st.id).length})
              </button>
            ))}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {shown.map((s) => {
              const st = styleOf(s.style);
              const top = Object.entries(s.best).sort((a, b) => b[1] - a[1])[0];
              return (
                <div key={s.id} className={`k-song ${pick?.id === s.id ? 'on' : ''}`}>
                  <button className="k-song-main" onClick={() => { sfx('click'); setPick(s); }}>
                    <span className="k-song-emoji" aria-hidden>{st.emoji}</span>
                    <span className="stack" style={{ gap: 2, minWidth: 0, textAlign: 'left' }}>
                      <b className="k-song-title">{s.title}</b>
                      <span className="small faint">{s.artist ? `${s.artist} · ` : ''}{fmt(s.duration)} · {st.name}{s.lyrics ? ' · 📝' : ''}{!s.stereo ? ' · mono' : ''}</span>
                      {top && <span className="small">🏆 {top[0]}: {top[1]}</span>}
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={`Letra de ${s.title}`} onClick={() => setLyricsOf(s)}>📝</button>
                  <button className="icon-btn" aria-label={`Apagar ${s.title}`} onClick={() => setConfirmDel(s)}>🗑️</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pick && (
        <Sheet onClose={() => setPick(null)}>
          <h2 className="title-m" style={{ margin: 0 }}>🎤 {pick.title}</h2>
          <div className="auth-field"><span className="auth-label">Quem vai cantar?</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {players.map((p) => (
                <button key={p.id} className={`pack-chip ${singerId === p.id ? 'on' : ''}`} aria-pressed={singerId === p.id} onClick={() => setSingerId(p.id)}>
                  {p.name}{pick.best[p.name] != null ? ` · 🏆 ${pick.best[p.name]}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field"><span className="auth-label">Como tocar</span>
            <Seg label="Como tocar" value={mode} onChange={setMode} options={(['karaoke', 'guide', 'original'] as Mode[]).map((m) => ({ v: m, t: MODE_NAMES[m] }))} />
            {!pick.stereo && mode !== 'original' && <span className="small faint">Essa música é mono: não dá para tirar a voz, então ela toca do jeito original.</span>}
          </div>
          <p className="small faint" style={{ margin: 0 }}>🎧 Dica: com fone de ouvido o microfone escuta só a sua voz e a nota fica mais justa.</p>
          <button className="btn big pink" onClick={() => { sfx('go'); setSinging(true); }}>Cantar! 🎤</button>
        </Sheet>
      )}
      {importing && <ImportSheet onClose={() => setImporting(false)} onSaved={(s) => { setImporting(false); reload(); setFilter('all'); setPick(s); }} />}
      {lyricsOf && <LyricsSheet song={lyricsOf} onClose={() => setLyricsOf(null)} onSaved={() => { setLyricsOf(null); reload(); }} />}
      {confirmDel && (
        <Sheet onClose={() => setConfirmDel(null)}>
          <h2 className="title-m" style={{ margin: 0 }}>Apagar “{confirmDel.title}”?</h2>
          <p className="small muted" style={{ margin: 0 }}>A música e os recordes dela saem deste aparelho.</p>
          <div className="row">
            <button className="btn ghost grow" onClick={() => setConfirmDel(null)}>Voltar</button>
            <button className="btn red grow" onClick={async () => { await deleteSong(confirmDel.id).catch(() => {}); setConfirmDel(null); if (pick?.id === confirmDel.id) setPick(null); reload(); }}>Apagar</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
