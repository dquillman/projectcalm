/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useState } = React as typeof React;

import type { AppSettings, Project, Task } from '../lib/types';
import {
  loadCloudSyncConfig,
  saveCloudSyncConfig,
  cloudPull,
  cloudPush,
  type CloudSyncConfig,
} from '../lib/cloudSync';
import { pushToGist, pullFromGist } from '../lib/gistSync';
import { loadSyncConfig, saveSyncConfig } from '../lib/sync';

interface SyncCallbacks {
  setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  setAppSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  buildExportPayload: () => any;
}

/**
 * Custom hook to manage cloud and gist synchronization
 * Extracts all sync-related logic from app.tsx
 */
export function useSyncState(callbacks: SyncCallbacks, projects: Project[], tasks: Task[]) {
  const [cloudCfg, setCloudCfg] = useState<CloudSyncConfig>(() => loadCloudSyncConfig());
  const [cloudBusy, setCloudBusy] = useState(false);

  // Auto-save cloud config whenever it changes
  useEffect(() => {
    saveCloudSyncConfig(cloudCfg);
  }, [cloudCfg]);

  // Default Cloud URL when hosted on Render static site
  useEffect(() => {
    try {
      const host = window.location?.hostname || '';
      const isRender = host.endsWith('onrender.com');
      if (isRender) {
        const defUrl = 'https://projectcalm-api.onrender.com';
        setCloudCfg((cur) => {
          if (!cur || !cur.serverUrl) return { ...cur, serverUrl: defUrl };
          return cur;
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background auto-sync: on mount try pull if local is empty
  useEffect(() => {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) return;

    (async () => {
      try {
        const r = await cloudPull(cfg);
        if (r && r.data && typeof r.data === 'object') {
          const localCount = projects.length + tasks.length;
          if (localCount === 0) {
            const nextProjects = Array.isArray(r.data.projects)
              ? (r.data.projects as Project[])
              : [];
            const nextTasks = Array.isArray(r.data.tasks) ? (r.data.tasks as Task[]) : [];
            const nextSettings = r.data.settings as AppSettings | undefined;
            callbacks.setProjects(nextProjects);
            callbacks.setTasks(nextTasks);
            if (nextSettings) callbacks.setAppSettings(nextSettings);
          }
          setCloudCfg({ ...cfg, lastVersion: r.updatedAt || undefined });
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-push on data changes (debounced)
  useEffect(() => {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) return;

    const handle = setTimeout(async () => {
      try {
        const res = await cloudPush(cfg, callbacks.buildExportPayload());
        if (res !== 'conflict') {
          setCloudCfg({ ...cfg, lastVersion: res.updatedAt });
        }
      } catch (e) {
        console.error('Auto-sync push failed:', e);
      }
    }, 1500);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tasks]);

  // Gist Sync functions
  async function onSyncPush(cfg: { gistToken: string; gistId?: string; public?: boolean }) {
    const token = (cfg.gistToken || '').trim();
    if (!token) throw new Error('Gist token is required');
    const payload = callbacks.buildExportPayload();
    const res = await pushToGist(payload, { token, gistId: cfg.gistId, public: cfg.public });
    saveSyncConfig({ gistToken: token, gistId: res.gistId, public: !!cfg.public });
    alert(`Pushed to Gist: ${res.url}`);
    return { gistId: res.gistId };
  }

  async function onSyncPull(cfg: { gistToken?: string; gistId: string }) {
    const data = await pullFromGist({ gistId: cfg.gistId, token: cfg.gistToken });
    if (!data || typeof data !== 'object') throw new Error('Invalid data in gist');
    if (
      !confirm('Import from Gist will replace current Projects and Tasks. Continue?')
    )
      return;
    const nextProjects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
    const nextTasks = Array.isArray(data.tasks) ? (data.tasks as Task[]) : [];
    const nextSettings = data.settings as AppSettings | undefined;
    callbacks.setProjects(nextProjects);
    callbacks.setTasks(nextTasks);
    if (nextSettings) callbacks.setAppSettings(nextSettings);
    alert('Imported data from Gist.');
  }

  // Cloud Sync functions
  async function onCloudPull() {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey)
      throw new Error('Cloud Sync not configured');
    setCloudBusy(true);
    try {
      const r = await cloudPull(cfg);
      if (!r) throw new Error('No response');
      if (r.data && typeof r.data === 'object') {
        if (
          !confirm('Import from Cloud will replace current Projects and Tasks. Continue?')
        )
          return;
        const nextProjects = Array.isArray(r.data.projects)
          ? (r.data.projects as Project[])
          : [];
        const nextTasks = Array.isArray(r.data.tasks) ? (r.data.tasks as Task[]) : [];
        const nextSettings = r.data.settings as AppSettings | undefined;
        callbacks.setProjects(nextProjects);
        callbacks.setTasks(nextTasks);
        if (nextSettings) callbacks.setAppSettings(nextSettings);
        setCloudCfg({ ...cfg, lastVersion: r.updatedAt || undefined });
        alert('Imported data from Cloud.');
      } else {
        alert('No cloud data found yet.');
      }
    } finally {
      setCloudBusy(false);
    }
  }

  async function onCloudPush() {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey)
      throw new Error('Cloud Sync not configured');
    setCloudBusy(true);
    try {
      const res = await cloudPush(cfg, callbacks.buildExportPayload());
      if (res === 'conflict') {
        const r = await cloudPull(cfg);
        if (
          r &&
          r.data &&
          confirm(
            'Cloud has different data. Overwrite cloud with local? Cancel to keep cloud.'
          )
        ) {
          const res2 = await cloudPush(
            { ...cfg, lastVersion: r.updatedAt || undefined },
            callbacks.buildExportPayload()
          );
          if (res2 !== 'conflict')
            setCloudCfg({ ...cfg, lastVersion: res2.updatedAt });
        }
      } else {
        setCloudCfg({ ...cfg, lastVersion: res.updatedAt });
        alert('Pushed to Cloud.');
      }
    } finally {
      setCloudBusy(false);
    }
  }

  // Quick sync button: Cloud first, fallback to Gist
  async function syncNow() {
    try {
      const cloud = loadCloudSyncConfig();
      if (cloud && cloud.enabled && cloud.serverUrl && cloud.syncKey) {
        await onCloudPush();
        return;
      }
      const gist = loadSyncConfig();
      if (gist && gist.gistToken) {
        await onSyncPush({
          gistToken: gist.gistToken,
          gistId: gist.gistId,
          public: gist.public,
        });
        return;
      }
      alert('Set up Cloud Sync or Gist in Settings to use Sync Now.');
    } catch (e) {
      alert(String((e as Error).message || e));
    }
  }

  return {
    cloudCfg,
    setCloudCfg,
    cloudBusy,
    onSyncPush,
    onSyncPull,
    onCloudPull,
    onCloudPush,
    syncNow,
  };
}
