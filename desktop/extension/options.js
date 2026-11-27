'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const isFirefox = Boolean(globalThis.browser?.runtime?.getBrowserInfo);
const REASONS = {
  token: 'Die automatische Kopplung hat nicht geklappt, und der Kopplungscode fehlt oder stimmt nicht. Starte die App einmal und warte kurz.',
  offline: 'Die Doomscroll-Blocker-App läuft nicht oder ist nicht erreichbar.',
  http: 'Die App hat die Meldung abgelehnt.',
};

function render(status) {
  const connection = document.getElementById('connection');
  const fresh = status && Date.now() - status.at < 15000;
  connection.className = `status ${fresh && status.ok ? 'ok' : 'bad'}`;
  connection.textContent = !status ? 'Noch keine Verbindung.' : fresh && status.ok ? 'Verbunden mit der App.' : `Nicht verbunden. ${REASONS[status.reason] ?? ''}`;

  const incognito = document.getElementById('incognito');
  const howto = document.getElementById('howto');
  if (status?.incognitoAllowed === false) {
    incognito.className = 'status bad';
    incognito.textContent = 'Private Fenster sind nicht erlaubt: Dort ist nichts gesperrt.';
    howto.hidden = false;
    howto.textContent = isFirefox
      ? 'Firefox: Add-ons und Themes öffnen (about:addons), Doomscroll Blocker wählen und „In privaten Fenstern ausführen“ auf „Erlauben“ stellen.'
      : 'Chrome, Edge, Brave: Erweiterungen verwalten, bei Doomscroll Blocker auf „Details“ gehen und „In Inkognito zulassen“ (bei Edge „In InPrivate zulassen“) einschalten.';
  } else if (status?.incognitoAllowed === true) {
    incognito.className = 'status ok';
    incognito.textContent = 'Private Fenster sind erlaubt.';
    howto.hidden = true;
  } else {
    incognito.textContent = '';
    howto.hidden = true;
  }
}

document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await api.storage.local.set({ token: document.getElementById('token').value.trim() });
  Promise.resolve(api.runtime.sendMessage({ type: 'beat' })).catch(() => {});
});

api.storage.onChanged.addListener((changes) => {
  if (changes.status) render(changes.status.newValue);
});

api.storage.local.get(['status', 'token']).then(({ status, token }) => {
  if (typeof token === 'string') document.getElementById('token').value = token;
  render(status);
  Promise.resolve(api.runtime.sendMessage({ type: 'beat' })).catch(() => {});
});
