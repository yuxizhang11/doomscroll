'use strict';
// Reine Rechnung für das Panel am Tray-Symbol: wo es erscheint, wie es beim Aufklappen wächst, wann ein Tray-Klick zählt.
// Alle Rechtecke sind {x, y, width, height} in Bildschirmpunkten (wie Electron sie liefert), ohne Electron nutzbar.

const SIZES = { compact: { width: 360, height: 480 }, full: { width: 520, height: 760 } };
const GAP = 8; // Abstand zu Taskleiste und Bildschirmrand

/** Seite, an der die Taskleiste sitzt: dort ist der Arbeitsbereich kleiner als der Bildschirm. null bei ausgeblendeter Taskleiste. */
function taskbarEdge({ bounds, workArea }) {
  if (workArea.y > bounds.y) return 'top';
  if (workArea.y + workArea.height < bounds.y + bounds.height) return 'bottom';
  if (workArea.x > bounds.x) return 'left';
  if (workArea.x + workArea.width < bounds.x + bounds.width) return 'right';
  return null;
}

/** Nächster Bildschirmrand zu einem Punkt (für ausgeblendete Taskleisten). */
function nearestEdge({ bounds }, px, py) {
  const dist = { top: py - bounds.y, bottom: bounds.y + bounds.height - py, left: px - bounds.x, right: bounds.x + bounds.width - px };
  return Object.keys(dist).reduce((a, b) => (dist[b] < dist[a] ? b : a));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Fensterrechteck am Tray-Symbol. Das Fenster liegt im Arbeitsbereich, an der Taskleiste ausgerichtet und auf das Symbol
 * zentriert, soweit es der Bildschirm zulässt. Ohne brauchbare Tray-Position (Symbol im Überlauf, Größe 0) sitzt es unten rechts.
 * @param {{tray: object, display: {bounds: object, workArea: object}, size: {width: number, height: number}, gap?: number}} p
 */
function position({ tray, display, size, gap = GAP }) {
  const wa = display.workArea;
  const width = Math.min(size.width, Math.max(1, wa.width - 2 * gap));
  const height = Math.min(size.height, Math.max(1, wa.height - 2 * gap));
  const usable = Boolean(tray) && tray.width > 0 && tray.height > 0;
  const cx = usable ? tray.x + tray.width / 2 : wa.x + wa.width;
  const cy = usable ? tray.y + tray.height / 2 : wa.y + wa.height;
  const edge = (usable ? taskbarEdge(display) ?? nearestEdge(display, cx, cy) : null) ?? 'bottom';
  let x;
  let y;
  if (edge === 'left' || edge === 'right') {
    x = edge === 'left' ? wa.x + gap : wa.x + wa.width - width - gap;
    y = cy - height / 2;
  } else {
    y = edge === 'top' ? wa.y + gap : wa.y + wa.height - height - gap;
    x = cx - width / 2;
  }
  return {
    x: Math.round(clamp(x, wa.x + gap, wa.x + wa.width - width - gap)),
    y: Math.round(clamp(y, wa.y + gap, wa.y + wa.height - height - gap)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

const easeOut = (t) => 1 - (1 - t) ** 3;

function lerpBounds(a, b, t) {
  const f = (k) => Math.round(a[k] + (b[k] - a[k]) * t);
  return { x: f('x'), y: f('y'), width: f('width'), height: f('height') };
}

/**
 * Klickt man das Tray-Symbol, während das Panel offen ist, nimmt ihm schon dieser Klick den Fokus und schließt es.
 * Der Klick selbst darf es dann nicht gleich wieder öffnen.
 */
function ignoreTrayClick(hiddenAt, now, windowMs = 400) {
  return hiddenAt != null && now - hiddenAt >= 0 && now - hiddenAt < windowMs;
}

/**
 * Fokusverlust schließt nur das kleine Panel, und auch das nicht, solange eine Aufklapp- oder Einklapp-Animation läuft oder das
 * Fenster seit dem Öffnen noch nie den Fokus hatte. Das aufgeklappte Fenster bleibt offen (Einrichtung in einem anderen Fenster,
 * Dateidialoge); es schließt mit ✕, Esc oder dem Tray-Symbol.
 */
function shouldHideOnBlur({ stage, animating, focusedSinceShow }) {
  return stage === 'compact' && focusedSinceShow === true && !animating;
}

module.exports = { SIZES, GAP, taskbarEdge, nearestEdge, position, easeOut, lerpBounds, ignoreTrayClick, shouldHideOnBlur };
