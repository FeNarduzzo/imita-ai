// Gera os PNGs de ícone/splash a partir dos SVGs em assets/.
import sharp from 'sharp';
import fs from 'node:fs/promises';

const icon = await fs.readFile('assets/icon.svg');
const fg = await fs.readFile('assets/icon-fg.svg');
await fs.mkdir('build', { recursive: true });

await sharp(icon, { density: 300 }).resize(1024, 1024).png().toFile('assets/icon-only.png');
await sharp(fg, { density: 300 }).resize(1024, 1024).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#231052' } }).png().toFile('assets/icon-background.png');
await sharp(icon, { density: 300 }).resize(1024, 1024).png().toFile('build/icon.png');

const splashIcon = await sharp(fg, { density: 300 }).resize(900, 900).png().toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#150a2e' } })
    .composite([{ input: splashIcon, gravity: 'center' }])
    .png()
    .toFile(`assets/${name}`);
}
console.log('ícones gerados');

// .icns para macOS (entradas PNG)
const types = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
const chunks = [];
for (const [type, size] of types) {
  const png = await sharp(icon, { density: 300 }).resize(size, size).png().toBuffer();
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(png.length + 8, 4);
  chunks.push(head, png);
}
const body = Buffer.concat(chunks);
const header = Buffer.alloc(8);
header.write('icns', 0, 'ascii');
header.writeUInt32BE(body.length + 8, 4);
await fs.writeFile('build/icon.icns', Buffer.concat([header, body]));
console.log('icon.icns gerado');

// Ícones do app web (PWA / iPhone)
await fs.mkdir('public/icons', { recursive: true });
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(icon, { density: 300 }).resize(size, size).png().toFile(`public/icons/${file}`);
}
console.log('ícones web gerados');
