const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vibePingDesktop", {
  platform: process.platform,
  runtime: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  selectFolders: () => ipcRenderer.invoke("watcher:select-folders"),
  getConfig: () => ipcRenderer.invoke("watcher:get-config"),
  updateConfig: (nextConfig) => ipcRenderer.invoke("watcher:update-config", nextConfig),
  testDiscordConnection: () => ipcRenderer.invoke("watcher:test-discord-connection"),
  getState: () => ipcRenderer.invoke("watcher:get-state")
});
