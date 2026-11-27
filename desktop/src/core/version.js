'use strict';
// Versionsvergleich nach SemVer X.Y.Z (Teil für Teil als Zahlen), Release-Auswahl und Changelog-Auszug.

const TAG = /^desktop-v(\d+)\.(\d+)\.(\d+)$/;

function parts(version) {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(version).trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** Ist candidate neuer als current? Unlesbare Versionen gelten nie als neuer. */
function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Das neueste Desktop-Release aus der GitHub-Liste. Die Android-Releases (Tag v1.28) im selben
 * Repo werden übersprungen: Desktop-Releases tragen den Tag desktop-vX.Y.Z und eine .exe.
 */
function pickRelease(list) {
  if (!Array.isArray(list)) return null;
  let best = null;
  for (const r of list) {
    if (!r || r.draft || r.prerelease || typeof r.tag_name !== 'string') continue;
    const m = TAG.exec(r.tag_name);
    if (!m) continue;
    const asset = Array.isArray(r.assets) ? r.assets.find((a) => typeof a?.name === 'string' && a.name.endsWith('.exe') && typeof a.browser_download_url === 'string') : null;
    if (!asset) continue;
    const version = `${m[1]}.${m[2]}.${m[3]}`;
    if (!best || isNewer(version, best.version)) {
      best = { version, url: asset.browser_download_url, notes: typeof r.body === 'string' ? r.body.slice(0, 4000) : '' };
    }
  }
  return best;
}

/** Nur Downloads von GitHub-Releases dieses Repos werden geöffnet. */
function isTrustedDownload(url, repo) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${repo}/releases/download/`);
  } catch {
    return false;
  }
}

/** Abschnitte „## X.Y.Z – Datum“ der CHANGELOG.md als [{version, date, lines}], neueste zuerst. */
function parseChangelog(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const h = /^##\s+(\d+\.\d+\.\d+)(?:\s+[–-]\s+(.+))?\s*$/.exec(line);
    if (h) {
      cur = { version: h[1], date: h[2] ?? '', lines: [] };
      entries.push(cur);
    } else if (cur && /^-\s+/.test(line)) {
      cur.lines.push(line.replace(/^-\s+/, '').trim());
    }
  }
  return entries;
}

module.exports = { isNewer, pickRelease, isTrustedDownload, parseChangelog };
