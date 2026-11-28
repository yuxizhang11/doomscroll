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
  openBrowser: call('browser:open'),
  openExtensionFolder: call('extension:openFolder'),
  copyExtensionPath: call('extension:copyPath'),
  exportBackup: call('backup:export'),
  importBackup: call('backup:import'),
  checkUpdate: call('update:check'),
  installUpdate: call('update:install'),
  dismissUpdate: call('update:dismiss'),
  whatsNewSeen: call('whatsnew:seen'),
  panelExpand: call('panel:expand'),
  panelCollapse: call('panel:collapse'),
  panelClose: call('panel:close'),
  onPanelStage: (cb) => ipcRenderer.on('panel-stage', (_event, name) => cb(name)),
  onOpenTab: (cb) => ipcRenderer.on('open-tab', (_event, tab) => cb(tab)),
  onOpenChallenge: (cb) => ipcRenderer.on('open-challenge', (_event, scope) => cb(scope)),
});
