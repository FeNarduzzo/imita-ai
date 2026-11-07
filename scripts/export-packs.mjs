// Gera release/ImitaAi-pacotes.zip com os pacotes de public/packs, para importar no app
// (iPhone/Android/navegador → "Importar pacotes").
import yazl from 'yazl';
import fs from 'node:fs';
import path from 'node:path';

const root = 'public/packs';
if (!fs.existsSync(path.join(root, 'index.json'))) {
  console.error('Rode "npm run import-packs" antes.');
  process.exit(1);
}
fs.mkdirSync('release', { recursive: true });
const out = new yazl.ZipFile();
const dest = 'release/ImitaAi-pacotes.zip';
const done = new Promise((r) => out.outputStream.pipe(fs.createWriteStream(dest)).on('close', r));
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else out.addFile(p, path.relative('public', p).split(path.sep).join('/'), { compress: p.endsWith('.json') });
  }
};
walk(root);
out.end();
await done;
console.log(`✓ ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
