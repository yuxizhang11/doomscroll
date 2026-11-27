'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { start, parseHeartbeat, isExtensionOrigin, tokenEquals } = require('../src/server');
const updater = require('../src/updater');

const PORT = 47698;
const TOKEN = 'a'.repeat(64);
const GOOD = { client: 'client-00001', browser: 'chromium', label: 'Chrome', version: '0.1.0', incognitoAllowed: true, tabs: [{ id: 1, url: 'https://www.tiktok.com/', incognito: false, focused: true }] };

function post(body, { headers = {}, method = 'POST', path = '/v1/heartbeat' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ agent: false, host: '127.0.0.1', port: PORT, path, method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

test('Server: Anfragen, Token, Origin und Host', async (t) => {
  const seen = [];
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: (client, info, tabs) => { seen.push({ client, info, tabs }); return { blocks: [{ id: 1, kind: 'limit', app: 'TIKTOK' }] }; } });
  t.after(() => server.close());

  assert.equal(server.address().address, '127.0.0.1');
  const ok = await post(GOOD);
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text).blocks, [{ id: 1, kind: 'limit', app: 'TIKTOK' }]);
  assert.equal(seen.length, 1);

  assert.equal((await post(GOOD, { headers: { Authorization: 'Bearer falsch' } })).status, 401);
  assert.equal((await post(GOOD, { headers: { Authorization: '' } })).status, 401);
  assert.equal((await post(GOOD, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post(GOOD, { headers: { Origin: 'null' } })).status, 403);
  const ext = await post(GOOD, { headers: { Origin: 'moz-extension://1234-abcd' } });
  assert.equal(ext.status, 200);
  assert.equal(ext.headers['access-control-allow-origin'], 'moz-extension://1234-abcd');
  assert.equal((await post(GOOD, { headers: { Host: 'evil.example' } })).status, 421);
  assert.equal((await post(GOOD, { headers: { Host: `127.0.0.1.evil.example:${PORT}` } })).status, 421);
  assert.equal((await post(GOOD, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post('', { method: 'GET' })).status, 404);
  assert.equal((await post(GOOD, { path: '/anders' })).status, 404);
  assert.equal((await post('kein json')).status, 400);
  assert.equal((await post({ ...GOOD, browser: 'safari' })).status, 400);
  assert.equal(seen.length, 2, 'abgelehnte Anfragen erreichen die Zähllogik nie');

  const pre = await post('', { method: 'OPTIONS', headers: { Origin: 'chrome-extension://abc' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], 'chrome-extension://abc');
  assert.equal((await post('', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('Sperrseite: feste Texte ohne Token, nichts aus der Adresse wird eingesetzt', async (t) => {
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: () => ({ blocks: [] }) });
  t.after(() => server.close());
  const get = (p, headers = {}) => post('', { method: 'GET', path: p, headers: { Authorization: '', ...headers } });
  const limit = await get('/blocked?kind=limit&app=INSTAGRAM');
  assert.equal(limit.status, 200);
  assert.match(limit.text, /Genug für heute!/);
  assert.match(limit.text, /https:\/\/www\.instagram\.com\//);
  assert.match(limit.headers['content-security-policy'], /default-src 'none'/);
  assert.match(limit.headers['content-security-policy'], /img-src data:/);
  assert.match(limit.text, /<link rel="icon" href="data:image\/svg\+xml;base64,/, 'Logo der App als Favicon');
  assert.match(limit.text, /<img src="data:image\/svg\+xml;base64,[^"]+" alt="">/, 'Logo in der Seite, ohne Vorlesetext');
  assert.match((await get('/blocked?kind=porn')).text, /Diese Seite ist gesperrt/);
  assert.match((await get('/blocked?kind=quiet&app=TIKTOK')).text, /Ruhezeit/);
  const evil = await get('/blocked?kind=%3Cscript%3Ealert(1)%3C%2Fscript%3E&app=%22%3E%3Cimg%20src%3Dx%3E');
  assert.match(evil.text, /Genug für heute!/, 'unbekannte Werte fallen auf „limit“ zurück');
  assert.doesNotMatch(evil.text, /<script>alert|<img src=x>/);
  assert.equal((await get('/blocked?kind=limit', { Host: 'evil.example' })).status, 421);
});

test('Server: zweiter Start auf demselben Port meldet EADDRINUSE', async (t) => {
  const a = await start({ token: TOKEN, port: PORT, onHeartbeat: () => ({ blocks: [] }) });
  t.after(() => a.close());
  await assert.rejects(start({ token: TOKEN, port: PORT, onHeartbeat: () => ({ blocks: [] }) }), { code: 'EADDRINUSE' });
});

test('Server: Fehler in der Zähllogik gibt 500 und stürzt nicht ab', async (t) => {
  const server = await start({ token: TOKEN, port: PORT, onHeartbeat: () => { throw new Error('kaputt'); } });
  t.after(() => server.close());
  assert.equal((await post(GOOD)).status, 500);
  assert.equal((await post(GOOD)).status, 500);
});

test('Meldung: sehr lange Adressen werden gekürzt und nicht verworfen', () => {
  const url = 'https://www.instagram.com/reels/?x=' + 'a'.repeat(10000);
  const parsed = parseHeartbeat({ ...GOOD, tabs: [{ id: 1, url, incognito: false }] });
  assert.equal(parsed.tabs.length, 1);
  assert.ok(parsed.tabs[0].url.startsWith('https://www.instagram.com/reels/'));
});

test('Meldung: strenge Prüfung', () => {
  assert.ok(parseHeartbeat(GOOD));
  assert.equal(parseHeartbeat(null), null);
  assert.equal(parseHeartbeat([]), null);
  assert.equal(parseHeartbeat({ ...GOOD, client: 'kurz' }), null);
  assert.equal(parseHeartbeat({ ...GOOD, client: 'a b c d e f g h' }), null);
  assert.equal(parseHeartbeat({ ...GOOD, tabs: 'x' }), null);
  assert.equal(parseHeartbeat({ ...GOOD, tabs: Array.from({ length: 65 }, (_, i) => ({ id: i, url: 'https://a.example/', incognito: false })) }), null);
  assert.equal(parseHeartbeat({ ...GOOD, tabs: [{ id: 'x', url: 'https://a.example/', incognito: false }] }), null);
  assert.equal(parseHeartbeat({ ...GOOD, tabs: [{ id: 1, url: 'https://a.example/', incognito: 'nein' }] }), null);
  const mixed = parseHeartbeat({ ...GOOD, incognitoAllowed: 'ja', label: 'x'.repeat(100), tabs: [
    { id: 1, url: 'chrome://settings', incognito: false },
    { id: 2, url: 'javascript:alert(1)', incognito: false },
    { id: 3, url: 'https://ok.example/', incognito: true },
  ] });
  assert.deepEqual(mixed.tabs, [{ id: 3, url: 'https://ok.example/', incognito: true, focused: false }]);
  assert.equal(mixed.info.incognitoAllowed, null);
  assert.equal(mixed.info.label.length, 40);
});

test('Origin und Token-Vergleich', () => {
  assert.ok(isExtensionOrigin('chrome-extension://abcdef'));
  assert.ok(isExtensionOrigin('moz-extension://12ab-34cd'));
  assert.equal(isExtensionOrigin('https://chrome-extension://abc'), false);
  assert.equal(isExtensionOrigin('chrome-extension://abc/evil'), false);
  assert.equal(isExtensionOrigin(undefined), false);
  assert.ok(tokenEquals('abc', 'abc'));
  assert.equal(tokenEquals('abc', 'abd'), false);
  assert.equal(tokenEquals('ab', 'abc'), false);
});

test('Updater: findet nur neuere Desktop-Releases und lehnt fremde Download-Adressen ab', async () => {
  const exe = (url) => ({ tag_name: 'desktop-v0.2.0', body: 'Neu', assets: [{ name: 'Setup.exe', browser_download_url: url }] });
  const fake = (payload, ok = true, status = 200) => async () => ({ ok, status, json: async () => payload });
  const good = 'https://github.com/yuxizhang11/doomscroll/releases/download/desktop-v0.2.0/Setup.exe';
  assert.equal((await updater.check('0.1.0', fake([exe(good)]))).version, '0.2.0');
  assert.equal(await updater.check('0.2.0', fake([exe(good)])), null);
  assert.equal(await updater.check('0.1.0', fake([exe('https://evil.example/Setup.exe')])), null);
  assert.equal(await updater.check('0.1.0', fake([{ tag_name: 'v1.29', assets: [] }])), null);
  await assert.rejects(updater.check('0.1.0', fake([], false, 403)), /403/);
  await assert.rejects(updater.check('0.1.0', async () => { throw new Error('offline'); }), /offline/);
});
