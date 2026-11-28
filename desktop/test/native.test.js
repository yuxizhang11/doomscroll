'use strict';
// Automatische Kopplung: Manifeste, Registry-Pfade, Startdatei, Host-Protokoll, Einrichtung und Browser-Erkennung.
// Die Registry und echte Browser werden hier nicht angefasst (das macht die Ende-zu-Ende-Prüfung mit Playwright-Chromium).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PassThrough } = require('node:stream');
const nm = require('../src/core/native-messaging');
const nativeSetup = require('../src/native-setup');
const browsers = require('../src/core/browsers');
const host = require('../native-host/host');

const TOKEN = 'c'.repeat(64);
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));

// ---------- Manifeste und IDs ----------

test('Erweiterungs-ID: aus dem Schlüssel im Manifest abgeleitet und fest in der App', () => {
  assert.equal(manifest.key, nm.EXTENSION_KEY);
  assert.equal(nm.extensionIdFromKey(manifest.key), nm.EXTENSION_ID);
  assert.match(nm.EXTENSION_ID, /^[a-p]{32}$/);
  assert.equal(manifest.browser_specific_settings.gecko.id, nm.GECKO_ID);
  assert.ok(manifest.permissions.includes('nativeMessaging'));
});

test('Host-Manifest: nur genau diese Erweiterung ist erlaubt', () => {
  const chromium = nm.hostManifest('chromium', 'C:\\x\\host.cmd');
  assert.deepEqual(chromium.allowed_origins, [`chrome-extension://${nm.EXTENSION_ID}/`]);
  assert.equal(chromium.allowed_extensions, undefined);
  const firefox = nm.hostManifest('firefox', 'C:\\x\\host.cmd');
  assert.deepEqual(firefox.allowed_extensions, ['doomscroll-blocker@doomscroll.local']);
  assert.equal(firefox.allowed_origins, undefined);
  for (const m of [chromium, firefox]) {
    assert.equal(m.type, 'stdio');
    assert.equal(m.path, 'C:\\x\\host.cmd');
    assert.match(m.name, /^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'gültiger Host-Name');
    assert.equal(m.name, nm.HOST_NAME);
  }
});

test('Registry: fünf Einträge unter HKCU, Chromium-Manifest für Chromium-Browser, Firefox-Manifest für Firefox', () => {
  const entries = nm.registryEntries({ chromium: 'C:\\c.json', firefox: 'C:\\f.json' });
  assert.deepEqual(entries.map((e) => e.browser), ['chrome', 'edge', 'brave', 'chromium', 'firefox']);
  for (const e of entries) assert.ok(e.key.startsWith('HKCU\\Software\\') && e.key.endsWith(`\\NativeMessagingHosts\\${nm.HOST_NAME}`), e.key);
  assert.equal(entries.find((e) => e.browser === 'chrome').key, 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\de.doomscroll.desktop');
  assert.equal(entries.find((e) => e.browser === 'edge').key, 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\de.doomscroll.desktop');
  assert.equal(entries.find((e) => e.browser === 'brave').key, 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\de.doomscroll.desktop');
  assert.equal(entries.find((e) => e.browser === 'chromium').key, 'HKCU\\Software\\Chromium\\NativeMessagingHosts\\de.doomscroll.desktop');
  assert.equal(entries.find((e) => e.browser === 'firefox').key, 'HKCU\\Software\\Mozilla\\NativeMessagingHosts\\de.doomscroll.desktop');
  assert.deepEqual(entries.map((e) => e.value), ['C:\\c.json', 'C:\\c.json', 'C:\\c.json', 'C:\\c.json', 'C:\\f.json']);
});

test('Installer: die Deinstallation entfernt genau die Schlüssel, die die App anlegt', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'installer', 'installer.nsh'), 'utf8');
  const removed = [...nsh.matchAll(/DeleteRegKey HKCU "([^"]+)"/g)].map((m) => m[1]).sort();
  const written = nm.registryEntries({ chromium: 'x', firefox: 'y' }).map((e) => e.key.replace(/^HKCU\\/, '')).sort();
  assert.deepEqual(removed, written);
  assert.match(nsh, /\$\{ifNot\} \$\{isUpdated\}[\s\S]*DeleteRegKey[\s\S]*\$\{endIf\}/, 'bei einem Update bleiben die Einträge stehen');
});

test('Startdatei des Hosts: Electron als Node, Pfade mit Leerzeichen und %, keine Ausgabe', () => {
  const text = nm.hostCmd({ exe: 'C:\\Program Files\\Doomscroll Desktop\\Doomscroll Desktop.exe', script: 'C:\\r\\native-host\\host.js', pairingFile: 'C:\\Users\\a%b\\pairing.json' });
  const lines = text.split('\r\n');
  assert.equal(lines[0], '@echo off', 'jede Ausgabe würde das Protokoll stören');
  assert.equal(lines[1], 'set ELECTRON_RUN_AS_NODE=1');
  assert.equal(lines[2], 'set "DOOMSCROLL_PAIRING=C:\\Users\\a%%b\\pairing.json"');
  assert.equal(lines[3], '"C:\\Program Files\\Doomscroll Desktop\\Doomscroll Desktop.exe" "C:\\r\\native-host\\host.js"');
  for (const bad of ['C:\\a"b', 'C:\\a\nb', 5]) assert.throws(() => nm.hostCmd({ exe: bad, script: 's', pairingFile: 'p' }));
});

test('Pfade: Erweiterungsordner, Firefox-Fassung und Host gepackt neben app.asar, sonst im Projekt', () => {
  const packed = { isPackaged: true, resourcesPath: 'C:\\App\\resources', appDir: 'C:\\App\\resources\\app.asar' };
  assert.equal(nm.extensionDir(packed), path.join('C:\\App\\resources', 'extension'));
  assert.equal(nm.hostScript(packed), path.join('C:\\App\\resources', 'native-host', 'host.js'));
  const dev = { isPackaged: false, resourcesPath: 'C:\\electron\\resources', appDir: 'C:\\proj\\desktop' };
  assert.equal(nm.extensionDir(dev), path.join('C:\\proj\\desktop', 'extension'));
  assert.equal(nm.hostScript(dev), path.join('C:\\proj\\desktop', 'native-host', 'host.js'));
  assert.ok(fs.existsSync(nm.extensionDir({ isPackaged: false, appDir: path.join(__dirname, '..') })), 'Entwicklungsordner der Erweiterung existiert');
  assert.ok(fs.existsSync(nm.hostScript({ isPackaged: false, appDir: path.join(__dirname, '..') })));
  const pkg = require('../package.json');
  assert.deepEqual(pkg.build.extraResources.map((r) => r.to).sort(), ['extension', 'firefox', 'native-host'], 'Erweiterung, signierte Firefox-Fassung und Host werden mitgepackt');
});

// ---------- Host-Protokoll ----------

test('Host-Protokoll: Rahmen mit 4 Byte Länge, auch zerstückelt und mehrere hintereinander', () => {
  const a = host.encode({ type: 'pair' });
  assert.equal(a.readUInt32LE(0), a.length - 4);
  assert.deepEqual(host.decode(a), { messages: [{ type: 'pair' }], rest: Buffer.alloc(0), error: null });
  const part = host.decode(a.subarray(0, a.length - 2));
  assert.deepEqual([part.messages, part.error], [[], null]);
  assert.equal(host.decode(Buffer.concat([a, a])).messages.length, 2);
  assert.equal(host.decode(a.subarray(0, 3)).messages.length, 0, 'weniger als der Längenkopf');
});

test('Host-Protokoll: zu große und kaputte Rahmen werden abgelehnt', () => {
  const big = Buffer.alloc(4);
  big.writeUInt32LE(host.MAX_MESSAGE + 1);
  assert.equal(host.decode(big).error, 'size');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(3);
  assert.equal(host.decode(Buffer.concat([head, Buffer.from('{x}')])).error, 'json');
});

test('Host: antwortet nur auf „pair“ und nur mit Code und Port', () => {
  const read = () => ({ token: TOKEN, port: 47615, extra: 'wird nicht weitergegeben', other: 1 });
  assert.deepEqual(host.answer({ type: 'pair' }, read), { ok: true, token: TOKEN, port: 47615 });
  for (const m of [null, {}, { type: 'other' }, { type: 'pair2' }, 'pair', []]) assert.deepEqual(host.answer(m, read), { ok: false, error: 'unknown' });
  for (const bad of [{ token: 'kurz', port: 47615 }, { token: TOKEN.toUpperCase(), port: 47615 }, { token: TOKEN, port: 80 }, { token: TOKEN, port: '47615' }, { token: TOKEN, port: 70000 }, {}]) {
    assert.deepEqual(host.answer({ type: 'pair' }, () => bad), { ok: false, error: 'pairing' }, JSON.stringify(bad));
  }
  assert.deepEqual(host.answer({ type: 'pair' }, () => { throw new Error('keine Datei'); }), { ok: false, error: 'pairing' });
});

test('Host: Schleife über Ströme, liest nur die Kopplungsdatei und endet mit dem Eingang', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-host-'));
  try {
    const file = path.join(dir, 'pairing.json');
    fs.writeFileSync(file, JSON.stringify({ token: TOKEN, port: 47620 }));
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const ended = new Promise((resolve) => host.run(stdin, stdout, file, resolve));
    const chunks = [];
    stdout.on('data', (c) => chunks.push(c));
    const frame = host.encode({ type: 'pair' });
    stdin.write(frame.subarray(0, 2)); // zerstückelt
    stdin.write(frame.subarray(2));
    stdin.write(host.encode({ type: 'evil', cmd: 'calc' }));
    await new Promise((r) => setTimeout(r, 50));
    stdin.end();
    await ended;
    const out = host.decode(Buffer.concat(chunks));
    assert.deepEqual(out.messages, [{ ok: true, token: TOKEN, port: 47620 }, { ok: false, error: 'unknown' }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Schickt eine Nachricht an ein Hostprogramm (Prozess) und gibt die erste Antwort zurück. */
function ask(command, args, env, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    let out = Buffer.alloc(0);
    child.stdout.on('data', (c) => {
      out = Buffer.concat([out, c]);
      const d = host.decode(out);
      if (d.messages.length > 0) { child.stdin.end(); resolve({ answer: d.messages[0], child }); }
    });
    child.on('error', reject);
    setTimeout(() => { child.kill(); reject(new Error('Zeitüberschreitung')); }, 15000).unref();
    child.stdin.write(host.encode(message));
  });
}

test('Host als echter Prozess: Antwort über stdin und stdout, Ende bei geschlossenem Eingang', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-proc-'));
  try {
    const file = path.join(dir, 'pairing.json');
    fs.writeFileSync(file, JSON.stringify({ token: TOKEN, port: 47621 }));
    const script = path.join(__dirname, '..', 'native-host', 'host.js');
    const { answer, child } = await ask(process.execPath, [script], { DOOMSCROLL_PAIRING: file }, { type: 'pair' });
    assert.deepEqual(answer, { ok: true, token: TOKEN, port: 47621 });
    const code = await new Promise((r) => child.on('exit', r));
    assert.equal(code, 0);
    const none = spawn(process.execPath, [script], { env: { ...process.env, DOOMSCROLL_PAIRING: '' }, stdio: 'ignore' });
    assert.equal(await new Promise((r) => none.on('exit', r)), 1, 'ohne Kopplungsdatei startet der Host nicht');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Einrichtung ----------

test('Einrichtung: schreibt Dateien und Registry-Einträge, ändert beim zweiten Lauf nichts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-setup-'));
  try {
    const calls = [];
    const opts = { dir, exe: 'C:\\App\\Doomscroll Desktop.exe', script: 'C:\\App\\resources\\native-host\\host.js', token: TOKEN, port: 47615, reg: async (key, value) => { calls.push([key, value]); } };
    assert.deepEqual(await nativeSetup.install(opts), []);
    const f = nm.files(dir);
    assert.equal(JSON.parse(fs.readFileSync(f.chromium, 'utf8')).path, f.cmd);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.firefox, 'utf8')).allowed_extensions, [nm.GECKO_ID]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.pairing, 'utf8')), { token: TOKEN, port: 47615 });
    assert.match(fs.readFileSync(f.cmd, 'utf8'), /Doomscroll Desktop\.exe" "C:\\App\\resources\\native-host\\host\.js"/);
    assert.deepEqual(calls.map(([k]) => k), nm.registryEntries({ chromium: f.chromium, firefox: f.firefox }).map((e) => e.key));
    const before = fs.statSync(f.pairing).mtimeMs;
    await new Promise((r) => setTimeout(r, 30));
    await nativeSetup.install(opts);
    assert.equal(fs.statSync(f.pairing).mtimeMs, before, 'unveränderte Dateien werden nicht neu geschrieben');
    // anderer Installationsort (Neuinstallation): Startdatei folgt der neuen Exe
    await nativeSetup.install({ ...opts, exe: 'D:\\Neu\\Doomscroll Desktop.exe' });
    assert.match(fs.readFileSync(f.cmd, 'utf8'), /D:\\Neu\\Doomscroll Desktop\.exe/);
    // Registry-Fehler eines Browsers hindern die anderen nicht
    const errors = await nativeSetup.install({ ...opts, reg: async (key) => { if (key.includes('Edge')) throw Object.assign(new Error('x'), { code: 5 }); } });
    assert.deepEqual(errors, ['edge: 5']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Einrichtung: die erzeugte host.cmd startet den Host (nur Windows)', { skip: process.platform !== 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc cmd '));
  try {
    const script = path.join(__dirname, '..', 'native-host', 'host.js');
    await nativeSetup.install({ dir, exe: process.execPath, script, token: TOKEN, port: 47622, reg: async () => {} });
    const { answer, child } = await ask('cmd.exe', ['/d', '/c', nm.files(dir).cmd, `chrome-extension://${nm.EXTENSION_ID}/`], {}, { type: 'pair' });
    assert.deepEqual(answer, { ok: true, token: TOKEN, port: 47622 });
    await new Promise((r) => child.on('exit', r)); // cmd liest die Datei bis zum Ende, erst danach aufräumen
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Browser ----------

test('Browser-Erkennung: Standardpfade, dann Registry „App Paths“; nur gefundene Browser', async () => {
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
  const existing = new Set([
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'D:\\Programme\\Brave\\brave.exe',
  ]);
  const lookups = [];
  const appPath = async (exe) => { lookups.push(exe); return exe === 'brave.exe' ? 'D:\\Programme\\Brave\\brave.exe' : exe === 'firefox.exe' ? 'C:\\weg\\firefox.exe' : null; };
  const found = await browsers.detectBrowsers({ env, exists: (p) => existing.has(p), appPath });
  assert.deepEqual(found.map((b) => [b.id, b.exe]), [
    ['chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    ['edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
    ['brave', 'D:\\Programme\\Brave\\brave.exe'],
  ]);
  assert.deepEqual(lookups, ['brave.exe', 'firefox.exe'], 'die Registry wird nur gefragt, wenn kein Standardpfad passt; ein Eintrag ohne Datei zählt nicht');
  assert.deepEqual(await browsers.detectBrowsers({ env: {}, exists: () => false, appPath: async () => null }), []);
});

test('Browser-Adressen: Erweiterungsseite und Detailseite mit der festen ID, Firefox ohne Detailseite', () => {
  const id = nm.EXTENSION_ID;
  assert.equal(browsers.pageUrl('chrome', 'extensions', id), 'chrome://extensions');
  assert.equal(browsers.pageUrl('edge', 'extensions', id), 'edge://extensions');
  assert.equal(browsers.pageUrl('brave', 'extensions', id), 'brave://extensions');
  assert.equal(browsers.pageUrl('chrome', 'details', id), `chrome://extensions/?id=${id}`);
  assert.equal(browsers.pageUrl('edge', 'details', id), `edge://extensions/?id=${id}`);
  assert.equal(browsers.pageUrl('firefox', 'extensions', id), 'about:debugging#/runtime/this-firefox');
  assert.equal(browsers.pageUrl('firefox', 'details', id), null);
  for (const bad of [['unbekannt', 'extensions'], ['chrome', 'https://evil'], ['chrome', undefined], ['../chrome', 'extensions']]) assert.equal(browsers.pageUrl(...bad, id), null, JSON.stringify(bad));
});

test('Browser-Status: verbunden, fehlt, nicht gestartet, private Fenster', () => {
  const now = 1_000_000;
  const clients = new Map([
    ['a', { browser: 'chromium', label: 'Edge', seen: now - 1000, incognitoAllowed: false }],
    ['b', { browser: 'chromium', label: 'Chrome oder Brave', seen: now - 2000, incognitoAllowed: true }],
    ['c', { browser: 'firefox', label: 'Firefox', seen: now - 60_000, incognitoAllowed: true }], // veraltet
  ]);
  const st = (id, running) => browsers.browserStatus(id, { clients, running, now });
  assert.deepEqual(st('edge', new Set()), { state: 'ok', incognito: 'denied', shared: false });
  assert.deepEqual(st('chrome', new Set()), { state: 'ok', incognito: 'ok', shared: true });
  assert.equal(st('brave', null).shared, true);
  assert.deepEqual(st('firefox', new Set(['firefox.exe'])), { state: 'missing', incognito: 'unknown', shared: false });
  assert.equal(st('firefox', new Set(['chrome.exe'])).state, 'idle');
  assert.equal(st('firefox', null).state, 'unknown');
  const edgeOnly = new Map([['a', { browser: 'chromium', label: 'Edge', seen: now, incognitoAllowed: true }]]);
  assert.equal(browsers.browserStatus('chrome', { clients: edgeOnly, running: new Set(['chrome.exe']), now }).state, 'missing', 'Edge verbunden sagt nichts über Chrome');
});
