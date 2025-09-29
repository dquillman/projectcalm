export type CloudSyncConfig = {
  enabled?: boolean;
  serverUrl?: string; // e.g., https://projectcalm-api.onrender.com
  syncKey?: string;   // user-chosen secret
  lastVersion?: string; // server updatedAt from last successful pull/push
};

const CLOUD_SYNC_KEY = 'projectcalm:cloudsync';

export function loadCloudSyncConfig(): CloudSyncConfig {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizeCfg(parsed);
  } catch {}
  return {};
}

export function saveCloudSyncConfig(cfg: CloudSyncConfig) {
  try {
    const out = sanitizeCfg(cfg);
    localStorage.setItem(CLOUD_SYNC_KEY, JSON.stringify(out));
  } catch {}
}

export async function cloudPull(cfg: CloudSyncConfig): Promise<{ data: any; updatedAt: string | null } | null> {
  const url = (cfg.serverUrl || '').trim();
  const key = (cfg.syncKey || '').trim();
  if (!url || !key) return null;
  const res = await fetch(norm(url) + '/v1/data?ts=' + Date.now(), {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Cloud pull failed (${res.status})`);
  const json = await res.json();
  return { data: json.data ?? null, updatedAt: json.updatedAt || null };
}

export async function cloudPush(cfg: CloudSyncConfig, payload: any): Promise<{ updatedAt: string } | 'conflict'> {
  const url = (cfg.serverUrl || '').trim();
  const key = (cfg.syncKey || '').trim();
  if (!url || !key) throw new Error('Missing Cloud Sync config');
  const body = { data: payload, version: cfg.lastVersion || undefined } as any;
  const res = await fetch(norm(url) + '/v1/data', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) return 'conflict';
  if (!res.ok) throw new Error(`Cloud push failed (${res.status})`);
  const json = await res.json();
  return { updatedAt: json.updatedAt };
}

function norm(u: string): string { return u.replace(/\/$/, ''); }

function sanitizeCfg(v: any): CloudSyncConfig {
  const out: CloudSyncConfig = {};
  if (v && typeof v === 'object') {
    if (typeof v.enabled === 'boolean') out.enabled = !!v.enabled;
    if (typeof v.serverUrl === 'string') out.serverUrl = v.serverUrl.trim();
    if (typeof v.syncKey === 'string') out.syncKey = v.syncKey.trim();
    if (typeof v.lastVersion === 'string') out.lastVersion = v.lastVersion.trim();
  }
  return out;
}

