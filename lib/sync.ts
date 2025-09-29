export type SyncConfig = {
  gistId?: string;
  gistToken?: string; // PAT with "gist" scope
  public?: boolean; // create public gist when true
};

const SYNC_KEY = 'projectcalm:sync';

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        gistId: sanitizeStr(parsed.gistId),
        gistToken: sanitizeStr(parsed.gistToken),
        public: !!parsed.public,
      };
    }
  } catch {}
  return {};
}

export function saveSyncConfig(cfg: SyncConfig) {
  try {
    const out = {
      gistId: sanitizeStr(cfg.gistId),
      gistToken: sanitizeStr(cfg.gistToken),
      public: !!cfg.public,
    };
    localStorage.setItem(SYNC_KEY, JSON.stringify(out));
  } catch {}
}

function sanitizeStr(v: any): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
}

