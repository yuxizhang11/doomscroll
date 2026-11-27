'use strict';
// Die Sperrseite, auf die die Erweiterung gesperrte Tabs umleitet. Sie kommt vom lokalen Server und nicht aus der
// Erweiterung, weil Chrome Erweiterungsseiten im privaten Fenster nicht laden lässt, wenn die Erweiterung
// `incognito: "spanning"` hat. Alle Texte sind fest; aus der Adresse wird nur gewählt, welcher, nie etwas eingesetzt.

const TEXTS = {
  limit: ['Genug für heute!', 'Dein Tageslimit für Reels, Shorts und TikTok ist erreicht. Morgen geht es weiter. Aufheben geht nur in der Doomscroll-Blocker-App auf diesem Rechner.'],
  quiet: ['Ruhezeit', 'In deiner Ruhezeit sind Reels, Shorts und TikTok gesperrt. Ändern geht nur in der Doomscroll-Blocker-App auf diesem Rechner.'],
  porn: ['Diese Seite ist gesperrt', 'Der Porno-Blocker ist immer an. Alles andere im Browser bleibt nutzbar.'],
};
const START_PAGES = {
  INSTAGRAM: ['Zur Startseite von Instagram', 'https://www.instagram.com/'],
  YOUTUBE: ['Zur Startseite von YouTube', 'https://www.youtube.com/'],
};

const CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const STYLE = `
:root{color-scheme:light dark;--bg:#eef1f6;--surface:#fff;--text:#0b1220;--text-2:#363c45;--border:rgba(11,18,32,.14);--accent:#1d5fc4;--on-accent:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--surface:#151e30;--text:#f1f4f9;--text-2:#c9d1de;--border:rgba(255,255,255,.16);--accent:#8ab4ff;--on-accent:#0b1220}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:400 16px/1.5 system-ui,"Segoe UI",sans-serif}
main{width:min(560px,100%);padding:32px;border-radius:28px;background:var(--surface);border:1px solid var(--border);box-shadow:0 1px 2px rgba(0,0,0,.12),0 10px 24px rgba(0,0,0,.10)}
h1{margin:0 0 16px;font-size:28px;font-weight:500}p{margin:0 0 16px;color:var(--text-2)}
a{display:inline-flex;align-items:center;min-height:48px;padding:0 24px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:500;text-decoration:none}
a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}`;

/** HTML der Sperrseite; unbekannte Werte fallen auf „limit“ bzw. ohne Startseite zurück. */
function render(kind, app) {
  const [title, text] = Object.hasOwn(TEXTS, kind) ? TEXTS[kind] : TEXTS.limit;
  const shown = Object.hasOwn(TEXTS, kind) ? kind : 'limit';
  const start = (shown === 'limit' || shown === 'quiet') && Object.hasOwn(START_PAGES, app) ? START_PAGES[app] : null;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title><style>${STYLE}</style></head>`
    + `<body><main role="alert"><h1>${title}</h1><p>${text}</p>${start ? `<a href="${start[1]}">${start[0]}</a>` : '<p>Du kannst diesen Tab schließen.</p>'}</main></body></html>`;
}

module.exports = { render, CSP, TEXTS };
