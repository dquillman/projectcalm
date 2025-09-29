const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

async function pathExists(p) {
  try { await fs.promises.access(p); return true; } catch { return false; }
}

async function copyDir(src, dest) {
  if (!(await pathExists(src))) return;
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.promises.mkdir(path.dirname(d), { recursive: true });
      await fs.promises.copyFile(s, d).catch(()=>{});
    }
  }
}

async function maybeMigrateUserData(force = false) {
  try {
    const userData = app.getPath('userData');
    const appData = app.getPath('appData');
    const marker = path.join(userData, 'migrated_from_dev.txt');
    if (!force && await pathExists(marker)) return; // already migrated

    // Dev runs may have used the package.json "name" (projectcalm) for userData
    const legacyDir = path.join(appData, 'projectcalm');
    if (!(await pathExists(legacyDir))) return;

    // Only migrate if current store is effectively empty (no Local Storage yet)
    const curLocalStorage = path.join(userData, 'Local Storage');
    const hasCurrent = await pathExists(curLocalStorage);
    if (!force && hasCurrent) return;

    // Copy key stores commonly used by Chromium-based storage
    const parts = ['Local Storage', 'IndexedDB'];
    for (const p of parts) {
      const s = path.join(legacyDir, p);
      const d = path.join(userData, p);
      if (await pathExists(s)) {
        await copyDir(s, d);
      }
    }
    // Copy Preferences if present
    const prefSrc = path.join(legacyDir, 'Preferences');
    const prefDst = path.join(userData, 'Preferences');
    if (await pathExists(prefSrc) && !(await pathExists(prefDst))) {
      await fs.promises.copyFile(prefSrc, prefDst).catch(()=>{});
    }

    await fs.promises.writeFile(marker, `migrated from ${legacyDir} at ${new Date().toISOString()}\n`, 'utf8');
  } catch (_) {
    // best-effort migration; ignore errors
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: true,
  });

  // Load the root index.html which references ./dist/app.js and ./vendor/*
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  // Optional: open devtools in dev
  if (!app.isPackaged) {
    // win.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.handle('calm:migrateProfile', async () => {
  await maybeMigrateUserData(true);
  return { ok: true };
});

app.whenReady().then(async () => {
  await maybeMigrateUserData(false);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
