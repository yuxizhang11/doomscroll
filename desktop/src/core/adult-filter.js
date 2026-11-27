'use strict';
// Port von AdultFilter.kt: nur Porno wird gesperrt, normale Seiten (auch mit „sex“ in Nachrichten) bleiben offen.

/** Namen von Porno-Seiten; überall im Text gefunden, damit auch Suchen danach greifen. */
const SITE_NAMES = [
  'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn', 'brazzers',
  'onlyfans', 'chaturbate', 'stripchat', 'camsoda', 'bongacams', 'livejasmin',
  'spankbang', 'eporner', 'tnaflix', 'motherless', 'fapello', 'thothub',
];

/** Porno-Wörter; überall im Text gefunden. */
const KEYWORDS = ['porn', 'hentai', 'rule34', 'nudes'];

/** Wörter, die auch Teil harmloser Wörter sind (XXXL, Milford): nur ganze Wörter zählen. */
const WHOLE_WORDS = /(?<![a-z])(xxx|milfs?)(?![a-z])/;

/** Adult-Seiten, deren Name keines der Wörter oben enthält. */
const DOMAINS = [
  'beeg.com', 'tube8.com', 'fansly.com', 'manyvids.com', 'cam4.com', 'myfreecams.com',
  'erome.com', 'iwara.tv', 'literotica.com', 'sxyprn.com', 'hqporner.com', 'ixxx.com',
  'noodlemagazine.com', 'xmoviesforyou.com', 'daftsex.com', 'fuq.com', 'hclips.com',
  'nuvid.com', 'drtuber.com', 'sunporno.com', 'luscious.net', 'f95zone.to',
];

/** Kleingeschrieben, getrimmt, mindestens 2 Zeichen, damit ein Buchstabe nicht jede Seite sperrt. */
function cleanWord(word) {
  if (typeof word !== 'string') return null;
  const clean = word.trim().toLowerCase();
  return clean.length >= 2 && clean.length <= 64 ? clean : null;
}

/** Browser melden Adressen prozentkodiert (Umlaute, Leerzeichen als + oder %20); eigene Wörter sollen trotzdem greifen. */
function safeDecode(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** Eine Porno-Seite oder -Suche; ownWords sind die eigenen Wörter des Users und zählen wie „porn“. */
function isPorn(address, ownWords = []) {
  if (typeof address !== 'string') return false;
  const text = address.toLowerCase();
  const decoded = safeDecode(text);
  return matches(text, ownWords) || (decoded !== text && matches(decoded, ownWords));
}

function matches(text, ownWords) {
  if (SITE_NAMES.some((s) => text.includes(s)) || KEYWORDS.some((s) => text.includes(s))) return true;
  if ([...ownWords].some((w) => text.includes(w))) return true;
  if (WHOLE_WORDS.test(text)) return true;
  return text.split(/\r?\n/).some((line) => {
    // Nur der Host zählt: Benutzerteil, Port, Fragment und Punkt am Ende (beeg.com.) dürfen die Liste nicht umgehen.
    const host = line.trim().split('://').pop().split(/[/?#]/)[0].split('@').pop().split(':')[0].replace(/\.$/, '').replace(/^www\./, '');
    return DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  });
}

module.exports = { isPorn, cleanWord, SITE_NAMES, KEYWORDS, DOMAINS };
