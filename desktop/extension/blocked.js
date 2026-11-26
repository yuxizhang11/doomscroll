'use strict';
// Die Seite zeigt nur feste Texte; aus der Adresse wird nur gewählt, welcher, nie etwas eingesetzt.

const api = globalThis.browser ?? globalThis.chrome;
const TEXTS = {
  limit: ['Genug für heute!', 'Dein Tageslimit für Reels, Shorts und TikTok ist erreicht. Morgen geht es weiter. Aufheben geht nur in der Doomscroll-Blocker-App auf diesem Rechner.'],
  quiet: ['Ruhezeit', 'In deiner Ruhezeit sind Reels, Shorts und TikTok gesperrt. Ändern geht nur in der Doomscroll-Blocker-App auf diesem Rechner.'],
  porn: ['Diese Seite ist gesperrt', 'Der Porno-Blocker ist immer an. Alles andere im Browser bleibt nutzbar.'],
};
const START_PAGES = {
  INSTAGRAM: ['Zur Startseite von Instagram', 'https://www.instagram.com/'],
  YOUTUBE: ['Zur Startseite von YouTube', 'https://www.youtube.com/'],
};

const params = new URLSearchParams(location.search);
const kind = Object.hasOwn(TEXTS, params.get('kind')) ? params.get('kind') : 'limit';
document.getElementById('title').textContent = TEXTS[kind][0];
document.getElementById('text').textContent = TEXTS[kind][1];
document.title = TEXTS[kind][0];

const start = kind === 'limit' || kind === 'quiet' ? START_PAGES[params.get('app')] : null;
if (start) {
  const home = document.getElementById('home');
  home.textContent = start[0];
  home.href = start[1];
  home.hidden = false;
}

document.getElementById('close').addEventListener('click', async () => {
  const tab = await api.tabs.getCurrent();
  if (tab?.id !== undefined) api.tabs.remove(tab.id);
  else window.close();
});
