'use strict';
// Die Seiten, die gezählt und gesperrt werden. Alles andere bleibt nutzbar.

const MAX_URL_LENGTH = 8192;

function hostIs(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

/** Reihenfolge = Vorrang, wenn mehrere Tabs gleichzeitig offen sind. */
const APPS = [
  {
    id: 'INSTAGRAM',
    label: 'Instagram Reels',
    // /reels, /reel/ID und /name/reel/ID
    match: (host, path) => hostIs(host, 'instagram.com') && /^\/(?:[^/]+\/)?reels?(?:\/|$)/.test(path),
    startPage: 'https://www.instagram.com/',
  },
  {
    id: 'YOUTUBE',
    label: 'YouTube Shorts',
    match: (host, path) => hostIs(host, 'youtube.com') && /^\/shorts(?:\/|$)/.test(path),
    startPage: 'https://www.youtube.com/',
  },
  {
    id: 'TIKTOK',
    label: 'TikTok',
    match: (host) => hostIs(host, 'tiktok.com'),
    startPage: null, // ganze Seite gesperrt, wie am Handy
  },
];

const APP_IDS = APPS.map((a) => a.id);

/** Gibt URL-Objekt zurück, wenn es eine ausreichend kurze http(s)-Adresse ist, sonst null. */
function parseWebUrl(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}

/** Die App, deren Kurzvideos die Adresse zeigt, oder null. */
function fromUrl(text) {
  const url = parseWebUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return APPS.find((a) => a.match(host, url.pathname.toLowerCase())) ?? null;
}

function byId(id) {
  return APPS.find((a) => a.id === id) ?? null;
}

module.exports = { APPS, APP_IDS, fromUrl, byId, parseWebUrl, MAX_URL_LENGTH };
