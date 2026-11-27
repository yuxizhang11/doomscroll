'use strict';
// Port von Backup.kt: Sicherungsdatei mit Schema-Version. Neuere Dateien als bekannt werden abgelehnt,
// ältere werden gelesen, soweit ihre Schlüssel reichen.

const { SCHEMA } = require('./store');

const APP = 'com.yuxizhang.doomscroll.desktop';
const ANDROID_APP = 'com.yuxizhang.doomscroll';
const MAX_BACKUP_BYTES = 1 << 20;

function write(store, appVersion, now = new Date()) {
  return JSON.stringify({
    app: APP,
    schema: SCHEMA,
    appVersion,
    exported: now.toISOString().slice(0, 19),
    values: store.backupValues(),
  }, null, 2);
}

/** Die gesicherten Werte oder ein Fehler mit Text für die Oberfläche. */
function read(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) return { error: 'Die Datei ist zu groß für eine Sicherung.' };
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return { error: 'Das ist keine Sicherungsdatei.' };
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return { error: 'Das ist keine Sicherungsdatei.' };
  if (root.app === ANDROID_APP) return { error: 'Das ist eine Sicherung der Handy-App. Die Desktop-App hat eigene Limits und nimmt nur ihre eigene Sicherung an.' };
  if (root.app !== APP) return { error: 'Das ist keine Sicherung von Doomscroll Blocker für den Desktop.' };
  const schema = Number.isInteger(root.schema) ? root.schema : 0;
  if (schema > SCHEMA) return { error: 'Die Sicherung stammt aus einer neueren Version. Bitte erst die App aktualisieren.' };
  const values = root.values && typeof root.values === 'object' && !Array.isArray(root.values) ? root.values : {};
  return { values };
}

module.exports = { write, read, APP, MAX_BACKUP_BYTES };
