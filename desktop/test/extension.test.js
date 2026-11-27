'use strict';
// Läuft background.js der Erweiterung mit einer nachgebauten Browser-API gegen den echten lokalen Server:
// prüft Meldung, Token, Umleiten gesperrter Tabs und das Verhalten ohne App. Echte Browser sind damit NICHT geprüft.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../src/server');
const { Store } = require('../src/core/store');
const { Tracker } = require('../src/core/tracker');

const TOKEN = 'b'.repeat(64);
const PORT = 47636; // die Erweiterung liest den Port aus ihrem Speicher; 47615 kann von einer laufenden App belegt sein

function fakeBrowser(tabs, storage) {
  const listeners = {};
  const calls = { update: [], fetchBodies: [] };
  const evt = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const api = {
    storage: { local: { get: async (keys) => Object.fromEntries(keys.filter((k) => k in storage).map((k) => [k, storage[k]])), set: async (o) => Object.assign(storage, o) } },
    tabs: { query: async () => tabs, update: async (id, props) => { calls.update.push({ id, props }); }, onActivated: evt('tabs.onActivated'), onUpdated: evt('tabs.onUpdated') },
    windows: { getAll: async () => [{ id: 1, state: 'normal', focused: true }], onFocusChanged: evt('windows.onFocusChanged') },
    alarms: { create: () => {}, onAlarm: evt('alarms.onAlarm') },
    runtime: { getManifest: () => ({ version: '0.1.0' }), getURL: (p) => `chrome-extension://abcd/${p}`, onInstalled: evt('onInstalled'), onStartup: evt('onStartup'), onMessage: evt('onMessage'), openOptionsPage: () => {} },
    extension: { isAllowedIncognitoAccess: async () => true },
    action: { onClicked: evt('action.onClicked') },
  };
  return { api, listeners, calls };
}

async function loadBackground(api) {
  globalThis.chrome = api;
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0; // der Takt wird im Test von Hand ausgelöst
  delete require.cache[require.resolve('../extension/background.js')];
  require('../extension/background.js');
  globalThis.setInterval = realSetInterval;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Erweiterung: meldet den aktiven Tab und leitet gesperrte Tabs auf die Sperrseite um', async (t) => {
  const store = new Store({ global_limit: 0 });
  const tracker = new Tracker(store);
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: (client, info, tabs) => tracker.report(client, info, tabs) }).catch((err) => err);
  if (server instanceof Error) return t.skip(`Port ${PORT} belegt (${server.code}); Test übersprungen`);
  t.after(() => server.close());

  const storage = { token: TOKEN, port: PORT };
  const tabs = [
    { id: 5, url: 'https://www.tiktok.com/@x', windowId: 1, incognito: true },
    { id: 6, url: 'https://www.wikipedia.org/', windowId: 1, incognito: false },
    { id: 7, url: 'chrome://settings', windowId: 1, incognito: false },
  ];
  const { api, listeners, calls } = fakeBrowser(tabs, storage);
  await loadBackground(api);
  listeners.onMessage({ type: 'beat' });
  await wait(300);

  assert.equal(storage.status.ok, true);
  assert.equal(storage.status.incognitoAllowed, true);
  assert.deepEqual(calls.update, [{ id: 5, props: { url: `http://127.0.0.1:${PORT}/blocked?kind=limit&app=TIKTOK` } }]);
  assert.equal(tracker.clients.size, 1);
  const seen = [...tracker.clients.values()][0];
  assert.deepEqual(seen.tabs.map((x) => x.id), [5, 6], 'chrome:// wird nicht gemeldet');
  assert.equal(seen.tabs[0].incognito, true);
  assert.deepEqual(seen.tabs.map((x) => x.focused), [true, true], 'Fensterfokus wird mitgeschickt');
  assert.equal(seen.browser, 'chromium');
});

test('Erweiterung: falscher Code und fehlende App werden gemeldet, ohne etwas umzuleiten', async (t) => {
  const store = new Store({});
  const tracker = new Tracker(store);
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: (c, i, tb) => tracker.report(c, i, tb) }).catch((err) => err);
  if (server instanceof Error) return t.skip(`Port ${PORT} belegt (${server.code})`);

  const storage = { token: 'falsch', port: PORT };
  const { api, listeners, calls } = fakeBrowser([{ id: 1, url: 'https://www.tiktok.com/', windowId: 1, incognito: false }], storage);
  await loadBackground(api);
  listeners.onMessage({ type: 'beat' });
  await wait(300);
  assert.deepEqual([storage.status.ok, storage.status.reason], [false, 'token']);

  const storage2 = {};
  const b2 = fakeBrowser([], storage2);
  await loadBackground(b2.api);
  b2.listeners.onMessage({ type: 'beat' });
  await wait(200);
  assert.equal(storage2.status.reason, 'token', 'ohne Code wird nichts gesendet');

  await new Promise((r) => server.close(r));
  const storage3 = { token: TOKEN, port: PORT };
  const b3 = fakeBrowser([{ id: 1, url: 'https://www.tiktok.com/', windowId: 1, incognito: false }], storage3);
  await loadBackground(b3.api);
  b3.listeners.onMessage({ type: 'beat' });
  await wait(300);
  assert.deepEqual([storage3.status.ok, storage3.status.reason], [false, 'offline']);
  assert.deepEqual(b3.calls.update, [], 'ohne App wird nichts gesperrt');
  assert.deepEqual(calls.update, []);
});

test('Erweiterung: Manifest ist gültig und fordert nur nötige Rechte', () => {
  const dir = path.join(__dirname, '..', 'extension');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.incognito, 'spanning');
  assert.deepEqual([...m.permissions].sort(), ['alarms', 'nativeMessaging', 'storage', 'tabs']);
  assert.deepEqual(m.host_permissions, ['http://127.0.0.1/*'], 'nur Loopback, der Port kommt von der App');
  assert.ok(m.browser_specific_settings.gecko.id);
  for (const f of [m.background.service_worker, m.options_ui.page, ...Object.values(m.icons), 'options.js', 'page.css']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} fehlt`);
  }
});

test('Erweiterung: koppelt sich über Native Messaging, ohne Code und auf dem Port der App', async (t) => {
  const PAIR_PORT = 47633;
  const store = new Store({});
  const tracker = new Tracker(store);
  const server = await start({ token: TOKEN, port: PAIR_PORT, onHeartbeat: (c, i, tb) => tracker.report(c, i, tb) }).catch((err) => err);
  if (server instanceof Error) return t.skip(`Port ${PAIR_PORT} belegt (${server.code})`);
  t.after(() => server.close());

  const storage = {};
  const { api, listeners } = fakeBrowser([{ id: 1, url: 'https://www.wikipedia.org/', windowId: 1, incognito: false }], storage);
  const asked = [];
  api.runtime.sendNativeMessage = async (host, message) => { asked.push([host, message]); return { ok: true, token: TOKEN, port: PAIR_PORT }; };
  await loadBackground(api);
  listeners.onMessage({ type: 'beat' });
  await wait(400);
  assert.deepEqual(asked, [['de.doomscroll.desktop', { type: 'pair' }]]);
  assert.equal(storage.token, TOKEN);
  assert.equal(storage.port, PAIR_PORT);
  assert.equal(storage.status.ok, true);
  assert.equal(tracker.clients.size, 1);
});

test('Erweiterung: ein falscher Code wird über die Kopplung berichtigt, ein falscher Host-Antworttext nie übernommen', async (t) => {
  const store = new Store({});
  const tracker = new Tracker(store);
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: (c, i, tb) => tracker.report(c, i, tb) }).catch((err) => err);
  if (server instanceof Error) return t.skip(`Port ${PORT} belegt (${server.code})`);
  t.after(() => server.close());

  // Antworten des Hosts, die nicht übernommen werden dürfen: kein Hex-Code, falscher Port, ok fehlt, Fehlerantwort, Fehler.
  const bad = [{ ok: true, token: 'zu kurz', port: 47615 }, { ok: true, token: TOKEN, port: 80 }, { token: TOKEN, port: 47615 }, { ok: false, error: 'pairing' }, null];
  for (const answer of bad) {
    const storage = {};
    const b = fakeBrowser([], storage);
    b.api.runtime.sendNativeMessage = async () => answer;
    await loadBackground(b.api);
    b.listeners.onMessage({ type: 'beat' });
    await wait(150);
    assert.equal(storage.token, undefined, `übernommen: ${JSON.stringify(answer)}`);
    assert.deepEqual([storage.status.ok, storage.status.reason], [false, 'token']);
  }
  const failing = {};
  const f = fakeBrowser([], failing);
  f.api.runtime.sendNativeMessage = async () => { throw new Error('Specified native messaging host not found.'); };
  await loadBackground(f.api);
  f.listeners.onMessage({ type: 'beat' });
  await wait(150);
  assert.equal(failing.status.reason, 'token', 'ohne Host bleibt nur der Code von der Optionsseite');

  const storage = { token: 'f'.repeat(64), port: PORT }; // abgelehnter Code, die Kopplung liefert den richtigen
  const ok = fakeBrowser([{ id: 1, url: 'https://www.wikipedia.org/', windowId: 1, incognito: false }], storage);
  ok.api.runtime.sendNativeMessage = async () => ({ ok: true, token: TOKEN, port: PORT });
  await loadBackground(ok.api);
  ok.listeners.onMessage({ type: 'beat' });
  await wait(500);
  assert.equal(storage.token, TOKEN);
  assert.equal(storage.status.ok, true);
});
