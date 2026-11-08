#!/usr/bin/env node
// Gera o SQL que copia o catálogo da loja (ITEMS em src/game/character.ts) para a tabela
// public.shop_items do Supabase. O servidor usa esses preços para validar cada compra.
//
// Uso: npm run shop-sql   →   cria supabase/seed/shop_items.sql (cole no SQL Editor, ou
// peça para o Claude aplicar). Rode de novo sempre que mudar roupas ou preços.
import { rolldown } from 'rolldown';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imita-shop-'));
const entry = path.join(tmp, 'entry.ts');
await fs.writeFile(entry, `export { ITEMS } from ${JSON.stringify(path.join(root, 'src/game/character.ts').split(path.sep).join('/'))};\n`);
const bundle = await rolldown({ input: entry, platform: 'node' });
const out = path.join(tmp, 'entry.mjs');
await bundle.write({ file: out, format: 'esm' });
const { ITEMS } = await import(pathToFileURL(out).href);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = ITEMS.map((i) => {
  const exclusive = i.exclusive === 'title' || i.exclusive === 'code' ? q(i.exclusive) : 'null';
  const minLevel = Number.isInteger(i.minLevel) ? i.minLevel : 'null';
  return `  (${q(i.id)}, ${Math.max(0, Math.round(i.price || 0))}, ${exclusive}, ${minLevel}, true)`;
});
const ids = ITEMS.map((i) => q(i.id)).join(', ');
const sql = `-- Gerado por scripts/shop-sql.mjs a partir de src/game/character.ts (${ITEMS.length} itens). Não edite à mão.
insert into public.shop_items (id, price, exclusive, min_level, active) values
${rows.join(',\n')}
on conflict (id) do update set price = excluded.price, exclusive = excluded.exclusive, min_level = excluded.min_level, active = true;
-- Itens que saíram do jogo ficam inativos (quem já tem continua tendo).
update public.shop_items set active = false where id not in (${ids});
`;
await fs.mkdir(path.join(root, 'supabase/seed'), { recursive: true });
await fs.writeFile(path.join(root, 'supabase/seed/shop_items.sql'), sql);
await fs.rm(tmp, { recursive: true, force: true });
console.log(`✓ supabase/seed/shop_items.sql (${ITEMS.length} itens, ${ITEMS.filter((i) => i.price > 0).length} pagos)`);
