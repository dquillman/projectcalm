import type { AppSettings, Difficulty, Priority, Project, Status, Task } from './types';

export const PROJECTS_KEY = 'projectcalm:projects';
export const TASKS_KEY = 'projectcalm:tasks';
export const SETTINGS_KEY = 'projectcalm:settings';

// Storage error handling and quota management
let lastQuotaWarning = 0;
const QUOTA_WARNING_INTERVAL = 5 * 60 * 1000; // 5 minutes between warnings

export interface StorageError {
  type: 'quota_exceeded' | 'storage_disabled' | 'unknown';
  message: string;
  canRetry: boolean;
}

export type StorageErrorCallback = (error: StorageError) => void;

let errorCallback: StorageErrorCallback | null = null;

export function setStorageErrorCallback(callback: StorageErrorCallback) {
  errorCallback = callback;
}

function handleStorageError(error: unknown, operation: string): void {
  console.error(`Storage ${operation} failed:`, error);

  if (!errorCallback) return;

  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') {
      const now = Date.now();
      if (now - lastQuotaWarning < QUOTA_WARNING_INTERVAL) return; // Throttle warnings
      lastQuotaWarning = now;

      errorCallback({
        type: 'quota_exceeded',
        message: 'Storage quota exceeded. Please export your data and clear old items.',
        canRetry: false,
      });
    } else if (error.message.includes('localStorage is not available')) {
      errorCallback({
        type: 'storage_disabled',
        message: 'Browser storage is disabled. Please enable cookies and site data.',
        canRetry: false,
      });
    } else {
      errorCallback({
        type: 'unknown',
        message: `Failed to ${operation}: ${error.message}`,
        canRetry: true,
      });
    }
  }
}

export function checkStorageQuota(): { used: number; available: number; percentage: number } | null {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  // Return estimate (async operation, caller should await)
  return null; // Sync version not available
}

export async function getStorageQuota(): Promise<{ used: number; available: number; percentage: number } | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const available = estimate.quota || 0;
    const percentage = available > 0 ? (used / available) * 100 : 0;

    return { used, available, percentage };
  } catch (e) {
    console.error('Failed to estimate storage quota:', e);
    return null;
  }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    if (Array.isArray(parsed)) {
      return parsed.map(p => ({
        ...p,
        steps: Array.isArray(p.steps) ? p.steps.map(s => ({
          ...s,
          // migrate old 'blocked' to 'waiting'
          status: s.status === 'blocked' ? 'waiting' : s.status,
        })) : [],
      }));
    }
  } catch (_) {}
  return [];
}

export function saveProjects(projects: Project[]): boolean {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    handleStorageError(e, 'save projects');
    return false;
  }
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Task[];
    if (Array.isArray(parsed)) return parsed.map(t => ({ ...t, status: (t as any).status === 'blocked' ? 'waiting' : t.status }));
  } catch (_) {}
  return [];
}

export function saveTasks(tasks: Task[]): boolean {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    return true;
  } catch (e) {
    handleStorageError(e, 'save tasks');
    return false;
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const b = parsed?.breathe ?? { inhale: 4, hold1: 4, exhale: 4, hold2: 4 };
      const ui = parsed?.ui ?? {
        showPriority: true,
        showDifficulty: true,
        showDueDate: true,
        showStatus: true,
        showEta: true,
      };
      const defaults = parsed?.defaults ?? {
        step: {},
        task: {},
      };
      return {
        breathe: {
          inhale: Math.max(1, Number((b as any).inhale) || 4),
          hold1: Math.max(1, Number((b as any).hold1) || 4),
          exhale: Math.max(1, Number((b as any).exhale) || 4),
          hold2: Math.max(1, Number((b as any).hold2) || 4),
        },
        ui: {
          showPriority: !!(ui as any).showPriority,
          showDifficulty: !!(ui as any).showDifficulty,
          showDueDate: !!(ui as any).showDueDate,
          showStatus: !!(ui as any).showStatus,
          showEta: !!(ui as any).showEta,
        },
        defaults: {
          step: {
            priority: sanitizePD((defaults as any).step?.priority),
            difficulty: sanitizePD((defaults as any).step?.difficulty),
            status: sanitizeStatus((defaults as any).step?.status),
            todayDefault: !!(defaults as any).step?.todayDefault,
          },
          task: {
            priority: sanitizePD((defaults as any).task?.priority),
            difficulty: sanitizePD((defaults as any).task?.difficulty),
            status: sanitizeStatus((defaults as any).task?.status),
            todayDefault: !!(defaults as any).task?.todayDefault,
          },
        },
      };
    }
  } catch (_) {}
  return {
    breathe: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
    ui: { showPriority: true, showDifficulty: true, showDueDate: true, showStatus: true, showEta: true },
    defaults: { step: {}, task: {} },
  };
}

function sanitizePD<T extends number | undefined>(v: T): any {
  if (v == null) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  const m = Math.max(1, Math.min(5, Math.round(n)));
  return m as Priority & Difficulty;
}
function sanitizeStatus(v: any): Status | undefined {
  if (v === 'blocked') return 'waiting';
  return v === 'todo' || v === 'in_progress' || v === 'waiting' || v === 'done' ? v : undefined;
}

export function saveSettings(s: AppSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    handleStorageError(e, 'save settings');
    return false;
  }
}
