// Personagens: visual (Look), catálogo de roupas casuais, moedas e guarda-roupa.

export interface Look {
  skin: string;
  hair: string;
  hairColor: string;
  face: string;
  top: string;
  bottom: string;
  shoes: string;
  hat: string | null;
  acc: string | null;
}

export type Category = 'skin' | 'hair' | 'hairColor' | 'face' | 'top' | 'bottom' | 'shoes' | 'hat' | 'acc';

export interface Item {
  id: string;
  cat: Category;
  name: string;
  price: number; // 0 = grátis
  style: string; // desenho usado pelo personagem
  c1?: string; // cor principal
  c2?: string; // cor secundária
}

export const CATEGORIES: { cat: Category; label: string; emoji: string }[] = [
  { cat: 'top', label: 'Parte de cima', emoji: '👕' },
  { cat: 'bottom', label: 'Parte de baixo', emoji: '👖' },
  { cat: 'shoes', label: 'Calçados', emoji: '👟' },
  { cat: 'hat', label: 'Chapéus', emoji: '🧢' },
  { cat: 'acc', label: 'Acessórios', emoji: '🕶️' },
  { cat: 'hair', label: 'Cabelo', emoji: '💇' },
  { cat: 'hairColor', label: 'Cor do cabelo', emoji: '🎨' },
  { cat: 'face', label: 'Rosto', emoji: '🙂' },
  { cat: 'skin', label: 'Pele', emoji: '✋' },
];

const SKINS = ['#ffe0c7', '#f3c29c', '#dca27a', '#b97c55', '#8d5638', '#5e3a25'];
const HAIR_COLORS: [string, string][] = [
  ['#2a1c14', 'Preto'], ['#5a3a22', 'Castanho'], ['#9b6331', 'Mel'], ['#e3b75e', 'Loiro'],
  ['#d4532c', 'Ruivo'], ['#d9d4cf', 'Grisalho'], ['#7b5cff', 'Roxo'], ['#ff4f9a', 'Rosa'], ['#2ec4b6', 'Verde-água'],
];

export const ITEMS: Item[] = [
  ...SKINS.map((c, i) => ({ id: `skin-${i}`, cat: 'skin' as const, name: `Tom ${i + 1}`, price: 0, style: 'skin', c1: c })),
  ...HAIR_COLORS.map(([c, n], i) => ({ id: `hc-${i}`, cat: 'hairColor' as const, name: n, price: i < 6 ? 0 : 25, style: 'color', c1: c })),
  // cabelo
  { id: 'hair-short', cat: 'hair', name: 'Curtinho', price: 0, style: 'short' },
  { id: 'hair-buzz', cat: 'hair', name: 'Raspado', price: 0, style: 'buzz' },
  { id: 'hair-curly', cat: 'hair', name: 'Cacheado', price: 0, style: 'curly' },
  { id: 'hair-long', cat: 'hair', name: 'Liso longo', price: 0, style: 'long' },
  { id: 'hair-fringe', cat: 'hair', name: 'Franjinha', price: 30, style: 'fringe' },
  { id: 'hair-bun', cat: 'hair', name: 'Coque', price: 30, style: 'bun' },
  { id: 'hair-ponytail', cat: 'hair', name: 'Rabo de cavalo', price: 35, style: 'ponytail' },
  { id: 'hair-afro', cat: 'hair', name: 'Black power', price: 45, style: 'afro' },
  { id: 'hair-braids', cat: 'hair', name: 'Tranças', price: 55, style: 'braids' },
  { id: 'hair-mohawk', cat: 'hair', name: 'Moicano', price: 60, style: 'mohawk' },
  // rosto
  { id: 'face-happy', cat: 'face', name: 'Feliz', price: 0, style: 'happy' },
  { id: 'face-grin', cat: 'face', name: 'Sorrisão', price: 0, style: 'grin' },
  { id: 'face-blush', cat: 'face', name: 'Bochechas', price: 0, style: 'blush' },
  { id: 'face-wink', cat: 'face', name: 'Piscadinha', price: 20, style: 'wink' },
  { id: 'face-wow', cat: 'face', name: 'Uau!', price: 20, style: 'wow' },
  { id: 'face-freckles', cat: 'face', name: 'Sardinhas', price: 25, style: 'freckles' },
  { id: 'face-cool', cat: 'face', name: 'De boa', price: 30, style: 'cool' },
  // parte de cima
  { id: 'top-tee-white', cat: 'top', name: 'Camiseta branca', price: 0, style: 'tee', c1: '#f4f1ec' },
  { id: 'top-tee-black', cat: 'top', name: 'Camiseta preta', price: 0, style: 'tee', c1: '#26232b' },
  { id: 'top-tee-red', cat: 'top', name: 'Camiseta vermelha', price: 15, style: 'tee', c1: '#e8434b' },
  { id: 'top-tee-yellow', cat: 'top', name: 'Camiseta amarela', price: 15, style: 'tee', c1: '#ffc93c' },
  { id: 'top-stripes', cat: 'top', name: 'Listrada', price: 35, style: 'stripes', c1: '#f4f1ec', c2: '#2f6fe0' },
  { id: 'top-tank', cat: 'top', name: 'Regata', price: 25, style: 'tank', c1: '#3fbf7f' },
  { id: 'top-crop', cat: 'top', name: 'Cropped', price: 40, style: 'crop', c1: '#ff7ab8' },
  { id: 'top-hoodie-grey', cat: 'top', name: 'Moletom cinza', price: 60, style: 'hoodie', c1: '#9aa0a8', c2: '#7f858d' },
  { id: 'top-hoodie-purple', cat: 'top', name: 'Moletom roxo', price: 70, style: 'hoodie', c1: '#7b5cff', c2: '#6247d9' },
  { id: 'top-flannel', cat: 'top', name: 'Camisa xadrez', price: 80, style: 'flannel', c1: '#c8333b', c2: '#2a1c22' },
  { id: 'top-jersey', cat: 'top', name: 'Camisa de time', price: 90, style: 'jersey', c1: '#ffd23f', c2: '#1f8a4c' },
  { id: 'top-denim', cat: 'top', name: 'Jaqueta jeans', price: 110, style: 'jacket', c1: '#4f7cc4', c2: '#f4f1ec' },
  { id: 'top-leather', cat: 'top', name: 'Jaqueta de couro', price: 150, style: 'jacket', c1: '#2b2a30', c2: '#e8434b' },
  // parte de baixo
  { id: 'bot-jeans', cat: 'bottom', name: 'Calça jeans', price: 0, style: 'pants', c1: '#3c64a8' },
  { id: 'bot-shorts', cat: 'bottom', name: 'Bermuda', price: 0, style: 'shorts', c1: '#c9a46b' },
  { id: 'bot-black', cat: 'bottom', name: 'Calça preta', price: 20, style: 'pants', c1: '#26232b' },
  { id: 'bot-jshorts', cat: 'bottom', name: 'Short jeans', price: 30, style: 'shorts', c1: '#5f86c8' },
  { id: 'bot-sweat', cat: 'bottom', name: 'Calça moletom', price: 40, style: 'sweat', c1: '#8e939b' },
  { id: 'bot-skirt', cat: 'bottom', name: 'Saia', price: 40, style: 'skirt', c1: '#ff7ab8' },
  { id: 'bot-cargo', cat: 'bottom', name: 'Calça cargo', price: 70, style: 'cargo', c1: '#6f7a4b' },
  { id: 'bot-plaid', cat: 'bottom', name: 'Calça xadrez', price: 90, style: 'plaid', c1: '#d23a3a', c2: '#26232b' },
  // calçados
  { id: 'shoe-white', cat: 'shoes', name: 'Tênis branco', price: 0, style: 'sneaker', c1: '#f4f1ec', c2: '#d6d1ca' },
  { id: 'shoe-flip', cat: 'shoes', name: 'Chinelo', price: 10, style: 'flip', c1: '#2f9e5b' },
  { id: 'shoe-color', cat: 'shoes', name: 'Tênis colorido', price: 50, style: 'sneaker', c1: '#ff4f9a', c2: '#ffd23f' },
  { id: 'shoe-allstar', cat: 'shoes', name: 'Tênis de lona', price: 60, style: 'canvas', c1: '#e8434b', c2: '#f4f1ec' },
  { id: 'shoe-runner', cat: 'shoes', name: 'Tênis de corrida', price: 70, style: 'sneaker', c1: '#3de0f5', c2: '#26232b' },
  { id: 'shoe-boots', cat: 'shoes', name: 'Bota', price: 80, style: 'boot', c1: '#7a4a2b' },
  // chapéus
  { id: 'hat-cap-red', cat: 'hat', name: 'Boné vermelho', price: 40, style: 'cap', c1: '#e8434b' },
  { id: 'hat-cap-back', cat: 'hat', name: 'Boné pra trás', price: 50, style: 'capback', c1: '#2f6fe0' },
  { id: 'hat-beanie', cat: 'hat', name: 'Gorro', price: 45, style: 'beanie', c1: '#ffc93c' },
  { id: 'hat-bucket', cat: 'hat', name: 'Chapéu bucket', price: 60, style: 'bucket', c1: '#9fd36b' },
  { id: 'hat-straw', cat: 'hat', name: 'Chapéu de palha', price: 70, style: 'straw', c1: '#e7c77b' },
  // acessórios
  { id: 'acc-glasses', cat: 'acc', name: 'Óculos redondos', price: 40, style: 'glasses', c1: '#26232b' },
  { id: 'acc-shades', cat: 'acc', name: 'Óculos escuros', price: 60, style: 'shades', c1: '#1b1b1f' },
  { id: 'acc-necklace', cat: 'acc', name: 'Corrente', price: 35, style: 'necklace', c1: '#ffd23f' },
  { id: 'acc-headphones', cat: 'acc', name: 'Fone de ouvido', price: 90, style: 'headphones', c1: '#ff4f9a' },
  { id: 'acc-mic', cat: 'acc', name: 'Microfone de mão', price: 120, style: 'mic', c1: '#c9c9d1' },
];

export const itemById = (id: string | null | undefined) => (id ? ITEMS.find((i) => i.id === id) : undefined);
export const itemsOf = (cat: Category) => ITEMS.filter((i) => i.cat === cat);
export const NONE_ALLOWED: Category[] = ['hat', 'acc'];

export function lookValue(look: Look, cat: Category): string | null {
  switch (cat) {
    case 'skin': return ITEMS.find((i) => i.cat === 'skin' && i.c1 === look.skin)?.id ?? null;
    case 'hairColor': return ITEMS.find((i) => i.cat === 'hairColor' && i.c1 === look.hairColor)?.id ?? null;
    default: return (look as unknown as Record<string, string | null>)[cat];
  }
}

export function withItem(look: Look, item: Item | null, cat: Category): Look {
  if (!item) return { ...look, [cat]: null };
  if (cat === 'skin') return { ...look, skin: item.c1! };
  if (cat === 'hairColor') return { ...look, hairColor: item.c1! };
  return { ...look, [cat]: item.id };
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Visual aleatório só com peças grátis (para jogadores novos). */
export function randomLook(): Look {
  const free = (cat: Category) => ITEMS.filter((i) => i.cat === cat && i.price === 0);
  return {
    skin: pick(SKINS),
    hair: pick(free('hair')).id,
    hairColor: pick(HAIR_COLORS.slice(0, 6))[0],
    face: pick(free('face')).id,
    top: pick(free('top')).id,
    bottom: pick(free('bottom')).id,
    shoes: 'shoe-white',
    hat: null,
    acc: null,
  };
}

// ---------------------------------------------------------------- moedas e guarda-roupa

export interface Wallet { coins: number; owned: string[] }
const WALLET_KEY = 'imita.wallets.v1';
export const START_COINS = 60;

function readAll(): Record<string, Wallet> {
  try { return JSON.parse(localStorage.getItem(WALLET_KEY) || '{}'); } catch { return {}; }
}
function writeAll(w: Record<string, Wallet>) {
  try { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); } catch { /* ok */ }
}

export function getWallet(pid: string): Wallet {
  return readAll()[pid] || { coins: START_COINS, owned: [] };
}
export function owns(w: Wallet, item: Item) { return item.price === 0 || w.owned.includes(item.id); }

export function buy(pid: string, item: Item): Wallet | null {
  const all = readAll();
  const w = all[pid] || { coins: START_COINS, owned: [] };
  if (owns(w, item) || w.coins < item.price) return null;
  const next = { coins: w.coins - item.price, owned: [...w.owned, item.id] };
  all[pid] = next;
  writeAll(all);
  return next;
}

export function addCoins(pid: string, amount: number): Wallet {
  const all = readAll();
  const w = all[pid] || { coins: START_COINS, owned: [] };
  const next = { ...w, coins: Math.max(0, w.coins + amount) };
  all[pid] = next;
  writeAll(all);
  return next;
}

/** Moedas ganhas no fim da partida: pontos/10 + bônus de colocação + participação. */
export function rewardFor(totalPoints: number, place: number): number {
  const bonus = place === 0 ? 30 : place === 1 ? 15 : place === 2 ? 8 : 0;
  return Math.round(totalPoints / 10) + bonus + 5;
}
