'use strict';
// Lokaler Server nur auf 127.0.0.1 für die Browser-Erweiterung.
//
// Warum HTTP mit Token und nicht Native Messaging: Native Messaging braucht je Browser einen
// Registry-Eintrag, eine ausführbare Host-Datei und feste Erweiterungs-IDs. HTTP braucht nur einen festen
// Port und ein Token, das der User einmal in die Erweiterung einträgt. Geschützt wird so:
//  - nur 127.0.0.1, Host-Header wird geprüft (gegen DNS-Rebinding)
//  - Origin muss fehlen oder eine Erweiterung sein (chrome-extension://, moz-extension://), Webseiten kommen nicht durch
//  - Bearer-Token (32 Zufallsbytes), Vergleich in konstanter Zeit
//  - kleine Anfragen, strenge Prüfung des Inhalts, keine URLs im Log

const http = require('node:http');
const crypto = require('node:crypto');
const { parseWebUrl } = require('./core/targets');
const blockedPage = require('./blocked-page');

const DEFAULT_PORT = 47615;
const MAX_BODY = 256 * 1024;
const MAX_TABS = 64;

function tokenEquals(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isExtensionOrigin(origin) {
  return typeof origin === 'string' && /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i.test(origin);
}

/** Prüft die Meldung der Erweiterung; gibt {client, info, tabs} oder null zurück. */
function parseHeartbeat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { client, browser, label, version, incognitoAllowed, tabs } = body;
  if (typeof client !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(client)) return null;
  if (browser !== 'chromium' && browser !== 'firefox') return null;
  if (!Array.isArray(tabs) || tabs.length > MAX_TABS) return null;
  const clean = [];
  for (const t of tabs) {
    if (!t || typeof t !== 'object') return null;
    if (!Number.isSafeInteger(t.id) || typeof t.incognito !== 'boolean') return null;
    // Nur Webadressen; alles andere (chrome://, about:, Erweiterungsseiten) wird verworfen.
    if (parseWebUrl(t.url)) clean.push({ id: t.id, url: t.url, incognito: t.incognito });
  }
  return {
    client,
    info: {
      browser,
      label: typeof label === 'string' ? label.slice(0, 40) : browser,
      version: typeof version === 'string' ? version.slice(0, 20) : '',
      incognitoAllowed: typeof incognitoAllowed === 'boolean' ? incognitoAllowed : null,
    },
    tabs: clean,
  };
}

/**
 * @param {{token: string, port?: number, onHeartbeat: (clientId: string, info: object, tabs: object[]) => object}} options
 * @returns {Promise<http.Server>} läuft, sobald der Port offen ist; schlägt mit EADDRINUSE fehl, wenn er belegt ist
 */
function start({ token, port = DEFAULT_PORT, onHeartbeat }) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const send = (status, payload) => {
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (isExtensionOrigin(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers.Vary = 'Origin';
      }
      res.writeHead(status, headers);
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };

    // DNS-Rebinding: nur Anfragen, die wirklich an 127.0.0.1 oder localhost gingen.
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(req.headers.host)) return send(421, { error: 'host' });
    // Webseiten (http/https-Origin) sind ausgeschlossen, andere Programme senden keinen Origin.
    if (origin !== undefined && !isExtensionOrigin(origin)) return send(403, { error: 'origin' });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin ?? '',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
      return res.end();
    }
    // Sperrseite für umgeleitete Tabs: ohne Token, feste Texte, nichts aus der Adresse wird eingesetzt.
    if (req.method === 'GET' && req.url.startsWith('/blocked')) {
      const q = new URL(req.url, 'http://127.0.0.1').searchParams;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': blockedPage.CSP, 'Referrer-Policy': 'no-referrer',
      });
      return res.end(blockedPage.render(q.get('kind'), q.get('app')));
    }
    if (req.method !== 'POST' || req.url !== '/v1/heartbeat') return send(404, { error: 'not-found' });

    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ') || !tokenEquals(auth.slice(7), token)) return send(401, { error: 'token' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'type' });

    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        send(413, { error: 'size' });
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let parsed;
      try {
        parsed = parseHeartbeat(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        parsed = null;
      }
      if (!parsed) return send(400, { error: 'body' });
      let answer;
      try {
        answer = onHeartbeat(parsed.client, parsed.info, parsed.tabs);
      } catch {
        return send(500, { error: 'internal' });
      }
      send(200, { ok: true, blocks: answer.blocks });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

module.exports = { start, parseHeartbeat, isExtensionOrigin, tokenEquals, DEFAULT_PORT };
