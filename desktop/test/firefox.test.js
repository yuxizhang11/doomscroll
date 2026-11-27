'use strict';
// Dauerhafte Firefox-Installation: Richtlinien-Logik, Signier-Skript (nur die Teile ohne Netz und ohne Schlüssel) und der Eintrag
// im Installer. Mit echtem Firefox ist das NICHT geprüft: die Richtlinie braucht eine signierte .xpi und Administratorrechte.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const policy = require('../src/core/firefox-policy');
const nm = require('../src/core/native-messaging');
const sign = require('../tools/firefox-signieren');

const root = path.join(__dirname, '..');
const XPI = 'C:\\Program Files\\Doomscroll Desktop\\resources\\firefox\\doomscroll-blocker.xpi';

test('xpiPath: installiert unter resources, in der Entwicklung im Projektordner', () => {
  assert.equal(policy.xpiPath({ isPackaged: true, resourcesPath: 'C:\\App\\resources', appDir: 'C:\\x' }), path.join('C:\\App\\resources', 'firefox', 'doomscroll-blocker.xpi'));
  assert.equal(policy.xpiPath({ isPackaged: false, resourcesPath: 'C:\\r', appDir: 'C:\\dev' }), path.join('C:\\dev', 'firefox', 'doomscroll-blocker.xpi'));
});

test('policyListsXpi liest die Ausgabe von reg query: genau dieser Pfad, Groß- und Kleinschreibung egal', () => {
  const out = `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mozilla\\Firefox\\Extensions\\Install\r\n    1    REG_SZ    https://example.org/a.xpi\r\n    2    REG_SZ    ${XPI}\r\n`;
  assert.equal(policy.policyListsXpi(out, XPI), true);
  assert.equal(policy.policyListsXpi(out.toUpperCase(), XPI), true);
  assert.equal(policy.policyListsXpi(out, 'C:\\Other\\doomscroll-blocker.xpi'), false);
  assert.equal(policy.policyListsXpi('', XPI), false);
  assert.equal(policy.policyListsXpi(undefined, XPI), false);
});

test('policyListsXpi mit echter reg.exe: Wert unter einem Testschlüssel in HKCU, Zustand vorher und nachher gleich', { skip: process.platform !== 'win32' }, () => {
  const key = `HKCU\\Software\\DoomscrollDesktopTest-${crypto.randomBytes(4).toString('hex')}\\Install`;
  const reg = (...args) => execFileSync('reg', args, { windowsHide: true, encoding: 'utf8' });
  const exists = () => { try { reg('query', key); return true; } catch { return false; } };
  assert.equal(exists(), false, 'der Testschlüssel darf nicht vorher da sein');
  try {
    reg('add', key, '/v', '3', '/t', 'REG_SZ', '/d', XPI, '/f');
    assert.equal(policy.policyListsXpi(reg('query', key), XPI), true);
    assert.equal(policy.policyListsXpi(reg('query', key), `${XPI}.alt`), false);
  } finally {
    try { reg('delete', key.replace(/\\Install$/, ''), '/f'); } catch { /* war nicht angelegt */ }
  }
  assert.equal(exists(), false, 'aufgeräumt');
});

test('Installer: schreibt und entfernt den Eintrag unter dem Schlüssel der App, nur bei Deinstallation und nicht bei Update', () => {
  const nsh = fs.readFileSync(path.join(root, 'installer', 'installer.nsh'), 'utf8');
  assert.ok(nsh.includes(policy.POLICY_KEY), 'Schlüssel wie POLICY_KEY');
  assert.ok(nsh.includes(`resources\\firefox\\${policy.XPI_NAME}`), 'Dateiname wie XPI_NAME');
  assert.match(nsh, /\$installMode == "all"[\s\S]*doomscrollPolicyAdd HKLM[\s\S]*\$\{Else\}[\s\S]*doomscrollPolicyAdd HKCU/, 'alle Benutzer: HKLM, sonst HKCU');
  assert.match(nsh, /\$\{ifNot\} \$\{isUpdated\}[\s\S]*doomscrollPolicyRemove HKLM[\s\S]*doomscrollPolicyRemove HKCU[\s\S]*\$\{endIf\}/, 'bei einem Update bleibt der Eintrag stehen');
  assert.match(nsh, /FileExists[^\n]*doomscroll-blocker\.xpi/, 'ohne beiliegende .xpi wird nichts eingetragen');
  assert.doesNotMatch(nsh, /DeleteRegKey [A-Z]+ "SOFTWARE\\Policies/, 'nie den ganzen Richtlinien-Schlüssel löschen (andere Einträge bleiben)');
});

test('package.json: .xpi wird als Ressource mitgeliefert, Signier-Skript ist angebunden', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.build.extraResources.some((r) => r.from === 'firefox' && r.to === 'firefox' && r.filter.includes('*.xpi')));
  assert.equal(pkg.scripts['firefox:signieren'], 'node tools/firefox-signieren.js');
});

test('Paket für Mozilla: manifest.json oben, Unterordner dabei, keine "./"-Pfade, Gecko-ID wie die Kopplung', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doomscroll-xpi-'));
  try {
    const zip = sign.paket(path.join(dir, 'paket.zip'));
    const names = sign.zipNamen(zip);
    assert.deepEqual([...names].filter((n) => !n.endsWith('/')).sort(), sign.dateien().sort());
    assert.ok(names.includes('manifest.json') && names.includes('background.js') && names.includes('icons/icon-16.png'));
    assert.ok(names.every((n) => !n.startsWith('./') && !n.startsWith('/') && !n.includes('\\')));
    const manifest = sign.manifestVon(zip);
    assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version);
    assert.equal(manifest.browser_specific_settings.gecko.id, nm.GECKO_ID);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('JWT für die AMO-API: HS256, Aussteller und Ablauf, Signatur stimmt', () => {
  const secret = 'nur-ein-testwert';
  const token = sign.jwt('user:test', secret, 1_000_000);
  const [h, p, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.iss, 'user:test');
  assert.equal(payload.exp - payload.iat, 60);
  assert.equal(s, crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'));
});

test('signierte .xpi (falls schon im Repo) gehört zur aktuellen Version der Erweiterung und trägt eine Mozilla-Signatur', { skip: !fs.existsSync(sign.ZIEL) }, () => {
  assert.ok(sign.zipNamen(sign.ZIEL).some((n) => n.startsWith('META-INF/')), 'Signatur fehlt');
  assert.equal(sign.manifestVon(sign.ZIEL).version, JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version, 'Version in extension/manifest.json erhöht, aber nicht neu signiert');
});
