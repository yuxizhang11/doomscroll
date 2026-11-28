'use strict';
// Kurzer Selbsttest für `electron . --smoke` mit DOOMSCROLL_SMOKE_DIR: prüft Tray, lokalen Server (auch die
// Abwehr falscher Anfragen), die Oberfläche und das Panel (klein, „Mehr“, „Weniger“, Esc, Schnellschalter), prüft die Logo-Dateien,
// macht Bildschirmfotos und beendet die App selbst.

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

    // Erster Start: Das Fenster öffnet sich vor jeder Verbindung gleich auf dem Reiter „Erweiterung“ (needsSetup).
    const first = getWin('full', 'erweiterung');
    await new Promise((resolve) => (first.webContents.isLoading() ? first.webContents.once('did-finish-load', resolve) : resolve()));
    await sleep(1200);
    const currentTab = () => first.webContents.executeJavaScript("document.querySelector('.tabs [aria-current=page]')?.dataset.tab");
    check('firstWindowStartsOnExtensionTab', (await currentTab()) === 'erweiterung', await currentTab());

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

    const win = getWin('full');
    await new Promise((resolve) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', resolve) : resolve()));
    await sleep(1200);
    const js = (code) => win.webContents.executeJavaScript(code);
    const vm = await js('window.doomscroll.getState()');
    check('ipcGetState', vm && vm.version === '0.1.0' && vm.apps.length === 3);
    check('extensionProblemsShown', vm.extension.problems.some((p) => p.key === 'firefox:incognito'), vm.extension.problems);
    check('extensionDirHasManifest', fs.existsSync(path.join(vm.extension.dir, 'manifest.json')), vm.extension.dir);
    // Einrichtung: Browser werden nur gelesen; ungültige Aufrufe starten nichts (echte Starts und die Zwischenablage bleiben ungetestet).
    check('browsersDetected', Array.isArray(vm.extension.browsers) && vm.extension.browsers.every((b) => ['chrome', 'edge', 'brave', 'firefox'].includes(b.id)), vm.extension.browsers.map((b) => b.id));
    check('firefoxXpiStateReported', typeof vm.extension.firefoxXpi?.present === 'boolean' && typeof vm.extension.firefoxXpi?.active === 'boolean', vm.extension.firefoxXpi);
    check('extensionIdSet', /^[a-p]{32}$/.test(vm.extension.id));
    check('openBrowserRejectsUnknown', (await js("window.doomscroll.openBrowser('cmd', 'extensions')")).ok === false && (await js("window.doomscroll.openBrowser('chrome', 'file:///C:/Windows/notepad.exe')")).ok === false);
    check('needsSetupEndsWithConnection', vm.extension.needsSetup === false);
    await js("document.querySelector('[data-tab=mehr]').click()");
    win.webContents.send('open-tab', 'erweiterung'); // wie das Tray-Menü „Erweiterung einrichten …“
    await sleep(500);
    check('openTabSwitchesToExtension', (await js("document.querySelector('.tabs [aria-current=page]')?.dataset.tab")) === 'erweiterung');
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
    // Einrichtung mit Firefox gewählt (Schritte, Hinweis, Kopplung von Hand), falls Firefox gefunden wurde
    await js("document.querySelector('[data-tab=erweiterung]').click()");
    await sleep(500);
    if (await js("(() => { const l = [...document.querySelectorAll('.seg label')].find((x) => x.textContent === 'Firefox'); if (!l) return false; l.querySelector('input').click(); return true; })()")) {
      await sleep(500);
      check('firefoxSetupExplainsPersistence', await js("document.body.textContent.includes('Neustart')"));
      await js('window.scrollTo(0, 420)');
      await sleep(300);
      await shot(win, path.join(dir, 'erweiterung-firefox.png'));
      await js('window.scrollTo(0, 99999)');
      await sleep(300);
      await shot(win, path.join(dir, 'erweiterung-unten.png'));
    }
    await js("document.documentElement.dataset.theme='dark';document.documentElement.dataset.glass='einfach';document.querySelector('[data-tab=heute]').click();");
    // Dialog für den Entsperr-Satz öffnen und fotografieren
    await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Für alle Apps aufheben').click()");
    await sleep(900);
    await shot(win, path.join(dir, 'dialog-satz.png'));
    const pasteBlocked = await js(`(() => { const t = document.getElementById('ch-input'); const e = new Event('paste', {cancelable:true, bubbles:true}); t.dispatchEvent(e); return e.defaultPrevented; })()`);
    check('pasteBlocked', pasteBlocked === true);

    // ---------- Panel am Tray: klein öffnen, „Mehr“ klappt auf, „Weniger“ klappt ein ----------
    await js("document.getElementById('challenge').close()");
    const dims = () => win.getSize().join('x');
    const stageNow = () => js('document.documentElement.dataset.stage');
    const tabNow = () => js("document.querySelector('.tabs [aria-current=page]')?.dataset.tab");
    const shown = (sel) => js(`(() => { const e = document.querySelector('${sel}'); return Boolean(e) && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; })()`);
    const esc = () => js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await js("window.doomscroll.setPref('animations','an')"); // mit Animation prüfen: sie muss auf der Zielgröße enden
    check('fullStageHasTabsAndLess', (await stageNow()) === 'full' && (await shown('.tabs')) && (await shown('#panel-less')) && !(await shown('.foot')), `${await stageNow()} ${dims()}`);
    await js("document.getElementById('panel-less').click()");
    await sleep(900);
    check('weniger_collapsesToCompact', (await stageNow()) === 'compact' && dims() === '360x480', `${await stageNow()} ${dims()}`);
    check('compactContentFillsWindow', await js('innerWidth === 360 && innerHeight === 480'), await js('[innerWidth, innerHeight]'));
    check('compactShowsMoreNotTabs', (await shown('#panel-more')) && !(await shown('.tabs')) && !(await shown('#panel-less')));
    check('compactHasStatusAndToday', await js("['Heute', 'Status', 'Schnell'].every((t) => [...document.querySelectorAll('.card > h2')].some((h) => h.textContent === t)) && document.body.textContent.includes('Private Fenster')"));
    check('compactNoHorizontalScroll', await js('document.documentElement.scrollWidth <= window.innerWidth'));
    check('compactTapTargets48', await js("[...document.querySelectorAll('.foot button, .flyout-actions button, .switch input')].every((e) => e.getBoundingClientRect().height >= 47)"));
    check('compactSwitchesLabelled', await js("[...document.querySelectorAll('#view [role=switch]')].length === 2 && [...document.querySelectorAll('#view [role=switch]')].every((e) => e.getAttribute('aria-label'))"));
    // Logo und Symbole: Dateien da, Logo in der Kopfzeile geladen
    const assets = path.join(__dirname, '..', 'assets');
    check('iconFilesExist', ['icon.ico', 'icon.png', 'logo.svg', 'logo-glass.svg', 'tray.png', 'tray@1.8x.png', 'tray@2x.png'].every((f) => fs.existsSync(path.join(assets, f))) && ['16', '48', '128'].every((n) => fs.existsSync(path.join(vm.extension.dir, 'icons', `icon-${n}.png`))));
    check('headerLogoLoaded', await js("(() => { return [...document.querySelectorAll('.top .logo')].length === 2 && [...document.querySelectorAll('.top .logo')].every((i) => i.complete && i.naturalWidth > 0); })()"));
    for (const [name, theme, glass] of [['flyout-dunkel-voll', 'dunkel', 'voll'], ['flyout-hell-aus', 'hell', 'aus'], ['flyout-hell-voll', 'hell', 'voll'], ['flyout-dunkel-einfach', 'dunkel', 'einfach']]) {
      await js(`window.doomscroll.setPref('theme','${theme}');window.doomscroll.setPref('glass','${glass}');`);
      await sleep(2600);
      await shot(win, path.join(dir, `${name}.png`));
    }
    // Große Schrift: nichts ragt aus dem Panel (die Seite schneidet seitlich ab, darum je Element gemessen)
    for (const scale of [150, 200]) {
      await js(`window.doomscroll.setPref('text_scale', ${scale})`);
      await sleep(2600);
      check(`compactFitsAtText${scale}`, await js(`(() => { const w = innerWidth; return document.documentElement.scrollWidth <= w && [...document.querySelectorAll('.top, .top h1, .card, .row, .foot .btn, .badge')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= w + 0.5; }); })()`));
      await shot(win, path.join(dir, `flyout-schrift-${scale}.png`));
    }
    await js('window.scrollTo(0, 99999)');
    await sleep(300);
    await shot(win, path.join(dir, 'flyout-schrift-200-unten.png'));
    await js("window.doomscroll.setPref('text_scale', 100)");
    await sleep(2600);
    await js('window.scrollTo(0, 99999)'); // unterer Teil des Panels (Schnellschalter)
    await sleep(300);
    await shot(win, path.join(dir, 'flyout-unten-dunkel-einfach.png'));
    await js('window.scrollTo(0, 0)');
    // Schnellschalter: Meldungen aus und wieder an; Autostart aus braucht die 20 Zeichen (Schalter bleibt an, Dialog öffnet sich)
    await js("document.querySelector('[data-k=notices]').click()");
    await sleep(400);
    const off = await js('window.doomscroll.getState()');
    check('noticesSwitchTurnsOffThree', ['hint_remaining', 'hint_warning', 'hint_extension'].every((k) => off.prefs.hints[k] === false));
    await js("document.querySelector('[data-k=notices]').click()");
    await sleep(400);
    check('noticesSwitchTurnsOn', (await js('window.doomscroll.getState()')).prefs.hints.hint_remaining === true);
    await js("document.querySelector('[data-k=autostart]').click()");
    await sleep(600);
    check('autostartOffAsksForCode', (await js("document.getElementById('challenge').open")) && (await js("document.getElementById('ch-text').classList.contains('code')")) && (await js('window.doomscroll.getState()')).prefs.autostart === true);
    await esc();
    await sleep(300);
    check('escWithDialogKeepsPanel', win.isVisible());
    await js("document.getElementById('challenge').close()");
    // Esc ohne Dialog schließt das Panel; beim nächsten Öffnen (Tray-Klick) ist es wieder klein
    await esc();
    await sleep(300);
    check('escClosesPanel', !win.isVisible());
    getWin('compact');
    await sleep(500);
    check('reopenIsCompact', win.isVisible() && (await stageNow()) === 'compact' && dims() === '360x480', `${await stageNow()} ${dims()}`);
    // Fokusverlust (Ereignisse von Hand ausgelöst, das Testfenster ist nicht fokussierbar): das kleine Panel schließt erst nach Fokus, das aufgeklappte bleibt offen
    win.emit('blur');
    check('blurWithoutFocusKeepsPanel', win.isVisible());
    win.emit('focus');
    win.emit('blur');
    check('blurClosesCompactPanel', !win.isVisible());
    getWin('full');
    await sleep(500);
    win.emit('blur');
    win.emit('focus');
    win.emit('blur');
    check('blurKeepsFullPanelOpen', win.isVisible() && (await stageNow()) === 'full');
    await js("document.getElementById('panel-close').click()");
    await sleep(300);
    check('closeButtonHidesFullPanel', !win.isVisible());
    getWin('compact');
    await sleep(500);
    // „Mehr“ klappt auf (mit Animation), danach Fotos; „Erweiterung einrichten“ springt auf den Reiter
    await js("window.doomscroll.setPref('theme','hell');window.doomscroll.setPref('glass','aus')");
    await js("document.getElementById('panel-more').click()");
    await sleep(900);
    check('mehr_expandsToFull', (await stageNow()) === 'full' && dims() === '520x760' && (await shown('.tabs')) && (await shown('#panel-less')) && !(await shown('#panel-more')), `${await stageNow()} ${dims()}`);
    check('fullContentFillsWindow', await js('innerWidth === 520 && innerHeight === 760'), await js('[innerWidth, innerHeight]'));
    check('expandedStartsOnHeute', (await tabNow()) === 'heute');
    await sleep(2600);
    await shot(win, path.join(dir, 'aufgeklappt-hell-aus.png'));
    await js("window.doomscroll.setPref('theme','dunkel');window.doomscroll.setPref('glass','voll')");
    await sleep(2600);
    await shot(win, path.join(dir, 'aufgeklappt-dunkel-voll.png'));
    await js("document.getElementById('panel-less').click()");
    await sleep(900);
    await js("document.querySelector('[data-k=setup]').click()");
    await sleep(900);
    check('setupExpandsToExtensionTab', (await stageNow()) === 'full' && (await tabNow()) === 'erweiterung');
    // ohne Animation: sofort auf der Zielgröße
    await js("window.doomscroll.setPref('animations','aus')");
    await js("document.getElementById('panel-less').click()");
    await sleep(250);
    check('noAnimationJumpsToCompact', dims() === '360x480', dims());

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
