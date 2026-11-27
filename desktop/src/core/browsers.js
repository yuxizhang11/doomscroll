'use strict';
// Die Browser, für die die geführte Einrichtung Knöpfe zeigt: Erkennung (Standardpfade, dann Registry „App Paths“),
// Adressen der Erweiterungsseiten und Live-Status je Browser. Reine Logik, Dateien und Registry kommen als Funktionen herein.

const STALE_MS = 15_000;

/**
 * paths: [Umgebungsvariable, Rest] der üblichen Installationsorte; process: Name im Task-Manager;
 * labels: so meldet sich die Erweiterung (background.js, browserLabel). Chrome und Brave sind für die Erweiterung
 * nicht immer zu unterscheiden, deshalb passt „Chrome oder Brave“ auf beide.
 */
const BROWSERS = [
  {
    id: 'chrome', label: 'Chrome', exe: 'chrome.exe', family: 'chromium', scheme: 'chrome', process: 'chrome.exe', labels: ['Chrome oder Brave'],
    incognito: 'In Inkognito zulassen',
    paths: [['PROGRAMFILES', 'Google\\Chrome\\Application\\chrome.exe'], ['PROGRAMFILES(X86)', 'Google\\Chrome\\Application\\chrome.exe'], ['LOCALAPPDATA', 'Google\\Chrome\\Application\\chrome.exe']],
  },
  {
    id: 'edge', label: 'Edge', exe: 'msedge.exe', family: 'chromium', scheme: 'edge', process: 'msedge.exe', labels: ['Edge'],
    incognito: 'In InPrivate zulassen',
    paths: [['PROGRAMFILES(X86)', 'Microsoft\\Edge\\Application\\msedge.exe'], ['PROGRAMFILES', 'Microsoft\\Edge\\Application\\msedge.exe']],
  },
  {
    id: 'brave', label: 'Brave', exe: 'brave.exe', family: 'chromium', scheme: 'brave', process: 'brave.exe', labels: ['Brave', 'Chrome oder Brave'],
    incognito: 'In Inkognito zulassen',
    paths: [['PROGRAMFILES', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], ['PROGRAMFILES(X86)', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], ['LOCALAPPDATA', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe']],
  },
  {
    id: 'firefox', label: 'Firefox', exe: 'firefox.exe', family: 'firefox', scheme: null, process: 'firefox.exe', labels: ['Firefox'],
    incognito: 'In privaten Fenstern ausführen',
    paths: [['PROGRAMFILES', 'Mozilla Firefox\\firefox.exe'], ['PROGRAMFILES(X86)', 'Mozilla Firefox\\firefox.exe']],
  },
];

const BROWSER_IDS = BROWSERS.map((b) => b.id);

/**
 * Welche Browser sind installiert? exists(pfad) prüft Dateien, appPath(exeName) liefert den Eintrag aus der Registry
 * (App Paths) oder null. Gibt nur die gefundenen mit ihrer Exe zurück.
 */
async function detectBrowsers({ env, exists, appPath }) {
  const found = [];
  for (const b of BROWSERS) {
    let exe = null;
    for (const [variable, rest] of b.paths) {
      const base = env[variable];
      if (base && exists(`${base}\\${rest}`)) { exe = `${base}\\${rest}`; break; }
    }
    if (!exe) {
      const fromRegistry = await appPath(b.exe);
      if (fromRegistry && exists(fromRegistry)) exe = fromRegistry;
    }
    if (exe) found.push({ id: b.id, label: b.label, exe });
  }
  return found;
}

function find(id) {
  return BROWSERS.find((b) => b.id === id) ?? null;
}

/** Adresse, die der Browser öffnen soll: die Erweiterungsseite oder die Detailseite der Erweiterung (nur Chromium). */
function pageUrl(id, target, extensionId) {
  const b = find(id);
  if (!b) return null;
  if (b.family === 'firefox') return target === 'extensions' ? 'about:debugging#/runtime/this-firefox' : null;
  if (target === 'extensions') return `${b.scheme}://extensions`;
  if (target === 'details') return `${b.scheme}://extensions/?id=${extensionId}`;
  return null;
}

/**
 * Status eines Browsers. running ist die Menge der laufenden Prozessnamen oder null (unbekannt).
 * Verbunden heißt: eine Erweiterung dieser Browser-Art hat sich in den letzten 15 Sekunden gemeldet.
 */
function browserStatus(id, { clients, running, now }) {
  const b = find(id);
  const fresh = [...clients.values()].filter((c) => c.browser === b.family && b.labels.includes(c.label) && now - c.seen <= STALE_MS);
  const isRunning = running ? running.has(b.process) : null;
  let state;
  if (fresh.length > 0) state = 'ok';
  else if (isRunning === true) state = 'missing';
  else if (isRunning === false) state = 'idle';
  else state = 'unknown';
  const incognito = state !== 'ok' ? 'unknown' : fresh.some((c) => c.incognitoAllowed === false) ? 'denied' : fresh.some((c) => c.incognitoAllowed === true) ? 'ok' : 'unknown';
  // Bei „Chrome oder Brave“ lässt sich nicht sagen, welcher der beiden es ist; die Oberfläche zeigt das an.
  const shared = state === 'ok' && fresh.some((c) => c.label.includes(' oder '));
  return { state, incognito, shared };
}

module.exports = { BROWSERS, BROWSER_IDS, STALE_MS, detectBrowsers, pageUrl, browserStatus, find };
