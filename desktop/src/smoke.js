'use strict';
// Kurzer Selbsttest für `electron . --smoke` mit DOOMSCROLL_SMOKE_DIR: prüft Tray, lokalen Server (auch die
// Abwehr falscher Anfragen) und die Oberfläche, macht Bildschirmfotos und beendet die App selbst.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function request(port, { method = 'POST', headers = {}, body, pathName = '/v1/heartbeat' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathName, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, body: text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** capturePage schlägt gelegentlich fehl (UnknownVizError), wenn das Fenster gerade neu zeichnet. */
async function shot(win, file) {
  for (let i = 0; ; i++) {
    try {
      fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
      return;
    } catch (err) {
      if (i >= 4) throw err;
      await sleep(500);
    }
  }
}

async function run({ app, getWin, tray, getServer, token, port, store }) {
  const dir = process.env.DOOMSCROLL_SMOKE_DIR;
  const results = { startedAt: new Date().toISOString() };
  const fail = [];
  const check = (name, ok, detail) => {
    results[name] = detail ?? ok;
    if (!ok) fail.push(name);
  };
  try {
    for (let i = 0; i < 50 && !getServer(); i++) await sleep(100);
    check('trayCreated', Boolean(tray) && !tray.isDestroyed());
    check('serverListening', Boolean(getServer()?.listening));
    const addr = getServer()?.address();
    check('serverBoundToLoopbackOnly', addr?.address === '127.0.0.1', addr);

    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const beat = (client, browser, incognitoAllowed, tabs, extra = {}) =>
      request(port, { headers: { ...auth, ...extra }, body: JSON.stringify({ client, browser, label: browser, version: '0.1.0', incognitoAllowed, tabs }) });

    // Sprung in den Verlauf, damit die Fotos etwas zeigen.
    const today = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = `hist_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      store.data[key] = (10 + i * 7) * 60000;
    }
    store.ensureToday();
    store.addUsage('INSTAGRAM', 12 * 60000);
    store.addUsage('YOUTUBE', 9 * 60000);

    const ok = await beat('smoke-client-1', 'chromium', true, [{ id: 1, url: 'https://www.youtube.com/watch?v=x', incognito: false }]);
    check('heartbeatOk', ok.status === 200 && JSON.parse(ok.body).blocks.length === 0, ok.status);
    const porn = await beat('smoke-client-1', 'chromium', true, [{ id: 2, url: 'https://www.google.com/search?q=porn', incognito: true }]);
    check('pornBlocked', porn.status === 200 && JSON.parse(porn.body).blocks[0]?.kind === 'porn', porn.body);
    const ff = await beat('smoke-client-2', 'firefox', false, [{ id: 3, url: 'about:blank', incognito: false }]);
    check('firefoxHeartbeat', ff.status === 200);
    check('wrongToken401', (await request(port, { headers: { ...auth, Authorization: 'Bearer falsch' }, body: '{}' })).status === 401);
    check('noToken401', (await request(port, { headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 401);
    check('webOrigin403', (await beat('smoke-client-3', 'chromium', true, [], { Origin: 'https://evil.example' })).status === 403);
    check('extensionOriginAllowed', (await beat('smoke-client-3', 'chromium', true, [], { Origin: 'chrome-extension://abcdefghijklmnop' })).status === 200);
    check('badHost421', (await beat('smoke-client-3', 'chromium', true, [], { Host: 'evil.example' })).status === 421);
    check('get404', (await request(port, { method: 'GET', headers: auth })).status === 404);
    check('badBody400', (await request(port, { headers: auth, body: '{"tabs": 5}' })).status === 400);
    check('notJson400', (await request(port, { headers: auth, body: 'kein json' })).status === 400);
    const big = await request(port, { headers: auth, body: JSON.stringify({ x: 'a'.repeat(300_000) }) }).catch(() => ({ status: 'abgebrochen' }));
    check('tooLargeRejected', big.status === 413 || big.status === 'abgebrochen', big.status);

    const win = getWin();
    await new Promise((resolve) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', resolve) : resolve()));
    await sleep(1200);
    const js = (code) => win.webContents.executeJavaScript(code);
    const vm = await js('window.doomscroll.getState()');
    check('ipcGetState', vm && vm.version === '0.1.0' && vm.apps.length === 3);
    check('extensionProblemsShown', vm.extension.problems.some((p) => p.key === 'firefox:incognito'), vm.extension.problems);
    check('extensionDirHasManifest', fs.existsSync(path.join(vm.extension.dir, 'manifest.json')), vm.extension.dir);
    // Einrichtung: Browser werden nur gelesen; ungültige Aufrufe starten nichts (echte Starts und die Zwischenablage bleiben ungetestet).
    check('browsersDetected', Array.isArray(vm.extension.browsers) && vm.extension.browsers.every((b) => ['chrome', 'edge', 'brave', 'firefox'].includes(b.id)), vm.extension.browsers.map((b) => b.id));
    check('extensionIdSet', /^[a-p]{32}$/.test(vm.extension.id));
    check('openBrowserRejectsUnknown', (await js("window.doomscroll.openBrowser('cmd', 'extensions')")).ok === false && (await js("window.doomscroll.openBrowser('chrome', 'file:///C:/Windows/notepad.exe')")).ok === false);
    const ch = await js("window.doomscroll.newChallenge('QUIT')");
    check('quitChallengeIs20Chars', ch?.kind === 'code' && ch.text.length === 20);
    const wrong = await js("window.doomscroll.submitChallenge('QUIT', 'falsch')");
    check('wrongChallengeRejected', wrong.ok === false);
    check('unknownScopeRejected', (await js("window.doomscroll.newChallenge('ROOT')")) === null);
    const pageErrors = [];
    win.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') pageErrors.push(e.message); });

    const shots = [
      ['heute-dunkel-einfach', 'heute', 'dark', 'einfach'],
      ['limits-hell-einfach', 'limits', 'light', 'einfach'],
      ['erweiterung-dunkel-voll', 'erweiterung', 'dark', 'voll'],
      ['mehr-hell-aus', 'mehr', 'light', 'aus'],
      ['heute-hell-voll', 'heute', 'light', 'voll'],
    ];
    await js('window.__errs=[];addEventListener("error",(e)=>window.__errs.push(e.message))');
    win.setSize(520, 1000);
    await js("window.doomscroll.setPref('animations','aus')");
    for (const [name, tab, theme, glass] of shots) {
      await js(`window.doomscroll.setPref('theme','${theme === 'dark' ? 'dunkel' : 'hell'}');window.doomscroll.setPref('glass','${glass}');document.querySelector('[data-tab=${tab}]').click();`);
      await sleep(2600); // die Oberfläche übernimmt Darstellung alle 2 s
      await shot(win, path.join(dir, `${name}.png`));
    }
    await js("document.documentElement.dataset.theme='dark';document.documentElement.dataset.glass='einfach';document.querySelector('[data-tab=heute]').click();");
    // Dialog für den Entsperr-Satz öffnen und fotografieren
    await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Für alle Apps aufheben').click()");
    await sleep(900);
    await shot(win, path.join(dir, 'dialog-satz.png'));
    const pasteBlocked = await js(`(() => { const t = document.getElementById('ch-input'); const e = new Event('paste', {cancelable:true, bubbles:true}); t.dispatchEvent(e); return e.defaultPrevented; })()`);
    check('pasteBlocked', pasteBlocked === true);
    pageErrors.push(...(await js('window.__errs')));
    results.pageErrors = pageErrors;
    check('noPageErrors', pageErrors.length === 0, pageErrors);
  } catch (err) {
    fail.push('exception');
    results.exception = String(err && err.stack ? err.stack : err);
  }
  results.failed = fail;
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
  app.exit(fail.length === 0 ? 0 : 1);
}

module.exports = { run };
