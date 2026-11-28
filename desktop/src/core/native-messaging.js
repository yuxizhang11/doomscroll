'use strict';
// Native Messaging für die automatische Kopplung: Texte der Host-Manifeste, Registry-Schlüssel, Startdatei und die
// festen IDs der Erweiterung. Reine Logik ohne Dateien und Registry (die schreibt src/native-setup.js).
// Die Erweiterung bekommt über `key` im Manifest immer dieselbe Chromium-ID; erlaubt wird genau diese eine Erweiterung.

const crypto = require('node:crypto');
const path = require('node:path');

const HOST_NAME = 'de.doomscroll.desktop';
const GECKO_ID = 'doomscroll-blocker@doomscroll.local';
/** Öffentlicher Schlüssel aus extension/manifest.json (`key`); der private Teil wurde verworfen und wird nicht gebraucht. */
const EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAztBOF3eWr01IZAdk/zc+DxUQ0YO8YldRXPNH2P575ieq9Ppw2Ej123Bl4hSgPA/UzwCWxe3BOlQ9ozaT3ik5eEslX96KK80C5UJPBTPjKQ3KUEr844/i5dagyAxP+4EA8YZZOvV8h3mw4t8aSeLQ8rzMr4ISHjhT2cnvkN5RTFSCbDOKA1s8wz+7qprsV5CEmXLEheWahhZserqhs3nMzd4SbTpJoKV1R1WpoMHbaeS+Iqoc/W3+EiwBUZ07aRWmnx6uDFyVf9Jock5uyisGjZQZktS0lwfwpHs1sD0x6YBvRMwhoGkGTWLVX/iVu8r906oGZetpAGeHQmGDQ4SBzQIDAQAB';
const EXTENSION_ID = 'banakglfihiakemhdcmhbefeobocjgog';

/** Chromium leitet die ID aus dem öffentlichen Schlüssel ab: SHA-256, erste 16 Byte, Ziffern 0 bis f als a bis p. */
function extensionIdFromKey(base64Key) {
  const hash = crypto.createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest().subarray(0, 16);
  return [...hash].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
}

/** Inhalt des Host-Manifests; kind ist 'chromium' (allowed_origins) oder 'firefox' (allowed_extensions). */
function hostManifest(kind, hostPath) {
  const base = { name: HOST_NAME, description: 'Kopplung der Doomscroll-Blocker-Erweiterung mit der App', path: hostPath, type: 'stdio' };
  if (kind === 'firefox') return { ...base, allowed_extensions: [GECKO_ID] };
  return { ...base, allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] };
}

/** Registry-Einträge unter HKCU (ohne Administratorrechte); der Standardwert zeigt auf das Manifest. */
const BROWSER_KEYS = [
  { browser: 'chrome', kind: 'chromium', key: 'Software\\Google\\Chrome\\NativeMessagingHosts' },
  { browser: 'edge', kind: 'chromium', key: 'Software\\Microsoft\\Edge\\NativeMessagingHosts' },
  { browser: 'brave', kind: 'chromium', key: 'Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts' },
  { browser: 'chromium', kind: 'chromium', key: 'Software\\Chromium\\NativeMessagingHosts' },
  { browser: 'firefox', kind: 'firefox', key: 'Software\\Mozilla\\NativeMessagingHosts' },
];

function registryEntries(manifestPaths) {
  return BROWSER_KEYS.map((b) => ({ browser: b.browser, key: `HKCU\\${b.key}\\${HOST_NAME}`, value: manifestPaths[b.kind] }));
}

/** Startdatei des Hosts: Electron läuft als reines Node (kein Fenster, kein separates Node nötig). */
function hostCmd({ exe, script, pairingFile }) {
  for (const p of [exe, script, pairingFile]) {
    if (typeof p !== 'string' || /["\r\n]/.test(p)) throw new Error('Ungültiger Pfad für den Host');
  }
  const esc = (p) => p.replace(/%/g, '%%'); // % würde in .cmd-Dateien als Variable gelesen
  return ['@echo off', 'set ELECTRON_RUN_AS_NODE=1', `set "DOOMSCROLL_PAIRING=${esc(pairingFile)}"`, `"${esc(exe)}" "${esc(script)}"`, ''].join('\r\n');
}

/** Dateien im Ordner der App-Daten, in dem Host-Startdatei, Manifeste und Kopplungsdatei liegen. */
function files(dir) {
  return {
    cmd: path.join(dir, 'host.cmd'),
    chromium: path.join(dir, 'host-chromium.json'),
    firefox: path.join(dir, 'host-firefox.json'),
    pairing: path.join(dir, 'pairing.json'),
  };
}

function pairingJson({ token, port }) {
  return JSON.stringify({ token, port });
}

/** Erweiterungsordner: gepackt neben app.asar (Browser laden nicht aus asar), sonst im Projekt. */
function extensionDir({ isPackaged, resourcesPath, appDir }) {
  return isPackaged ? path.join(resourcesPath, 'extension') : path.join(appDir, 'extension');
}

function hostScript({ isPackaged, resourcesPath, appDir }) {
  return isPackaged ? path.join(resourcesPath, 'native-host', 'host.js') : path.join(appDir, 'native-host', 'host.js');
}

module.exports = { HOST_NAME, GECKO_ID, EXTENSION_KEY, EXTENSION_ID, BROWSER_KEYS, extensionIdFromKey, hostManifest, registryEntries, hostCmd, files, pairingJson, extensionDir, hostScript };
