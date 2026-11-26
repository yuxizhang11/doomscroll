'use strict';
// Meldet der Doomscroll-Blocker-App (nur 127.0.0.1) alle ~2 s die Adressen der aktiven Tabs und
// leitet die Tabs um, die die App als gesperrt zurückmeldet. Gezählt und entschieden wird in der App.

const api = globalThis.browser ?? globalThis.chrome;
const ENDPOINT = 'http://127.0.0.1:47615/v1/heartbeat';
const BEAT_MS = 2000;
const RETRY_MS = 10000; // App nicht erreichbar: seltener versuchen
const BLOCK_KINDS = new Set(['limit', 'quiet', 'porn']);
const FAMILY = globalThis.browser?.runtime?.getBrowserInfo ? 'firefox' : 'chromium';

function browserLabel() {
  const ua = navigator.userAgent;
  if (FAMILY === 'firefox') return 'Firefox';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Vivaldi/.test(ua)) return 'Vivaldi';
  return 'Chrome oder Brave';
}

let busy = false;
let again = false;
let nextAllowed = 0;
let debounce = null;

async function identity() {
  const stored = await api.storage.local.get(['token', 'client']);
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
  const tabs = active.filter((t) => !minimized.has(t.windowId));
  if (extraTab && !tabs.some((t) => t.id === extraTab.id)) tabs.push(extraTab);
  return tabs
    .filter((t) => Number.isSafeInteger(t.id) && typeof t.url === 'string' && /^https?:/i.test(t.url))
    .slice(0, 64)
    .map((t) => ({ id: t.id, url: t.url, incognito: Boolean(t.incognito) }));
}

async function setStatus(status) {
  await api.storage.local.set({ status: { ...status, at: Date.now() } });
}

async function block({ id, kind, app }) {
  if (!Number.isSafeInteger(id) || !BLOCK_KINDS.has(kind)) return;
  const query = new URLSearchParams({ kind });
  if (typeof app === 'string' && /^[A-Z]{3,12}$/.test(app)) query.set('app', app);
  try {
    await api.tabs.update(id, { url: api.runtime.getURL(`blocked.html?${query}`) });
  } catch {
    // Tab ist schon zu: nichts zu tun.
  }
}

async function beat(extraTab) {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    const { token, client } = await identity();
    if (!token) return await setStatus({ ok: false, reason: 'token' });
    const incognitoAllowed = await Promise.resolve(api.extension.isAllowedIncognitoAccess()).catch(() => null);
    const tabs = await activeTabs(extraTab);
    const res = await fetch(ENDPOINT, {
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
      nextAllowed = Date.now() + RETRY_MS;
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
