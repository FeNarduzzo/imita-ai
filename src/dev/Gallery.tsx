// Galeria de personagens (só em desenvolvimento: abra com ?galeria).
import { Character, type Pose } from '../components/Character';
import { ITEMS, randomLook, type Look } from '../game/character';
import { COLORS, type GameState } from '../game/model';
import { LiveScore, StageStar, TopBar } from '../screens/Turn';

const ids = (cat: string) => ITEMS.filter((i) => i.cat === cat).map((i) => i.id);

/** Partida de mentira só para ver o placar ao vivo. */
function demoGame(teams: boolean): GameState {
  const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Léo', 'Malu Fernanda'];
  const players = names.map((name, i) => ({ id: `p${i}`, name, color: COLORS[i], emoji: '🙂', team: (i % 2) as 0 | 1, look: randomLook() }));
  const totals = { p0: 120, p1: 180, p2: 95, p3: 180, p4: 60, p5: 140 };
  const last = { p0: 10, p1: 70, p2: 40, p3: 20, p4: 0, p5: 50 };
  return {
    players, totals, teamTotals: [415, 360],
    history: [{ index: 1, soundName: 'Teste', points: last, winners: ['p1'] }],
    round: { order: players.map((p) => p.id), turn: 2 },
    settings: { mode: teams ? 'teams' : 'classic' },
  } as unknown as GameState;
}

/** Prévia do palco (abra com ?galeria&palco): como fica a vez de alguém, sem precisar de microfone. */
function StageDemo() {
  const g = demoGame(false);
  const p = g.players[2];
  return (
    <div className="screen handoff" style={{ ['--c' as string]: p.color }}>
      <TopBar g={g} onQuit={() => {}} label="Vez 3 de 6" />
      <div className="grow stack" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div className="caps">Passe o celular para</div>
        <div className="bob"><StageStar p={p} pose="cheer" /></div>
        <div className="name">{p.name}</div>
        <div className="row" style={{ gap: 18 }}>
          <StageStar p={g.players[1]} pose="sing" lvl={0.8} size="m" />
          <StageStar p={g.players[5]} pose="idle" size="m" />
        </div>
      </div>
      <button className="btn big pink">Sou eu! 🎤</button>
    </div>
  );
}

export function Gallery() {
  if (location.search.includes('palco')) return <StageDemo />;
  const tops = ids('top');
  const looks: { look: Look; pose: Pose }[] = tops.map((top, i) => {
    const base = randomLook();
    const hairs = ids('hair');
    return {
      look: {
        ...base,
        top,
        hair: hairs[i % hairs.length],
        bottom: ids('bottom')[i % ids('bottom').length],
        shoes: ids('shoes')[i % ids('shoes').length],
        face: ids('face')[i % ids('face').length],
        hat: i % 3 === 0 ? ids('hat')[(i / 3) % ids('hat').length] : null,
        acc: i % 4 === 1 ? ids('acc')[i % ids('acc').length] : null,
      },
      pose: (['idle', 'sing', 'cheer', 'idle'] as Pose[])[i % 4],
    };
  });
  return (
    <div style={{ background: '#1f0f45', minHeight: '100vh' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, maxWidth: 560 }}>
      <b style={{ color: '#fff' }}>Placar ao vivo</b>
      <LiveScore g={demoGame(false)} />
      <LiveScore g={demoGame(true)} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, padding: 12 }}>
      {looks.map((l, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 }}>
          <Character look={l.look} pose={l.pose} />
          <Character look={l.look} view="bust" className="gal-bust" />
        </div>
      ))}
    </div>
    </div>
  );
}
