// Galeria de personagens (só em desenvolvimento: abra com ?galeria).
import { Character, type Pose } from '../components/Character';
import { ITEMS, randomLook, type Look } from '../game/character';

const ids = (cat: string) => ITEMS.filter((i) => i.cat === cat).map((i) => i.id);

export function Gallery() {
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, padding: 12, background: '#1f0f45', minHeight: '100vh' }}>
      {looks.map((l, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 }}>
          <Character look={l.look} pose={l.pose} />
          <Character look={l.look} view="bust" className="gal-bust" />
        </div>
      ))}
    </div>
  );
}
