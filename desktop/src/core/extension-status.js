'use strict';
// Meldet, ob die Browser-Erweiterung ihren Dienst tut. Der Browser selbst lässt sich ohne Admin-Rechte
// nicht zwingen; die App merkt nur, wenn ein Browser läuft, aber kein Heartbeat kommt oder private Fenster fehlen.

const STALE_MS = 15_000;

const FAMILIES = {
  chromium: { label: 'Chrome, Edge oder Brave', processes: ['chrome.exe', 'msedge.exe', 'brave.exe', 'vivaldi.exe', 'opera.exe'] },
  firefox: { label: 'Firefox', processes: ['firefox.exe'] },
};

// shortcut: pro Browser-Familie statt pro Programm. Brave ohne Erweiterung fällt nicht auf, solange Chrome sie hat, und ein
// im Hintergrund laufendes msedge.exe gibt Firefox-Nutzern ein falsches „fehlt“. Bei Bedarf pro Prozess prüfen.
/** running: Menge der laufenden Prozessnamen (klein geschrieben) oder null, wenn unbekannt. */
function evaluate({ clients, running, now }) {
  const families = {};
  const problems = [];
  for (const [family, info] of Object.entries(FAMILIES)) {
    const fresh = [...clients.values()].filter((c) => c.browser === family && now - c.seen <= STALE_MS);
    const isRunning = running ? info.processes.some((p) => running.has(p)) : null;
    let state;
    if (fresh.length > 0) state = 'ok';
    else if (isRunning === true) state = 'missing';
    else if (isRunning === false) state = 'idle';
    else state = 'unknown';
    // false = ausdrücklich nicht erlaubt; null = die Erweiterung konnte es nicht feststellen
    const incognito = fresh.some((c) => c.incognitoAllowed === false) ? 'denied' : fresh.some((c) => c.incognitoAllowed === true) ? 'ok' : 'unknown';
    families[family] = { label: info.label, state, incognito, browser: fresh[0]?.label ?? null };
    if (state === 'missing') problems.push({ key: `${family}:missing`, family, kind: 'missing', label: info.label });
    if (state === 'ok' && incognito === 'denied') problems.push({ key: `${family}:incognito`, family, kind: 'incognito', label: info.label });
  }
  return { families, problems };
}

module.exports = { evaluate, FAMILIES, STALE_MS };
