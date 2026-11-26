'use strict';
// Port von Store.kt: alle Einstellungen und Tageszähler in einem JSON-Objekt.
// Zähler und Entsperrungen gehören zu einem Tag und werden beim ersten Lesen an einem neuen Tag gelöscht.

const { APP_IDS } = require('./targets');
const { cleanWord } = require('./adult-filter');

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;
const HISTORY = 'hist_';
const HISTORY_DAYS = 30;
const MAX_MINUTES = 600;
const MAX_WARN_MINUTES = 120;
/** Version der gespeicherten Daten; zusammen mit einem Schritt in migrate() erhöhen. */
const SCHEMA = 1;

/** Meldungen, die einzeln abschaltbar sind; alle sind standardmäßig an. */
const HINTS = [
  { key: 'hint_remaining', label: 'Restzeit beim Öffnen', detail: 'Kurze Meldung „Noch X Minuten“, wenn du Reels, Shorts oder TikTok öffnest.' },
  { key: 'hint_warning', label: 'Vorwarnung', detail: 'Meldung, kurz bevor das Limit erreicht ist (Zeit unter Limits).' },
  { key: 'hint_extension', label: 'Erweiterung fehlt', detail: 'Meldung, wenn ein Browser läuft, aber die Erweiterung nicht meldet oder nicht für private Fenster erlaubt ist.' },
  { key: 'hint_update_notification', label: 'Update-Benachrichtigung', detail: 'Meldung, sobald eine neue Version da ist.' },
  { key: 'hint_update_popup', label: 'Update-Popup', detail: 'Fragt beim Öffnen des Fensters, ob das Update geladen werden soll.' },
  { key: 'hint_whats_new', label: 'Was ist neu', detail: 'Zeigt nach einem Update kurz die Änderungen.' },
];
const HINT_KEYS = HINTS.map((h) => h.key);

const THEMES = ['system', 'hell', 'dunkel'];
const GLASS = ['aus', 'einfach', 'voll'];
const ANIMATIONS = ['system', 'an', 'aus'];

const LIMIT_KEYS = ['per_app_mode', 'global_limit', 'warning_minutes', 'quiet', 'quiet_start', 'quiet_end'];
const LIMIT_PREFIXES = ['limit_', 'enabled_'];

/** Lokales Datum als YYYY-MM-DD (nicht UTC, damit der Reset um lokale Mitternacht kommt). */
function localDay(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Liegt die Minute im Fenster von start bis end, das über Mitternacht laufen darf? */
function inWindow(minute, start, end) {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isDayKey(key) {
  return typeof key === 'string' && key.startsWith(HISTORY) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(HISTORY.length));
}

class Store {
  /**
   * @param {object} data gespeicherte Daten (wird verändert)
   * @param {{now?: () => Date, onChange?: () => void}} options
   */
  constructor(data = {}, { now = () => new Date(), onChange = () => {} } = {}) {
    this.data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    this.now = now;
    this.onChange = onChange;
    this.migrate();
  }

  /** Hebt ältere Daten Schritt für Schritt auf SCHEMA. Schritte ergänzen nur Schlüssel und lassen Vorgaben stehen. */
  migrate() {
    const from = Number.isInteger(this.data.schema_version) ? this.data.schema_version : 0;
    if (from >= SCHEMA) return;
    // 0 → 1: nichts ändert sich, die Schema-Nummer wird ab jetzt gespeichert.
    this.data.schema_version = SCHEMA;
    this.onChange();
  }

  set(key, value) {
    this.data[key] = value;
    this.onChange();
  }

  num(key, fallback) {
    const v = this.data[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  bool(key, fallback) {
    const v = this.data[key];
    return typeof v === 'boolean' ? v : fallback;
  }

  // ---- Einstellungen ----

  get perAppMode() { return this.bool('per_app_mode', false); }
  get globalLimitMinutes() { return clampInt(this.num('global_limit', 30), 0, MAX_MINUTES, 30); }
  limitMinutes(app) { return clampInt(this.num(`limit_${app}`, 15), 0, MAX_MINUTES, 15); }
  isEnabled(app) { return this.bool(`enabled_${app}`, true); }
  get quietEnabled() { return this.bool('quiet', false); }
  get quietStart() { return clampInt(this.num('quiet_start', 22 * 60), 0, 1439, 22 * 60); }
  get quietEnd() { return clampInt(this.num('quiet_end', 7 * 60), 0, 1439, 7 * 60); }
  get warnMinutes() { return clampInt(this.num('warning_minutes', 5), 0, MAX_WARN_MINUTES, 5); }
  get textScalePercent() { return clampInt(this.num('text_scale', 100), 80, 200, 100); }
  get theme() { return THEMES.includes(this.data.theme) ? this.data.theme : 'system'; }
  get glass() { return GLASS.includes(this.data.glass) ? this.data.glass : 'einfach'; }
  get animations() { return ANIMATIONS.includes(this.data.animations) ? this.data.animations : 'system'; }
  get autostart() { return this.bool('autostart', true); }
  isOn(hintKey) { return this.bool(hintKey, true); }
  limitFor(app) { return this.perAppMode ? this.limitMinutes(app) : this.globalLimitMinutes; }

  get adultWords() {
    return Array.isArray(this.data.adult_words) ? this.data.adult_words.filter((w) => typeof w === 'string') : [];
  }

  /** Eigene Wörter werden nur ergänzt, nie entfernt. Gibt false zurück, wenn das Wort zu kurz ist. */
  addAdultWord(word) {
    const clean = cleanWord(word);
    if (!clean) return false;
    this.set('adult_words', [...new Set([...this.adultWords, clean])]);
    return true;
  }

  /** Der aktuelle Stand der Limit-Einstellungen im Format, das die Oberfläche speichert. */
  settings() {
    return {
      perAppMode: this.perAppMode,
      globalLimit: this.globalLimitMinutes,
      enabled: Object.fromEntries(APP_IDS.map((id) => [id, this.isEnabled(id)])),
      limits: Object.fromEntries(APP_IDS.map((id) => [id, this.limitMinutes(id)])),
      warnMinutes: this.warnMinutes,
      quietEnabled: this.quietEnabled,
      quietStart: this.quietStart,
      quietEnd: this.quietEnd,
    };
  }

  /** Macht aus beliebiger Eingabe gültige Einstellungen; ungültige Felder behalten den aktuellen Wert. */
  sanitizeSettings(raw) {
    const base = this.settings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const flags = (src, fallback) => Object.fromEntries(APP_IDS.map((id) => [id, typeof src?.[id] === 'boolean' ? src[id] : fallback[id]]));
    const mins = (src, fallback) => Object.fromEntries(APP_IDS.map((id) => [id, clampInt(src?.[id], 0, MAX_MINUTES, fallback[id])]));
    return {
      perAppMode: typeof raw.perAppMode === 'boolean' ? raw.perAppMode : base.perAppMode,
      globalLimit: clampInt(raw.globalLimit, 0, MAX_MINUTES, base.globalLimit),
      enabled: flags(raw.enabled, base.enabled),
      limits: mins(raw.limits, base.limits),
      warnMinutes: clampInt(raw.warnMinutes, 0, MAX_WARN_MINUTES, base.warnMinutes),
      quietEnabled: typeof raw.quietEnabled === 'boolean' ? raw.quietEnabled : base.quietEnabled,
      quietStart: clampInt(raw.quietStart, 0, 1439, base.quietStart),
      quietEnd: clampInt(raw.quietEnd, 0, 1439, base.quietEnd),
    };
  }

  /** Alles, was mehr Zeit als bisher gibt, braucht den Satz, genau wie eine Entsperrung. */
  loosens(next) {
    const cur = this.settings();
    if (next.perAppMode !== cur.perAppMode) return true;
    if (next.globalLimit > cur.globalLimit) return true;
    if (APP_IDS.some((id) => (cur.enabled[id] && !next.enabled[id]) || next.limits[id] > cur.limits[id])) return true;
    return this.quietShrinks(next);
  }

  /** Wahr, wenn eine Minute, die bisher Ruhezeit war, es nicht mehr wäre. */
  quietShrinks(next) {
    if (!this.quietEnabled) return false;
    for (let m = 0; m < 24 * 60; m++) {
      if (inWindow(m, this.quietStart, this.quietEnd) && !(next.quietEnabled && inWindow(m, next.quietStart, next.quietEnd))) return true;
    }
    return false;
  }

  applySettings(next) {
    const s = this.sanitizeSettings(next);
    Object.assign(this.data, {
      per_app_mode: s.perAppMode,
      global_limit: s.globalLimit,
      warning_minutes: s.warnMinutes,
      quiet: s.quietEnabled,
      quiet_start: s.quietStart,
      quiet_end: s.quietEnd,
    });
    for (const id of APP_IDS) {
      this.data[`enabled_${id}`] = s.enabled[id];
      this.data[`limit_${id}`] = s.limits[id];
    }
    this.onChange();
  }

  // ---- Heute ----

  isQuietNow() {
    const d = this.now();
    return this.quietEnabled && inWindow(d.getHours() * 60 + d.getMinutes(), this.quietStart, this.quietEnd);
  }

  /** Beim ersten Lesen an einem neuen Tag: Gesamtzeit von gestern in den Verlauf (30 Tage), Zähler, Entsperrungen und Warnungen weg. */
  ensureToday() {
    const today = localDay(this.now());
    const last = this.data.day;
    if (last === today) return;
    const d = this.data;
    if (typeof last === 'string') {
      d[`${HISTORY}${last}`] = Object.keys(d).filter((k) => k.startsWith('usage_')).reduce((sum, k) => sum + (typeof d[k] === 'number' ? d[k] : 0), 0);
    }
    const oldestDate = new Date(this.now().getTime());
    oldestDate.setDate(oldestDate.getDate() - HISTORY_DAYS);
    const oldest = localDay(oldestDate);
    for (const key of Object.keys(d)) {
      if (key.startsWith('usage_') || key.startsWith('unlock_') || key.startsWith('warn_')) delete d[key];
      else if (key.startsWith(HISTORY) && !(isDayKey(key) && key.slice(HISTORY.length) >= oldest)) delete d[key];
    }
    d.day = today;
    this.onChange();
  }

  usageMs(app) {
    this.ensureToday();
    return this.num(`usage_${app}`, 0);
  }

  addUsage(app, ms) {
    if (!(ms > 0)) return;
    this.ensureToday();
    this.set(`usage_${app}`, this.num(`usage_${app}`, 0) + ms);
  }

  totalUsageMs() {
    return APP_IDS.filter((id) => this.isEnabled(id)).reduce((sum, id) => sum + this.usageMs(id), 0);
  }

  /** Kurzvideo-Zeit an einem Tag über alle Apps; vergangene Tage kommen aus dem Verlauf. */
  dayTotalMs(date) {
    this.ensureToday();
    if (localDay(date) === localDay(this.now())) return APP_IDS.reduce((sum, id) => sum + this.usageMs(id), 0);
    return this.num(`${HISTORY}${localDay(date)}`, 0);
  }

  /** Schlüssel für „alle Apps“ ist null. */
  isUnlockedToday(app) {
    this.ensureToday();
    return this.bool(`unlock_${app ?? 'ALL'}`, false);
  }

  unlockToday(app) {
    this.ensureToday();
    this.set(`unlock_${app ?? 'ALL'}`, true);
  }

  /** Millisekunden Kurzvideo-Zeit, die heute noch bleiben, oder null, wenn gerade nichts begrenzt ist. */
  remainingMs(app) {
    if (!this.isEnabled(app) || this.isUnlockedToday(null) || this.isUnlockedToday(app)) return null;
    if (this.isQuietNow()) return 0;
    return this.perAppMode
      ? this.limitMinutes(app) * MINUTE - this.usageMs(app)
      : this.globalLimitMinutes * MINUTE - this.totalUsageMs();
  }

  warnKey(app) { return `warn_${this.perAppMode ? app : 'ALL'}`; }

  wasWarnedToday(app) {
    this.ensureToday();
    return this.bool(this.warnKey(app), false);
  }

  markWarned(app) {
    this.ensureToday();
    this.set(this.warnKey(app), true);
  }

  // ---- Sicherung ----

  /** Einstellungen, Hinweise und Verlauf; heutige Zähler und Entsperrungen bleiben draußen. */
  backupValues() {
    this.ensureToday();
    const safe = (k) => isDayKey(k) || HINT_KEYS.includes(k) || ['text_scale', 'adult_words', 'theme', 'glass', 'animations'].includes(k);
    return Object.fromEntries(Object.entries(this.data).filter(([k]) => LIMIT_KEYS.includes(k) || LIMIT_PREFIXES.some((p) => k.startsWith(p)) || safe(k)));
  }

  /**
   * Übernimmt, was nie mehr Zeit geben kann: Verlauf, Hinweise, Schriftgröße, Darstellung und
   * eigene Wörter (nur ergänzt). Die Limits stellt settingsFromBackup bereit, damit der Satz gefragt wird.
   */
  restoreSafe(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return;
    for (const [key, value] of Object.entries(values)) {
      if (isDayKey(key)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DAY_MS) this.data[key] = Math.round(value);
      } else if (HINT_KEYS.includes(key)) {
        if (typeof value === 'boolean') this.data[key] = value;
      } else if (key === 'text_scale') {
        this.data[key] = clampInt(value, 80, 200, 100);
      } else if (key === 'theme' && THEMES.includes(value)) this.data[key] = value;
      else if (key === 'glass' && GLASS.includes(value)) this.data[key] = value;
      else if (key === 'animations' && ANIMATIONS.includes(value)) this.data[key] = value;
      else if (key === 'adult_words' && Array.isArray(value)) {
        const own = value.map(cleanWord).filter(Boolean);
        this.data.adult_words = [...new Set([...this.adultWords, ...own])];
      }
    }
    this.onChange();
  }

  /** Die gesicherten Limits als Einstellungen; fehlende oder ungültige Felder behalten den aktuellen Wert. */
  settingsFromBackup(values) {
    const v = values && typeof values === 'object' ? values : {};
    return this.sanitizeSettings({
      perAppMode: v.per_app_mode,
      globalLimit: v.global_limit,
      enabled: Object.fromEntries(APP_IDS.map((id) => [id, v[`enabled_${id}`]])),
      limits: Object.fromEntries(APP_IDS.map((id) => [id, v[`limit_${id}`]])),
      warnMinutes: v.warning_minutes,
      quietEnabled: v.quiet,
      quietStart: v.quiet_start,
      quietEnd: v.quiet_end,
    });
  }
}

module.exports = { Store, HINTS, HINT_KEYS, THEMES, GLASS, ANIMATIONS, SCHEMA, MINUTE, MAX_MINUTES, localDay, inWindow };
