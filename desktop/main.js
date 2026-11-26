'use strict';
// Doomscroll Blocker für Windows: sitzt im Tray, zählt über die Browser-Erweiterung und sperrt bei Limit.
// Fenster nur auf Klick; „Beenden“ im Tray braucht die 20 Zeichen.

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, shell, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) {
  app.setPath('userData', path.join(process.env.DOOMSCROLL_SMOKE_DIR, 'userdata'));
  // Das Testfenster liegt außerhalb des Bildschirms und soll trotzdem gezeichnet werden.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

const { Store, HINTS, HINT_KEYS, THEMES, GLASS, ANIMATIONS, MINUTE, localDay } = require('./src/core/store');
const { APPS, APP_IDS } = require('./src/core/targets');
const { Tracker } = require('./src/core/tracker');
const unlock = require('./src/core/unlock');
const backup = require('./src/core/backup');
const { parseChangelog, isTrustedDownload } = require('./src/core/version');
const { evaluate } = require('./src/core/extension-status');
const persist = require('./src/persist');
const server = require('./src/server');
const updater = require('./src/updater');

const VERSION = require('./package.json').version;
const INDEX = path.join(__dirname, 'src', 'ui', 'index.html');
const INDEX_URL = pathToFileURL(INDEX).href;
const PORT = Number(process.env.DOOMSCROLL_PORT) || server.DEFAULT_PORT;
const STARTED = Date.now();
const MISSING_GRACE_MS = 90_000;

app.setAppUserModelId('com.yuxizhang.doomscroll.desktop');

let store;
let tracker;
let saver;
let tray = null;
let win = null;
let httpServer = null;
let allowQuit = false;
let serverError = null;
let running = null; // laufende Prozessnamen, null = unbekannt
let update = { available: null, checking: false, error: null, offered: null };
const challenges = new Map();
const notifiedProblems = new Set();
let pending = null; // Einstellungen, die auf den Satz warten

// ---------- Hilfen ----------

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

function minutesText(n) {
  return n === 1 ? 'Noch 1 Minute' : `Noch ${n} Minuten`;
}

function applyAutostart() {
  if (SMOKE) return;
  app.setLoginItemSettings({
    openAtLogin: store.autostart,
    path: process.execPath,
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
  });
}

function token() {
  if (typeof store.data.extension_token !== 'string' || store.data.extension_token.length < 32) {
    store.set('extension_token', crypto.randomBytes(32).toString('hex'));
  }
  return store.data.extension_token;
}

function extensionState() {
  return evaluate({ clients: tracker.clients, running, now: Date.now() });
}

function refreshProcesses() {
  if (process.platform !== 'win32') return;
  execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000 }, (err, out) => {
    if (err) return;
    running = new Set(out.split(/\r?\n/).map((l) => /^"([^"]+)"/.exec(l)?.[1]?.toLowerCase()).filter(Boolean));
  });
}

// ---------- Zustand für die Oberfläche ----------

function viewModel() {
  const now = new Date();
  const total = store.totalUsageMs();
  const ext = extensionState();
  const unlockedAll = store.isUnlockedToday(null);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { label: d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''), minutes: Math.floor(store.dayTotalMs(d) / MINUTE), today: i === 6 };
  });
  const changelog = parseChangelog(readChangelog());
  const lastSeen = store.data.last_seen_version;
  const whatsNew = typeof lastSeen === 'string' && lastSeen !== VERSION && store.isOn('hint_whats_new')
    ? changelog.find((e) => e.version === VERSION) ?? null
    : null;
  const popup = update.available && store.isOn('hint_update_popup') && update.offered !== update.available.version;
  return {
    version: VERSION,
    apps: APPS.map((a) => ({
      id: a.id,
      label: a.label,
      enabled: store.isEnabled(a.id),
      usedMin: Math.floor(store.usageMs(a.id) / MINUTE),
      limitMin: store.perAppMode ? store.limitMinutes(a.id) : null,
      unlocked: store.isUnlockedToday(a.id),
    })),
    total: { usedMin: Math.floor(total / MINUTE), limitMin: store.globalLimitMinutes, perApp: store.perAppMode, unlockedAll },
    quietNow: store.isQuietNow(),
    activeApp: tracker.currentApp(),
    week,
    settings: store.settings(),
    prefs: {
      theme: store.theme, glass: store.glass, animations: store.animations, textScale: store.textScalePercent,
      autostart: store.autostart, hints: Object.fromEntries(HINT_KEYS.map((k) => [k, store.isOn(k)])),
    },
    hints: HINTS,
    adultWords: store.adultWords,
    extension: { families: ext.families, problems: ext.problems, port: PORT, serverError },
    update: { available: update.available ? { version: update.available.version, notes: update.available.notes } : null, checking: update.checking, error: update.error, popup: Boolean(popup) },
    whatsNew,
    options: { THEMES, GLASS, ANIMATIONS },
  };
}

function readChangelog() {
  try {
    return fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
  } catch {
    return '';
  }
}

// ---------- Heartbeat der Erweiterung ----------

function onHeartbeat(clientId, info, tabs) {
  const result = tracker.report(clientId, info, tabs);
  for (const e of result.events) {
    const label = APPS.find((a) => a.id === e.app)?.label ?? '';
    notify(label, e.type === 'warning' ? `Vorwarnung: ${minutesText(e.minutes)} bis zum Limit` : minutesText(e.minutes));
  }
  saver.schedule();
  return result;
}

// ---------- Prüfungen im Hintergrund ----------

function checkExtension() {
  if (!store.isOn('hint_extension') || Date.now() - STARTED < MISSING_GRACE_MS) return;
  const { problems } = extensionState();
  const keys = new Set(problems.map((p) => p.key));
  for (const k of [...notifiedProblems]) if (!keys.has(k)) notifiedProblems.delete(k);
  for (const p of problems) {
    if (notifiedProblems.has(p.key)) continue;
    notifiedProblems.add(p.key);
    notify(
      p.kind === 'missing' ? 'Erweiterung fehlt' : 'Private Fenster nicht geschützt',
      p.kind === 'missing'
        ? `${p.label} läuft, aber die Erweiterung meldet sich nicht. Ohne sie wird dort nichts gezählt oder gesperrt.`
        : `Die Erweiterung in ${p.label} darf nicht in privaten Fenstern laufen. Dort ist nichts gesperrt.`,
    );
  }
}

async function checkUpdate(silent = true) {
  if (SMOKE || update.checking) return;
  update.checking = true;
  update.error = null;
  try {
    update.available = await updater.check(VERSION);
    if (update.available && silent && store.isOn('hint_update_notification') && store.data.notified_version !== update.available.version) {
      store.set('notified_version', update.available.version);
      notify('Update für Doomscroll Blocker', `Version ${update.available.version} ist da. Öffne das Fenster für Details.`);
    }
  } catch (err) {
    update.error = 'Die Suche nach Updates hat nicht geklappt. Prüfe die Internetverbindung.';
    if (!silent) console.error(err.message);
  } finally {
    update.checking = false;
  }
}

// ---------- Tray und Fenster ----------

function trayText() {
  const vm = viewModel();
  const left = vm.total.unlockedAll ? 'heute frei' : vm.total.perApp ? `${vm.total.usedMin} min heute` : `${vm.total.usedMin} / ${vm.total.limitMin} min`;
  const problem = vm.extension.problems.length > 0 ? ' · Erweiterung prüfen' : '';
  return { vm, text: `Doomscroll Blocker: ${left}${problem}` };
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const { vm, text } = trayText();
  tray.setToolTip(text);
  const ext = Object.values(vm.extension.families).map((f) => `${f.label}: ${{ ok: 'verbunden', missing: 'meldet sich nicht', idle: 'nicht gestartet', unknown: 'unbekannt' }[f.state]}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Öffnen', click: () => showWindow() },
    { type: 'separator' },
    { label: text.replace('Doomscroll Blocker: ', 'Heute: '), enabled: false },
    ...ext.map((label) => ({ label, enabled: false })),
    { type: 'separator' },
    { label: 'Beenden …', click: () => openChallengeInWindow('QUIT') },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.on('click', () => (win && win.isVisible() ? win.hide() : showWindow()));
  refreshTray();
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 520, height: 760, minWidth: 380, minHeight: 480, show: false, autoHideMenuBar: true,
      ...(SMOKE ? { x: -5000, y: 100, skipTaskbar: true, focusable: false } : {}),
      title: 'Doomscroll Blocker', icon: path.join(__dirname, 'assets', 'icon.png'), backgroundColor: '#0b1220',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: !SMOKE },
    });
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.on('close', (e) => {
      if (!allowQuit) {
        e.preventDefault();
        win.hide();
      }
    });
    // Windows fährt herunter: das Fenster darf das Herunterfahren nicht aufhalten.
    win.on('session-end', () => { allowQuit = true; });
    win.loadFile(INDEX);
  }
  win.show();
  win.focus();
}

function openChallengeInWindow(scope) {
  showWindow();
  const send = () => win.webContents.send('open-challenge', scope);
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
}

// ---------- IPC ----------

/** Nur die eigene Oberfläche darf die App steuern. */
function trusted(event) {
  return event.senderFrame?.url === INDEX_URL;
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('nicht erlaubt');
    return fn(...args);
  });
}

function applyPending(next) {
  store.applySettings(next);
  pending = null;
  saver.flush();
}

handle('state:get', () => viewModel());

handle('challenge:new', (scope) => {
  const ch = unlock.newChallenge(scope);
  if (!ch) return null;
  challenges.set(scope, ch);
  return { scope, kind: ch.kind, text: ch.text };
});

handle('challenge:submit', (scope, typed) => {
  const ch = challenges.get(scope);
  if (!ch || !unlock.check(ch, typed)) {
    return { ok: false, message: ch?.kind === 'code' ? 'Die Zeichen stimmen noch nicht genau.' : 'Der Satz stimmt noch nicht genau.' };
  }
  challenges.delete(scope);
  if (scope === 'QUIT') {
    allowQuit = true;
    setImmediate(() => app.quit());
    return { ok: true, message: 'Wird beendet …' };
  }
  if (scope === 'AUTOSTART') {
    store.set('autostart', false);
    applyAutostart();
    return { ok: true, message: 'Autostart ist aus.' };
  }
  if (scope === 'SETTINGS') {
    if (!pending) return { ok: false, message: 'Es gibt nichts zu speichern.' };
    applyPending(pending);
    return { ok: true, message: 'Gespeichert.' };
  }
  store.unlockToday(scope === 'ALL' ? null : scope);
  saver.flush();
  return { ok: true, message: 'Für heute aufgehoben.' };
});

handle('settings:save', (raw) => {
  const next = store.sanitizeSettings(raw);
  if (store.loosens(next)) {
    pending = next;
    return { ok: false, needsUnlock: true };
  }
  applyPending(next);
  return { ok: true };
});

handle('prefs:set', (key, value) => {
  const choice = (list) => typeof value === 'string' && list.includes(value);
  if (key === 'theme' && choice(THEMES)) store.set('theme', value);
  else if (key === 'glass' && choice(GLASS)) store.set('glass', value);
  else if (key === 'animations' && choice(ANIMATIONS)) store.set('animations', value);
  else if (key === 'text_scale' && Number.isFinite(value)) store.set('text_scale', Math.min(200, Math.max(80, Math.round(value))));
  else if (HINT_KEYS.includes(key) && typeof value === 'boolean') store.set(key, value);
  else if (key === 'autostart' && value === true) {
    store.set('autostart', true);
    applyAutostart();
  } else return { ok: false };
  saver.flush();
  return { ok: true };
});

handle('words:add', (word) => {
  if (!store.addAdultWord(word)) return { ok: false, message: 'Mindestens 2 Zeichen.' };
  saver.flush();
  return { ok: true };
});

handle('token:copy', () => {
  clipboard.writeText(token());
  return true;
});

handle('backup:export', async () => {
  const day = localDay(new Date());
  const res = await dialog.showSaveDialog(win, { title: 'Datensicherung speichern', defaultPath: `doomscroll-desktop-${day}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (res.canceled || !res.filePath) return { ok: false, message: '' };
  try {
    fs.writeFileSync(res.filePath, backup.write(store, VERSION), 'utf8');
    return { ok: true, message: 'Sicherung gespeichert.' };
  } catch (err) {
    return { ok: false, message: `Speichern nicht möglich: ${err.code ?? err.message}` };
  }
});

handle('backup:import', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Datensicherung öffnen', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, message: '' };
  let text;
  try {
    if (fs.statSync(res.filePaths[0]).size > backup.MAX_BACKUP_BYTES) return { ok: false, message: 'Die Datei ist zu groß für eine Sicherung.' };
    text = fs.readFileSync(res.filePaths[0], 'utf8');
  } catch {
    return { ok: false, message: 'Die Datei lässt sich nicht lesen.' };
  }
  const read = backup.read(text);
  if (read.error) return { ok: false, message: read.error };
  store.restoreSafe(read.values);
  const next = store.settingsFromBackup(read.values);
  if (store.loosens(next)) {
    pending = next;
    return { ok: false, needsUnlock: true, message: 'Die Sicherung lockert Limits. Dafür brauchst du den Satz.' };
  }
  applyPending(next);
  return { ok: true, message: 'Sicherung eingelesen.' };
});

handle('update:check', async () => {
  await checkUpdate(false);
  return viewModel().update;
});

handle('update:install', async () => {
  // Erst neu suchen: nie eine früher gefundene Fassung laden.
  try {
    update.available = await updater.check(VERSION);
  } catch {
    return { ok: false, message: 'Die Suche nach Updates hat nicht geklappt. Es wurde nichts geladen.' };
  }
  if (!update.available) return { ok: false, message: 'Du hast schon die neueste Version.' };
  if (!isTrustedDownload(update.available.url, updater.REPO)) return { ok: false, message: 'Die Download-Adresse wurde nicht als sicher erkannt.' };
  await shell.openExternal(update.available.url);
  return { ok: true, message: `Version ${update.available.version} wird im Browser geladen. Danach das Setup starten.` };
});

handle('update:dismiss', () => {
  if (update.available) update.offered = update.available.version;
  return true;
});

handle('whatsnew:seen', () => {
  store.set('last_seen_version', VERSION);
  saver.flush();
  return true;
});

// ---------- Start ----------

function start() {
  const file = path.join(app.getPath('userData'), 'doomscroll-desktop.json');
  store = new Store(persist.load(file), { onChange: () => saver?.schedule() });
  saver = persist.debounced(file, () => store.data);
  tracker = new Tracker(store);
  const firstRun = typeof store.data.last_seen_version !== 'string';
  if (firstRun) store.set('last_seen_version', VERSION);
  Menu.setApplicationMenu(null);
  applyAutostart();
  createTray();
  server.start({ token: token(), port: PORT, onHeartbeat })
    .then((s) => { httpServer = s; })
    .catch((err) => {
      serverError = err.code === 'EADDRINUSE'
        ? `Der Port ${PORT} ist belegt. Läuft die App schon, oder nutzt ein anderes Programm den Port? Ohne ihn erreicht die Erweiterung die App nicht.`
        : `Der lokale Server startet nicht: ${err.code ?? err.message}`;
      notify('Doomscroll Blocker', serverError);
    });
  refreshProcesses();
  setInterval(refreshProcesses, 30_000);
  setInterval(() => { refreshTray(); checkExtension(); }, 10_000);
  setInterval(() => checkUpdate(true), updater.CHECK_EVERY_MS);
  setTimeout(() => checkUpdate(true), 5_000);
  // Beim ersten Start oder ohne --hidden zeigt sich das Fenster, sonst bleibt die App im Tray.
  if (SMOKE) {
    require('./src/smoke').run({ app, getWin: () => { showWindow(); return win; }, tray, getServer: () => httpServer, token: token(), port: PORT, store });
  } else if (firstRun || !process.argv.includes('--hidden')) showWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.on('window-all-closed', () => {}); // läuft im Tray weiter
  app.on('before-quit', () => saver?.flush());
  app.whenReady().then(start);
}
