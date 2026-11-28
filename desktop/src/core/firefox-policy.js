'use strict';
// Dauerhafte Installation in Firefox: Der Installer trägt die von Mozilla signierte Erweiterung (firefox/doomscroll-blocker.xpi,
// im installierten Stand unter resources/firefox) in die Firefox-Richtlinie „Extensions → Install“ ein, damit sie auch nach einem
// Neustart von Firefox bleibt. Geschrieben und entfernt wird das von installer/installer.nsh (nur dort sind Administratorrechte
// da); die App liest es nur, um in der Einrichtung den richtigen Weg zu zeigen. Reine Logik ohne Registry und Dateien.

const path = require('node:path');

const XPI_NAME = 'doomscroll-blocker.xpi';
/** Schlüssel unter HKLM (Installation für alle Benutzer) bzw. HKCU (nur für mich); die Werte heißen 1, 2, … und enthalten Pfade oder Adressen. */
const POLICY_KEY = 'SOFTWARE\\Policies\\Mozilla\\Firefox\\Extensions\\Install';

function xpiPath({ isPackaged, resourcesPath, appDir }) {
  return path.join(isPackaged ? resourcesPath : appDir, 'firefox', XPI_NAME);
}

/** Ausgabe von `reg query <Schlüssel>`: true, wenn ein Wert genau diesen Pfad enthält (Groß- und Kleinschreibung egal, wie unter Windows). */
function policyListsXpi(regOutput, xpi) {
  const wanted = path.normalize(xpi).toLowerCase();
  return String(regOutput).split(/\r?\n/).some((line) => {
    const m = /^\s+\S+\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/.exec(line);
    return m !== null && path.normalize(m[1]).toLowerCase() === wanted;
  });
}

module.exports = { XPI_NAME, POLICY_KEY, xpiPath, policyListsXpi };
