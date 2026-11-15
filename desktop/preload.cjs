// The bridge between the window and the main process: only these calls, nothing else from Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oc', {
  agents: () => ipcRenderer.invoke('agents'),
  state: () => ipcRenderer.invoke('state'),
  connect: agentId => ipcRenderer.invoke('connect', agentId),
  authenticate: methodId => ipcRenderer.invoke('authenticate', methodId),
  prompt: text => ipcRenderer.invoke('prompt', text),
  cancel: () => ipcRenderer.invoke('cancel'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openInBrowser: () => ipcRenderer.invoke('open-in-browser'),
  answerPermission: (requestId, optionId) => ipcRenderer.invoke('permission-answer', requestId, optionId),
  session: () => ipcRenderer.invoke('auth-session'),
  signIn: (email, password) => ipcRenderer.invoke('auth-signin', email, password),
  signUp: (email, password) => ipcRenderer.invoke('auth-signup', email, password),
  verify: (email, code) => ipcRenderer.invoke('auth-verify', email, code),
  signOut: () => ipcRenderer.invoke('auth-signout'),
  web: () => ipcRenderer.invoke('web'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  on: (channel, fn) => { const h = (_e, data) => fn(data); ipcRenderer.on(channel, h); return () => ipcRenderer.off(channel, h); },
});
