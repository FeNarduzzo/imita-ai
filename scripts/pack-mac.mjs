// Monta o app de macOS a partir do Windows/Linux: pega o Electron oficial para darwin,
// coloca o app.asar do jogo dentro e regrava o zip preservando os links simbólicos.
// Uso: npm run dist:win (gera o app.asar) && node scripts/pack-mac.mjs
import { downloadArtifact } from '@electron/get';
import yauzl from 'yauzl';
import yazl from 'yazl';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync('node_modules/electron/package.json', 'utf8')).version;
const APP = 'Imita Ai.app';
const ASAR = 'release/win-unpacked/resources/app.asar';
const ICNS = fs.readFileSync('build/icon.icns');
const MIC = pkg.build.mac.extendInfo.NSMicrophoneUsageDescription;

if (!fs.existsSync(ASAR)) {
  console.error('Rode "npm run dist:win" antes: ele gera o app.asar.');
  process.exit(1);
}

const README = `Imita Aí! para macOS (${'${ARCH}'})

1. Descompacte e arraste "Imita Ai.app" para a pasta Aplicativos.
2. Como o app não é assinado pela Apple, abra o Terminal e rode UMA vez:

   xattr -cr "/Applications/Imita Ai.app"
   codesign --force --deep -s - "/Applications/Imita Ai.app"

3. Abra o app. Na primeira partida o macOS pede acesso ao microfone: permita.
`;

function patchPlist(xml) {
  const set = (key, value) => {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
    if (re.test(xml)) xml = xml.replace(re, `$1${value}$2`);
    else xml = xml.replace(/<dict>/, `<dict>\n\t<key>${key}</key>\n\t<string>${value}</string>`);
  };
  set('CFBundleDisplayName', 'Imita Aí!');
  set('CFBundleName', 'Imita Aí');
  set('CFBundleIdentifier', pkg.build.appId);
  set('CFBundleShortVersionString', pkg.version);
  set('CFBundleVersion', pkg.version);
  set('NSMicrophoneUsageDescription', MIC);
  set('LSApplicationCategoryType', 'public.app-category.games');
  return xml;
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on('data', (b) => parts.push(b));
    stream.on('end', () => resolve(Buffer.concat(parts)));
    stream.on('error', reject);
  });
}

async function build(arch) {
  const src = await downloadArtifact({ version: electronVersion, platform: 'darwin', arch, artifactName: 'electron' });
  const dest = `release/ImitaAi-${pkg.version}-mac-${arch}.zip`;
  const out = new yazl.ZipFile();
  const done = new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    ws.on('close', resolve);
    ws.on('error', reject);
    out.outputStream.pipe(ws);
  });
  let links = 0;
  let plistPatched = false;

  await new Promise((resolve, reject) => {
    yauzl.open(src, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', async (entry) => {
        try {
          if (!entry.fileName.startsWith('Electron.app/')) return zip.readEntry();
          const name = APP + entry.fileName.slice('Electron.app'.length);
          const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
          const mtime = entry.getLastModDate();
          if (name === `${APP}/Contents/Resources/default_app.asar`) return zip.readEntry();
          if (name.endsWith('/')) {
            out.addEmptyDirectory(name, { mode: mode || 0o40755, mtime });
            return zip.readEntry();
          }
          const isLink = (mode & 0o170000) === 0o120000;
          if (isLink) links++;
          let data = await new Promise((res, rej) => zip.openReadStream(entry, (e, s) => (e ? rej(e) : readAll(s).then(res, rej))));
          if (name === `${APP}/Contents/Info.plist`) { data = Buffer.from(patchPlist(data.toString('utf8')), 'utf8'); plistPatched = true; }
          if (name === `${APP}/Contents/Resources/electron.icns`) data = ICNS;
          out.addBuffer(data, name, { mode: mode || 0o100644, mtime, compress: !isLink });
          zip.readEntry();
        } catch (e) {
          reject(e);
        }
      });
      zip.readEntry();
    });
  });

  out.addFile(ASAR, `${APP}/Contents/Resources/app.asar`, { mode: 0o100644 });
  out.addBuffer(Buffer.from(README.replace('${ARCH}', arch === 'arm64' ? 'Apple Silicon M1/M2/M3/M4' : 'Intel'), 'utf8'), 'LEIA-ME.txt', { mode: 0o100644 });
  out.end();
  await done;
  if (!plistPatched) throw new Error('Info.plist não encontrado');
  console.log(`✓ ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB, ${links} links simbólicos preservados)`);
}

for (const arch of ['arm64', 'x64']) await build(arch);
