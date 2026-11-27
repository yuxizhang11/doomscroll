'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPorn, cleanWord } = require('../src/core/adult-filter');
const { fromUrl, parseWebUrl } = require('../src/core/targets');
const { Store, inWindow, MINUTE, SCHEMA } = require('../src/core/store');
const { Tracker } = require('../src/core/tracker');
const unlock = require('../src/core/unlock');
const backup = require('../src/core/backup');
const { isNewer, pickRelease, isTrustedDownload, parseChangelog } = require('../src/core/version');
const { evaluate } = require('../src/core/extension-status');

/** Eine steuerbare Uhr: Datum lokal, damit Mitternacht lokal gilt. */
function clock(y = 2026, m = 11, d = 10, h = 12, min = 0) {
  const c = { t: new Date(y, m - 1, d, h, min, 0).getTime() };
  c.now = () => new Date(c.t);
  c.advance = (ms) => { c.t += ms; };
  return c;
}

const tab = (url, id = 1, focused = true) => ({ id, url, incognito: false, focused });
const INFO = { browser: 'chromium', label: 'Chrome', version: '1', incognitoAllowed: true };

// ---------- Adult-Filter ----------

test('Porno-Filter: Seitennamen, Wörter und ganze Wörter', () => {
  assert.ok(isPorn('https://www.pornhub.com/'));
  assert.ok(isPorn('https://www.google.com/search?q=hentai+bilder'));
  assert.ok(isPorn('https://example.com/XXX/clip'));
  assert.ok(isPorn('https://example.com/?q=milf'));
  assert.ok(isPorn('https://beeg.com/'));
  assert.ok(isPorn('https://de.tube8.com/x'));
});

test('Porno-Filter: Domain-Liste gilt auch mit Punkt am Ende, Port, Benutzerteil und Fragment', () => {
  for (const u of ['https://beeg.com./', 'https://beeg.com:8443/x', 'https://name@beeg.com/', 'https://beeg.com#a', 'https://www.beeg.com./a']) assert.ok(isPorn(u), u);
  assert.equal(isPorn('https://example.com/?u=name@beeg.org'), false);
});

test('Porno-Filter: harmlose Seiten bleiben offen', () => {
  assert.equal(isPorn('https://de.wikipedia.org/wiki/Sexualkunde'), false);
  assert.equal(isPorn('https://shop.example.com/tshirt-xxxl'), false);
  assert.equal(isPorn('https://milford.example.com/'), false);
  assert.equal(isPorn('https://www.tagesschau.de/'), false);
  assert.equal(isPorn(''), false);
  assert.equal(isPorn(undefined), false);
  assert.equal(isPorn(42), false);
});

test('Porno-Filter: prozentkodierte Adressen (Umlaute, Leerzeichen) treffen eigene Wörter', () => {
  assert.ok(isPorn('https://www.google.com/search?q=m%C3%BCllwort+mehr', ['müllwort']));
  assert.ok(isPorn('https://example.com/?q=zwei%20worte', ['zwei worte']));
  assert.ok(isPorn('https://example.com/?q=zwei+worte', ['zwei worte']));
  assert.ok(isPorn('https://example.com/?q=%70orn'), 'auch Porno-Wörter hinter %-Kodierung');
  assert.equal(isPorn('https://example.com/?q=%E0%A4%A', ['x1']), false, 'kaputte Kodierung wirft nicht');
});

test('Porno-Filter: eigene Wörter zählen wie „porn“, zu kurze werden abgelehnt', () => {
  assert.equal(isPorn('https://example.com/?q=deepfake'), false);
  assert.ok(isPorn('https://example.com/?q=DeepFake+videos', ['deepfake']));
  assert.equal(cleanWord(' Deepfake '), 'deepfake');
  assert.equal(cleanWord('a'), null);
  assert.equal(cleanWord('   '), null);
  assert.equal(cleanWord(null), null);
  assert.equal(cleanWord('x'.repeat(65)), null);
});

// ---------- Adressen ----------

test('Adressen: nur Reels, Shorts und TikTok', () => {
  assert.equal(fromUrl('https://www.instagram.com/reels/')?.id, 'INSTAGRAM');
  assert.equal(fromUrl('https://www.instagram.com/reel/Cabc123/')?.id, 'INSTAGRAM');
  assert.equal(fromUrl('https://www.instagram.com/someone/reel/Cabc123/')?.id, 'INSTAGRAM');
  assert.equal(fromUrl('https://www.instagram.com/'), null);
  assert.equal(fromUrl('https://www.instagram.com/direct/inbox/'), null);
  assert.equal(fromUrl('https://www.instagram.com/stories/x/'), null);
  assert.equal(fromUrl('https://www.instagram.com/realreels/'), null);
  assert.equal(fromUrl('https://www.youtube.com/shorts/abc')?.id, 'YOUTUBE');
  assert.equal(fromUrl('https://m.youtube.com/shorts/abc')?.id, 'YOUTUBE');
  assert.equal(fromUrl('https://www.youtube.com/watch?v=abc'), null);
  assert.equal(fromUrl('https://www.youtube.com/shortsfoo'), null);
  assert.equal(fromUrl('https://www.tiktok.com/@x/video/1')?.id, 'TIKTOK');
  assert.equal(fromUrl('https://tiktok.com/')?.id, 'TIKTOK');
});

test('Adressen: Fälschungen und ungültige Eingaben', () => {
  assert.equal(fromUrl('https://nottiktok.com/'), null);
  assert.equal(fromUrl('https://tiktok.com.evil.example/'), null);
  assert.equal(fromUrl('https://evil.example/?u=youtube.com/shorts/x'), null);
  assert.equal(fromUrl('javascript:alert(1)'), null);
  assert.equal(fromUrl('chrome://settings'), null);
  assert.equal(fromUrl('about:blank'), null);
  assert.equal(fromUrl(''), null);
  assert.equal(fromUrl(null), null);
  assert.equal(fromUrl({}), null);
  assert.equal(parseWebUrl('https://x.example/' + 'a'.repeat(9000)), null);
});

// ---------- Store ----------

test('Store: Vorgaben wie am Handy', () => {
  const s = new Store({}, { now: clock().now });
  assert.equal(s.globalLimitMinutes, 30);
  assert.equal(s.limitMinutes('INSTAGRAM'), 15);
  assert.equal(s.perAppMode, false);
  assert.equal(s.warnMinutes, 5);
  assert.equal(s.quietEnabled, false);
  assert.equal(s.data.schema_version, SCHEMA);
});

test('Store: Zeitfenster über Mitternacht', () => {
  assert.ok(inWindow(23 * 60, 22 * 60, 7 * 60));
  assert.ok(inWindow(3 * 60, 22 * 60, 7 * 60));
  assert.equal(inWindow(12 * 60, 22 * 60, 7 * 60), false);
  assert.ok(inWindow(9 * 60, 8 * 60, 10 * 60));
  assert.equal(inWindow(10 * 60, 8 * 60, 10 * 60), false);
  assert.equal(inWindow(5, 100, 100), false);
});

test('Store: gemeinsames Limit zählt alle aktiven Apps, pro App nur die eigene', () => {
  const c = clock();
  const s = new Store({}, { now: c.now });
  s.addUsage('INSTAGRAM', 10 * MINUTE);
  s.addUsage('YOUTUBE', 5 * MINUTE);
  assert.equal(s.remainingMs('TIKTOK'), 15 * MINUTE);
  s.applySettings({ ...s.settings(), perAppMode: true });
  assert.equal(s.remainingMs('INSTAGRAM'), 5 * MINUTE);
  assert.equal(s.remainingMs('TIKTOK'), 15 * MINUTE);
});

test('Store: ausgeschaltete App und Entsperrung begrenzen nichts', () => {
  const s = new Store({}, { now: clock().now });
  s.addUsage('TIKTOK', 99 * MINUTE);
  assert.ok(s.remainingMs('TIKTOK') < 0);
  s.unlockToday('TIKTOK');
  assert.equal(s.remainingMs('TIKTOK'), null);
  const t = new Store({}, { now: clock().now });
  t.addUsage('TIKTOK', 99 * MINUTE);
  t.unlockToday(null);
  assert.equal(t.remainingMs('INSTAGRAM'), null);
  const u = new Store({ enabled_YOUTUBE: false }, { now: clock().now });
  assert.equal(u.remainingMs('YOUTUBE'), null);
});

test('Store: Ruhezeit sperrt, egal wie viel vom Limit übrig ist', () => {
  const c = clock(2026, 11, 10, 23, 0);
  const s = new Store({ quiet: true, quiet_start: 22 * 60, quiet_end: 7 * 60 }, { now: c.now });
  assert.equal(s.remainingMs('INSTAGRAM'), 0);
  c.t = new Date(2026, 10, 11, 8, 0).getTime();
  assert.ok(s.remainingMs('INSTAGRAM') > 0);
});

test('Store: Mitternacht setzt Zähler, Entsperrung und Warnung zurück und schreibt den Verlauf', () => {
  const c = clock(2026, 11, 10, 23, 59);
  const s = new Store({}, { now: c.now });
  s.addUsage('INSTAGRAM', 7 * MINUTE);
  s.addUsage('TIKTOK', 3 * MINUTE);
  s.unlockToday(null);
  s.markWarned('INSTAGRAM');
  assert.equal(s.dayTotalMs(c.now()), 10 * MINUTE);
  c.advance(2 * MINUTE); // 00:01 am nächsten Tag
  assert.equal(s.usageMs('INSTAGRAM'), 0);
  assert.equal(s.isUnlockedToday(null), false);
  assert.equal(s.wasWarnedToday('INSTAGRAM'), false);
  assert.equal(s.dayTotalMs(new Date(2026, 10, 10)), 10 * MINUTE);
  assert.equal(s.dayTotalMs(c.now()), 0);
});

test('Store: Verlauf behält 30 Tage, ältere und kaputte Einträge fallen weg', () => {
  const c = clock(2026, 11, 10);
  const s = new Store({
    day: '2026-11-09', usage_INSTAGRAM: MINUTE,
    'hist_2026-10-01': 5, 'hist_2026-10-20': 6, 'hist_kaputt': 7,
  }, { now: c.now });
  s.ensureToday();
  assert.equal(s.data['hist_2026-11-09'], MINUTE);
  assert.equal(s.data['hist_2026-10-20'], 6);
  assert.equal('hist_2026-10-01' in s.data, false);
  assert.equal('hist_kaputt' in s.data, false);
});

test('Store: kaputte Werte fallen auf die Vorgaben zurück', () => {
  const s = new Store({ global_limit: 'viel', limit_TIKTOK: NaN, quiet_start: 99999, text_scale: 5000, theme: 'bunt', glass: 3 }, { now: clock().now });
  assert.equal(s.globalLimitMinutes, 30);
  assert.equal(s.limitMinutes('TIKTOK'), 15);
  assert.equal(s.quietStart, 1439);
  assert.equal(s.textScalePercent, 200);
  assert.equal(s.theme, 'system');
  assert.equal(s.glass, 'einfach');
  assert.deepEqual(new Store(null).adultWords, []);
  assert.deepEqual(new Store([1, 2]).adultWords, []);
});

test('Store: ungültige Einstellungen werden bereinigt', () => {
  const s = new Store({}, { now: clock().now });
  const base = s.settings();
  assert.deepEqual(s.sanitizeSettings(null), base);
  assert.deepEqual(s.sanitizeSettings('x'), base);
  assert.deepEqual(s.sanitizeSettings([]), base);
  const odd = s.sanitizeSettings({ globalLimit: -5, limits: { INSTAGRAM: 99999, YOUTUBE: 'x', EVIL: 1 }, enabled: { TIKTOK: 'ja' }, warnMinutes: 1.4, quietStart: -1, perAppMode: 1 });
  assert.equal(odd.globalLimit, 0);
  assert.equal(odd.limits.INSTAGRAM, 600);
  assert.equal(odd.limits.YOUTUBE, base.limits.YOUTUBE);
  assert.equal('EVIL' in odd.limits, false);
  assert.equal(odd.enabled.TIKTOK, true);
  assert.equal(odd.warnMinutes, 1);
  assert.equal(odd.quietStart, 0);
  assert.equal(odd.perAppMode, false);
});

test('Lockern braucht den Satz, Verschärfen nicht', () => {
  const s = new Store({}, { now: clock().now });
  const cur = s.settings();
  assert.equal(s.loosens(cur), false);
  assert.equal(s.loosens({ ...cur, globalLimit: 20 }), false);
  assert.equal(s.loosens({ ...cur, globalLimit: 35 }), true);
  assert.equal(s.loosens({ ...cur, perAppMode: true }), true);
  assert.equal(s.loosens({ ...cur, limits: { ...cur.limits, TIKTOK: 20 } }), true);
  assert.equal(s.loosens({ ...cur, enabled: { ...cur.enabled, YOUTUBE: false } }), true);
  assert.equal(s.loosens({ ...cur, warnMinutes: 0 }), false);
  assert.equal(s.loosens({ ...cur, quietEnabled: true }), false);
  s.applySettings({ ...cur, quietEnabled: true, quietStart: 22 * 60, quietEnd: 7 * 60 });
  const q = s.settings();
  assert.equal(s.loosens({ ...q, quietEnabled: false }), true);
  assert.equal(s.loosens({ ...q, quietStart: 23 * 60 }), true);
  assert.equal(s.loosens({ ...q, quietStart: 21 * 60 }), false);
  assert.equal(s.loosens({ ...q, quietEnd: 8 * 60 }), false);
});

test('Eigene Wörter: nur ergänzen, doppelte und zu kurze abweisen', () => {
  const s = new Store({}, { now: clock().now });
  assert.equal(s.addAdultWord('DeepFake'), true);
  assert.equal(s.addAdultWord('deepfake'), true);
  assert.equal(s.addAdultWord('a'), false);
  assert.deepEqual(s.adultWords, ['deepfake']);
});

// ---------- Sicherung ----------

test('Sicherung: Export und Import round trip, Schema-Version drin', () => {
  const c = clock();
  const a = new Store({}, { now: c.now });
  a.applySettings({ ...a.settings(), globalLimit: 45, limits: { ...a.settings().limits, TIKTOK: 5 } });
  a.addAdultWord('deepfake');
  a.addUsage('INSTAGRAM', MINUTE);
  const text = backup.write(a, '0.1.0', new Date(2026, 10, 10, 12));
  const parsed = JSON.parse(text);
  assert.equal(parsed.schema, SCHEMA);
  assert.equal(parsed.app, backup.APP);
  assert.equal('usage_INSTAGRAM' in parsed.values, false, 'heutige Zähler gehören nicht in die Sicherung');
  const read = backup.read(text);
  assert.ok(read.values);
  const b = new Store({}, { now: c.now });
  const next = b.settingsFromBackup(read.values);
  assert.equal(next.globalLimit, 45);
  assert.equal(next.limits.TIKTOK, 5);
  b.restoreSafe(read.values);
  assert.deepEqual(b.adultWords, ['deepfake']);
});

test('Sicherung: Import fügt Wörter nur hinzu und lockert nie von selbst', () => {
  const s = new Store({ adult_words: ['eins'] }, { now: clock().now });
  s.restoreSafe({ adult_words: ['zwei', 'x', 5], global_limit: 600, 'hist_2026-11-01': 3 * MINUTE, 'hist_zzz': 1, hint_remaining: false, text_scale: 9999, theme: 'dunkel', glass: 'nix' });
  assert.deepEqual(s.adultWords, ['eins', 'zwei']);
  assert.equal(s.globalLimitMinutes, 30, 'Limits werden nur über den Satz gesetzt');
  assert.equal(s.data['hist_2026-11-01'], 3 * MINUTE);
  assert.equal('hist_zzz' in s.data, false);
  assert.equal(s.isOn('hint_remaining'), false);
  assert.equal(s.textScalePercent, 200);
  assert.equal(s.theme, 'dunkel');
  assert.equal(s.glass, 'einfach');
  const loose = s.settingsFromBackup({ global_limit: 600 });
  assert.equal(s.loosens(loose), true);
});

test('Sicherung: ungültige und fremde Dateien werden abgelehnt', () => {
  assert.match(backup.read('kein json').error, /keine Sicherungsdatei/);
  assert.match(backup.read('[]').error, /keine Sicherungsdatei/);
  assert.match(backup.read('null').error, /keine Sicherungsdatei/);
  assert.match(backup.read(JSON.stringify({ app: 'com.yuxizhang.doomscroll', schema: 1, values: {} })).error, /Handy-App/);
  assert.match(backup.read(JSON.stringify({ app: 'anders', schema: 1 })).error, /keine Sicherung/);
  assert.match(backup.read(JSON.stringify({ app: backup.APP, schema: SCHEMA + 1, values: {} })).error, /neueren Version/);
  assert.match(backup.read('x'.repeat(backup.MAX_BACKUP_BYTES + 1)).error, /zu groß/);
  assert.deepEqual(backup.read(JSON.stringify({ app: backup.APP, schema: 0 })).values, {});
  assert.deepEqual(backup.read(JSON.stringify({ app: backup.APP, schema: 1, values: [1] })).values, {});
});

// ---------- Entsperr-Aufgabe ----------

test('Entsperr-Sätze haben mindestens 15 Wörter', () => {
  for (const s of unlock.SENTENCES) assert.ok(unlock.wordCount(s) >= unlock.MIN_WORDS, s);
});

test('Entsperren: Satz muss vollständig stimmen, Satzzeichen und Groß-/Kleinschreibung sind egal', () => {
  const ch = unlock.newChallenge('ALL', () => 0);
  assert.equal(ch.kind, 'sentence');
  assert.ok(unlock.check(ch, ch.text));
  assert.ok(unlock.check(ch, '  ' + ch.text.toUpperCase().replace(/,/g, '') + ' '));
  const words = ch.text.split(' ');
  assert.equal(unlock.check(ch, words.slice(0, 14).join(' ')), false, 'Satz mit weniger Wörtern');
  assert.equal(unlock.check(ch, words.slice(0, -1).join(' ')), false);
  assert.equal(unlock.check(ch, ''), false);
  assert.equal(unlock.check(ch, null), false);
  assert.equal(unlock.check(ch, 'a'.repeat(5000)), false);
  assert.equal(unlock.check(null, 'x'), false);
});

test('Code: 20 Zeichen ohne Verwechslungen, Groß-/Kleinschreibung zählt', () => {
  const code = unlock.randomCode();
  assert.equal(code.length, 20);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{20}$/);
  assert.notEqual(unlock.randomCode(), unlock.randomCode());
  const ch = unlock.newChallenge('QUIT');
  assert.equal(ch.kind, 'code');
  assert.ok(unlock.check(ch, ch.text));
  assert.ok(unlock.check(ch, ' ' + ch.text + ' '));
  assert.equal(unlock.check(ch, ch.text.toLowerCase() === ch.text ? ch.text.toUpperCase() : ch.text.toLowerCase()), false);
  assert.equal(unlock.check(ch, ch.text.slice(1)), false);
});

test('Aufgaben: unbekannte Bereiche gibt es nicht', () => {
  assert.equal(unlock.newChallenge('ROOT'), null);
  assert.equal(unlock.newChallenge('__proto__'), null);
  assert.equal(unlock.newChallenge(undefined), null);
  assert.equal(unlock.newChallenge('INSTAGRAM').kind, 'sentence');
  assert.equal(unlock.newChallenge('AUTOSTART').kind, 'code');
});

// ---------- Tracker ----------

function setup(data = {}) {
  const c = clock();
  const store = new Store(data, { now: c.now });
  const tracker = new Tracker(store, { now: () => c.t });
  return { c, store, tracker };
}

test('Tracker: zählt nur Reels, Shorts und TikTok', () => {
  const { c, store, tracker } = setup();
  tracker.report('client-0001', INFO, [tab('https://www.youtube.com/watch?v=1')]);
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab('https://www.youtube.com/watch?v=1')]);
  assert.equal(store.usageMs('YOUTUBE'), 0);
  tracker.report('client-0001', INFO, [tab('https://www.youtube.com/shorts/1')]);
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab('https://www.youtube.com/shorts/1')]);
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab('https://www.youtube.com/shorts/1')]);
  assert.equal(store.usageMs('YOUTUBE'), 4000);
});

test('Tracker: ohne Fensterfokus zählt keine Zeit, ein Fensterwechsel umgeht die Sperre aber nicht', () => {
  const { c, store, tracker } = setup({ global_limit: 1 });
  const url = 'https://www.youtube.com/shorts/x';
  tracker.report('client-0001', INFO, [tab(url, 1, true)]);
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab(url, 1, true)]);
  assert.equal(store.usageMs('YOUTUBE'), 2000);
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab(url, 1, false)]); // die letzte Spanne vor dem Fokusverlust zählt noch
  const atFocusLoss = store.usageMs('YOUTUBE');
  for (let i = 0; i < 5; i++) {
    c.advance(2000);
    tracker.report('client-0001', INFO, [tab(url, 1, false)]);
  }
  assert.equal(store.usageMs('YOUTUBE'), atFocusLoss, 'Fenster ohne Fokus zählt nicht');
  assert.equal(tracker.currentApp(), null);
  // Limit erreicht: Der Tab ohne Fokus wird trotzdem gesperrt.
  store.addUsage('YOUTUBE', 2 * MINUTE);
  assert.deepEqual(tracker.report('client-0001', INFO, [tab(url, 1, false)]).blocks, [{ id: 1, kind: 'limit', app: 'YOUTUBE' }]);
  // Fehlt die Angabe ganz, gilt der Tab als ohne Fokus.
  const { c: c2, store: s2, tracker: t2 } = setup();
  t2.report('client-0001', INFO, [{ id: 1, url, incognito: false }]);
  c2.advance(2000);
  t2.report('client-0001', INFO, [{ id: 1, url, incognito: false }]);
  assert.equal(s2.usageMs('YOUTUBE'), 0);
});

test('Tracker: gesperrte Windows-Sitzung hält das Zählen an und beendet die Sitzung', () => {
  const { c, store, tracker } = setup();
  const reel = [tab('https://www.instagram.com/reels/')];
  tracker.report('client-0001', INFO, reel);
  c.advance(2000);
  tracker.report('client-0001', INFO, reel);
  assert.equal(store.usageMs('INSTAGRAM'), 2000);
  tracker.setLocked(true);
  assert.equal(tracker.currentApp(), null);
  for (let i = 0; i < 5; i++) {
    c.advance(2000);
    tracker.report('client-0001', INFO, reel);
  }
  assert.equal(store.usageMs('INSTAGRAM'), 2000, 'gesperrt zählt nichts');
  tracker.setLocked(false);
  c.advance(2000);
  tracker.report('client-0001', INFO, reel);
  assert.equal(store.usageMs('INSTAGRAM'), 2000, 'die Lücke bis zum Entsperren zählt nicht');
  c.advance(2000);
  tracker.report('client-0001', INFO, reel);
  assert.equal(store.usageMs('INSTAGRAM'), 4000, 'danach zählt es wieder');
});

test('Tracker: Lücke über 6 s zählt nicht, zwei Browser zählen die Zeit nur einmal', () => {
  const { c, store, tracker } = setup();
  const reel = [tab('https://www.instagram.com/reels/')];
  tracker.report('client-0001', INFO, reel);
  c.advance(60_000);
  tracker.report('client-0001', INFO, reel);
  assert.equal(store.usageMs('INSTAGRAM'), 0, 'Browser war weg');
  c.advance(1000);
  tracker.report('client-0002', { ...INFO, browser: 'firefox' }, reel);
  c.advance(1000);
  tracker.report('client-0001', INFO, reel);
  assert.equal(store.usageMs('INSTAGRAM'), 2000);
});

test('Tracker: Limit erreicht sperrt den Tab, Entsperren hebt es auf', () => {
  const { c, store, tracker } = setup({ global_limit: 1 });
  const url = 'https://www.tiktok.com/@x';
  let r = tracker.report('client-0001', INFO, [tab(url, 7)]);
  assert.deepEqual(r.blocks, []);
  for (let i = 0; i < 40; i++) {
    c.advance(2000);
    r = tracker.report('client-0001', INFO, [tab(url, 7)]);
  }
  assert.deepEqual(r.blocks, [{ id: 7, kind: 'limit', app: 'TIKTOK' }]);
  const before = store.usageMs('TIKTOK');
  c.advance(2000);
  tracker.report('client-0001', INFO, [tab(url, 7)]);
  assert.equal(store.usageMs('TIKTOK'), before, 'gesperrt zählt nicht weiter');
  store.unlockToday('TIKTOK');
  assert.deepEqual(tracker.report('client-0001', INFO, [tab(url, 7)]).blocks, []);
});

test('Tracker: Ruhezeit meldet „quiet“, normale Seiten bleiben offen', () => {
  const c = clock(2026, 11, 10, 23, 30);
  const store = new Store({ quiet: true }, { now: c.now });
  const tracker = new Tracker(store, { now: () => c.t });
  const r = tracker.report('client-0001', INFO, [tab('https://www.youtube.com/shorts/x', 1), tab('https://www.youtube.com/watch?v=y', 2)]);
  assert.deepEqual(r.blocks, [{ id: 1, kind: 'quiet', app: 'YOUTUBE' }]);
});

test('Tracker: Porno wird immer gesperrt, auch bei Entsperrung und im privaten Fenster', () => {
  const { store, tracker } = setup();
  store.unlockToday(null);
  const r = tracker.report('client-0001', INFO, [{ id: 3, url: 'https://www.google.com/search?q=porn', incognito: true }]);
  assert.deepEqual(r.blocks, [{ id: 3, kind: 'porn', app: null }]);
});

test('Tracker: eigene Wörter sperren, ausgeschaltete Apps bleiben frei', () => {
  const { store, tracker } = setup({ enabled_TIKTOK: false, global_limit: 0 });
  store.addAdultWord('deepfake');
  assert.deepEqual(tracker.report('client-0001', INFO, [tab('https://x.example/deepfake', 2)]).blocks[0].kind, 'porn');
  assert.deepEqual(tracker.report('client-0001', INFO, [tab('https://www.tiktok.com/')]).blocks, []);
});

test('Tracker: Restzeit beim Öffnen und Vorwarnung einmal pro Tag', () => {
  const { c, store, tracker } = setup({ global_limit: 6, warning_minutes: 5 });
  store.addUsage('YOUTUBE', MINUTE);
  const url = [tab('https://www.youtube.com/shorts/x')];
  let r = tracker.report('client-0001', INFO, url);
  assert.deepEqual(r.events.map((e) => e.type), ['remaining', 'warning'], 'Limit 6, 5 min übrig, Warnung bei 5');
  assert.equal(r.events[0].minutes, 5);
  c.advance(2000);
  r = tracker.report('client-0001', INFO, url);
  assert.deepEqual(r.events, []);
  assert.equal(store.wasWarnedToday('YOUTUBE'), true);
});

test('Tracker: keine Vorwarnung, wenn das Limit nicht länger als die Warnzeit ist; Hinweise abschaltbar', () => {
  const { tracker } = setup({ global_limit: 5, warning_minutes: 5, hint_remaining: false });
  assert.deepEqual(tracker.report('client-0001', INFO, [tab('https://www.tiktok.com/')]).events, []);
  const b = setup({ global_limit: 60, warning_minutes: 5, hint_warning: false });
  b.store.addUsage('TIKTOK', 56 * MINUTE);
  assert.deepEqual(b.tracker.report('client-0001', INFO, [tab('https://www.tiktok.com/')]).events.map((e) => e.type), ['remaining']);
});

test('Tracker: Restzeit kommt nach kurzer Pause nicht erneut, nach längerer schon', () => {
  const { c, tracker } = setup({ global_limit: 60 });
  const reel = [tab('https://www.instagram.com/reels/')];
  const none = [tab('https://www.instagram.com/')];
  assert.equal(tracker.report('client-0001', INFO, reel).events.length, 1);
  c.advance(2000);
  tracker.report('client-0001', INFO, none);
  c.advance(2000);
  assert.equal(tracker.report('client-0001', INFO, reel).events.length, 0);
  c.advance(2000);
  tracker.report('client-0001', INFO, none);
  c.advance(30_000);
  assert.equal(tracker.report('client-0001', INFO, reel).events.length, 1);
});

test('Tracker: Mitternacht während einer Sitzung setzt die Sperre zurück', () => {
  const c = clock(2026, 11, 10, 23, 59);
  c.t += 50_000;
  const store = new Store({ global_limit: 1 }, { now: c.now });
  const tracker = new Tracker(store, { now: () => c.t });
  const url = [tab('https://www.tiktok.com/', 4)];
  store.addUsage('TIKTOK', 2 * MINUTE);
  assert.equal(tracker.report('client-0001', INFO, url).blocks.length, 1);
  c.advance(30_000);
  assert.deepEqual(tracker.report('client-0001', INFO, url).blocks, []);
  assert.equal(store.usageMs('TIKTOK'), 0);
});

// ---------- Version, Release, Changelog ----------

test('Version: SemVer Teil für Teil als Zahlen', () => {
  assert.ok(isNewer('0.10.0', '0.9.0'));
  assert.ok(isNewer('1.0.0', '0.99.99'));
  assert.ok(isNewer('1.2.4', '1.2.3'));
  assert.equal(isNewer('1.2.3', '1.2.3'), false);
  assert.equal(isNewer('1.2.3', '1.10.0'), false);
  assert.equal(isNewer('abc', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', ''), false);
  assert.ok(isNewer('v2.0.0', '1.9.9'));
});

test('Release: nur Desktop-Releases mit .exe, die Android-Releases im selben Repo werden übersprungen', () => {
  const asset = (n) => ({ name: n, browser_download_url: `https://github.com/yuxizhang11/doomscroll/releases/download/x/${n}` });
  const list = [
    { tag_name: 'v1.29', assets: [asset('doomscroll-blocker-v1.29.apk')] },
    { tag_name: 'desktop-v0.2.0', draft: true, assets: [asset('a.exe')] },
    { tag_name: 'desktop-v0.1.1', body: 'Fix', assets: [asset('Setup.exe')] },
    { tag_name: 'desktop-v0.1.10', assets: [asset('Setup2.exe')] },
    { tag_name: 'desktop-v0.3.0', assets: [asset('nur.zip')] },
    null,
  ];
  assert.equal(pickRelease(list).version, '0.1.10');
  assert.equal(pickRelease([]), null);
  assert.equal(pickRelease(null), null);
  assert.equal(pickRelease([{ tag_name: 'v9.9' }]), null);
});

test('Download-Adresse: nur GitHub-Releases dieses Repos', () => {
  const repo = 'yuxizhang11/doomscroll';
  assert.ok(isTrustedDownload('https://github.com/yuxizhang11/doomscroll/releases/download/desktop-v0.1.0/Setup.exe', repo));
  assert.equal(isTrustedDownload('http://github.com/yuxizhang11/doomscroll/releases/download/x/a.exe', repo), false);
  assert.equal(isTrustedDownload('https://evil.example/yuxizhang11/doomscroll/releases/download/x/a.exe', repo), false);
  assert.equal(isTrustedDownload('https://github.com/other/repo/releases/download/x/a.exe', repo), false);
  assert.equal(isTrustedDownload('nichts', repo), false);
});

test('Changelog: Abschnitte werden gelesen', () => {
  const e = parseChangelog('# Changelog\n\n## 0.2.0 – 2026-12-01\n\n- Eins\n- Zwei\n\n## 0.1.0\n\n- Start\n');
  assert.deepEqual(e.map((x) => x.version), ['0.2.0', '0.1.0']);
  assert.deepEqual(e[0].lines, ['Eins', 'Zwei']);
  assert.equal(e[0].date, '2026-12-01');
  assert.deepEqual(parseChangelog(''), []);
});

// ---------- Erweiterungs-Status ----------

test('Erweiterung: fehlt, wenn ein Browser läuft und kein Heartbeat kommt', () => {
  const now = 1_000_000;
  const clients = new Map();
  let r = evaluate({ clients, running: new Set(['chrome.exe']), now });
  assert.equal(r.families.chromium.state, 'missing');
  assert.equal(r.families.firefox.state, 'idle');
  assert.deepEqual(r.problems.map((p) => p.key), ['chromium:missing']);
  clients.set('a', { browser: 'chromium', label: 'Chrome', seen: now - 1000, incognitoAllowed: true });
  r = evaluate({ clients, running: new Set(['chrome.exe']), now });
  assert.equal(r.families.chromium.state, 'ok');
  assert.deepEqual(r.problems, []);
});

test('Erweiterung: meldet, wenn private Fenster nicht erlaubt sind, und ignoriert alte Heartbeats', () => {
  const now = 1_000_000;
  const clients = new Map([['a', { browser: 'firefox', label: 'Firefox', seen: now - 2000, incognitoAllowed: false }]]);
  let r = evaluate({ clients, running: new Set(['firefox.exe']), now });
  assert.deepEqual(r.problems.map((p) => p.key), ['firefox:incognito']);
  clients.get('a').seen = now - 60_000;
  r = evaluate({ clients, running: new Set(['firefox.exe']), now });
  assert.deepEqual(r.problems.map((p) => p.key), ['firefox:missing']);
  r = evaluate({ clients, running: null, now });
  assert.equal(r.families.firefox.state, 'unknown');
  assert.deepEqual(r.problems, []);
});
