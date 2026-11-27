'use strict';
// Update-Suche über die GitHub-Releases (ohne Login, das Repo ist öffentlich), Muster wie in der Handy-App:
// beim Start und alle 6 Stunden suchen; „Update laden“ sucht vorher noch einmal neu und lädt nie eine ältere Fassung.

const { isNewer, pickRelease, isTrustedDownload } = require('./core/version');

const REPO = 'yuxizhang11/doomscroll';
const LIST = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const TIMEOUT_MS = 15_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Das neueste Desktop-Release, wenn es neuer als current ist, sonst null. Wirft bei Netzfehlern. */
async function check(current, fetchFn = fetch) {
  const res = await fetchFn(LIST, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}`);
  const release = pickRelease(await res.json());
  return release && isNewer(release.version, current) && isTrustedDownload(release.url, REPO) ? release : null;
}

module.exports = { check, REPO, CHECK_EVERY_MS };
