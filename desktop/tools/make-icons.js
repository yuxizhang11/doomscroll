'use strict';
// Erzeugt alle Logo-Dateien aus assets/logo.svg (dem Logo der Handy-App): `npx electron tools/make-icons.js`.
// Gerendert wird mit dem Chromium von Electron, es braucht keine weitere Abhängigkeit. Kleine Größen (bis 32 px) zeigen
// einen engeren Ausschnitt (66 statt 72 von 108, die „sichere Zone“ der Launcher-Maske), damit das Symbol nicht untergeht.

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'assets', 'logo.svg'), 'utf8');
const SMALL = SVG.replace('viewBox="18 18 72 72"', 'viewBox="21 21 66 66"').replace('<rect x="18" y="18" width="72" height="72" rx="16"', '<rect x="21" y="21" width="66" height="66" rx="14"');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function render(win, size) {
  const svg = size <= 32 ? SMALL : SVG;
  const url = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${size}; c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size}); resolve(c.toDataURL('image/png')); };
    img.onerror = () => reject(new Error('SVG nicht lesbar'));
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
  })`);
  return Buffer.from(url.split(',')[1], 'base64');
}

/** ICO mit PNG-Bildern (ab Windows Vista üblich), Größe 256 steht als 0. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    head[at] = size === 256 ? 0 : size;
    head[at + 1] = size === 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4); // Ebenen
    head.writeUInt16LE(32, at + 6); // Bits je Pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<meta charset=utf-8>');
  const out = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);
  const png = {};
  for (const size of new Set([...ICO_SIZES, 20, 29, 40])) png[size] = await render(win, size);
  out('assets/icon.png', png[256]);
  out('assets/icon.ico', ico(ICO_SIZES.map((size) => ({ size, png: png[size] }))));
  // Tray: Electron wählt je nach Bildschirmskalierung die passende Datei (16 px bei 100 %, 32 px bei 200 %); nativeImage kennt nur diese Endungen.
  out('assets/tray.png', png[16]);
  out('assets/tray@1.25x.png', png[20]);
  out('assets/tray@1.5x.png', png[24]);
  out('assets/tray@1.8x.png', png[29]);
  out('assets/tray@2x.png', png[32]);
  out('assets/tray@2.5x.png', png[40]);
  out('assets/tray@3x.png', png[48]);
  for (const size of [16, 48, 128]) out(`extension/icons/icon-${size}.png`, png[size] ?? (await render(win, size)));
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
