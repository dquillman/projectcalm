const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calmNative', {
  migrateProfile: async () => {
    try {
      const res = await ipcRenderer.invoke('calm:migrateProfile');
      return res;
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  },
});

