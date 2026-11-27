'use strict';
// Native-Messaging-Host der Browser-Erweiterung. Er tut genau eins: auf die Nachricht {"type":"pair"} antwortet er
// mit Kopplungscode und Port aus der Kopplungsdatei der App und beendet sich, sobald der Browser die Leitung schließt.
// Gestartet wird er vom Browser über host.cmd (ELECTRON_RUN_AS_NODE), der Pfad der Kopplungsdatei kommt aus
// DOOMSCROLL_PAIRING. Er liest und schreibt sonst nichts, öffnet kein Netz und startet keine Programme.

const fs = require('node:fs');

const MAX_MESSAGE = 1024; // Browser -> Host: die einzige gültige Nachricht ist winzig
const TOKEN = /^[0-9a-f]{64}$/;

/** Rahmen des Protokolls: 4 Byte Länge (little endian) plus JSON. */
function encode(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
}

/** Zerlegt gepufferte Bytes in Nachrichten. error ist gesetzt, wenn ein Rahmen zu groß oder kein JSON ist. */
function decode(buffer) {
  const messages = [];
  let rest = buffer;
  while (rest.length >= 4) {
    const length = rest.readUInt32LE(0);
    if (length > MAX_MESSAGE) return { messages, rest, error: 'size' };
    if (rest.length < 4 + length) break;
    try {
      messages.push(JSON.parse(rest.subarray(4, 4 + length).toString('utf8')));
    } catch {
      return { messages, rest, error: 'json' };
    }
    rest = rest.subarray(4 + length);
  }
  return { messages, rest, error: null };
}

/** Antwort auf eine Nachricht. readPairing liefert {token, port} oder wirft. */
function answer(message, readPairing) {
  if (!message || message.type !== 'pair') return { ok: false, error: 'unknown' };
  try {
    const { token, port } = readPairing();
    if (typeof token !== 'string' || !TOKEN.test(token) || !Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: 'pairing' };
    return { ok: true, token, port };
  } catch {
    return { ok: false, error: 'pairing' };
  }
}

function run(stdin, stdout, pairingFile, onEnd = () => process.exit(0)) {
  const readPairing = () => JSON.parse(fs.readFileSync(pairingFile, 'utf8'));
  let buffer = Buffer.alloc(0);
  stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, rest, error } = decode(buffer);
    buffer = rest;
    for (const m of messages) stdout.write(encode(answer(m, readPairing)));
    if (error) {
      stdout.write(encode({ ok: false, error }));
      stdin.destroy();
    }
  });
  stdin.on('end', onEnd);
}

if (require.main === module) {
  if (!process.env.DOOMSCROLL_PAIRING) process.exit(1);
  run(process.stdin, process.stdout, process.env.DOOMSCROLL_PAIRING);
}

module.exports = { encode, decode, answer, run, MAX_MESSAGE };
