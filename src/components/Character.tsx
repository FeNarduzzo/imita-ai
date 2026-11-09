// Personagem desenhado em SVG, montado em camadas a partir do Look.
import { useId, type ReactNode } from 'react';
import { itemById, type Look } from '../game/character';

export type Pose = 'idle' | 'sing' | 'cheer' | 'sit';

const INK = '#2a1c22';
type P = [number, number];

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Pontos de uma estrela de 5 pontas. */
function star(cx: number, cy: number, R: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * d).toFixed(1)},${(cy + Math.sin(a) * d).toFixed(1)}`;
  }).join(' ');
}

const SHOULDER_L: P = [41, 87];
const SHOULDER_R: P = [79, 87];
function hands(pose: Pose): [P, P] {
  switch (pose) {
    case 'cheer': return [[22, 60], [98, 60]];
    case 'sing': return [[30, 122], [76, 78]];
    case 'sit': return [[34, 116], [86, 116]];
    default: return [[30, 123], [90, 123]];
  }
}

// ---------------------------------------------------------------- camadas

function HairBack({ style, c }: { style: string; c: string }) {
  switch (style) {
    case 'long': return <path d="M28 52 Q26 26 60 22 Q94 26 92 52 L94 102 Q78 108 72 96 L48 96 Q42 108 26 102 Z" fill={c} />;
    case 'afro': return <circle cx="60" cy="46" r="40" fill={c} />;
    case 'curly': return <ellipse cx="60" cy="48" rx="36" ry="34" fill={c} />;
    case 'ponytail': return <path d="M86 40 Q108 50 100 92 Q96 104 90 96 Q96 70 82 50 Z" fill={c} />;
    case 'braids':
      return (
        <g fill={c}>
          {[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={`l${i}`} cx={30 - i * 0.6} cy={64 + i * 9} rx="5.5" ry="6" />)}
          {[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={`r${i}`} cx={90 + i * 0.6} cy={64 + i * 9} rx="5.5" ry="6" />)}
        </g>
      );
    default: return null;
  }
}

function HairFront({ style, c }: { style: string; c: string }) {
  const cap = 'M30 50 Q29 22 60 21 Q91 22 90 50 Q84 37 71 35 Q61 42 46 35 Q35 39 30 50 Z';
  switch (style) {
    case 'short': return <path d={cap} fill={c} />;
    case 'buzz': return <path d="M32 46 Q34 24 60 23 Q86 24 88 46 Q76 33 60 33 Q44 33 32 46 Z" fill={c} opacity="0.85" />;
    case 'curly':
      return (
        <g fill={c}>
          {[[36, 40, 10], [47, 29, 10], [60, 25, 11], [73, 29, 10], [84, 40, 10], [30, 52, 7], [90, 52, 7]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
        </g>
      );
    case 'long': return <path d="M30 52 Q28 22 60 21 Q92 22 90 52 Q86 34 66 32 Q56 44 38 40 Q32 44 30 52 Z" fill={c} />;
    case 'fringe': return <path d="M30 52 Q28 22 60 20 Q92 22 90 52 L88 44 Q60 40 32 44 Z" fill={c} />;
    case 'bun': return <g fill={c}><circle cx="60" cy="16" r="11" /><path d={cap} /></g>;
    case 'ponytail': return <path d={cap} fill={c} />;
    case 'afro': return <path d="M31 48 Q32 30 60 28 Q88 30 89 48 Q76 38 60 38 Q44 38 31 48 Z" fill={c} />;
    case 'braids': return <path d="M30 50 Q29 22 59 21 L60 40 L61 21 Q91 22 90 50 Q84 34 64 32 L60 40 L56 32 Q36 34 30 50 Z" fill={c} />;
    case 'mohawk':
      return (
        <g>
          <path d="M32 46 Q34 26 60 24 Q86 26 88 46 Q76 34 60 34 Q44 34 32 46 Z" fill={c} opacity="0.55" />
          <path d="M52 34 L50 14 L56 20 L60 6 L64 20 L70 14 L68 34 Z" fill={c} />
        </g>
      );
    default: return null;
  }
}

function Face({ style }: { style: string }) {
  const eye = (x: number) => (
    <g key={x}>
      <ellipse cx={x} cy="54" rx="3.6" ry="4.4" fill={INK} />
      <circle cx={x + 1.2} cy="52.4" r="1.2" fill="#fff" />
    </g>
  );
  const brows = <g stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none"><path d="M44 45 Q49 42 54 45" /><path d="M66 45 Q71 42 76 45" /></g>;
  const smile = <path d="M52 65 Q60 72 68 65" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  const blush = <g fill="#ff7a8a" opacity="0.45"><ellipse cx="43" cy="64" rx="5" ry="3" /><ellipse cx="77" cy="64" rx="5" ry="3" /></g>;
  switch (style) {
    case 'grin':
      return <g>{brows}{eye(49)}{eye(71)}<path d="M49 63 Q60 77 71 63 Z" fill={INK} /><ellipse cx="60" cy="70" rx="5" ry="2.6" fill="#ff7a8a" /></g>;
    case 'blush': return <g>{brows}{eye(49)}{eye(71)}{smile}{blush}</g>;
    case 'wink':
      return <g>{brows}<path d="M45 55 Q49 51 53 55" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />{eye(71)}<path d="M52 65 Q61 72 69 64" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" /></g>;
    case 'wow':
      return <g><g stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none"><path d="M44 43 Q49 39 54 42" /><path d="M66 42 Q71 39 76 43" /></g><circle cx="49" cy="54" r="4.6" fill={INK} /><circle cx="71" cy="54" r="4.6" fill={INK} /><circle cx="50.5" cy="52.4" r="1.4" fill="#fff" /><circle cx="72.5" cy="52.4" r="1.4" fill="#fff" /><ellipse cx="60" cy="68" rx="4" ry="5" fill={INK} /></g>;
    case 'freckles':
      return <g>{brows}{eye(49)}{eye(71)}{smile}<g fill="#b9784f" opacity="0.7">{[[42, 61], [45, 64], [40, 65], [78, 61], [75, 64], [80, 65]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.1" />)}</g></g>;
    case 'cool':
      return <g><g stroke={INK} strokeWidth="2.6" strokeLinecap="round"><path d="M45 54 L53 54" /><path d="M67 54 L75 54" /></g><path d="M53 66 Q61 70 68 64" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" /></g>;
    default: return <g>{brows}{eye(49)}{eye(71)}{smile}</g>;
  }
}

function Bottom({ style, c1, c2, skin, clip }: { style: string; c1: string; c2?: string; skin: string; clip: string }) {
  const legs = (top: number) => <g fill={skin}><rect x="45" y={top} width="12" height={168 - top} rx="5" /><rect x="63" y={top} width="12" height={168 - top} rx="5" /></g>;
  const waist = <rect x="40" y="120" width="40" height="12" rx="5" fill={c1} />;
  const pants = (
    <g fill={c1}>
      {waist}
      <rect x="42" y="124" width="17" height="45" rx="6" />
      <rect x="61" y="124" width="17" height="45" rx="6" />
    </g>
  );
  switch (style) {
    case 'shorts': return <g>{legs(132)}<g fill={c1}>{waist}<rect x="42" y="124" width="17" height="20" rx="5" /><rect x="61" y="124" width="17" height="20" rx="5" /></g></g>;
    case 'skirt': return <g>{legs(138)}<path d="M40 121 L80 121 L88 150 Q60 156 32 150 Z" fill={c1} /><path d="M40 121 L80 121" stroke={shade(c1, 0.8)} strokeWidth="4" /></g>;
    case 'sweat': return <g>{pants}<g fill={shade(c1, 0.75)}><rect x="42" y="160" width="17" height="8" rx="3" /><rect x="61" y="160" width="17" height="8" rx="3" /></g><path d="M58 122 L58 132 M62 122 L62 132" stroke="#fff" strokeWidth="1.3" /></g>;
    case 'cargo': return <g>{pants}<g fill={shade(c1, 0.82)}><rect x="38" y="140" width="9" height="12" rx="2" /><rect x="73" y="140" width="9" height="12" rx="2" /></g></g>;
    case 'plaid':
      return (
        <g>
          {pants}
          <g clipPath={`url(#${clip}-legs)`} stroke={c2} strokeWidth="1.6" opacity="0.7">
            {[126, 134, 142, 150, 158, 166].map((y) => <line key={y} x1="40" y1={y} x2="80" y2={y} />)}
            {[46, 52, 66, 72].map((x) => <line key={x} x1={x} y1="120" x2={x} y2="170" />)}
          </g>
          <clipPath id={`${clip}-legs`}><rect x="42" y="124" width="17" height="45" rx="6" /><rect x="61" y="124" width="17" height="45" rx="6" /><rect x="40" y="120" width="40" height="12" rx="5" /></clipPath>
        </g>
      );
    case 'wide':
      return (
        <g>
          <g fill={c1}>{waist}<path d="M42 124 L59 124 L62 171 L35 171 Z" /><path d="M61 124 L78 124 L85 171 L58 171 Z" /></g>
          <path d="M60 130 L60 171" stroke={shade(c1, 0.82)} strokeWidth="1.2" />
        </g>
      );
    case 'leather':
      return <g>{pants}<path d="M47 129 L47 164 M66 129 L66 164" stroke="#fff" strokeOpacity="0.25" strokeWidth="2.2" strokeLinecap="round" /></g>;
    case 'camo':
      return (
        <g>
          {pants}
          <g clipPath={`url(#${clip}-legs)`} fill={c2}>
            {[[46, 130, 4], [54, 143, 3.5], [48, 157, 4], [68, 133, 3.5], [73, 148, 4], [64, 161, 3.5], [52, 122, 3], [75, 123, 3]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r + 2.5} ry={r} />)}
          </g>
          <clipPath id={`${clip}-legs`}><rect x="42" y="124" width="17" height="45" rx="6" /><rect x="61" y="124" width="17" height="45" rx="6" /><rect x="40" y="120" width="40" height="12" rx="5" /></clipPath>
        </g>
      );
    default: return <g>{pants}<path d="M59 124 L59 140" stroke={shade(c1, 0.8)} strokeWidth="1.2" /></g>;
  }
}

function Shoes({ style, c1, c2, skin }: { style: string; c1: string; c2?: string; skin: string }) {
  const pair = (render: (x: number) => ReactNode) => <g>{render(41)}{render(61)}</g>;
  switch (style) {
    case 'flip':
      return pair((x) => <g key={x}><ellipse cx={x + 9} cy="170" rx="8" ry="4" fill={skin} /><rect x={x} y="172" width="19" height="4" rx="2" fill={c1} /><path d={`M${x + 5} 172 L${x + 9} 167 L${x + 13} 172`} stroke={c1} strokeWidth="2" fill="none" /></g>);
    case 'boot':
      return pair((x) => <g key={x}><rect x={x + 1} y="156" width="17" height="18" rx="4" fill={c1} /><rect x={x} y="170" width="21" height="6" rx="3" fill={shade(c1, 0.6)} /></g>);
    case 'canvas':
      return pair((x) => <g key={x}><rect x={x} y="164" width="21" height="11" rx="5" fill={c1} /><rect x={x} y="172" width="21" height="4" rx="2" fill={c2} /><circle cx={x + 17} cy="170" r="3.6" fill={c2} /></g>);
    case 'hightop':
      return pair((x) => <g key={x}><rect x={x + 1} y="154" width="19" height="21" rx="5" fill={c1} /><rect x={x + 1} y="160" width="19" height="3" fill={c2} /><rect x={x} y="171" width="21" height="5" rx="2" fill="#f4f1ec" /><circle cx={x + 10} cy="157" r="1.6" fill={c2} /></g>);
    case 'loafer':
      return pair((x) => <g key={x}><path d={`M${x} 176 Q${x} 166 ${x + 9} 166 Q${x + 21} 166 ${x + 21} 176 Z`} fill={c1} /><rect x={x + 5} y="168" width="10" height="3" rx="1.5" fill={shade(c1, 1.5)} /></g>);
    default:
      return pair((x) => <g key={x}><rect x={x} y="163" width="21" height="12" rx="6" fill={c1} /><rect x={x} y="172" width="21" height="4" rx="2" fill={c2 || shade(c1, 0.8)} /><path d={`M${x + 6} 167 L${x + 13} 167`} stroke={c2 || shade(c1, 0.7)} strokeWidth="1.5" /></g>);
  }
}

function Torso({ style, c1, c2, skin, clip }: { style: string; c1: string; c2?: string; skin: string; clip: string }) {
  const body = 'M40 86 Q40 80 48 79 L72 79 Q80 80 80 86 L82 126 Q60 130 38 126 Z';
  const neckline = <path d="M53 79 Q60 86 67 79" stroke={shade(c1, 0.78)} strokeWidth="2.4" fill="none" />;
  switch (style) {
    case 'tank':
      return <g><path d="M45 86 L48 79 L53 79 Q60 88 67 79 L72 79 L75 86 L80 126 Q60 130 40 126 Z" fill={c1} /></g>;
    case 'crop':
      return <g><rect x="42" y="104" width="36" height="20" rx="6" fill={skin} /><path d="M40 86 Q40 80 48 79 L72 79 Q80 80 80 86 L80 108 Q60 112 40 108 Z" fill={c1} />{neckline}</g>;
    case 'stripes':
      return (
        <g>
          <path d={body} fill={c1} />
          <g clipPath={`url(#${clip}-torso)`} fill={c2}>{[88, 98, 108, 118].map((y) => <rect key={y} x="36" y={y} width="48" height="4.5" />)}</g>
          <clipPath id={`${clip}-torso`}><path d={body} /></clipPath>
          {neckline}
        </g>
      );
    case 'hoodie':
      return (
        <g>
          <path d={body} fill={c1} />
          <rect x="47" y="108" width="26" height="12" rx="5" fill={c2} />
          <path d="M55 80 L54 96 M65 80 L66 96" stroke="#f4f1ec" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'flannel':
      return (
        <g>
          <path d={body} fill={c1} />
          <g clipPath={`url(#${clip}-torso)`} stroke={c2} opacity="0.55">
            {[86, 96, 106, 116].map((y) => <line key={y} x1="36" y1={y} x2="84" y2={y} strokeWidth="2.4" />)}
            {[46, 56, 64, 74].map((x) => <line key={x} x1={x} y1="78" x2={x} y2="130" strokeWidth="2.4" />)}
          </g>
          <clipPath id={`${clip}-torso`}><path d={body} /></clipPath>
          <path d="M60 82 L60 126" stroke={shade(c1, 0.6)} strokeWidth="1.4" />
          {[92, 102, 112].map((y) => <circle key={y} cx="62.5" cy={y} r="1.2" fill="#f4f1ec" />)}
          <path d="M52 79 L60 88 L68 79" fill="none" stroke={shade(c1, 0.6)} strokeWidth="2" />
        </g>
      );
    case 'jersey':
      return (
        <g>
          <path d={body} fill={c1} />
          <path d="M41 86 L41 124 M79 86 L79 124" stroke={c2} strokeWidth="4" />
          <text x="60" y="113" textAnchor="middle" fontSize="18" fontWeight="800" fill={c2} fontFamily="Fredoka, sans-serif">10</text>
          <path d="M53 79 Q60 87 67 79" stroke={c2} strokeWidth="3" fill="none" />
        </g>
      );
    case 'jacket':
      return (
        <g>
          <path d={body} fill="#f4f1ec" />
          <path d="M40 86 Q40 80 48 79 L55 79 L56 127 Q46 127 38 126 Z" fill={c1} />
          <path d="M80 86 Q80 80 72 79 L65 79 L64 127 Q74 127 82 126 Z" fill={c1} />
          <path d="M48 79 L55 79 L51 92 Z M72 79 L65 79 L69 92 Z" fill={shade(c1, 0.75)} />
          <rect x="55" y="104" width="2" height="16" fill={c2 && c2 !== '#f4f1ec' ? c2 : shade(c1, 0.7)} />
        </g>
      );
    case 'polo':
      return (
        <g>
          <path d={body} fill={c1} />
          <path d="M50 77 L60 86 L70 77 L68 79 L60 89 L52 79 Z" fill={c2 || '#f4f1ec'} />
          <path d="M60 87 L60 99" stroke={shade(c1, 0.7)} strokeWidth="1.4" />
          {[91, 96].map((y) => <circle key={y} cx="61.8" cy={y} r="1" fill={c2 || '#f4f1ec'} />)}
        </g>
      );
    case 'varsity':
      return (
        <g>
          <path d={body} fill={c1} />
          <rect x="38" y="119" width="44" height="7" rx="3" fill={c2} />
          <path d="M53 79 Q60 86 67 79" stroke={c2} strokeWidth="3.2" fill="none" />
          <path d="M60 84 L60 126" stroke={shade(c1, 0.7)} strokeWidth="1.2" />
          {[92, 101, 110].map((y) => <circle key={y} cx="62.5" cy={y} r="1.3" fill={c2} />)}
          <text x="49" y="105" textAnchor="middle" fontSize="13" fontWeight="800" fill={c2} fontFamily="Fredoka, sans-serif">I</text>
        </g>
      );
    case 'puffer':
      return (
        <g>
          <path d={body} fill={c1} />
          {[92, 104, 116].map((y) => <path key={y} d={`M39 ${y} Q60 ${y + 3} 81 ${y}`} stroke={shade(c1, 0.78)} strokeWidth="2" fill="none" />)}
          <rect x="50" y="73" width="20" height="10" rx="4" fill={shade(c1, 0.9)} />
          <path d="M60 81 L60 127" stroke={shade(c1, 0.6)} strokeWidth="1.4" />
        </g>
      );
    case 'blazer':
      return (
        <g>
          <path d={body} fill={c2 || '#f4f1ec'} />
          <path d="M40 86 Q40 80 48 79 L56 79 L60 100 L57 127 Q46 127 38 126 Z" fill={c1} />
          <path d="M80 86 Q80 80 72 79 L64 79 L60 100 L63 127 Q74 127 82 126 Z" fill={c1} />
          <path d="M48 79 L56 79 L53 95 Z M72 79 L64 79 L67 95 Z" fill={shade(c1, 0.7)} />
          {[107, 115].map((y) => <circle key={y} cx="58.4" cy={y} r="1.4" fill={shade(c1, 1.8)} />)}
        </g>
      );
    case 'sequin':
      return (
        <g>
          <path d={body} fill={c1} />
          <g clipPath={`url(#${clip}-torso)`}>
            {Array.from({ length: 9 }, (_, row) => Array.from({ length: 10 }, (_, col) => (
              <circle key={`${row}-${col}`} cx={38 + col * 5 + (row % 2) * 2.5} cy={83 + row * 5} r="1.3" fill={(row + col) % 3 ? '#ffffff' : c2} opacity={(row + col) % 2 ? 0.85 : 0.5} />
            )))}
          </g>
          <clipPath id={`${clip}-torso`}><path d={body} /></clipPath>
          {neckline}
        </g>
      );
    case 'startee':
      return <g><path d={body} fill={c1} />{neckline}<polygon points={star(60, 104, 11, 4.6)} fill={c2 || '#fff'} /></g>;
    case 'galaxy':
      return (
        <g>
          <path d={body} fill={c1} />
          <g clipPath={`url(#${clip}-torso)`}>
            <circle cx="50" cy="98" r="17" fill={c2} opacity="0.55" />
            <circle cx="73" cy="114" r="13" fill="#ff4f9a" opacity="0.35" />
            {[[46, 88], [70, 92], [56, 104], [76, 100], [44, 116], [64, 120], [52, 112]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 0.9 : 1.4} fill="#fff" />)}
          </g>
          <clipPath id={`${clip}-torso`}><path d={body} /></clipPath>
          <rect x="47" y="108" width="26" height="12" rx="5" fill={shade(c1, 1.6)} opacity="0.7" />
          <path d="M55 80 L54 96 M65 80 L66 96" stroke="#f4f1ec" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    default:
      return <g><path d={body} fill={c1} />{neckline}</g>;
  }
}

const LONG_SLEEVES = ['hoodie', 'flannel', 'jacket', 'varsity', 'puffer', 'blazer', 'galaxy'];

function Arms({ pose, top, c1, sleeve, skin, hasMic, micColor, mesh }: { pose: Pose; top: string; c1: string; sleeve?: string; skin: string; hasMic: boolean; micColor?: string; mesh: string }) {
  const [hl, hr] = hands(pose);
  const sleeveT = top === 'tank' ? 0 : LONG_SLEEVES.includes(top) ? 0.86 : 0.42;
  const arm = (s: P, h: P, k: string) => {
    const e = lerp(s, h, sleeveT);
    return (
      <g key={k}>
        <line x1={s[0]} y1={s[1]} x2={h[0]} y2={h[1]} stroke={skin} strokeWidth="9" strokeLinecap="round" />
        {sleeveT > 0 && <line x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1]} stroke={sleeve || c1} strokeWidth={top === 'puffer' ? 14 : 12.5} strokeLinecap="round" />}
        <circle cx={h[0]} cy={h[1]} r="5.6" fill={skin} />
      </g>
    );
  };
  return (
    <g>
      {arm(SHOULDER_L, hl, 'l')}
      {arm(SHOULDER_R, hr, 'r')}
      {(pose === 'sing' || hasMic) && (
        <g transform={`translate(${hr[0]} ${hr[1]}) rotate(${pose === 'sing' ? -35 : 20})`}>
          <rect x="-2.6" y="-2" width="5.2" height="16" rx="2.4" fill="#3a3a44" />
          <circle cx="0" cy="-5" r="5.4" fill={micColor || '#c9c9d1'} />
          <circle cx="0" cy="-5" r="5.4" fill={`url(#${mesh})`} opacity="0.5" />
        </g>
      )}
    </g>
  );
}

function Hat({ style, c, c2 }: { style: string; c: string; c2?: string }) {
  const d = shade(c, 0.78);
  switch (style) {
    case 'cap': return <g><path d="M29 44 Q29 18 60 17 Q91 18 91 44 Z" fill={c} /><ellipse cx="60" cy="44" rx="34" ry="5.5" fill={d} /><circle cx="60" cy="18" r="2.6" fill={d} /></g>;
    case 'capback': return <g><path d="M29 44 Q29 18 60 17 Q91 18 91 44 Z" fill={c} /><rect x="29" y="40" width="62" height="5" rx="2.5" fill={d} /><circle cx="60" cy="18" r="2.6" fill={d} /></g>;
    case 'beanie': return <g><path d="M30 44 Q30 14 60 13 Q90 14 90 44 Z" fill={c} /><rect x="28" y="36" width="64" height="11" rx="5" fill={d} /><circle cx="60" cy="11" r="6" fill={d} /></g>;
    case 'bucket': return <g><path d="M34 40 Q36 16 60 16 Q84 16 86 40 Z" fill={c} /><path d="M24 46 Q30 36 40 38 L80 38 Q90 36 96 46 Q60 52 24 46 Z" fill={d} /></g>;
    case 'straw': return <g><ellipse cx="60" cy="40" rx="46" ry="9" fill={c} /><path d="M36 40 Q38 14 60 14 Q82 14 84 40 Z" fill={c} /><rect x="36" y="33" width="48" height="6" fill="#c0392b" /></g>;
    case 'beret': return <g><ellipse cx="58" cy="27" rx="31" ry="11" fill={c} transform="rotate(-8 58 27)" /><circle cx="55" cy="15" r="2.6" fill={d} /></g>;
    case 'cowboy':
      return (
        <g>
          <path d="M18 42 Q30 51 60 51 Q90 51 102 42 Q96 37 88 40 L32 40 Q24 37 18 42 Z" fill={d} />
          <path d="M36 41 Q35 17 49 15 Q60 22 71 15 Q85 17 84 41 Z" fill={c} />
          <rect x="36" y="34" width="48" height="5" fill={shade(c, 0.55)} />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M36 38 L36 17 L46 27 L53 9 L60 24 L67 9 L74 27 L84 17 L84 38 Z" fill={c} stroke={shade(c, 0.7)} strokeWidth="1.2" />
          <rect x="35" y="32" width="50" height="8" rx="2" fill={shade(c, 0.85)} />
          {[45, 60, 75].map((x) => <circle key={x} cx={x} cy="36" r="2.6" fill={c2 || '#e8434b'} />)}
          {[36, 53, 67, 84].map((x, i) => <circle key={x} cx={x} cy={i === 0 || i === 3 ? 17 : 9} r="2" fill="#fff" />)}
        </g>
      );
    case 'halo':
      return (
        <g>
          <ellipse cx="60" cy="13" rx="22" ry="5.5" fill="none" stroke={c} strokeWidth="4" />
          <ellipse cx="60" cy="13" rx="22" ry="5.5" fill="none" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.2" />
        </g>
      );
    default: return null;
  }
}

function Acc({ style, c }: { style: string; c: string }) {
  switch (style) {
    case 'glasses': return <g fill="none" stroke={c} strokeWidth="2.2"><circle cx="49" cy="54" r="7.5" /><circle cx="71" cy="54" r="7.5" /><path d="M56.5 54 L63.5 54 M41.5 52 L32 50 M78.5 52 L88 50" /></g>;
    case 'shades': return <g><rect x="40" y="48" width="17" height="11" rx="4" fill={c} /><rect x="63" y="48" width="17" height="11" rx="4" fill={c} /><path d="M57 52 L63 52" stroke={c} strokeWidth="2.4" /><path d="M43 51 L47 51" stroke="#fff" strokeWidth="1.5" opacity="0.6" /></g>;
    case 'headphones': return <g><path d="M30 56 Q30 18 60 18 Q90 18 90 56" fill="none" stroke={c} strokeWidth="5" /><rect x="24" y="48" width="11" height="17" rx="5" fill={c} /><rect x="85" y="48" width="11" height="17" rx="5" fill={c} /></g>;
    case 'necklace': return <g><path d="M50 80 Q60 94 70 80" fill="none" stroke={c} strokeWidth="2.2" /><circle cx="60" cy="91" r="3" fill={c} /></g>;
    case 'starshades':
      return <g><polygon points={star(49, 54, 10.5, 4.8)} fill={c} /><polygon points={star(71, 54, 10.5, 4.8)} fill={c} /><path d="M57 52 L63 52" stroke={c} strokeWidth="2.4" /><circle cx="46" cy="51" r="1.4" fill="#fff" opacity="0.7" /></g>;
    case 'hearts': {
      const heart = (x: number, y: number) => `M${x} ${y + 7} L${x - 8} ${y - 1} Q${x - 9} ${y - 8} ${x - 3.5} ${y - 7} Q${x} ${y - 6} ${x} ${y - 2.5} Q${x} ${y - 6} ${x + 3.5} ${y - 7} Q${x + 9} ${y - 8} ${x + 8} ${y - 1} Z`;
      return <g><path d={heart(49, 54)} fill={c} /><path d={heart(71, 54)} fill={c} /><path d="M57 52 L63 52" stroke={c} strokeWidth="2.4" /></g>;
    }
    default: return null;
  }
}

function Cape({ c1 }: { c1: string }) {
  return (
    <g>
      <path d="M42 82 Q28 120 23 168 Q60 179 97 168 Q92 120 78 82 Z" fill={c1} />
      <path d="M42 84 Q32 120 29 166 M78 84 Q88 120 91 166" stroke={shade(c1, 0.75)} strokeWidth="2" fill="none" />
    </g>
  );
}

export const JEWEL_NECK = ['pearls', 'pendant', 'chain'];
export const JEWEL_EARS = ['studs', 'hoops', 'starstuds'];
export const JEWEL_WRIST = ['watch', 'bracelet'];

function JewelNeck({ style, c1, c2 }: { style: string; c1: string; c2?: string }) {
  // curva do colar: de (49,80) a (71,80), passando por baixo do pescoço
  const at = (t: number): P => {
    const u = 1 - t;
    return [u * u * 49 + 2 * u * t * 60 + t * t * 71, u * u * 80 + 2 * u * t * 96 + t * t * 80];
  };
  switch (style) {
    case 'pearls':
      return <g fill={c1} stroke={shade(c1, 0.75)} strokeWidth="0.5">{Array.from({ length: 11 }, (_, i) => { const [x, y] = at(i / 10); return <circle key={i} cx={x} cy={y} r="1.9" />; })}</g>;
    case 'pendant':
      return (
        <g>
          <path d="M49 80 Q60 96 71 80" fill="none" stroke={c1} strokeWidth="1.2" />
          <path d="M60 88 L64.5 92.5 L60 99 L55.5 92.5 Z" fill={c2 || '#e8434b'} stroke={c1} strokeWidth="1" />
          <path d="M58 91 L60 89.5" stroke="#fff" strokeWidth="1" opacity="0.8" />
        </g>
      );
    case 'chain':
      return (
        <g>
          <path d="M48 80 Q60 98 72 80" fill="none" stroke={c1} strokeWidth="3.4" strokeDasharray="3 1.3" />
          <circle cx="60" cy="94" r="5.2" fill={c1} stroke={shade(c1, 0.7)} strokeWidth="1" />
          <circle cx="60" cy="94" r="2.6" fill="none" stroke={shade(c1, 0.7)} strokeWidth="0.9" />
        </g>
      );
    default: return null;
  }
}

function JewelEars({ style, c1 }: { style: string; c1: string }) {
  const both = (draw: (x: number) => ReactNode) => <g>{draw(30.5)}{draw(89.5)}</g>;
  switch (style) {
    case 'studs': return both((x) => <g key={x}><circle cx={x} cy="62" r="2.5" fill={c1} stroke="#9fd8ff" strokeWidth="0.6" /><circle cx={x - 0.8} cy="61.2" r="0.8" fill="#fff" /></g>);
    case 'hoops': return both((x) => <circle key={x} cx={x} cy="66" r="4.8" fill="none" stroke={c1} strokeWidth="1.9" />);
    case 'starstuds': return both((x) => <polygon key={x} points={star(x, 63, 4.4, 1.9)} fill={c1} stroke={shade(c1, 0.75)} strokeWidth="0.5" />);
    default: return null;
  }
}

function JewelWrist({ style, c1, c2, pose }: { style: string; c1: string; c2?: string; pose: Pose }) {
  const [hl, hr] = hands(pose);
  const wl = lerp(SHOULDER_L, hl, 0.84);
  const wr = lerp(SHOULDER_R, hr, 0.84);
  switch (style) {
    case 'watch': return <g><circle cx={wl[0]} cy={wl[1]} r="5.6" fill={c2 || '#26232b'} /><circle cx={wl[0]} cy={wl[1]} r="3.6" fill={c1} /><circle cx={wl[0]} cy={wl[1]} r="2.3" fill="#fff" /></g>;
    case 'bracelet': return <g><circle cx={wr[0]} cy={wr[1]} r="5.8" fill="none" stroke={c1} strokeWidth="2.6" /><circle cx={wr[0] + 4} cy={wr[1] - 3} r="1.2" fill="#fff" /></g>;
    default: return null;
  }
}

// ---------------------------------------------------------------- personagem

export function Character({ look, pose = 'idle', view = 'full', className, title }: { look: Look; pose?: Pose; view?: 'full' | 'bust'; className?: string; title?: string }) {
  const clip = `c${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hair = itemById(look.hair)?.style || 'short';
  const face = itemById(look.face)?.style || 'happy';
  const top = itemById(look.top) || itemById('top-tee-white')!;
  const bottom = itemById(look.bottom) || itemById('bot-jeans')!;
  const shoes = itemById(look.shoes) || itemById('shoe-white')!;
  const hat = itemById(look.hat);
  const acc = itemById(look.acc);
  const jewel = itemById(look.jewel);
  const skin = look.skin;
  const hideFrontHair = hat && ['beanie', 'bucket', 'cowboy'].includes(hat.style) && ['short', 'buzz', 'fringe', 'mohawk', 'afro', 'braids'].includes(hair);
  const hood = top.style === 'hoodie' || top.style === 'galaxy';
  const viewBox = view === 'bust' ? '14 6 92 92' : '0 0 120 190';
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={title || 'Personagem'}>
      <defs>
        <pattern id={`${clip}-mesh`} width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.5" fill="#666" /></pattern>
      </defs>
      {view === 'full' && <ellipse cx="60" cy="180" rx="30" ry="5" fill="rgba(0,0,0,0.3)" />}
      <HairBack style={hair} c={look.hairColor} />
      {acc?.style === 'cape' && <Cape c1={acc.c1!} />}
      {view === 'full' && <Bottom style={bottom.style} c1={bottom.c1!} c2={bottom.c2} skin={skin} clip={clip} />}
      {view === 'full' && <Shoes style={shoes.style} c1={shoes.c1!} c2={shoes.c2} skin={skin} />}
      {hood && <ellipse cx="60" cy="80" rx="20" ry="8" fill={top.c2} />}
      <rect x="54" y="72" width="12" height="12" rx="4" fill={skin} />
      <Torso style={top.style} c1={top.c1!} c2={top.c2} skin={skin} clip={clip} />
      {acc?.style === 'cape' && <g fill={acc.c2 || '#ffd23f'}><circle cx="46" cy="82" r="3" /><circle cx="74" cy="82" r="3" /></g>}
      {acc?.style === 'necklace' && <Acc style="necklace" c={acc.c1!} />}
      {jewel && JEWEL_NECK.includes(jewel.style) && <JewelNeck style={jewel.style} c1={jewel.c1!} c2={jewel.c2} />}
      <Arms pose={pose} top={top.style} c1={top.c1!} sleeve={top.style === 'varsity' ? top.c2 : undefined} skin={skin} hasMic={acc?.style === 'mic'} micColor={acc?.style === 'mic' ? acc.c1 : undefined} mesh={`${clip}-mesh`} />
      {jewel && JEWEL_WRIST.includes(jewel.style) && <JewelWrist style={jewel.style} c1={jewel.c1!} c2={jewel.c2} pose={pose} />}
      <circle cx="30.5" cy="56" r="6" fill={skin} />
      <circle cx="89.5" cy="56" r="6" fill={skin} />
      <circle cx="60" cy="52" r="30" fill={skin} />
      <Face style={face} />
      {!hideFrontHair && <HairFront style={hair} c={look.hairColor} />}
      {jewel && JEWEL_EARS.includes(jewel.style) && <JewelEars style={jewel.style} c1={jewel.c1!} />}
      {hat && <Hat style={hat.style} c={hat.c1!} c2={hat.c2} />}
      {acc && !['necklace', 'mic', 'cape'].includes(acc.style) && <Acc style={acc.style} c={acc.c1!} />}
    </svg>
  );
}
