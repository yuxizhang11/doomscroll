'use strict';
// Echter Browser-Test der Sperrseite: Porno-Adresse öffnen, die Erweiterung leitet auf die Sperrseite um, danach darf
// die Sperrseite NICHT erneut gesperrt und neu geladen werden (Schleife). Zählt die Anfragen an /blocked.
//
//   node tools/e2e-sperrseite.js chromium   (Playwright-Chromium, Pfad zu playwright-core und chrome.exe unten)
//   node tools/e2e-sperrseite.js firefox    (Firefox mit leerem Wegwerf-Profil über Marionette, temporäres Add-on)
//
// Eigener Port, eigene Erweiterungskopie und eigenes Profil im Temp-Ordner: weder die installierte App noch die
// Browser des Users werden angefasst. Kein Teil von `npm test`, weil Browser und Playwright gebraucht werden.

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { start } = require('../src/server');
const { Store } = require('../src/core/store');
const { Tracker } = require('../src/core/tracker');

const PORT = 47941;
const STUB_PORT = 47942; // gibt sich als „irgendeine Webseite“ aus; die Adresse enthält „porn“
const TOKEN = 'c'.repeat(64);
const WATCH_MS = 10000;
const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE || 'C:/Claude/mcp/playwright/node_modules/playwright-core';
const CHROME = process.env.CHROME_EXE || 'C:/Users/yuxiz/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const FIREFOX = process.env.FIREFOX_EXE || 'C:/Program Files/Mozilla Firefox/firefox.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kopie der Erweiterung mit festem Port und Code (kein Native Messaging, die App-Daten bleiben unberührt). */
function extensionCopy(dir) {
  fs.cpSync(path.join(__dirname, '..', 'extension'), dir, { recursive: true });
  const file = path.join(dir, 'background.js');
  const seed = `(globalThis.browser ?? globalThis.chrome).storage.local.set({ token: '${TOKEN}', port: ${PORT} });\n`;
  fs.writeFileSync(file, seed + fs.readFileSync(file, 'utf8').replace('const DEFAULT_PORT = 47615;', `const DEFAULT_PORT = ${PORT};`));
}

async function harness() {
  const tracker = new Tracker(new Store({}));
  const counts = { blocked: 0, heartbeats: 0 };
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: (c, i, t) => tracker.report(c, i, t) });
  server.prependListener('request', (req) => {
    if (req.url.startsWith('/blocked')) counts.blocked++;
    if (req.url === '/v1/heartbeat') counts.heartbeats++;
  });
  const stub = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<title>stub</title><h1>stub</h1>'); });
  await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));
  return { counts, close: () => { server.close(); stub.close(); } };
}

async function chromiumRun(extDir, profile) {
  const { chromium } = require(PLAYWRIGHT);
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false, executablePath: CHROME, viewport: { width: 900, height: 600 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--headless=new', '--window-position=-3000,0'],
  });
  try {
    if (!ctx.serviceWorkers()[0]) await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const page = await ctx.newPage();
    return { go: (url) => page.goto(url).catch(() => {}), url: async () => page.url(), text: async () => page.locator('body').innerText().catch(() => ''), done: () => ctx.close() };
  } catch (err) {
    await ctx.close();
    throw err;
  }
}

function marionette(port) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    let id = 0;
    let greeted = false;
    const wait = new Map();
    s.setEncoding('utf8');
    const cmd = (name, params = {}) => {
      const i = ++id;
      const j = JSON.stringify([0, i, name, params]);
      s.write(`${j.length}:${j}`);
      return new Promise((res, rej) => wait.set(i, [res, rej]));
    };
    s.on('data', (d) => {
      buf += d;
      for (;;) {
        const m = /^(\d+):/.exec(buf);
        if (!m) return;
        const n = Number(m[1]);
        if (buf.length < m[0].length + n) return;
        const msg = JSON.parse(buf.slice(m[0].length, m[0].length + n));
        buf = buf.slice(m[0].length + n);
        if (!greeted) { greeted = true; resolve({ cmd, close: () => s.destroy() }); }
        else if (Array.isArray(msg) && wait.has(msg[1])) {
          const [res, rej] = wait.get(msg[1]);
          wait.delete(msg[1]);
          if (msg[2]) rej(new Error(JSON.stringify(msg[2]))); else res(msg[3]);
        }
      }
    });
    s.on('error', reject);
  });
}

async function firefoxRun(extDir, profile) {
  const mPort = 47943;
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'user.js'), `user_pref("marionette.port", ${mPort});\nuser_pref("browser.shell.checkDefaultBrowser", false);\n`);
  const proc = spawn(FIREFOX, ['-no-remote', '-profile', profile, '-marionette', '-headless', 'about:blank'], { stdio: 'ignore', env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } });
  let m;
  for (let i = 0; i < 60 && !m; i++) { await sleep(500); m = await marionette(mPort).catch(() => null); }
  if (!m) { proc.kill(); throw new Error('Firefox startet nicht'); }
  try {
    await m.cmd('WebDriver:NewSession', { capabilities: { pageLoadStrategy: 'none' } });
    await m.cmd('Marionette:SetContext', { value: 'chrome' });
    await m.cmd('Addon:Install', { path: extDir.split('/').join('\\'), temporary: true });
    await m.cmd('Marionette:SetContext', { value: 'content' });
    const hs = await m.cmd('WebDriver:GetWindowHandles');
    await m.cmd('WebDriver:SwitchToWindow', { handle: hs[hs.length - 1] });
    return {
      go: (url) => m.cmd('WebDriver:Navigate', { url }).catch(() => {}),
      url: async () => (await m.cmd('WebDriver:GetCurrentURL')).value,
      // Nur ASCII zurückgeben: die Längenangabe im Marionette-Rahmen zählt Bytes, Umlaute brächten den einfachen Leser aus dem Takt.
      text: async () => Promise.race([
        m.cmd('WebDriver:ExecuteScript', { script: 'return document.readyState + (document.body && /gesperrt/.test(document.title) ? " gesperrt" : "")', args: [] }).then((r) => r.value ?? ''),
        sleep(3000).then(() => '(keine Antwort der Seite)'),
      ]).catch(() => ''),
      done: async () => { m.close(); proc.kill(); },
    };
  } catch (err) {
    m.close();
    proc.kill();
    throw err;
  }
}

(async () => {
  const which = process.argv[2];
  if (!['chromium', 'firefox'].includes(which)) throw new Error('Aufruf: node tools/e2e-sperrseite.js chromium|firefox');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doomscroll-e2e-'));
  const h = await harness();
  let browser;
  let ok = false;
  try {
    const extDir = path.join(tmp, 'ext').split('\\').join('/');
    extensionCopy(extDir);
    browser = await (which === 'chromium' ? chromiumRun : firefoxRun)(extDir, path.join(tmp, 'profile'));
    await sleep(3000); // Erweiterung startet und meldet sich einmal
    await browser.go(`http://127.0.0.1:${STUB_PORT}/search?q=porn`);
    await sleep(2500);
    const first = { url: await browser.url(), blocked: h.counts.blocked };
    await sleep(WATCH_MS);
    const last = { url: await browser.url(), blocked: h.counts.blocked, text: (await browser.text()).replace(/\s+/g, ' ').slice(0, 80) };
    console.log(which, JSON.stringify({ first, last, heartbeats: h.counts.heartbeats }));
    ok = first.url.startsWith(`http://127.0.0.1:${PORT}/blocked?kind=porn`) && last.url === first.url
      && first.blocked === 1 && last.blocked === 1 && last.text.includes('gesperrt');
    console.log(ok ? 'BESTANDEN: Sperrseite bleibt stehen, genau 1 Anfrage' : 'FEHLGESCHLAGEN: Sperrseite wird neu geladen oder fehlt');
  } finally {
    await browser?.done();
    h.close();
    await sleep(500);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FEHLER', e.message); process.exit(2); });
