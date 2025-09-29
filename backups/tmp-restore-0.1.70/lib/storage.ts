import type { AppSettings, Difficulty, Priority, Project, Status, Task } from './types';

export const PROJECTS_KEY = 'projectcalm:projects';
export const TASKS_KEY = 'projectcalm:tasks';
export const SETTINGS_KEY = 'projectcalm:settings';

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

export function saveProjects(projects: Project[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (_) {}
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

export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (_) {}
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

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {}
}
