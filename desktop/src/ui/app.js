'use strict';
// Oberfläche: nur textContent und Elemente, nie innerHTML mit Daten. Alles Wichtige entscheidet die App (main.js).

const api = window.doomscroll;
const view = document.getElementById('view');
const root = document.documentElement;
const MIN = 5; // Schrittweite der Limits in Minuten
const MAX = 600;

let state = null;
let tab = 'heute';
let draft = null; // Limit-Einstellungen, die noch nicht gespeichert sind
let toastTimer = null;
let lastTodayKey = '';

// ---------- Hilfen ----------

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM statt Attribut, wegen der CSP
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}

function toast(message) {
  if (!message) return;
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

let uid = 0;
const nextId = () => `f${++uid}`;

function card(title, ...content) {
  return h('section', { class: 'card' }, title ? h('h2', null, title) : null, content);
}

function sw(checked, onchange, label) {
  return h('span', { class: 'switch' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked, onchange: (e) => onchange(e.target.checked, e.target) }), h('span', { class: 'track' }));
}

function stepper(value, set, { label, unit = 'min', min = 0, max = MAX, step = MIN, zeroText }) {
  const out = h('output', { 'aria-live': 'polite' });
  const show = (v) => { out.textContent = v === 0 && zeroText ? zeroText : `${v} ${unit}`; };
  let current = value;
  show(current);
  const move = (d) => () => {
    current = Math.min(max, Math.max(min, current + d));
    show(current);
    set(current);
  };
  return h('div', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', class: 'btn icon', 'aria-label': `${label} verringern`, onclick: move(-step) }, '−'),
    out,
    h('button', { type: 'button', class: 'btn icon', 'aria-label': `${label} erhöhen`, onclick: move(step) }, '+'));
}

// ---------- Darstellung ----------

function applyPrefs() {
  const p = state.prefs;
  const dark = p.theme === 'dunkel' || (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.glass = p.glass;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.motion = p.animations === 'aus' || (p.animations === 'system' && reduced) ? 'off' : 'on';
  root.style.setProperty('--scale', String(p.textScale / 100));
}

// ---------- Zustand holen ----------

async function refresh(full = true) {
  state = await api.getState();
  applyPrefs();
  renderHeader();
  if (full) render();
}

function renderHeader() {
  const sub = document.getElementById('subtitle');
  sub.textContent = state.activeApp
    ? `Gerade offen: ${state.apps.find((a) => a.id === state.activeApp)?.label ?? ''}`
    : `Version ${state.version} · läuft im Tray`;
}

function render(still = false) {
  view.classList.toggle('still', still);
  for (const b of document.querySelectorAll('.tabs button')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const pages = { heute: pageToday, limits: pageLimits, erweiterung: pageExtension, mehr: pageMore };
  const nodes = pages[tab]();
  nodes.forEach((n, i) => n.style.setProperty('--i', String(i)));
  view.replaceChildren(...nodes);
}

// ---------- Heute ----------

function problemBanner() {
  const ex = state.extension;
  const lines = [];
  if (ex.serverError) lines.push(ex.serverError);
  for (const p of ex.problems) {
    lines.push(p.kind === 'missing'
      ? `${p.label} läuft, aber die Erweiterung meldet sich nicht. Dort wird nichts gezählt oder gesperrt.`
      : `Die Erweiterung in ${p.label} darf nicht in privaten Fenstern laufen. Dort ist nichts gesperrt.`);
  }
  const connected = Object.values(ex.families).some((f) => f.state === 'ok');
  if (lines.length === 0 && !connected && !Object.values(ex.families).some((f) => f.state === 'idle')) {
    lines.push('Noch keine Browser-Erweiterung verbunden. Ohne sie wird nichts gezählt.');
  }
  if (lines.length === 0) return null;
  return h('section', { class: 'card warn', role: 'alert' },
    h('h2', null, 'Schutz lückenhaft'),
    lines.map((l) => h('p', null, l)),
    h('button', { type: 'button', class: 'btn', onclick: () => { tab = 'erweiterung'; render(); } }, 'Zur Erweiterung'));
}

function pageToday() {
  const t = state.total;
  const left = Math.max(0, t.limitMin - t.usedMin);
  let big;
  let sub;
  if (t.unlockedAll) {
    big = 'Heute frei';
    sub = 'Die Sperre ist für heute aufgehoben.';
  } else if (state.quietNow) {
    big = 'Ruhezeit';
    sub = 'Reels, Shorts und TikTok sind gerade gesperrt.';
  } else if (t.perApp) {
    big = `${t.usedMin} min heute`;
    sub = 'Jede App hat ihr eigenes Limit.';
  } else if (left === 0) {
    big = 'Genug für heute!';
    sub = `Das Limit von ${t.limitMin} min ist erreicht.`;
  } else {
    big = `Noch ${left} min`;
    sub = `${t.usedMin} von ${t.limitMin} min heute genutzt.`;
  }
  const hero = h('section', { class: 'card hero' }, h('div', { class: 'big' }, big), h('p', { class: 'muted' }, sub));

  const rows = state.apps.filter((a) => a.enabled).map((a) => {
    const limit = a.limitMin ?? t.limitMin;
    const used = a.usedMin;
    const right = a.unlocked || t.unlockedAll ? `${a.usedMin} min · frei` : a.limitMin == null ? `${a.usedMin} min` : `${a.usedMin} / ${a.limitMin} min`;
    const bar = h('progress', { max: String(Math.max(1, limit)), value: String(a.unlocked || t.unlockedAll ? 0 : Math.min(used, limit)), 'aria-label': `${a.label}: ${right}`, class: used >= limit && !(a.unlocked || t.unlockedAll) ? 'full' : '' });
    return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'row', style: 'min-height:0' }, h('span', null, a.label), h('span', { class: 'muted' }, right)), bar));
  });
  const usage = card('Heute', rows.length ? rows : h('p', { class: 'muted' }, 'Alle Apps sind ausgeschaltet. Unter „Limits“ einschalten.'));

  const max = Math.max(1, ...state.week.map((d) => d.minutes));
  const sum = state.week.reduce((s, d) => s + d.minutes, 0);
  const week = card('Letzte 7 Tage',
    h('p', { class: 'muted' }, `Zusammen ${sum} min · Schnitt ${Math.round(sum / 7)} min pro Tag`),
    h('div', { class: 'bars', role: 'img', 'aria-label': state.week.map((d) => `${d.label} ${d.minutes} Minuten`).join(', ') },
      state.week.map((d) => h('div', { class: `bar${d.today ? ' today' : ''}` }, h('i', { style: `height:${Math.max(3, Math.round((d.minutes / max) * 100))}%` })))),
    h('div', { class: 'bar-labels', 'aria-hidden': 'true' }, state.week.map((d) => h('span', { class: d.today ? 'today' : '' }, d.label))));

  const unlockCard = card('Sperre aufheben',
    h('p', { class: 'muted' }, 'Gilt nur für heute. Dafür tippst du einen langen Satz von Hand ab, Einfügen geht nicht. Der Porno-Blocker lässt sich nicht aufheben.'),
    h('button', { type: 'button', class: 'btn block', onclick: () => openChallenge('ALL') }, 'Für alle Apps aufheben'),
    state.apps.filter((a) => a.enabled && !a.unlocked).map((a) => h('button', { type: 'button', class: 'btn block', onclick: () => openChallenge(a.id) }, `Nur ${a.label}`)));

  return [problemBanner(), hero, usage, week, unlockCard].filter(Boolean);
}

// ---------- Limits ----------

function pageLimits() {
  draft ??= structuredClone(state.settings);
  const d = draft;
  const modeName = nextId();
  const saveBtn = h('button', { type: 'button', class: 'btn primary block', onclick: save }, 'Änderungen speichern');

  const mode = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Limit für' },
    [['Für alle zusammen', false], ['Pro App', true]].map(([text, val]) =>
      h('label', null, h('input', { type: 'radio', name: modeName, checked: d.perAppMode === val, onchange: () => { d.perAppMode = val; render(); } }), h('span', null, text))));

  const limits = d.perAppMode
    ? state.apps.map((a) => h('div', { class: 'row' }, h('span', { class: 'grow' }, a.label), stepper(d.limits[a.id], (v) => { d.limits[a.id] = v; }, { label: `Limit ${a.label}` })))
    : [h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Limit pro Tag'), stepper(d.globalLimit, (v) => { d.globalLimit = v; }, { label: 'Limit für alle zusammen' }))];

  const apps = card('Meine Apps',
    h('p', { class: 'muted' }, 'Nur eingeschaltete Apps werden gezählt und gesperrt. Ausschalten braucht den langen Satz.'),
    state.apps.map((a) => h('div', { class: 'row' }, h('span', { class: 'grow' }, a.label), sw(d.enabled[a.id], (on) => { d.enabled[a.id] = on; }, a.label))));

  const warn = card('Vorwarnung',
    h('p', { class: 'muted' }, '0 schaltet sie aus. Ist das Limit nicht länger als die Vorwarnung, kommt keine.'),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Minuten vor dem Limit'), stepper(d.warnMinutes, (v) => { d.warnMinutes = v; }, { label: 'Vorwarnung', step: 1, max: 120, zeroText: 'Aus' })));

  const startId = nextId();
  const endId = nextId();
  const quiet = card('Ruhezeiten',
    h('p', { class: 'muted' }, 'In dieser Zeit sind alle Kurzvideos gesperrt, egal wie viel vom Limit übrig ist. Kürzer machen oder ausschalten braucht den langen Satz.'),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Ruhezeiten'), sw(d.quietEnabled, (on) => { d.quietEnabled = on; }, 'Ruhezeiten')),
    h('div', { class: 'field' }, h('label', { for: startId }, 'Von'), h('input', { id: startId, type: 'time', value: clock(d.quietStart), onchange: (e) => { d.quietStart = minutes(e.target.value, d.quietStart); } })),
    h('div', { class: 'field' }, h('label', { for: endId }, 'Bis'), h('input', { id: endId, type: 'time', value: clock(d.quietEnd), onchange: (e) => { d.quietEnd = minutes(e.target.value, d.quietEnd); } })));

  return [
    card('Limits', h('p', { class: 'muted' }, 'Lockern (mehr Zeit, App ausschalten, Modus wechseln) braucht den langen Satz.'), mode, limits, saveBtn),
    apps, warn, quiet,
  ];
}

function clock(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function minutes(text, fallback) {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : fallback;
}

async function save() {
  const res = await api.saveSettings(draft);
  if (res.ok) {
    draft = null;
    toast('Gespeichert');
    await refresh();
  } else if (res.needsUnlock) {
    openChallenge('SETTINGS');
  }
}

// ---------- Erweiterung ----------

const STATE_TEXT = { ok: ['Erweiterung verbunden', 'ok'], missing: ['Erweiterung fehlt', 'bad'], idle: ['Browser nicht gestartet', 'idle'], unknown: ['Status unbekannt', 'idle'] };
let setupBrowser = null; // Browser, für den die Schritte gezeigt werden
let shownBrowsers = ''; // erkannte Browser der letzten Darstellung

function browserRows() {
  const list = state.extension.browsers;
  if (!state.extension.browsersKnown) return [h('p', { class: 'muted' }, 'Suche nach installierten Browsern …')];
  if (list.length === 0) return [h('p', { class: 'muted' }, 'Es wurde kein Chrome, Edge, Brave oder Firefox gefunden. Bei einem anderen Browser auf Chromium-Basis klappt dieselbe Einrichtung wie bei Chrome mit dem Ordner unten.')];
  const rows = list.map((b) => {
    const [text, cls] = STATE_TEXT[b.state];
    const incog = b.state !== 'ok' ? null
      : b.incognito === 'denied' ? h('span', { class: 'badge bad' }, 'Private Fenster nicht erlaubt')
      : b.incognito === 'ok' ? h('span', { class: 'badge ok' }, 'Private Fenster erlaubt')
      : h('span', { class: 'badge idle' }, 'Private Fenster unbekannt');
    return h('div', { class: 'row' }, h('span', { class: 'grow' }, b.label), h('span', { class: 'status-line' }, h('span', { class: `badge ${cls}` }, text), incog));
  });
  if (list.some((b) => b.shared)) rows.push(h('p', { class: 'muted' }, 'Chrome und Brave lassen sich für die Erweiterung nicht unterscheiden: „Verbunden“ gilt für den Browser, in dem sie läuft.'));
  return rows;
}

async function openPage(id, target) {
  const res = await api.openBrowser(id, target);
  if (!res.ok) toast(res.message ?? 'Der Browser lässt sich nicht öffnen.');
}

function folderButtons() {
  return [
    h('code', { class: 'path' }, state.extension.dir),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn', onclick: async () => { const r = await api.openExtensionFolder(); if (!r.ok) toast(r.message); } }, 'Ordner öffnen'),
      h('button', { type: 'button', class: 'btn', onclick: async () => { await api.copyExtensionPath(); toast('Pfad kopiert'); } }, 'Pfad kopieren')),
  ];
}

function setupSteps(b) {
  const open = h('button', { type: 'button', class: 'btn primary', onclick: () => openPage(b.id, 'extensions') }, `${b.label} öffnen und Erweiterungsseite zeigen`);
  if (b.id === 'firefox') {
    return h('ol', { class: 'steps' },
      h('li', null, 'Firefox mit der Seite zum Testen von Add-ons öffnen.', h('div', { class: 'row-actions' }, open)),
      h('li', null, 'Dort „Dieser Firefox“ wählen, dann „Temporäres Add-on laden …“ und im Ordner der Erweiterung die Datei ', h('code', null, 'manifest.json'), ' auswählen:', folderButtons()),
      h('li', null, 'Private Fenster erlauben: ', h('code', null, 'about:addons'), ' öffnen, „Doomscroll Blocker“ wählen und „In privaten Fenstern ausführen“ auf „Erlauben“ stellen.'),
      h('li', null, 'Fertig: Oben steht „Erweiterung verbunden“, sobald sich App und Erweiterung gefunden haben. Einen Code musst du nicht kopieren.'));
  }
  return h('ol', { class: 'steps' },
    h('li', null, `${b.label} mit der Seite für Erweiterungen öffnen.`, h('div', { class: 'row-actions' }, open)),
    h('li', null, b.id === 'edge' ? 'Links in der Seitenleiste „Entwicklermodus“ einschalten.' : 'Oben rechts „Entwicklermodus“ einschalten.'),
    h('li', null, '„Entpackte Erweiterung laden“ wählen und diesen Ordner auswählen (im Dateidialog den Pfad in die Adresszeile einfügen):', folderButtons()),
    h('li', null, `Private Fenster erlauben: die Detailseite der Erweiterung öffnen und „${b.incognitoLabel}“ einschalten.`,
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => openPage(b.id, 'details') }, 'Detailseite der Erweiterung öffnen'))),
    h('li', null, 'Fertig: Oben steht „Erweiterung verbunden“, sobald sich App und Erweiterung gefunden haben. Einen Code musst du nicht kopieren.'));
}

function pageExtension() {
  const ex = state.extension;
  const list = ex.browsers;
  if (!list.some((b) => b.id === setupBrowser)) setupBrowser = (list.find((b) => b.state !== 'ok') ?? list[0])?.id ?? null;
  const chosen = list.find((b) => b.id === setupBrowser);
  shownBrowsers = ex.browsersKnown + list.map((b) => b.id).join();

  const status = card('Browser', h('div', { id: 'family-rows' }, browserRows()),
    ex.serverError ? h('p', { class: 'error' }, ex.serverError) : null,
    ex.nativeErrors.length > 0 ? h('p', { class: 'error' }, `Die automatische Kopplung ließ sich nicht einrichten (${ex.nativeErrors.join(', ')}). Nutze unten die Kopplung von Hand.`) : null,
    h('p', { class: 'muted' }, 'Die App zählt nur, was die Erweiterung meldet. Ohne Erweiterung bleibt der Browser frei.'));

  const pick = list.length > 1
    ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Browser für die Einrichtung' },
      list.map((b) => h('label', null, h('input', { type: 'radio', name: 'setup-browser', checked: b.id === setupBrowser, onchange: () => { setupBrowser = b.id; render(); } }), h('span', null, b.label))))
    : null;
  const setup = card('Erweiterung einrichten',
    h('p', null, 'Die Erweiterung lädst du einmal selbst in den Browser. Die Kopplung mit der App läuft danach von selbst.'),
    pick,
    chosen ? setupSteps(chosen) : null,
    chosen?.id === 'firefox' ? h('p', { class: 'muted' }, 'Firefox behält temporär geladene Add-ons nur bis zum nächsten Neustart des Browsers; danach wiederholst du die Schritte 1 und 2. Dauerhaft geht das in Firefox nur mit einer von Mozilla signierten Fassung der Erweiterung, und die gibt es noch nicht.') : null);

  const manual = h('details', { class: 'card manual' },
    h('summary', null, 'Kopplung von Hand (nur wenn die automatische nicht klappt)'),
    h('p', null, 'Kopiere den Kopplungscode und füge ihn in den Einstellungen der Erweiterung ein (Erweiterungsseite des Browsers, bei Doomscroll Blocker „Erweiterungsoptionen“).'),
    h('button', { type: 'button', class: 'btn block', onclick: async () => { await api.copyToken(); toast('Kopplungscode kopiert'); } }, 'Kopplungscode kopieren'),
    h('p', { class: 'muted', style: 'margin-top:16px' }, `Die App lauscht nur auf 127.0.0.1, Port ${ex.port}. Der Code schützt sie vor anderen Programmen und Webseiten.`));

  const admin = card('Fest erzwingen',
    h('p', null, 'Ohne Administratorrechte lässt sich nicht verhindern, dass jemand die Erweiterung entfernt oder einen anderen Browser nutzt. Mit Administratorrechten kann man sie per Browser-Richtlinie fest installieren und gegen Entfernen sperren (Chrome und Edge: ', h('code', null, 'ExtensionInstallForcelist'), ', Firefox: ', h('code', null, 'ExtensionSettings'), ', dort auch für private Fenster).'),
    h('p', { class: 'muted' }, 'Das richtet diese App nicht ein. Es ist nur ein Hinweis.'));
  return [status, setup, manual, admin];
}

// ---------- Mehr ----------

function select(label, value, options, onchange) {
  const id = nextId();
  return h('div', { class: 'field' }, h('label', { for: id }, label),
    h('select', { id, onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => h('option', { value: v, selected: v === String(value) }, t))));
}

async function setPref(key, value) {
  const res = await api.setPref(key, value);
  if (res.ok) await refresh(false);
  return res;
}

function pageMore() {
  const p = state.prefs;
  const look = card('Darstellung',
    select('Design', p.theme, [['system', 'Wie Windows'], ['hell', 'Hell'], ['dunkel', 'Dunkel']], (v) => setPref('theme', v)),
    select('Glas-Effekte', p.glass, [['aus', 'Aus'], ['einfach', 'Einfach (Leiste und Knöpfe)'], ['voll', 'Voll (alles Glas)']], (v) => setPref('glass', v)),
    select('Animationen', p.animations, [['system', 'Wie Windows'], ['an', 'An'], ['aus', 'Aus']], (v) => setPref('animations', v)),
    select('Schriftgröße', String(p.textScale), [['100', 'Normal'], ['125', 'Groß'], ['150', 'Sehr groß'], ['200', 'Riesig']], (v) => setPref('text_scale', Number(v))));

  const hints = card('Hinweise',
    h('p', { class: 'muted' }, 'Meldungen von Windows, jede einzeln abschaltbar. „Genug für heute!“ gehört zur Sperre und bleibt immer an.'),
    state.hints.map((hint) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', null, hint.label), h('div', { class: 'muted small' }, hint.detail)), sw(p.hints[hint.key], (on) => setPref(hint.key, on), hint.label))));

  const wordId = nextId();
  const wordError = h('p', { class: 'error', role: 'alert' });
  const adult = card('Porno-Blocker',
    h('p', null, 'Immer an. Steht eine Porno-Seite oder -Suche in der Adresse eines Tabs, geht die Erweiterung auf „Diese Seite ist gesperrt“. Andere Seiten bleiben offen.'),
    h('p', { class: 'muted' }, 'Eigene Wörter (z. B. ein Name) lassen sich nur hinzufügen, nie entfernen.'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const input = e.target.elements.word;
      const res = await api.addWord(input.value);
      wordError.textContent = res.ok ? '' : res.message;
      if (res.ok) { input.value = ''; await refresh(); }
    } },
      h('label', { for: wordId }, 'Eigenes Wort'),
      h('div', { class: 'row-actions', style: 'margin-top:8px' }, h('input', { id: wordId, name: 'word', type: 'text', autocomplete: 'off', style: 'flex:1;min-width:8rem' }), h('button', { type: 'submit', class: 'btn' }, 'Hinzufügen')),
      wordError),
    state.adultWords.length ? h('ul', { class: 'words', 'aria-label': 'Eigene Wörter' }, state.adultWords.map((w) => h('li', null, w))) : null);

  const autostart = card('Start mit Windows',
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', null, 'Mit Windows starten'), h('div', { class: 'muted small' }, 'Im Tray, ohne Fenster. Ausschalten braucht 20 abgetippte Zeichen.')),
      sw(p.autostart, async (on, el) => { if (on) await setPref('autostart', true); else { el.checked = true; openChallenge('AUTOSTART'); } }, 'Mit Windows starten')));

  const backupMsg = h('p', { class: 'muted', role: 'status' });
  const backup = card('Datensicherung',
    h('p', { class: 'muted' }, 'Speichert Limits, Ruhezeiten, Hinweise, Darstellung und den Verlauf der letzten 30 Tage als Datei. Lockert ein Import ein Limit, musst du den Satz abtippen. Eigene Wörter fügt ein Import nur hinzu. Mit dem Handy wird nichts abgeglichen.'),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn', onclick: async () => { const r = await api.exportBackup(); if (r.message) backupMsg.textContent = r.message; } }, 'Exportieren'),
      h('button', { type: 'button', class: 'btn', onclick: async () => {
        const r = await api.importBackup();
        if (r.message) backupMsg.textContent = r.message;
        if (r.needsUnlock) openChallenge('SETTINGS'); else if (r.ok) { draft = null; await refresh(); }
      } }, 'Importieren')),
    backupMsg);

  const upd = h('div', { id: 'update-box' }, updateBox());
  const updates = card('Updates', h('p', null, `Version ${state.version}`), upd);

  const quit = card('Beenden',
    h('p', { class: 'muted' }, 'Das Fenster schließen lässt die App im Tray weiterlaufen. Zum Beenden tippst du 20 Zeichen ab.'),
    h('button', { type: 'button', class: 'btn', onclick: () => openChallenge('QUIT') }, 'App beenden …'));

  return [look, hints, adult, autostart, backup, updates, quit];
}

function updateBox() {
  const u = state.update;
  const out = [];
  if (u.available) {
    out.push(h('p', null, `Neue Version ${u.available.version} ist da.`));
    out.push(h('button', { type: 'button', class: 'btn primary', onclick: installUpdate }, 'Update laden'));
  } else {
    out.push(h('p', { class: 'muted' }, u.error ?? 'Du hast die neueste Version, sofern die letzte Suche geklappt hat.'));
    out.push(h('button', { type: 'button', class: 'btn', onclick: async () => { toast('Suche läuft …'); state.update = await api.checkUpdate(); document.getElementById('update-box')?.replaceChildren(...updateBox()); } }, 'Nach Updates suchen'));
  }
  return out;
}

async function installUpdate() {
  const r = await api.installUpdate();
  toast(r.message);
  await refresh(false);
}

// ---------- Dialoge ----------

const chDialog = document.getElementById('challenge');
const chInput = document.getElementById('ch-input');
let chScope = null;

const WHAT = {
  ALL: 'Um die Sperre heute für alle Apps aufzuheben',
  SETTINGS: 'Um das Limit zu lockern',
  QUIT: 'Um Doomscroll Blocker zu beenden',
  AUTOSTART: 'Um den Start mit Windows auszuschalten',
};

async function openChallenge(scope) {
  const ch = await api.newChallenge(scope);
  if (!ch) return;
  chScope = scope;
  const app = state?.apps.find((a) => a.id === scope);
  const what = WHAT[scope] ?? `Um die Sperre heute für ${app?.label ?? 'diese App'} aufzuheben`;
  const code = ch.kind === 'code';
  document.getElementById('ch-instruction').textContent = code
    ? `${what}, tippe diese 20 Zeichen genau ab (Groß- und Kleinschreibung zählt):`
    : `${what}, tippe diesen Satz genau ab:`;
  const text = document.getElementById('ch-text');
  text.textContent = ch.text;
  text.className = `challenge-text${code ? ' code' : ''}`;
  document.getElementById('ch-label').textContent = code ? '20 Zeichen hier abtippen' : 'Satz hier abtippen';
  chInput.rows = code ? 1 : 3;
  chInput.value = '';
  document.getElementById('ch-error').textContent = '';
  if (!chDialog.open) chDialog.showModal();
  chInput.focus();
}

// Einfügen ist gesperrt: Strg+V, Rechtsklick, Ziehen und Einfügen über das Menü.
for (const type of ['paste', 'drop', 'contextmenu', 'copy', 'cut']) chInput.addEventListener(type, (e) => e.preventDefault());
chInput.addEventListener('beforeinput', (e) => { if (/^insertFrom(Paste|Drop|PasteAsQuotation)/.test(e.inputType)) e.preventDefault(); });
chInput.addEventListener('keydown', (e) => {
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') || (e.shiftKey && e.key === 'Insert')) e.preventDefault();
  if (e.key === 'Enter' && chInput.rows === 1) e.preventDefault();
});

document.getElementById('ch-cancel').addEventListener('click', () => { chDialog.close(); draftNeedsRefresh(); });
document.getElementById('ch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api.submitChallenge(chScope, chInput.value);
  if (!res.ok) {
    document.getElementById('ch-error').textContent = res.message;
    chInput.focus();
    return;
  }
  chDialog.close();
  toast(res.message);
  if (chScope === 'SETTINGS') draft = null;
  await refresh();
});
function draftNeedsRefresh() { render(); }

const infoDialog = document.getElementById('info');
let infoClosed = null;
infoDialog.addEventListener('close', () => { const fn = infoClosed; infoClosed = null; fn?.(); });
function showInfo(title, body, actions, onClose) {
  infoClosed = onClose;
  document.getElementById('info-title').textContent = title;
  document.getElementById('info-body').replaceChildren(...body);
  document.getElementById('info-actions').replaceChildren(...actions.map(([text, fn, primary]) =>
    h('button', { type: 'button', class: `btn${primary ? ' primary' : ''}`, onclick: async () => { infoDialog.close(); await fn?.(); } }, text)));
  if (!infoDialog.open) infoDialog.showModal();
}

function maybePopups() {
  if (infoDialog.open || chDialog.open) return;
  if (state.update.popup) {
    const u = state.update.available;
    showInfo(`Update ${u.version}`, [h('p', null, 'Eine neue Version von Doomscroll Blocker ist da.'), u.notes ? h('p', { class: 'muted', style: 'white-space:pre-wrap' }, u.notes) : null],
      [['Update laden', installUpdate, true], ['Später']], () => api.dismissUpdate());
  } else if (state.whatsNew) {
    showInfo(`Neu in ${state.whatsNew.version}`, [h('ul', { class: 'notes' }, state.whatsNew.lines.map((l) => h('li', null, l)))],
      [['Verstanden', null, true]], () => api.whatsNewSeen());
  }
}

// ---------- Start ----------

for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
}
api.onOpenChallenge((scope) => openChallenge(scope));
api.onOpenTab((name) => { if (name === 'erweiterung') { tab = name; render(); window.scrollTo(0, 0); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => state && applyPrefs());

// Live-Anzeige: nur Bereiche ohne Eingaben werden neu gezeichnet, damit nichts beim Tippen verspringt.
setInterval(async () => {
  if (document.hidden) return;
  try {
    state = await api.getState();
  } catch {
    return;
  }
  applyPrefs();
  renderHeader();
  const key = JSON.stringify([state.total, state.apps, state.week, state.quietNow, state.extension, state.activeApp]);
  if (tab === 'heute' && !chDialog.open && key !== lastTodayKey) {
    lastTodayKey = key;
    render(true);
  }
  if (tab === 'erweiterung') {
    // Wurden Browser gerade erst erkannt, wird die Seite neu gebaut (sie hat keine Eingaben); sonst nur der Status.
    const ids = state.extension.browsersKnown + state.extension.browsers.map((b) => b.id).join();
    if (ids !== shownBrowsers) render(true);
    else document.getElementById('family-rows')?.replaceChildren(...browserRows());
  }
  maybePopups();
}, 2000);

// Fenster ohne verbundene Erweiterung (erster Start, später über den Tray geöffnet) beginnt bei der Einrichtung.
refresh(false).then(() => {
  if (state.extension.needsSetup) tab = 'erweiterung';
  render();
  maybePopups();
});
