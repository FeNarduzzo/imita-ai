#!/usr/bin/env node
// Importa pacotes de som no formato "theme.json + .wav + imagens" (o mesmo usado
// pelos pacotes do Steam Workshop) para public/packs, convertendo o áudio para
// MP3 mono leve e as imagens para JPG 256px.
//
// Uso: node scripts/import-packs.mjs [pasta-de-origem]
// Sem argumento, usa a pasta do Workshop do Steam no Windows.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'public', 'packs');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const MAX_SEC = 8;

const defaultSrc = 'C:/Program Files (x86)/Steam/steamapps/workshop/content/5053820';
const src = process.argv[2] || defaultSrc;

const slug = (s) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pack';

const tidyName = (s) => {
  let t = String(s || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(sound effect|soundboard link|mp3cut)\b/gi, '').replace(/[🔽]+/gu, '');
  t = t.replace(/\s[A-Za-z0-9]{7}$/, (m) => (/[A-Z]/.test(m) && /[a-z]/.test(m) ? '' : m));
  t = t.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/[\s(,.]+$/, '').trim();
  if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) t += ')';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Som';
};

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function duration(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(stdout) || 0;
}

async function convertAudio(input, output) {
  const trim =
    'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,' +
    'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.08,areverse';
  const filters = [trim, `atrim=0:${MAX_SEC}`, 'loudnorm=I=-16:TP=-1.5:LRA=11'];
  await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-af', filters.join(','), '-ac', '1', '-ar', '44100', '-b:a', '96k', output]);
  let d = await duration(output);
  if (d >= MAX_SEC - 0.05) {
    // Corte com fade-out para não terminar seco.
    const tmp = output.replace(/\.mp3$/, '.tmp.mp3');
    await run(FFMPEG, ['-y', '-v', 'error', '-i', output, '-af', `afade=t=out:st=${MAX_SEC - 0.4}:d=0.4`, '-b:a', '96k', tmp]);
    await fs.rename(tmp, output);
    d = await duration(output);
  }
  return Math.round(d * 100) / 100;
}

async function convertImage(input, output) {
  await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-vf',
    'scale=256:256:force_original_aspect_ratio=increase,crop=256:256', '-frames:v', '1', '-q:v', '4', output]);
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

async function main() {
  if (!(await exists(src))) {
    console.error(`Pasta de origem não encontrada: ${src}`);
    process.exit(1);
  }
  await fs.mkdir(outRoot, { recursive: true });
  const dirs = (await fs.readdir(src, { withFileTypes: true })).filter((d) => d.isDirectory());
  const usedIds = new Set();
  const packs = [];

  for (const dir of dirs) {
    const folder = path.join(src, dir.name);
    const themePath = path.join(folder, 'theme.json');
    if (!(await exists(themePath))) continue;
    const theme = JSON.parse((await fs.readFile(themePath, 'utf8')).replace(/^\uFEFF/, ''));
    let id = slug(theme.id || theme.name || dir.name);
    if (usedIds.has(id)) id = `${id}-${dir.name}`;
    usedIds.add(id);

    const outDir = path.join(outRoot, id);
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    let cover = null;
    if (theme.defaultImage && (await exists(path.join(folder, theme.defaultImage)))) {
      await convertImage(path.join(folder, theme.defaultImage), path.join(outDir, 'cover.jpg'));
      cover = `packs/${id}/cover.jpg`;
    }

    const list = (theme.sounds || []).filter((s) => s.file);
    const sounds = await pool(list, 6, async (s, i) => {
      const n = String(i + 1).padStart(2, '0');
      const input = path.join(folder, s.file);
      if (!(await exists(input))) return null;
      try {
        const dur = await convertAudio(input, path.join(outDir, `snd-${n}.mp3`));
        if (dur < 0.2) return null;
        let image = null;
        if (s.image && (await exists(path.join(folder, s.image)))) {
          await convertImage(path.join(folder, s.image), path.join(outDir, `img-${n}.jpg`));
          image = `packs/${id}/img-${n}.jpg`;
        }
        return { id: `${id}/${n}`, name: tidyName(s.name || s.file.replace(/\.\w+$/, '')), file: `packs/${id}/snd-${n}.mp3`, image, duration: dur };
      } catch (e) {
        console.warn(`  ! falhou ${s.file}: ${e.message.split('\n')[0]}`);
        return null;
      }
    });

    const ok = sounds.filter(Boolean);
    if (!ok.length) { await fs.rm(outDir, { recursive: true, force: true }); continue; }
    packs.push({ id, name: String(theme.name || id).trim(), author: String(theme.author || '').trim(), cover, sounds: ok });
    console.log(`✓ ${theme.name} — ${ok.length} sons`);
  }

  packs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  await fs.writeFile(path.join(outRoot, 'index.json'), JSON.stringify({ version: 1, packs }, null, 1));
  const total = packs.reduce((n, p) => n + p.sounds.length, 0);
  console.log(`\n${packs.length} pacotes, ${total} sons → public/packs/index.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
