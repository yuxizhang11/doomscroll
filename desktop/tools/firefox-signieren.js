'use strict';
// Lässt die Firefox-Erweiterung bei Mozilla (addons.mozilla.org, Kanal „unlisted“: nicht im Add-on-Verzeichnis) signieren und legt
// die signierte Datei als desktop/firefox/doomscroll-blocker.xpi ab. Grund: Firefox (Release) behält nur signierte Erweiterungen über
// einen Neustart; ein temporäres Add-on aus about:debugging fällt dabei heraus. Der Installer liefert die .xpi mit und trägt sie per
// Firefox-Richtlinie ein (siehe README, „Firefox dauerhaft“). Jede Änderung in extension/ braucht eine höhere "version" in
// extension/manifest.json und eine neue Signatur; die Gecko-ID bleibt.
//
// Aufruf: npm run firefox:signieren
//   Die Schlüssel kommen nur aus den Umgebungsvariablen AMO_JWT_ISSUER und AMO_JWT_SECRET (addons.mozilla.org → Developer Hub →
//   „Manage API Keys“), nie aus einer Datei und nie in eine Ausgabe.
// Ohne Schlüssel: npm run firefox:signieren -- --nur-paket <Ziel.zip> baut nur das ZIP zum Hochladen von Hand.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const API = 'https://addons.mozilla.org/api/v5/addons/';
const QUELLE = path.join(__dirname, '..', 'extension');
const ZIEL = path.join(__dirname, '..', 'firefox', 'doomscroll-blocker.xpi');

// JWT für die AMO-API (HS256, kurz gültig, je Anfrage neu).
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
function jwt(iss, secret, jetzt = Math.floor(Date.now() / 1000)) {
  const teil = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss, jti: crypto.randomBytes(16).toString('hex'), iat: jetzt, exp: jetzt + 60 })}`;
  return `${teil}.${crypto.createHmac('sha256', secret).update(teil).digest('base64url')}`;
}

/** Alle Dateien der Erweiterung mit Pfaden relativ zum Ordner (Schrägstriche), auch aus Unterordnern wie icons/. */
function dateien(ordner = QUELLE, prefix = '') {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? dateien(path.join(ordner, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
}

// ZIP mit manifest.json auf oberster Ebene. tar.exe gehört zu Windows 10 und 11.
function paket(ziel) {
  fs.rmSync(ziel, { force: true });
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', ziel, '-C', QUELLE, ...dateien()], { windowsHide: true });
  return ziel;
}

/** Namen aller Einträge einer ZIP-Datei (aus dem Verzeichnis am Ende). */
function zipNamen(datei) {
  return zipEintraege(fs.readFileSync(datei)).map((e) => e.name);
}

function zipEintraege(buf) {
  const ende = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (ende < 0) throw new Error('keine ZIP-Datei');
  const anzahl = buf.readUInt16LE(ende + 10);
  let pos = buf.readUInt32LE(ende + 16);
  const liste = [];
  for (let i = 0; i < anzahl; i++) {
    const nameLen = buf.readUInt16LE(pos + 28);
    liste.push({
      name: buf.toString('utf8', pos + 46, pos + 46 + nameLen), methode: buf.readUInt16LE(pos + 10),
      groesse: buf.readUInt32LE(pos + 20), kopf: buf.readUInt32LE(pos + 42),
    });
    pos += 46 + nameLen + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  return liste;
}

/** Inhalt eines Eintrags (nur gespeichert oder deflate) oder null. */
function zipLesen(datei, name) {
  const buf = fs.readFileSync(datei);
  const e = zipEintraege(buf).find((x) => x.name === name);
  if (!e) return null;
  const start = e.kopf + 30 + buf.readUInt16LE(e.kopf + 26) + buf.readUInt16LE(e.kopf + 28);
  const roh = buf.subarray(start, start + e.groesse);
  return e.methode === 0 ? roh : zlib.inflateRawSync(roh);
}

const manifestVon = (datei) => JSON.parse(zipLesen(datei, 'manifest.json')?.toString('utf8') || 'null');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function signieren() {
  const { version, browser_specific_settings: { gecko: { id } } } = JSON.parse(fs.readFileSync(path.join(QUELLE, 'manifest.json'), 'utf8'));
  // Die Schlüssel enthalten keine Leerzeichen; mitkopierte Leerzeichen und Umbrüche fallen weg.
  const iss = (process.env.AMO_JWT_ISSUER || '').replace(/\s+/g, '');
  const secret = (process.env.AMO_JWT_SECRET || '').replace(/\s+/g, '');
  if (!iss || !secret) throw new Error('AMO_JWT_ISSUER und AMO_JWT_SECRET fehlen (addons.mozilla.org → Developer Hub → „Manage API Keys“).');
  if (fs.existsSync(ZIEL) && manifestVon(ZIEL)?.version === version) throw new Error(`Version ${version} ist schon signiert. Erst "version" in extension/manifest.json erhöhen.`);
  const api = async (adresse, opt = {}) => {
    const r = await fetch(adresse.startsWith('https:') ? adresse : API + adresse, { ...opt, headers: { ...opt.headers, Authorization: `JWT ${jwt(iss, secret)}` } });
    if (!r.ok) throw new Error(`addons.mozilla.org antwortet ${r.status}: ${(await r.text()).slice(0, 800)}`);
    return r;
  };
  // Ein erneuter Aufruf nach „dauert zu lange“ lädt nicht noch einmal hoch (Mozilla nimmt eine Version nur einmal an), sondern
  // wartet weiter auf die schon eingereichte Version.
  const versionUrl = `${API}addon/${encodeURIComponent(id)}/versions/v${version}/`;
  const schonDa = await fetch(versionUrl, { headers: { Authorization: `JWT ${jwt(iss, secret)}` } });
  if (!schonDa.ok && schonDa.status !== 404) throw new Error(`addons.mozilla.org antwortet ${schonDa.status}: ${(await schonDa.text()).slice(0, 800)}`);
  if (!schonDa.ok) {
    const zip = paket(path.join(os.tmpdir(), `doomscroll-firefox-${version}.zip`));
    const form = new FormData();
    form.append('upload', new Blob([fs.readFileSync(zip)]), path.basename(zip));
    form.append('channel', 'unlisted');
    let up = await (await api('upload/', { method: 'POST', body: form })).json();
    console.log('Hochgeladen, Mozilla prüft das Paket …');
    for (let n = 0; !up.processed && n < 60; n++) { await warte(5000); up = await (await api(`upload/${up.uuid}/`)).json(); }
    if (!up.processed) throw new Error('Die Prüfung bei Mozilla dauert zu lange. Später erneut aufrufen.');
    if (!up.valid) throw new Error(`Mozilla lehnt das Paket ab: ${(up.validation?.messages || []).filter((m) => m.type === 'error').map((m) => m.message).join(' | ')}`);
    // Legt die Erweiterung beim ersten Mal an, sonst eine neue Version (die ID kommt aus manifest.json).
    await api(`addon/${encodeURIComponent(id)}/`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: { upload: up.uuid } }) });
  }
  console.log('Angenommen, warte auf die Signatur …');
  let v = null;
  for (let n = 0; n < 60 && v?.file?.status !== 'public'; n++) {
    if (n) await warte(10000);
    v = await (await api(versionUrl)).json();
    if (v.file?.status === 'disabled') throw new Error('Mozilla hat diese Version abgelehnt (Status „disabled“). Details im Developer Hub.');
  }
  if (v?.file?.status !== 'public' || !v.file.url) throw new Error('Die Signatur dauert zu lange. Später erneut aufrufen.');
  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
  const neu = `${ZIEL}.neu`;
  fs.writeFileSync(neu, Buffer.from(await (await api(v.file.url)).arrayBuffer()));
  // Nur eine Datei mit Signatur und der erwarteten Version ersetzt die alte.
  if (!zipNamen(neu).some((n) => n.startsWith('META-INF/')) || manifestVon(neu)?.version !== version) {
    fs.rmSync(neu, { force: true });
    throw new Error('Die geladene Datei ist keine signierte Erweiterung dieser Version.');
  }
  fs.renameSync(neu, ZIEL);
  console.log(`Signiert: ${ZIEL} (Version ${version}). Datei committen; der Installer trägt sie beim nächsten Bau per Firefox-Richtlinie ein.`);
}

if (require.main === module) {
  const i = process.argv.indexOf('--nur-paket');
  const lauf = i > 0 ? Promise.resolve(console.log(`ZIP zum Hochladen: ${paket(path.resolve(process.argv[i + 1] || 'doomscroll-firefox.zip'))}`)) : signieren();
  lauf.catch((e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { jwt, paket, dateien, zipNamen, zipLesen, manifestVon, ZIEL, QUELLE };
