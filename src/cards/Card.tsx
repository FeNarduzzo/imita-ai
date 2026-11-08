import { cardName, isRed, type Card as C } from './cards';

/** Carta desenhada (frente ou verso). `size` = largura em px. */
export function Card({ card, hidden = false, size = 56, style, highlight, onClick, className = '' }: {
  card?: C | null; hidden?: boolean; size?: number; style?: React.CSSProperties; highlight?: boolean; onClick?: () => void; className?: string;
}) {
  const h = size * 1.42;
  const common = { width: size, height: h, ...style };
  if (hidden || !card) {
    return (
      <div className={`card back ${className}`} style={common} aria-label="Carta virada para baixo" onClick={onClick}>
        <div className="card-back-inner"><span>🎤</span></div>
      </div>
    );
  }
  const red = isRed(card.s);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card face ${red ? 'red' : ''} ${highlight ? 'hl' : ''} ${className}`} style={{ ...common, fontSize: size * 0.3 }} aria-label={cardName(card)} onClick={onClick}>
      <span className="corner tl">{card.r}<br />{card.s}</span>
      <span className="pip" style={{ fontSize: size * 0.62 }}>{card.s}</span>
      <span className="corner br">{card.r}<br />{card.s}</span>
    </Tag>
  );
}
