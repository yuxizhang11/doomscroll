'use strict';
// Schmale Brücke zwischen Oberfläche und App: nur diese Funktionen, keine Node-Rechte in der Seite.

const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('doomscroll', {
  getState: call('state:get'),
  newChallenge: call('challenge:new'),
  submitChallenge: call('challenge:submit'),
  saveSettings: call('settings:save'),
  setPref: call('prefs:set'),
  addWord: call('words:add'),
  copyToken: call('token:copy'),
  exportBackup: call('backup:export'),
  importBackup: call('backup:import'),
  checkUpdate: call('update:check'),
  installUpdate: call('update:install'),
  dismissUpdate: call('update:dismiss'),
  whatsNewSeen: call('whatsnew:seen'),
  onOpenChallenge: (cb) => ipcRenderer.on('open-challenge', (_event, scope) => cb(scope)),
});
