'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('../src/core/flyout');

const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
const screen = (workArea) => ({ bounds, workArea });
const bottom = screen({ x: 0, y: 0, width: 1920, height: 1040 }); // Taskleiste unten, 40 px
const top = screen({ x: 0, y: 40, width: 1920, height: 1040 });
const left = screen({ x: 60, y: 0, width: 1860, height: 1080 });
const right = screen({ x: 0, y: 0, width: 1860, height: 1080 });
const size = f.SIZES.compact;

test('Taskleiste wird an der Differenz von Bildschirm und Arbeitsbereich erkannt', () => {
  assert.equal(f.taskbarEdge(bottom), 'bottom');
  assert.equal(f.taskbarEdge(top), 'top');
  assert.equal(f.taskbarEdge(left), 'left');
  assert.equal(f.taskbarEdge(right), 'right');
  assert.equal(f.taskbarEdge(screen(bounds)), null);
});

test('Taskleiste unten: Panel sitzt über der Leiste, zentriert auf dem Symbol', () => {
  const tray = { x: 1500, y: 1040, width: 24, height: 40 };
  assert.deepEqual(f.position({ tray, display: bottom, size }), { x: 1512 - 180, y: 1040 - 480 - 8, width: 360, height: 480 });
});

test('Taskleiste oben: Panel hängt unter der Leiste', () => {
  const tray = { x: 1500, y: 0, width: 24, height: 40 };
  const p = f.position({ tray, display: top, size });
  assert.equal(p.y, 40 + 8);
  assert.equal(p.x, 1512 - 180);
});

test('Taskleiste links und rechts: Panel sitzt neben der Leiste, auf Höhe des Symbols', () => {
  const l = f.position({ tray: { x: 0, y: 500, width: 60, height: 24 }, display: left, size });
  assert.equal(l.x, 60 + 8);
  assert.equal(l.y, 512 - 240);
  const r = f.position({ tray: { x: 1860, y: 500, width: 60, height: 24 }, display: right, size });
  assert.equal(r.x, 1860 - 360 - 8);
  assert.equal(r.y, 512 - 240);
});

test('Symbol am Bildschirmrand: Panel bleibt im Arbeitsbereich', () => {
  const nearRight = f.position({ tray: { x: 1896, y: 1040, width: 24, height: 40 }, display: bottom, size });
  assert.equal(nearRight.x + nearRight.width, 1920 - 8);
  const nearLeft = f.position({ tray: { x: 0, y: 1040, width: 24, height: 40 }, display: bottom, size });
  assert.equal(nearLeft.x, 8);
  const nearTop = f.position({ tray: { x: 0, y: 10, width: 60, height: 24 }, display: left, size });
  assert.ok(nearTop.y >= 8);
});

test('ausgeblendete Taskleiste: nächster Bildschirmrand entscheidet', () => {
  const hidden = screen(bounds);
  const p = f.position({ tray: { x: 1500, y: 1056, width: 24, height: 24 }, display: hidden, size });
  assert.equal(p.y, 1080 - 480 - 8);
  const t = f.position({ tray: { x: 1500, y: 0, width: 24, height: 24 }, display: hidden, size });
  assert.equal(t.y, 8);
});

test('zweiter Monitor mit eigenem Ursprung', () => {
  const second = { bounds: { x: 1920, y: -200, width: 2560, height: 1440 }, workArea: { x: 1920, y: -200, width: 2560, height: 1400 } };
  const p = f.position({ tray: { x: 3000, y: 1200, width: 24, height: 40 }, display: second, size });
  assert.equal(p.x, 3012 - 180);
  assert.equal(p.y, 1200 - 480 - 8);
  assert.ok(p.x >= 1920 && p.x + p.width <= 4480);
});

test('ohne brauchbare Tray-Position: unten rechts im Arbeitsbereich', () => {
  for (const tray of [{ x: 0, y: 0, width: 0, height: 0 }, undefined]) {
    const p = f.position({ tray, display: bottom, size });
    assert.deepEqual(p, { x: 1920 - 360 - 8, y: 1040 - 480 - 8, width: 360, height: 480 });
  }
});

test('zu großes Fenster wird auf den Arbeitsbereich verkleinert', () => {
  const display = { bounds: { x: 0, y: 0, width: 400, height: 540 }, workArea: { x: 0, y: 0, width: 400, height: 500 } };
  const p = f.position({ tray: { x: 300, y: 500, width: 24, height: 40 }, display, size: f.SIZES.full });
  assert.equal(p.width, 384);
  assert.equal(p.height, 484);
  assert.ok(p.x >= 8 && p.y >= 8 && p.x + p.width <= 392 && p.y + p.height <= 492);
});

test('aufgeklappt wächst das Fenster von der Taskleiste weg und bleibt im Bild', () => {
  const tray = { x: 1500, y: 1040, width: 24, height: 40 };
  const a = f.position({ tray, display: bottom, size: f.SIZES.compact });
  const b = f.position({ tray, display: bottom, size: f.SIZES.full });
  assert.equal(a.y + a.height, b.y + b.height); // Unterkante bleibt an der Taskleiste
  assert.ok(b.width > a.width && b.height > a.height);
});

test('Übergang: Anfang, Ende und ruhiger Verlauf', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  const b = { x: 100, y: 50, width: 300, height: 500 };
  assert.deepEqual(f.lerpBounds(a, b, 0), a);
  assert.deepEqual(f.lerpBounds(a, b, 1), b);
  assert.equal(f.easeOut(0), 0);
  assert.equal(f.easeOut(1), 1);
  assert.ok(f.easeOut(0.5) > 0.5);
});

test('Tray-Klick kurz nach dem Schließen durch Fokusverlust wird ignoriert', () => {
  assert.equal(f.ignoreTrayClick(null, 1000), false);
  assert.equal(f.ignoreTrayClick(900, 1000), true);
  assert.equal(f.ignoreTrayClick(500, 1000), false);
  assert.equal(f.ignoreTrayClick(1100, 1000), false);
});

test('Logo-Dateien sind da: ICO mit allen Größen, PNGs in der richtigen Größe', () => {
  const dir = path.join(__dirname, '..');
  const png = (rel) => {
    const b = fs.readFileSync(path.join(dir, rel));
    assert.equal(b.toString('latin1', 1, 4), 'PNG');
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  assert.deepEqual(png('assets/icon.png'), [256, 256]);
  assert.deepEqual(png('assets/tray.png'), [16, 16]);
  assert.deepEqual(png('assets/tray@2x.png'), [32, 32]);
  for (const s of [16, 48, 128]) assert.deepEqual(png(`extension/icons/icon-${s}.png`), [s, s]);
  const ico = fs.readFileSync(path.join(dir, 'assets/icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico[6 + 16 * i] || 256);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});
