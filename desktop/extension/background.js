'use strict';
// Meldet der Doomscroll-Blocker-App (nur 127.0.0.1) alle ~2 s die Adressen der aktiven Tabs und
// leitet die Tabs um, die die App als gesperrt zurückmeldet. Gezählt und entschieden wird in der App.
// Kopplungscode und Port holt sich die Erweiterung selbst von der App (Native Messaging, Host de.doomscroll.desktop);
// der Code aus der Optionsseite bleibt als Rückfall.

const api = globalThis.browser ?? globalThis.chrome;
const DEFAULT_PORT = 47615;
const NATIVE_HOST = 'de.doomscroll.desktop';
const PAIR_EVERY_MS = 30000; // jede Kopplung startet ein Hilfsprogramm: nicht öfter als nötig versuchen
const BEAT_MS = 2000;
const RETRY_MS = 10000; // App nicht erreichbar: seltener versuchen
const BLOCK_KINDS = new Set(['limit', 'quiet', 'porn']);
const FAMILY = globalThis.browser?.runtime?.getBrowserInfo ? 'firefox' : 'chromium';

function browserLabel() {
  const ua = navigator.userAgent;
  if (FAMILY === 'firefox') return 'Firefox';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (navigator.brave) return 'Brave'; // nur wenn der Browser es im Hintergrundprozess verrät
  if (/Vivaldi/.test(ua)) return 'Vivaldi';
  return 'Chrome oder Brave';
}

let busy = false;
let again = false;
let nextAllowed = 0;
let nextPair = 0;
let port = DEFAULT_PORT;
let debounce = null;

const validPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

/** Holt Kopplungscode und Port von der App über Native Messaging und merkt sie sich; false, wenn es nicht klappt. */
async function pair() {
  if (Date.now() < nextPair) return false;
  nextPair = Date.now() + PAIR_EVERY_MS;
  try {
    const answer = await api.runtime.sendNativeMessage(NATIVE_HOST, { type: 'pair' });
    if (answer?.ok !== true || typeof answer.token !== 'string' || !/^[0-9a-f]{64}$/.test(answer.token) || !validPort(answer.port)) return false;
    await api.storage.local.set({ token: answer.token, port: answer.port });
    return true;
  } catch {
    return false; // Host nicht eingerichtet: der Code von der Optionsseite gilt
  }
}

async function identity() {
  const stored = await api.storage.local.get(['token', 'client', 'port']);
  port = validPort(stored.port) ? stored.port : DEFAULT_PORT;
  let client = stored.client;
  if (typeof client !== 'string') {
    client = crypto.randomUUID();
    await api.storage.local.set({ client });
  }
  return { token: typeof stored.token === 'string' ? stored.token.trim() : '', client };
}

async function activeTabs(extraTab) {
  const [windows, active] = await Promise.all([api.windows.getAll(), api.tabs.query({ active: true })]);
  const minimized = new Set(windows.filter((w) => w.state === 'minimized').map((w) => w.id));
  const focused = new Set(windows.filter((w) => w.focused).map((w) => w.id)); // zählt nur im Fenster mit Fokus
  const tabs = active.filter((t) => !minimized.has(t.windowId));
  if (extraTab && !tabs.some((t) => t.id === extraTab.id)) tabs.push(extraTab);
  return tabs
    .filter((t) => Number.isSafeInteger(t.id) && typeof t.url === 'string' && /^https?:/i.test(t.url))
    .slice(0, 64)
    .map((t) => ({ id: t.id, url: t.url, incognito: Boolean(t.incognito), focused: focused.has(t.windowId) }));
}

async function setStatus(status) {
  await api.storage.local.set({ status: { ...status, at: Date.now() } });
}

async function block({ id, kind, app }) {
  if (!Number.isSafeInteger(id) || !BLOCK_KINDS.has(kind)) return;
  const query = new URLSearchParams({ kind });
  if (typeof app === 'string' && /^[A-Z]{3,12}$/.test(app)) query.set('app', app);
  // Die Seite kommt von der App und nicht aus der Erweiterung: Chrome lädt Erweiterungsseiten nicht in
  // private Tabs, wenn die Erweiterung `incognito: "spanning"` hat. about:blank ist der letzte Ausweg.
  try {
    await api.tabs.update(id, { url: `http://127.0.0.1:${port}/blocked?${query}` });
  } catch {
    await api.tabs.update(id, { url: 'about:blank' }).catch(() => {}); // Tab ist schon zu: nichts zu tun
  }
}

async function beat(extraTab) {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    let { token, client } = await identity();
    if (!token && (await pair())) ({ token } = await identity());
    if (!token) return await setStatus({ ok: false, reason: 'token' });
    const incognitoAllowed = await Promise.resolve(api.extension.isAllowedIncognitoAccess()).catch(() => null);
    const tabs = await activeTabs(extraTab);
    const res = await fetch(`http://127.0.0.1:${port}/v1/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        client,
        browser: FAMILY,
        label: browserLabel(),
        version: api.runtime.getManifest().version,
        incognitoAllowed: typeof incognitoAllowed === 'boolean' ? incognitoAllowed : null,
        tabs,
      }),
    });
    if (!res.ok) {
      // Code abgelehnt: bei neuem Code in der App holt die Kopplung den richtigen und es geht gleich weiter.
      if (res.status === 401 && (await pair())) again = true; // gleich noch einmal mit dem neuen Code
      else nextAllowed = Date.now() + RETRY_MS;
      return await setStatus({ ok: false, reason: res.status === 401 ? 'token' : 'http', incognitoAllowed });
    }
    const data = await res.json();
    nextAllowed = 0;
    await setStatus({ ok: true, incognitoAllowed });
    if (Array.isArray(data.blocks)) for (const b of data.blocks) await block(b);
  } catch {
    nextAllowed = Date.now() + RETRY_MS;
    await setStatus({ ok: false, reason: 'offline' }).catch(() => {});
  } finally {
    busy = false;
    if (again) {
      again = false;
      schedule();
    }
  }
}

/** Sofort-Meldung bei Ereignissen, leicht gebündelt, damit schnelle Folgen nur eine Anfrage auslösen. */
function schedule(extraTab) {
  clearTimeout(debounce);
  debounce = setTimeout(() => beat(extraTab), 150);
}

setInterval(() => {
  if (Date.now() >= nextAllowed) beat();
}, BEAT_MS);

api.alarms.create('beat', { periodInMinutes: 0.5 }); // weckt den Hintergrundprozess, falls der Browser ihn schlafen legt
api.alarms.onAlarm.addListener(() => beat());
api.tabs.onActivated.addListener(() => schedule());
api.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') schedule(tab);
});
api.windows.onFocusChanged.addListener(() => schedule());
api.runtime.onInstalled.addListener(() => schedule());
api.runtime.onStartup.addListener(() => schedule());
api.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'beat') {
    nextAllowed = 0;
    beat();
  }
});
api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
