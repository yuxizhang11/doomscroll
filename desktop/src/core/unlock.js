'use strict';
// Port der Entsperr-Aufgabe aus UnlockActivity.kt: ein langer Satz (mindestens 15 Wörter) für die
// Kurzvideo-Limits, 20 zufällige Zeichen für Schutz-Aktionen (Beenden). Einfügen sperrt die Oberfläche.

const crypto = require('node:crypto');
const { APP_IDS } = require('./targets');

const MIN_WORDS = 15;
const CODE_LENGTH = 20;
// Keine Verwechslungen wie 0/O oder 1/l/I, damit sich der Code ohne Raten abtippen lässt.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const SENTENCES = [
  'Ich entscheide mich bewusst dafür, heute noch mehr kurze Videos zu schauen, obwohl ich eigentlich etwas anderes vorhatte.',
  'Mir ist klar, dass diese Zeit nicht zurückkommt und ich sie auch mit Freunden oder einem Buch verbringen könnte.',
  'Ich hebe die Sperre jetzt auf, weil ich glaube, dass ein paar weitere Minuten Scrollen mir heute wirklich guttun.',
  'Bevor ich weiterscrolle, atme ich einmal tief durch und frage mich ehrlich, ob ich das gerade wirklich brauche.',
  'Kurze Videos sind so gebaut, dass man nicht aufhört, und ich weiß das, schaue aber trotzdem jetzt weiter.',
  'Heute Abend möchte ich zufrieden auf meinen Tag schauen und nicht bereuen, wie viele Stunden ich am Rechner war.',
];

/** Gruß- und Satzzeichen, Groß-/Kleinschreibung und überzählige Leerzeichen sind egal, jedes Wort zählt. */
function normalize(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function wordCount(text) {
  const n = normalize(text);
  return n === '' ? 0 : n.split(' ').length;
}

function randomCode(random = crypto.randomInt) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[random(CODE_CHARS.length)]).join('');
}

function randomSentence(random = crypto.randomInt) {
  return SENTENCES[random(SENTENCES.length)];
}

/** Die Aufgaben: Satz für Sperren und Limits, Code für den Schutz. */
const SCOPES = {
  ALL: 'sentence',
  SETTINGS: 'sentence',
  QUIT: 'code',
  AUTOSTART: 'code',
  ...Object.fromEntries(APP_IDS.map((id) => [id, 'sentence'])),
};

function isScope(scope) {
  return typeof scope === 'string' && Object.hasOwn(SCOPES, scope);
}

function newChallenge(scope, random) {
  if (!isScope(scope)) return null;
  const kind = SCOPES[scope];
  return { scope, kind, text: kind === 'code' ? randomCode(random) : randomSentence(random) };
}

/** Prüft die Eingabe gegen die Aufgabe: Code genau (Groß-/Kleinschreibung zählt), Satz nach normalize. */
function check(challenge, typed) {
  if (!challenge || typeof typed !== 'string' || typed.length > 2000) return false;
  return challenge.kind === 'code'
    ? typed.trim() === challenge.text
    : normalize(typed) === normalize(challenge.text);
}

module.exports = { SENTENCES, MIN_WORDS, CODE_LENGTH, CODE_CHARS, normalize, wordCount, randomCode, randomSentence, newChallenge, check, isScope };
