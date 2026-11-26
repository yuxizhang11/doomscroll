'use strict';
// Zähllogik, Gegenstück zu BlockerService.kt: Die Browser-Erweiterung meldet etwa alle 2 s die URLs der
// aktiven Tabs. Hier wird gezählt, gewarnt und entschieden, welcher Tab gesperrt werden muss.
// Reine Logik ohne Electron, die Uhr kommt von außen.

const { APPS, fromUrl } = require('./targets');
const { isPorn } = require('./adult-filter');
const { MINUTE } = require('./store');

const HEARTBEAT_GAP_MS = 6_000; // länger ohne Meldung: Sitzung vorbei, die Lücke zählt nicht
const REMINDER_GAP_MS = 10_000; // kürzere Pausen lösen keine neue „Noch X Minuten“-Meldung aus

class Tracker {
  constructor(store, { now = Date.now } = {}) {
    this.store = store;
    this.now = now;
    this.clients = new Map(); // clientId -> { seen, tabs, browser, label, version, incognitoAllowed }
    this.activeApp = null;
    this.lastAccount = null;
    this.lastApp = null;
    this.lastSessionEnd = 0;
  }

  /**
   * Eine Meldung der Erweiterung. Gibt zurück, welche der gemeldeten Tabs gesperrt werden sollen
   * (blocks: [{id, kind: 'limit' | 'quiet' | 'porn', app}]) und welche Meldungen anstehen (events).
   * tabs müssen bereits geprüft sein: [{id: Zahl, url: Text, incognito: Wahrheitswert}].
   */
  report(clientId, info, tabs) {
    const t = this.now();
    const store = this.store;
    const prevApp = this.activeApp;

    // 1. Die Zeit seit der letzten Meldung der zuletzt aktiven App gutschreiben.
    if (prevApp && this.lastAccount !== null) {
      const delta = t - this.lastAccount;
      if (delta > 0 && delta <= HEARTBEAT_GAP_MS) store.addUsage(prevApp, delta);
    }
    this.lastAccount = t;

    // 2. Den Stand dieses Browsers merken, veraltete Browser vergessen.
    this.clients.set(clientId, { ...info, seen: t, tabs });
    for (const [id, c] of this.clients) if (id !== clientId && t - c.seen > HEARTBEAT_GAP_MS) c.tabs = [];

    // 3. Welche App ist jetzt offen? Gesperrte Tabs zählen nicht (am Handy ebenso), Porno-Adressen auch nicht.
    const words = store.adultWords;
    const open = new Set();
    for (const c of this.clients.values()) {
      for (const tab of c.tabs) {
        if (isPorn(tab.url, words)) continue;
        const app = fromUrl(tab.url);
        if (!app || !store.isEnabled(app.id)) continue;
        const left = store.remainingMs(app.id);
        if (left === null || left > 0) open.add(app.id);
      }
    }
    const app = APPS.find((a) => open.has(a.id))?.id ?? null;

    // 4. Sitzungswechsel: Restzeit zeigen, wenn das Zählen neu beginnt.
    const events = [];
    if (app !== prevApp) {
      if (prevApp) {
        this.lastApp = prevApp;
        this.lastSessionEnd = t;
      }
      if (app) {
        const left = store.remainingMs(app);
        if (left !== null && store.isOn('hint_remaining') && (app !== this.lastApp || t - this.lastSessionEnd > REMINDER_GAP_MS)) {
          events.push({ type: 'remaining', app, minutes: Math.ceil(left / MINUTE) });
        }
      }
    }
    this.activeApp = app;

    // 5. Vorwarnung, einmal pro Tag und Limit; nur wenn das Limit länger als die Warnzeit ist.
    if (app) {
      const left = store.remainingMs(app);
      const warn = store.warnMinutes;
      if (left !== null && left > 0 && warn > 0 && store.limitFor(app) > warn && left <= warn * MINUTE && !store.wasWarnedToday(app)) {
        store.markWarned(app);
        if (store.isOn('hint_warning')) events.push({ type: 'warning', app, minutes: Math.ceil(left / MINUTE) });
      }
    }

    // 6. Welche Tabs dieses Browsers müssen weg? Porno nie entsperrbar, Limits nur ohne Entsperrung.
    const blocks = [];
    for (const tab of tabs) {
      if (isPorn(tab.url, words)) {
        blocks.push({ id: tab.id, kind: 'porn', app: null });
        continue;
      }
      const a = fromUrl(tab.url);
      if (!a || !store.isEnabled(a.id)) continue;
      const left = store.remainingMs(a.id);
      if (left !== null && left <= 0) blocks.push({ id: tab.id, kind: store.isQuietNow() ? 'quiet' : 'limit', app: a.id });
    }
    return { blocks, events };
  }

  /** Läuft gerade eine Sitzung (jüngste Meldung nicht älter als die Lücke)? */
  currentApp() {
    return this.activeApp && this.lastAccount !== null && this.now() - this.lastAccount <= HEARTBEAT_GAP_MS ? this.activeApp : null;
  }
}

module.exports = { Tracker, HEARTBEAT_GAP_MS, REMINDER_GAP_MS };
