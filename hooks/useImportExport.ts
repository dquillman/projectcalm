import type { AppSettings, Project, Task } from '../lib/types';
import { toCSV, parseCSV } from '../lib/csv';
import { uid } from '../lib/utils';

function nowIso() {
  return new Date().toISOString();
}

interface ImportExportCallbacks {
  projects: Project[];
  tasks: Task[];
  appSettings: AppSettings;
  setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  setAppSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
}

/**
 * Custom hook for import/export functionality
 * Handles JSON and CSV export/import operations
 */
export function useImportExport(callbacks: ImportExportCallbacks) {
  function downloadFile(name: string, mime: string, text: string) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 0);
    } catch (e) {
      console.error(e);
    }
  }

  function buildExportPayload() {
    return {
      version: (window as any).__APP_VERSION || 'vNext',
      exportedAt: new Date().toISOString(),
      projects: callbacks.projects,
      tasks: callbacks.tasks,
      settings: callbacks.appSettings,
    };
  }

  function exportJson() {
    const payload = buildExportPayload();
    downloadFile(
      `projectcalm-export-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
      JSON.stringify(payload, null, 2)
    );
  }

  function doImportFromJsonText(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
      const nextProjects = Array.isArray(parsed.projects)
        ? (parsed.projects as Project[])
        : [];
      const nextTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Task[]) : [];
      const nextSettings = parsed.settings as AppSettings | undefined;
      if (
        !confirm(
          `Import will replace current Projects (${callbacks.projects.length}) and Tasks (${callbacks.tasks.length}). Continue?`
        )
      )
        return;
      callbacks.setProjects(nextProjects);
      callbacks.setTasks(nextTasks);
      if (nextSettings) callbacks.setAppSettings(nextSettings);
    } catch (e) {
      alert('Failed to import JSON. ' + (e as Error).message);
    }
  }

  function importJsonPaste() {
    const text = window.prompt('Paste exported JSON here:');
    if (!text) return;
    doImportFromJsonText(text);
  }

  function exportCsv() {
    const headers = [
      'type',
      'projectId',
      'projectName',
      'id',
      'title',
      'notes',
      'done',
      'today',
      'status',
      'priority',
      'difficulty',
      'dueDate',
      'estimatedMinutes',
      'deletedAt',
      'createdAt',
    ];
    const rows: Array<Record<string, any>> = [];

    for (const p of callbacks.projects) {
      for (const s of p.steps) {
        rows.push({
          type: 'step',
          projectId: p.id,
          projectName: p.name,
          id: s.id,
          title: s.title,
          notes: s.notes ?? '',
          done: s.done ? 1 : 0,
          today: s.today ? 1 : 0,
          status: s.status ?? '',
          priority: s.priority ?? '',
          difficulty: s.difficulty ?? '',
          dueDate: s.dueDate ?? '',
          estimatedMinutes: s.estimatedMinutes ?? '',
          deletedAt: s.deletedAt ?? '',
          createdAt: s.createdAt ?? '',
        });
      }
    }

    for (const t of callbacks.tasks) {
      rows.push({
        type: 'task',
        projectId: '',
        projectName: '',
        id: t.id,
        title: t.title,
        notes: t.notes ?? '',
        done: t.done ? 1 : 0,
        today: t.today ? 1 : 0,
        status: t.status ?? '',
        priority: t.priority ?? '',
        difficulty: t.difficulty ?? '',
        dueDate: t.dueDate ?? '',
        estimatedMinutes: t.estimatedMinutes ?? '',
        deletedAt: t.deletedAt ?? '',
        createdAt: t.createdAt ?? '',
      });
    }

    const csv = toCSV(headers, rows);
    downloadFile(
      `projectcalm-export-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv',
      csv
    );
  }

  function coerceBool(v: string | undefined): boolean {
    return v === '1' || /^true$/i.test(String(v || '').trim());
  }

  function coerceNum(v: string | undefined): number | undefined {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }

  function doImportFromCsvText(text: string) {
    try {
      const { headers, rows } = parseCSV(text);
      if (!headers || !rows) throw new Error('No data');
      const idx = (name: string) => headers.indexOf(name);
      const get = (r: string[], name: string) => r[idx(name)] || '';

      const projMap = new Map<string, Project>();
      const outProjects: Project[] = [];
      const outTasks: Task[] = [];

      function ensureProject(id: string, name: string): Project {
        const key = id || name || 'Unnamed';
        let p = projMap.get(key);
        if (!p) {
          p = { id: id || uid(), name: name || 'Unnamed', steps: [] } as Project;
          projMap.set(key, p);
          outProjects.push(p);
        }
        return p;
      }

      for (const r of rows) {
        const type = get(r, 'type');
        if (type === 'step') {
          const p = ensureProject(get(r, 'projectId'), get(r, 'projectName'));
          p.steps.push({
            id: get(r, 'id') || uid(),
            title: get(r, 'title'),
            notes: get(r, 'notes') || undefined,
            done: coerceBool(get(r, 'done')),
            today: coerceBool(get(r, 'today')),
            status: ((): any => {
              const s = get(r, 'status');
              return s || undefined;
            })(),
            priority: coerceNum(get(r, 'priority')) as any,
            difficulty: coerceNum(get(r, 'difficulty')) as any,
            dueDate: ((): string | undefined => {
              const d = get(r, 'dueDate');
              return d || undefined;
            })(),
            estimatedMinutes: coerceNum(get(r, 'estimatedMinutes')),
            deletedAt: ((): string | undefined => {
              const d = get(r, 'deletedAt');
              return d || undefined;
            })(),
            createdAt: ((): string => {
              const d = get(r, 'createdAt');
              return d || nowIso();
            })(),
          });
        } else if (type === 'task') {
          outTasks.push({
            id: get(r, 'id') || uid(),
            title: get(r, 'title'),
            notes: get(r, 'notes') || undefined,
            done: coerceBool(get(r, 'done')),
            today: coerceBool(get(r, 'today')),
            status: ((): any => {
              const s = get(r, 'status');
              return s || undefined;
            })(),
            priority: coerceNum(get(r, 'priority')) as any,
            difficulty: coerceNum(get(r, 'difficulty')) as any,
            dueDate: ((): string | undefined => {
              const d = get(r, 'dueDate');
              return d || undefined;
            })(),
            estimatedMinutes: coerceNum(get(r, 'estimatedMinutes')),
            deletedAt: ((): string | undefined => {
              const d = get(r, 'deletedAt');
              return d || undefined;
            })(),
            createdAt: ((): string => {
              const d = get(r, 'createdAt');
              return d || nowIso();
            })(),
            kind: 'task',
          });
        }
      }

      if (
        !confirm(
          `Import will replace current Projects (${callbacks.projects.length}) and Tasks (${callbacks.tasks.length}). Continue?`
        )
      )
        return;
      callbacks.setProjects(outProjects);
      callbacks.setTasks(outTasks);
    } catch (e) {
      alert('Failed to import CSV. ' + (e as Error).message);
    }
  }

  function importCsvPaste() {
    const text = window.prompt('Paste CSV here:');
    if (!text) return;
    doImportFromCsvText(text);
  }

  return {
    exportJson,
    importJsonPaste,
    doImportFromJsonText,
    exportCsv,
    importCsvPaste,
    doImportFromCsvText,
    buildExportPayload,
  };
}
