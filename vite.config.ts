import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// WEB_PUBLIC=1: build para o site público (GitHub Pages) — sem os pacotes da comunidade.
const webPublic = process.env.WEB_PUBLIC === '1';

function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'imita-pwa',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      if (webPublic) fs.rmSync(path.join(outDir, 'packs'), { recursive: true, force: true });
      const files: string[] = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else files.push(path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const list = files.filter((f) => f !== 'sw.js' && !f.startsWith('packs/') && !f.endsWith('.map') && !f.endsWith('.woff'));
      const version = crypto.createHash('sha1').update(list.join('|')).update(fs.readFileSync(path.join(outDir, 'index.html'))).digest('hex').slice(0, 10);
      const sw = fs.readFileSync('scripts/sw-template.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(['./', ...list]));
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pwa()],
  build: { outDir: 'dist', target: 'es2020' },
});
