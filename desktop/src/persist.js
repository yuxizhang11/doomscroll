'use strict';
// Speichert den Zustand als JSON-Datei. Geschrieben wird über eine Temp-Datei und umbenannt, damit ein
// Absturz mitten im Schreiben die alte Datei nie zerstört. Eine unlesbare Datei wird zur Seite gelegt, nicht gelöscht.

const fs = require('node:fs');
const path = require('node:path');

function load(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('kein Objekt');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    try {
      fs.renameSync(file, `${file}.defekt-${Date.now()}`);
    } catch {
      // nichts zu retten
    }
    return {};
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** Bündelt viele Änderungen zu einem Schreibvorgang (Zähler ändern sich alle 2 s). */
function debounced(file, getData, delayMs = 5000) {
  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      save(file, getData());
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', err.message);
    }
  };
  return {
    schedule() {
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}

module.exports = { load, save, debounced };
