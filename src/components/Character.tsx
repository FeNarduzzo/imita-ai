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
    default:
      return <g><path d={body} fill={c1} />{neckline}</g>;
  }
}

function Arms({ pose, top, c1, skin, hasMic, mesh }: { pose: Pose; top: string; c1: string; skin: string; hasMic: boolean; mesh: string }) {
  const [hl, hr] = hands(pose);
  const sleeveT = top === 'tank' ? 0 : ['hoodie', 'flannel', 'jacket'].includes(top) ? 0.86 : 0.42;
  const arm = (s: P, h: P, k: string) => {
    const e = lerp(s, h, sleeveT);
    return (
      <g key={k}>
        <line x1={s[0]} y1={s[1]} x2={h[0]} y2={h[1]} stroke={skin} strokeWidth="9" strokeLinecap="round" />
        {sleeveT > 0 && <line x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1]} stroke={c1} strokeWidth="12.5" strokeLinecap="round" />}
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
          <circle cx="0" cy="-5" r="5.4" fill="#c9c9d1" />
          <circle cx="0" cy="-5" r="5.4" fill={`url(#${mesh})`} opacity="0.5" />
        </g>
      )}
    </g>
  );
}

function Hat({ style, c }: { style: string; c: string }) {
  const d = shade(c, 0.78);
  switch (style) {
    case 'cap': return <g><path d="M29 44 Q29 18 60 17 Q91 18 91 44 Z" fill={c} /><ellipse cx="60" cy="44" rx="34" ry="5.5" fill={d} /><circle cx="60" cy="18" r="2.6" fill={d} /></g>;
    case 'capback': return <g><path d="M29 44 Q29 18 60 17 Q91 18 91 44 Z" fill={c} /><rect x="29" y="40" width="62" height="5" rx="2.5" fill={d} /><circle cx="60" cy="18" r="2.6" fill={d} /></g>;
    case 'beanie': return <g><path d="M30 44 Q30 14 60 13 Q90 14 90 44 Z" fill={c} /><rect x="28" y="36" width="64" height="11" rx="5" fill={d} /><circle cx="60" cy="11" r="6" fill={d} /></g>;
    case 'bucket': return <g><path d="M34 40 Q36 16 60 16 Q84 16 86 40 Z" fill={c} /><path d="M24 46 Q30 36 40 38 L80 38 Q90 36 96 46 Q60 52 24 46 Z" fill={d} /></g>;
    case 'straw': return <g><ellipse cx="60" cy="40" rx="46" ry="9" fill={c} /><path d="M36 40 Q38 14 60 14 Q82 14 84 40 Z" fill={c} /><rect x="36" y="33" width="48" height="6" fill="#c0392b" /></g>;
    default: return null;
  }
}

function Acc({ style, c }: { style: string; c: string }) {
  switch (style) {
    case 'glasses': return <g fill="none" stroke={c} strokeWidth="2.2"><circle cx="49" cy="54" r="7.5" /><circle cx="71" cy="54" r="7.5" /><path d="M56.5 54 L63.5 54 M41.5 52 L32 50 M78.5 52 L88 50" /></g>;
    case 'shades': return <g><rect x="40" y="48" width="17" height="11" rx="4" fill={c} /><rect x="63" y="48" width="17" height="11" rx="4" fill={c} /><path d="M57 52 L63 52" stroke={c} strokeWidth="2.4" /><path d="M43 51 L47 51" stroke="#fff" strokeWidth="1.5" opacity="0.6" /></g>;
    case 'headphones': return <g><path d="M30 56 Q30 18 60 18 Q90 18 90 56" fill="none" stroke={c} strokeWidth="5" /><rect x="24" y="48" width="11" height="17" rx="5" fill={c} /><rect x="85" y="48" width="11" height="17" rx="5" fill={c} /></g>;
    case 'necklace': return <g><path d="M50 80 Q60 94 70 80" fill="none" stroke={c} strokeWidth="2.2" /><circle cx="60" cy="91" r="3" fill={c} /></g>;
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
  const skin = look.skin;
  const hideFrontHair = hat && ['beanie', 'bucket'].includes(hat.style) && ['short', 'buzz', 'fringe', 'mohawk', 'afro', 'braids'].includes(hair);
  const viewBox = view === 'bust' ? '14 6 92 92' : '0 0 120 190';
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={title || 'Personagem'}>
      <defs>
        <pattern id={`${clip}-mesh`} width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.5" fill="#666" /></pattern>
      </defs>
      {view === 'full' && <ellipse cx="60" cy="180" rx="30" ry="5" fill="rgba(0,0,0,0.3)" />}
      <HairBack style={hair} c={look.hairColor} />
      {view === 'full' && <Bottom style={bottom.style} c1={bottom.c1!} c2={bottom.c2} skin={skin} clip={clip} />}
      {view === 'full' && <Shoes style={shoes.style} c1={shoes.c1!} c2={shoes.c2} skin={skin} />}
      {top.style === 'hoodie' && <ellipse cx="60" cy="80" rx="20" ry="8" fill={top.c2} />}
      <rect x="54" y="72" width="12" height="12" rx="4" fill={skin} />
      <Torso style={top.style} c1={top.c1!} c2={top.c2} skin={skin} clip={clip} />
      {acc?.style === 'necklace' && <Acc style="necklace" c={acc.c1!} />}
      <Arms pose={pose} top={top.style} c1={top.c1!} skin={skin} hasMic={acc?.style === 'mic'} mesh={`${clip}-mesh`} />
      <circle cx="30.5" cy="56" r="6" fill={skin} />
      <circle cx="89.5" cy="56" r="6" fill={skin} />
      <circle cx="60" cy="52" r="30" fill={skin} />
      <Face style={face} />
      {!hideFrontHair && <HairFront style={hair} c={look.hairColor} />}
      {hat && <Hat style={hat.style} c={hat.c1!} />}
      {acc && acc.style !== 'necklace' && acc.style !== 'mic' && <Acc style={acc.style} c={acc.c1!} />}
    </svg>
  );
}
