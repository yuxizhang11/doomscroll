'use strict';
// Richtet die automatische Kopplung ein: schreibt Startdatei, Host-Manifeste und Kopplungsdatei in den Ordner der
// App-Daten und trägt die Manifeste unter HKCU ein (Chrome, Edge, Brave, Chromium, Firefox). Läuft bei jedem Start
// und ändert nur, was sich unterscheidet. Beim Deinstallieren entfernt installer/installer.nsh die Einträge wieder.

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const nm = require('./core/native-messaging');

/** Schreibt die Datei nur, wenn sich der Inhalt ändert. */
function writeIfChanged(file, text) {
  try {
    if (fs.readFileSync(file, 'utf8') === text) return;
  } catch { /* gibt es noch nicht */ }
  fs.writeFileSync(file, text, 'utf8');
}

function regAdd(key, value) {
  return new Promise((resolve, reject) => {
    execFile('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true, timeout: 10_000 }, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * @param {{dir: string, exe: string, script: string, token: string, port: number, reg?: (key: string, value: string) => Promise<void>}} o
 * @returns {Promise<string[]>} Fehlertexte (leer, wenn alles geklappt hat)
 */
async function install({ dir, exe, script, token, port, reg = regAdd }) {
  const f = nm.files(dir);
  fs.mkdirSync(dir, { recursive: true });
  writeIfChanged(f.cmd, nm.hostCmd({ exe, script, pairingFile: f.pairing }));
  writeIfChanged(f.chromium, JSON.stringify(nm.hostManifest('chromium', f.cmd), null, 2));
  writeIfChanged(f.firefox, JSON.stringify(nm.hostManifest('firefox', f.cmd), null, 2));
  writeIfChanged(f.pairing, nm.pairingJson({ token, port }));
  const errors = [];
  for (const e of nm.registryEntries({ chromium: f.chromium, firefox: f.firefox })) {
    try {
      await reg(e.key, e.value);
    } catch (err) {
      errors.push(`${e.browser}: ${err.code ?? err.message}`);
    }
  }
  return errors;
}

module.exports = { install, writeIfChanged };
