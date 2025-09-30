/* @jsxRuntime classic */
/* @jsx React.createElement */
// Using global React in a standalone UMD build.
// Defines window.ProjectCalmApp so index.html can mount it.

// Grab hooks from global React injected by index.html
const { useEffect, useMemo, useState } = React as typeof React;

import type { AppSettings, ID, Project, SortMode, Step, Tab, Task } from './lib/types';
import { useTheme } from './hooks/useTheme';
import { AppSettingsEditor } from './components/AppSettingsEditor';
import { BreatheGuide } from './components/BreatheGuide';
import { ProjectSection } from './components/ProjectSection';
import { StepItem } from './components/StepItem';
import { EditItemModal, type EditItem } from './components/EditItemModal';
import { PlanModal, type PlanCandidate } from './components/PlanModal';
import { FocusPane } from './components/FocusPane';
import { btnBase, btnNeutral, btnPositive, btnSelected, cardBase, cardTone, selectTone, strongText, subtleText, chipTone } from './lib/styles';
import { filterStepsForTab, sortProjects, sortSteps, uid, classNames, formatHours, daysUntilDue, priorityLabel, difficultyLabel, smartExplain, statusLabel } from './lib/utils';
import { loadProjects, saveProjects, loadSettings, saveSettings, loadTasks, saveTasks } from './lib/storage';
import { toCSV, parseCSV } from './lib/csv';
import { pushToGist, pullFromGist } from './lib/gistSync';
import { loadSyncConfig, saveSyncConfig } from './lib/sync';
import { loadCloudSyncConfig, saveCloudSyncConfig, cloudPull, cloudPush, type CloudSyncConfig } from './lib/cloudSync';

function nowIso() { return new Date().toISOString(); }

type View = 'projects' | 'everything' | 'steps' | 'tasks' | 'focus';

export function ProjectCalmApp() {
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState<View>('projects');
  const [tab, setTab] = useState<Tab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [showBreathe, setShowBreathe] = useState(false);
  const [editingStep, setEditingStep] = useState<{ projectId: ID; step: Step } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [planSel, setPlanSel] = useState<Map<string, boolean>>(new Map());
  const [focusTarget, setFocusTarget] = useState<{ kind: 'task'; id: ID } | null>(null);
  const [cloudCfg, setCloudCfg] = useState<CloudSyncConfig>(() => loadCloudSyncConfig());
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => { saveProjects(projects); }, [projects]);
  useEffect(() => { saveTasks(tasks); }, [tasks]);
  useEffect(() => { saveSettings(appSettings); }, [appSettings]);
  useEffect(() => { saveCloudSyncConfig(cloudCfg); }, [cloudCfg]);
  // Default Cloud URL when hosted on Render static site and none set yet
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

  const activeProjects = useMemo(() => projects.filter(p => !p.deletedAt), [projects]);
  const sortedProjects = useMemo(() => sortProjects(activeProjects, sortMode, tab), [activeProjects, sortMode, tab]);
  const allOpenSteps = useMemo(() => {
    const out: Array<{projectId: ID; step: Step; projectName: string}> = [];
    for (const p of activeProjects) {
      for (const s of p.steps) {
        if (!s.deletedAt && !s.done && !s.today) out.push({ projectId: p.id, step: s, projectName: p.name });
      }
    }
    return out;
  }, [activeProjects]);
  const allOpenTasks = useMemo(() => (tasks.filter(t => !t.deletedAt && !t.done && !t.today)), [tasks]);
  const planCandidates = useMemo<PlanCandidate[]>(() => {
    type RankItem = { rank: Step; cand: PlanCandidate };
    const stepItems: RankItem[] = allOpenSteps.map(({projectId, step, projectName}) => ({
      rank: step as Step,
      cand: {
        key: 'step|' + projectId + '|' + step.id,
        kind: 'step', id: step.id, projectId,
        title: step.title, subtitle: projectName, checked: !!planSel.get('step|' + projectId + '|' + step.id),
      },
    }));
    const taskItems: RankItem[] = allOpenTasks.map(t => ({
      rank: (t as unknown as Step),
      cand: {
        key: 'task|' + t.id,
        kind: 'task', id: t.id,
        title: t.title, checked: !!planSel.get('task|' + t.id),
      },
    }));
    const combined = [...stepItems, ...taskItems];
    const sorted = sortSteps(combined.map(x => x.rank), 'smart');
    const order = new Map(sorted.map((s, i) => [s.id, i] as const));
    combined.sort((a, b) => (order.get(a.rank.id) ?? 9999) - (order.get(b.rank.id) ?? 9999));
    return combined.map(x => x.cand).slice(0, 12);
  }, [allOpenSteps, allOpenTasks, planSel]);

  function addProject() {
    const name = (window.prompt('New project name?') || '').trim();
    if (!name) return;
    setProjects(ps => [...ps, { id: uid(), name, steps: [], createdAt: nowIso() } as any]);
  }
  function renameProject(projectId: ID) {
    const p = projects.find(x => x.id === projectId);
    const next = window.prompt(`Rename project "${p?.name ?? ''}" to:`, p?.name || '') || '';
    const name = next.trim();
    if (!name) return;
    setProjects(ps => ps.map(x => x.id === projectId ? { ...x, name } : x));
  }
  function softDeleteProject(projectId: ID) {
    setProjects(ps => ps.map(x => x.id === projectId ? { ...x, deletedAt: nowIso() } : x));
  }
  function restoreProject(projectId: ID) {
    setProjects(ps => ps.map(x => x.id === projectId ? ({ ...x, deletedAt: undefined }) : x));
  }
  function purgeProject(projectId: ID) {
    setProjects(ps => ps.filter(x => x.id !== projectId));
  }

  function addProjectStep(projectId: ID) {
    const title = (window.prompt('New step title?') || '').trim();
    if (!title) return;
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: [
        ...p.steps,
        {
          id: uid(),
          title,
          notes: undefined,
          done: false,
          today: !!appSettings.defaults?.step?.todayDefault,
          status: appSettings.defaults?.step?.status,
          priority: appSettings.defaults?.step?.priority,
          difficulty: appSettings.defaults?.step?.difficulty,
          dueDate: undefined,
          estimatedMinutes: undefined,
          deletedAt: undefined,
          createdAt: nowIso(),
        },
      ],
    } : p));
  }

  // Tasks (global) CRUD and helpers
  function addTask() {
    const title = (window.prompt('New task title?') || '').trim();
    if (!title) return;
    const d = appSettings.defaults?.task || {};
    setTasks(ts => [...ts, {
      id: uid(),
      title,
      notes: undefined,
      done: false,
      today: !!d.todayDefault,
      status: d.status,
      priority: d.priority,
      difficulty: d.difficulty,
      dueDate: undefined,
      estimatedMinutes: undefined,
      deletedAt: undefined,
      createdAt: nowIso(),
      kind: 'task',
    }]);
  }
  function updateTaskMeta(taskId: ID, meta: Partial<EditItem>) {
    setTasks(ts => ts.map(t => t.id === taskId ? {
      ...t,
      title: meta.title ?? t.title,
      today: meta.today ?? t.today,
      status: meta.status ?? t.status,
      priority: meta.priority ?? t.priority,
      difficulty: meta.difficulty ?? t.difficulty,
      dueDate: meta.dueDate ?? t.dueDate,
      estimatedMinutes: meta.estimatedMinutes ?? t.estimatedMinutes,
      notes: meta.notes ?? t.notes,
    } : t));
  }
  function toggleTaskDone(taskId: ID) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
  }
  function toggleTaskToday(taskId: ID) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, today: !t.today } : t));
  }
  function softDeleteTask(taskId: ID) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, deletedAt: nowIso() } : t));
  }
  function restoreTask(taskId: ID) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, deletedAt: undefined } : t));
  }
  function purgeTask(taskId: ID) {
    setTasks(ts => ts.filter(t => t.id !== taskId));
  }

  function updateStepMeta(projectId: ID, stepId: ID, meta: Partial<EditItem>) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.map(s => s.id === stepId ? {
        ...s,
        title: meta.title ?? s.title,
        today: meta.today ?? s.today,
        status: meta.status ?? s.status,
        priority: meta.priority ?? s.priority,
        difficulty: meta.difficulty ?? s.difficulty,
        dueDate: meta.dueDate ?? s.dueDate,
        estimatedMinutes: meta.estimatedMinutes ?? s.estimatedMinutes,
        notes: meta.notes ?? s.notes,
      } : s),
    } : p));
  }
  function toggleStepDone(projectId: ID, stepId: ID) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s),
    } : p));
  }
  function toggleStepToday(projectId: ID, stepId: ID) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.map(s => s.id === stepId ? { ...s, today: !s.today } : s),
    } : p));
  }
  function softDeleteStep(projectId: ID, stepId: ID) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.map(s => s.id === stepId ? { ...s, deletedAt: nowIso() } : s),
    } : p));
  }
  function restoreStep(projectId: ID, stepId: ID) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.map(s => s.id === stepId ? { ...s, deletedAt: undefined } : s),
    } : p));
  }
  function purgeStep(projectId: ID, stepId: ID) {
    setProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      steps: p.steps.filter(s => s.id !== stepId),
    } : p));
  }

  const stepsByProjectForTab = useMemo(() => {
    const map = new Map<ID, Step[]>();
    for (const p of sortedProjects) {
      const filtered = filterStepsForTab(p.steps, tab);
      const sorted = sortSteps(filtered, sortMode);
      map.set(p.id, sorted);
    }
    return map;
  }, [sortedProjects, tab, sortMode]);

  // ------------------ Import/Export ------------------
  function downloadFile(name: string, mime: string, text: string) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(()=>{ try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){} }, 0);
    } catch (e) { console.error(e); }
  }

  function exportJson() {
    const payload = {
      version: (window as any).__APP_VERSION || 'vNext',
      exportedAt: new Date().toISOString(),
      projects,
      tasks,
      settings: appSettings,
    };
    downloadFile(`projectcalm-export-${new Date().toISOString().slice(0,10)}.json`, 'application/json', JSON.stringify(payload, null, 2));
  }
  function buildExportPayload() {
    return {
      version: (window as any).__APP_VERSION || 'vNext',
      exportedAt: new Date().toISOString(),
      projects,
      tasks,
      settings: appSettings,
    };
  }
  function doImportFromJsonText(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || (typeof parsed !== 'object')) throw new Error('Invalid JSON');
      const nextProjects = Array.isArray(parsed.projects) ? parsed.projects as Project[] : [];
      const nextTasks = Array.isArray(parsed.tasks) ? parsed.tasks as Task[] : [];
      const nextSettings = parsed.settings as AppSettings | undefined;
      if (!confirm(`Import will replace current Projects (${projects.length}) and Tasks (${tasks.length}). Continue?`)) return;
      setProjects(nextProjects);
      setTasks(nextTasks);
      if (nextSettings) setAppSettings(nextSettings);
    } catch (e) {
      alert('Failed to import JSON. ' + (e as Error).message);
    }
  }
  function importJsonPaste() {
    const text = window.prompt('Paste exported JSON here:');
    if (!text) return;
    doImportFromJsonText(text);
  }

  
  // -------- Plan (Today suggestions) --------
  function togglePlanKey(key: string) {
    setPlanSel(prev => {
      const m = new Map(prev);
      m.set(key, !m.get(key));
      return m;
    });
  }
  function applyPlan() {
    const selected = Array.from(planSel.entries()).filter(([,v])=>v).map(([k])=>k);
    if (selected.length === 0) { setShowPlan(false); return; }
    // Apply to steps
    const stepKeys = selected.filter(k => k.startsWith('step|'));
    if (stepKeys.length) {
      setProjects(ps => ps.map(p => {
        const nextSteps = p.steps.map(s => stepKeys.some(k => k === `step|${p.id}|${s.id}`) ? ({ ...s, today: true }) : s);
        return { ...p, steps: nextSteps };
      }));
    }
    // Apply to tasks
    const taskIds = selected.filter(k => k.startsWith('task|')).map(k => k.split('|')[1]);
    if (taskIds.length) {
      setTasks(ts => ts.map(t => taskIds.includes(t.id) ? ({ ...t, today: true }) : t));
    }
    setShowPlan(false);
    setPlanSel(new Map());
  }
  function exportCsv() {
    const headers = [
      'type','projectId','projectName','id','title','notes','done','today','status','priority','difficulty','dueDate','estimatedMinutes','deletedAt','createdAt'
    ];
    const rows: Array<Record<string, any>> = [];
    for (const p of projects) {
      for (const s of p.steps) {
        rows.push({
          type: 'step', projectId: p.id, projectName: p.name, id: s.id, title: s.title, notes: s.notes ?? '', done: s.done ? 1 : 0,
          today: s.today ? 1 : 0, status: s.status ?? '', priority: s.priority ?? '', difficulty: s.difficulty ?? '',
          dueDate: s.dueDate ?? '', estimatedMinutes: s.estimatedMinutes ?? '', deletedAt: s.deletedAt ?? '', createdAt: s.createdAt ?? ''
        });
      }
    }
    for (const t of tasks) {
      rows.push({
        type: 'task', projectId: '', projectName: '', id: t.id, title: t.title, notes: t.notes ?? '', done: t.done ? 1 : 0,
        today: t.today ? 1 : 0, status: t.status ?? '', priority: t.priority ?? '', difficulty: t.difficulty ?? '',
        dueDate: t.dueDate ?? '', estimatedMinutes: t.estimatedMinutes ?? '', deletedAt: t.deletedAt ?? '', createdAt: t.createdAt ?? ''
      });
    }
    const csv = toCSV(headers, rows);
    downloadFile(`projectcalm-export-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv', csv);
  }
  function coerceBool(v: string | undefined): boolean { return v === '1' || /^true$/i.test(String(v||'').trim()); }
  function coerceNum(v: string | undefined): number | undefined {
    if (v == null || v === '') return undefined; const n = Number(v); return Number.isNaN(n) ? undefined : n;
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
          projMap.set(key, p); outProjects.push(p);
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
            status: ((): any => { const s = get(r, 'status'); return s || undefined; })(),
            priority: coerceNum(get(r, 'priority')) as any,
            difficulty: coerceNum(get(r, 'difficulty')) as any,
            dueDate: ((): string | undefined => { const d = get(r, 'dueDate'); return d || undefined; })(),
            estimatedMinutes: coerceNum(get(r, 'estimatedMinutes')),
            deletedAt: ((): string | undefined => { const d = get(r, 'deletedAt'); return d || undefined; })(),
            createdAt: ((): string => { const d = get(r, 'createdAt'); return d || nowIso(); })(),
          });
        } else if (type === 'task') {
          outTasks.push({
            id: get(r, 'id') || uid(),
            title: get(r, 'title'),
            notes: get(r, 'notes') || undefined,
            done: coerceBool(get(r, 'done')),
            today: coerceBool(get(r, 'today')),
            status: ((): any => { const s = get(r, 'status'); return s || undefined; })(),
            priority: coerceNum(get(r, 'priority')) as any,
            difficulty: coerceNum(get(r, 'difficulty')) as any,
            dueDate: ((): string | undefined => { const d = get(r, 'dueDate'); return d || undefined; })(),
            estimatedMinutes: coerceNum(get(r, 'estimatedMinutes')),
            deletedAt: ((): string | undefined => { const d = get(r, 'deletedAt'); return d || undefined; })(),
            createdAt: ((): string => { const d = get(r, 'createdAt'); return d || nowIso(); })(),
            kind: 'task',
          });
        }
      }
      if (!confirm(`Import will replace current Projects (${projects.length}) and Tasks (${tasks.length}). Continue?`)) return;
      setProjects(outProjects);
      setTasks(outTasks);
    } catch (e) {
      alert('Failed to import CSV. ' + (e as Error).message);
    }
  }
  function importCsvPaste() {
    const text = window.prompt('Paste CSV here:');
    if (!text) return;
    doImportFromCsvText(text);
  }

  // --------------- Gist Sync ---------------
  async function onSyncPush(cfg: { gistToken: string; gistId?: string; public?: boolean }) {
    const token = (cfg.gistToken || '').trim();
    if (!token) throw new Error('Gist token is required');
    const payload = buildExportPayload();
    const res = await pushToGist(payload, { token, gistId: cfg.gistId, public: cfg.public });
    saveSyncConfig({ gistToken: token, gistId: res.gistId, public: !!cfg.public });
    alert(`Pushed to Gist: ${res.url}`);
    return { gistId: res.gistId };
  }
  async function onSyncPull(cfg: { gistToken?: string; gistId: string }) {
    const data = await pullFromGist({ gistId: cfg.gistId, token: cfg.gistToken });
    if (!data || typeof data !== 'object') throw new Error('Invalid data in gist');
    if (!confirm('Import from Gist will replace current Projects and Tasks. Continue?')) return;
    const nextProjects = Array.isArray(data.projects) ? data.projects as Project[] : [];
    const nextTasks = Array.isArray(data.tasks) ? data.tasks as Task[] : [];
    const nextSettings = data.settings as AppSettings | undefined;
    setProjects(nextProjects);
    setTasks(nextTasks);
    if (nextSettings) setAppSettings(nextSettings);
    alert('Imported data from Gist.');
  }

  // --------------- Cloud Sync (Server) ---------------
  // Pull handler used by Settings buttons
  async function onCloudPull() {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) throw new Error('Cloud Sync not configured');
    setCloudBusy(true);
    try {
      const r = await cloudPull(cfg);
      if (!r) throw new Error('No response');
      if (r.data && typeof r.data === 'object') {
        if (!confirm('Import from Cloud will replace current Projects and Tasks. Continue?')) return;
        const nextProjects = Array.isArray(r.data.projects) ? r.data.projects as Project[] : [];
        const nextTasks = Array.isArray(r.data.tasks) ? r.data.tasks as Task[] : [];
        const nextSettings = r.data.settings as AppSettings | undefined;
        setProjects(nextProjects);
        setTasks(nextTasks);
        if (nextSettings) setAppSettings(nextSettings);
        setCloudCfg({ ...cfg, lastVersion: r.updatedAt || undefined });
        alert('Imported data from Cloud.');
      } else {
        alert('No cloud data found yet.');
      }
    } finally { setCloudBusy(false); }
  }
  // Push handler used by Settings buttons
  async function onCloudPush() {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) throw new Error('Cloud Sync not configured');
    setCloudBusy(true);
    try {
      const res = await cloudPush(cfg, buildExportPayload());
      if (res === 'conflict') {
        const r = await cloudPull(cfg);
        if (r && r.data && confirm('Cloud has different data. Overwrite cloud with local? Cancel to keep cloud.')) {
          const res2 = await cloudPush({ ...cfg, lastVersion: r.updatedAt || undefined }, buildExportPayload());
          if (res2 !== 'conflict') setCloudCfg({ ...cfg, lastVersion: res2.updatedAt });
        }
      } else {
        setCloudCfg({ ...cfg, lastVersion: res.updatedAt });
        alert('Pushed to Cloud.');
      }
    } finally { setCloudBusy(false); }
  }

  // --------------- Quick Sync Button ---------------
  // Cloud first (if configured), otherwise Gist (requires token)
  async function syncNow() {
    try {
      const cloud = loadCloudSyncConfig();
      if (cloud && cloud.enabled && cloud.serverUrl && cloud.syncKey) {
        await onCloudPush();
        return;
      }
      const gist = loadSyncConfig();
      if (gist && gist.gistToken) {
        await onSyncPush({ gistToken: gist.gistToken, gistId: gist.gistId, public: gist.public });
        return;
      }
      alert('Set up Cloud Sync or Gist in Settings to use Sync Now.');
    } catch (e) {
      alert(String((e as Error).message || e));
    }
  }

  // Background auto-sync: on mount try pull; on changes push (debounced)
  useEffect(() => {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) return;
    (async () => {
      try {
        const r = await cloudPull(cfg);
        if (r && r.data && typeof r.data === 'object') {
          // Simple strategy: if local is empty-ish, adopt cloud; else skip
          const localCount = projects.length + tasks.length;
          if (localCount === 0) {
            const nextProjects = Array.isArray(r.data.projects) ? r.data.projects as Project[] : [];
            const nextTasks = Array.isArray(r.data.tasks) ? r.data.tasks as Task[] : [];
            const nextSettings = r.data.settings as AppSettings | undefined;
            setProjects(nextProjects);
            setTasks(nextTasks);
            if (nextSettings) setAppSettings(nextSettings);
          }
          setCloudCfg({ ...cfg, lastVersion: r.updatedAt || undefined });
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cfg = loadCloudSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl || !cfg.syncKey) return;
    const tm = setTimeout(async () => {
      try {
        const res = await cloudPush(cfg, buildExportPayload());
        if (res !== 'conflict') setCloudCfg({ ...cfg, lastVersion: res.updatedAt });
      } catch {}
    }, 1200);
    return () => clearTimeout(tm);
  }, [projects, tasks, appSettings]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center sticky top-0 z-10 bg-slate-950/80 backdrop-blur px-2 py-2 border-b border-slate-800/60">
        {/* Left: title */}
        <div className="flex items-center gap-2">
          <div className={classNames('text-lg font-semibold', strongText)}>Project Calm</div>
          <div className={classNames('text-xs', subtleText)} title="Version">{(window as any).__APP_VERSION || 'vNext'}</div>
        </div>
        {/* Center: view buttons */}
        <div className="flex flex-1 items-center justify-center overflow-x-auto">
          <div className="flex items-center gap-1">
            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', view==='projects' ? btnSelected : 'border-slate-700 hover:bg-slate-800/30 text-slate-300')} onClick={()=>setView('projects')}>Projects</button>
            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', view==='everything' ? btnSelected : 'border-slate-700 hover:bg-slate-800/30 text-slate-300')} onClick={()=>setView('everything')}>Everything</button>
            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', view==='steps' ? btnSelected : 'border-slate-700 hover:bg-slate-800/30 text-slate-300')} onClick={()=>setView('steps')}>Steps</button>
            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', view==='tasks' ? btnSelected : 'border-slate-700 hover:bg-slate-800/30 text-slate-300')} onClick={()=>setView('tasks')}>Tasks</button>
          </div>
        </div>
        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <select className={classNames('sm:hidden text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-200')}
            value={view}
            onChange={(e)=>setView((e.target as HTMLSelectElement).value as View)}
            title="Change view">
            <option value="projects">Projects</option>
            <option value="everything">Everything</option>
            <option value="steps">Steps</option>
            <option value="tasks">Tasks</option>
          </select>
          <button className={classNames(btnBase, btnNeutral, 'hidden sm:inline-flex')} onClick={() => setShowPlan(true)}>Plan</button>
          <button className={classNames(btnBase, btnNeutral, 'hidden sm:inline-flex')} onClick={() => setShowBreathe(true)}>Breathe</button>
          <button className={classNames(btnBase, btnNeutral)} onClick={() => setShowSettings(true)}>Settings</button>
          {view === 'focus' ? (
            (() => {
              const t = focusTarget;
              if (!t) return <div className={classNames('text-sm', subtleText)}>No focus target.</div>;
              const task = tasks.find(x => x.id === t.id);
              if (!task) return <div className={classNames('text-sm', subtleText)}>Not found.</div>;
              return (
                <FocusPane
                  title={task.title}
                  onDone={() => toggleTaskDone(task.id)}
                  onBack={() => setView('projects')}
                />
              );
            })()
          ) : view === 'projects' ? (
            <button className={classNames(btnBase, btnPositive)} onClick={addProject}>Add Project</button>
          ) : view === 'tasks' ? (
            <button className={classNames(btnBase, btnPositive)} onClick={addTask}>Add Task</button>
          ) : null}
        </div>
      </div>

      

      <div className={classNames(cardBase, cardTone)}>
        <div className="p-3 flex items-center justify-between border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            {(['all','today','plan','done','trash'] as Tab[]).map(t => (
              <button key={t} className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', t===tab ? btnSelected : 'border-slate-700 hover:bg-slate-800/30 text-slate-300')} onClick={() => setTab(t)}>
                {t === 'plan' ? 'To Do' : (t.charAt(0).toUpperCase()+t.slice(1))}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs">Sort</label>
            <select className={selectTone} value={sortMode} onChange={(e)=>setSortMode((e.target as HTMLSelectElement).value as SortMode)}>
              <option value="smart">Smart</option>
              <option value="due">Due</option>
              <option value="priority">Priority</option>
              <option value="created">Created</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {view === 'projects' ? (
            sortedProjects.length === 0 ? (
              <div className={classNames('text-sm', subtleText)}>No projects yet.</div>
            ) : (
              sortedProjects.map(p => (
                <ProjectSection
                  key={p.id}
                  project={p}
                  steps={stepsByProjectForTab.get(p.id) || []}
                  tab={tab}
                  ui={appSettings.ui}
                  onRename={renameProject}
                  onAddStep={addProjectStep}
                  onDeleteProject={softDeleteProject}
                  onRestoreProject={restoreProject}
                  onPurgeProject={purgeProject}
                  onToggleDone={toggleStepDone}
                  onToggleToday={toggleStepToday}
                  onEdit={(projectId, step) => setEditingStep({ projectId, step })}
                  onSoftDelete={softDeleteStep}
                  onRestore={restoreStep}
                  onPurge={purgeStep}
                />
              ))
            )
          ) : view === 'everything' ? (
            (() => {
              // Everything view
              const stepEntries = projects
                .filter(p => !p.deletedAt)
                .flatMap(p => filterStepsForTab(p.steps, tab).map(s => ({ kind: 'step' as const, item: s, projectId: p.id, projectName: p.name })));
              const taskEntries = filterStepsForTab(tasks as unknown as Step[], tab).map(t => ({ kind: 'task' as const, item: t as unknown as Step }));
              const entries = [...stepEntries, ...taskEntries];
              const wm = new WeakMap<Step, typeof entries[number]>();
              entries.forEach(e => wm.set(e.item, e));
              const sorted = sortSteps(entries.map(e => e.item), sortMode);
              if (sorted.length === 0) return (<div className={classNames('text-sm', subtleText)}>No items.</div>);
              return (
                <ul className="space-y-2">
                  {sorted.map((it) => {
                    const meta = wm.get(it)!;
                    if (meta.kind === 'step') {
                      const s = it as Step;
                      return (
                        <StepItem
                          key={s.id + '|step:everything'}
                          projectId={meta.projectId as ID}
                          step={s}
                          tab={tab}
                          ui={appSettings.ui}
                          titlePrefix={meta.projectName as any}
                          onToggleDone={toggleStepDone}
                          onToggleToday={toggleStepToday}
                          onEdit={(_pid: ID, step: Step) => setEditingStep({ projectId: meta.projectId as ID, step })}
                          onSoftDelete={softDeleteStep}
                          onRestore={restoreStep}
                          onPurge={purgeStep}
                        />
                      );
                    } else {
                      const t = it as unknown as Task;
                      const ui = appSettings.ui;
                      return (
                        <li key={t.id + '|task:everything'} className="flex items-start justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                          <div className="flex items-start gap-3">
                            <div>
                              <div className={classNames('text-sm', t.done ? 'line-through text-slate-500' : 'text-slate-200')} title={smartExplain(t as unknown as Step)}>{t.title}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                {!t.deletedAt && !t.done && t.today && (<span className={classNames('px-1 rounded', chipTone.ok)}>Today</span>)}
                                {ui.showStatus && t.status && !t.deletedAt && !t.done && (
                                  <span
                                    className={classNames(
                                      'px-1 rounded',
                                      t.status === 'waiting' ? chipTone.warn : (t.status === 'in_progress' ? chipTone.info : (t.status === 'todo' ? chipTone.purple : chipTone.neutral))
                                    )}
                                  >
                                    {statusLabel(t.status)}
                                  </span>
                                )}
                                {ui.showPriority && t.priority != null && (()=>{ const p = t.priority as number; const tone = p <= 1 ? chipTone.danger : p === 2 ? chipTone.warn : p === 3 ? chipTone.info : p === 4 ? chipTone.purple : chipTone.ok; return (<span className={classNames('px-1 rounded', tone)} title={`Priority ${p} (${priorityLabel(p)})`}>Priority: {priorityLabel(p)} ({p})</span>); })()}
                                {ui.showDifficulty && t.difficulty != null && (()=>{ const d = t.difficulty as number; const tone = d <= 1 ? chipTone.danger : d === 2 ? chipTone.warn : d === 3 ? chipTone.info : d === 4 ? chipTone.purple : chipTone.ok; return (<span className={classNames('px-1 rounded', tone)} title={`Difficulty ${d} (${difficultyLabel(d)})`}>Difficulty: {difficultyLabel(d)} ({d})</span>); })()}
                                {ui.showDueDate && t.dueDate && (() => {
                                  const d = daysUntilDue(t.dueDate);
                                  const tone = (d ?? 9999) < 0 ? chipTone.danger : (d != null && d <= 5 ? chipTone.warn : chipTone.ok);
                                  return (<span className={classNames('px-1 rounded', tone)}>Due In: {d}</span>);
                                })()}
                                {ui.showEta && typeof t.estimatedMinutes === 'number' && (<span className={classNames('px-1 rounded', chipTone.neutral)} title="Estimated Time to Completion">ETC {formatHours(t.estimatedMinutes)} hrs</span>)}
                                {t.done && (<span className={classNames('px-1 rounded', chipTone.ok)}>Done</span>)}
                                {t.notes && (<span className={classNames('px-1 rounded', chipTone.ok)}>Note</span>)}
                                {t.deletedAt && (<span className={classNames('px-1 rounded', chipTone.warn)}>Trash</span>)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {tab !== 'trash' ? (
                              <>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => toggleTaskDone(t.id)}>{t.done ? 'Undo' : 'Done'}</button>
                                {!t.done && (
                                  <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => toggleTaskToday(t.id)}>
                                    {t.today ? 'Untoday' : 'Today'}
                                  </button>
                                )}
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => setEditingTaskId(t.id)}>Edit</button>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => { setFocusTarget({ kind:'task', id: t.id }); setView('focus'); }}>Focus</button>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-rose-600 text-rose-300 hover:bg-rose-900/30')} onClick={() => softDeleteTask(t.id)}>Delete</button>
                              </>
                            ) : (
                              <>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => restoreTask(t.id)}>Restore</button>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-rose-600 text-rose-300 hover:bg-rose-900/30')} onClick={() => purgeTask(t.id)}>Purge</button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    }
                  })}
                </ul>
              );
            })()
          ) : view === 'steps' ? (
            (() => {
              const entries = projects
                .filter(p => !p.deletedAt)
                .flatMap(p => filterStepsForTab(p.steps, tab).map(s => ({ item: s, projectId: p.id, projectName: p.name })));
              if (entries.length === 0) return (<div className={classNames('text-sm', subtleText)}>No items.</div>);
              const wm = new WeakMap<Step, { projectId: ID; projectName: string }>();
              entries.forEach(e => wm.set(e.item, { projectId: e.projectId, projectName: e.projectName }));
              const sorted = sortSteps(entries.map(e => e.item), sortMode);
              return (
                <ul className="space-y-2">
                  {sorted.map(s => {
                    const meta = wm.get(s)!;
                    return (
                      <StepItem
                        key={s.id + '|step:steps'}
                        projectId={meta.projectId}
                        step={s}
                        tab={tab}
                        ui={appSettings.ui}
                        titlePrefix={meta.projectName}
                        onToggleDone={toggleStepDone}
                        onToggleToday={toggleStepToday}
                        onEdit={(pid: ID, step: Step) => setEditingStep({ projectId: meta.projectId, step })}
                        onSoftDelete={softDeleteStep}
                        onRestore={restoreStep}
                        onPurge={purgeStep}
                      />
                    );
                  })}
                </ul>
              );
            })()
          ) : (
            // tasks view
            (() => {
              const filtered = filterStepsForTab(tasks as unknown as Step[], tab) as unknown as Task[];
              if (filtered.length === 0) return (<div className={classNames('text-sm', subtleText)}>No items.</div>);
              const sorted = sortSteps(filtered as unknown as Step[], sortMode) as unknown as Task[];
              return (
                <ul className="space-y-2">
                  {sorted.map((t) => (
                    <li key={t.id + '|task:tasks'} className="flex items-start justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                      <div className="flex items-start gap-3">
                        <div>
                          <div className={classNames('text-sm', t.done ? 'line-through text-slate-500' : 'text-slate-200')} title={smartExplain(t as unknown as Step)}>{t.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {!t.deletedAt && !t.done && t.today && (<span className={classNames('px-1 rounded', chipTone.ok)}>Today</span>)}
                            {appSettings.ui.showStatus && t.status && !t.deletedAt && !t.done && (
                              <span
                                className={classNames(
                                  'px-1 rounded',
                                  t.status === 'waiting' ? chipTone.warn : (t.status === 'in_progress' ? chipTone.info : (t.status === 'todo' ? chipTone.purple : chipTone.neutral))
                                )}
                              >
                                {statusLabel(t.status)}
                              </span>
                            )}
                            {appSettings.ui.showPriority && t.priority != null && (()=>{ const p = t.priority as number; const tone = p <= 1 ? chipTone.danger : p === 2 ? chipTone.warn : p === 3 ? chipTone.info : p === 4 ? chipTone.purple : chipTone.ok; return (<span className={classNames('px-1 rounded', tone)} title={`Priority ${p} (${priorityLabel(p)})`}>Priority: {priorityLabel(p)} ({p})</span>); })()}
                            {appSettings.ui.showDifficulty && t.difficulty != null && (()=>{ const d = t.difficulty as number; const tone = d <= 1 ? chipTone.danger : d === 2 ? chipTone.warn : d === 3 ? chipTone.info : d === 4 ? chipTone.purple : chipTone.ok; return (<span className={classNames('px-1 rounded', tone)} title={`Difficulty ${d} (${difficultyLabel(d)})`}>Difficulty: {difficultyLabel(d)} ({d})</span>); })()}
                            {appSettings.ui.showDueDate && t.dueDate && (() => {
                              const d = daysUntilDue(t.dueDate);
                              const tone = (d ?? 9999) < 0 ? chipTone.danger : (d != null && d <= 5 ? chipTone.warn : chipTone.ok);
                              return (<span className={classNames('px-1 rounded', tone)}>Due In: {d}</span>);
                            })()}
                            {appSettings.ui.showEta && typeof t.estimatedMinutes === 'number' && (<span className={classNames('px-1 rounded', chipTone.neutral)} title="Estimated Time to Completion">ETC {formatHours(t.estimatedMinutes)} hrs</span>)}
                            {t.done && (<span className={classNames('px-1 rounded', chipTone.ok)}>Done</span>)}
                            {t.notes && (<span className={classNames('px-1 rounded', chipTone.ok)}>Note</span>)}
                            {t.deletedAt && (<span className={classNames('px-1 rounded', chipTone.warn)}>Trash</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {tab !== 'trash' ? (
                          <>
                            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => toggleTaskDone(t.id)}>{t.done ? 'Undo' : 'Done'}</button>
                            {!t.done && (
                              <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => toggleTaskToday(t.id)}>
                                {t.today ? 'Untoday' : 'Today'}
                              </button>
                            )}
                            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => setEditingTaskId(t.id)}>Edit</button>
                                <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => { setFocusTarget({ kind:'task', id: t.id }); setView('focus'); }}>Focus</button>
                            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-rose-600 text-rose-300 hover:bg-rose-900/30')} onClick={() => softDeleteTask(t.id)}>Delete</button>
                          </>
                        ) : (
                          <>
                            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => restoreTask(t.id)}>Restore</button>
                            <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-rose-600 text-rose-300 hover:bg-rose-900/30')} onClick={() => purgeTask(t.id)}>Purge</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowSettings(false)} />
          <div className={classNames('relative w-full max-w-2xl mx-4 p-4', 'rounded-xl border border-slate-700/50 bg-slate-800/40')}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Settings</div>
              <button
                className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')}
                onClick={() => {
                  try {
                    const btn = document.getElementById('settings-save-button') as HTMLButtonElement | null;
                    if (btn) btn.click();
                  } catch (_) {}
                  setShowSettings(false);
                }}
              >
                Close
              </button>
            </div>
          <AppSettingsEditor
              value={appSettings}
              currentTheme={theme}
              onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              onChange={(s)=>setAppSettings(s)}
              onExport={exportJson}
              onImport={importJsonPaste}
              onImportJsonText={doImportFromJsonText}
              onExportCsv={exportCsv}
              onImportCsv={importCsvPaste}
              onImportCsvText={doImportFromCsvText}
              onImportFromPrevious={async () => {
                try {
                  const api = (window as any).calmNative;
                  if (!api || !api.migrateProfile) {
                    alert('Import requires the desktop app. Please use the packaged EXE.');
                    return;
                  }
                  const res = await api.migrateProfile();
                  if (res && res.ok) {
                    if (confirm('Imported data from previous profile. Reload app now to apply?')) {
                      location.reload();
                    }
                  } else {
                    alert('Import failed. ' + (res && res.error ? res.error : '')); 
                  }
                } catch (e) {
                  alert('Import failed. ' + (e as Error).message);
                }
              }}
              onSyncPush={onSyncPush}
              onSyncPull={onSyncPull}
              onCloudPush={onCloudPush}
              onCloudPull={onCloudPull}
            />
          </div>
        </div>
      )}


      {showPlan && (
        <PlanModal
          items={planCandidates}
          onToggle={togglePlanKey}
          onApply={applyPlan}
          onClose={() => { setShowPlan(false); setPlanSel(new Map()); }}
        />
      )}
      {showBreathe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowBreathe(false)} />
          <div className={classNames('relative w-full max-w-sm mx-4 p-4', 'rounded-xl border border-slate-700/50 bg-slate-800/40')}>
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Box Breathing</div>
              <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => setShowBreathe(false)}>Close</button>
            </div>
            <BreatheGuide key={`${appSettings.breathe.inhale}-${appSettings.breathe.hold1}-${appSettings.breathe.exhale}-${appSettings.breathe.hold2}`} config={appSettings.breathe} />
            <div className="mt-4 flex justify-between">
              <button
                className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')}
                onClick={() => { setShowSettings(true); }}
                title="Adjust inhale/hold/exhale times"
              >
                Settings
              </button>
              <button className={classNames('sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border', 'border-slate-600')} onClick={() => setShowBreathe(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {editingStep && (() => {
        const { projectId, step: s } = editingStep;
        return (
          <EditItemModal
            title="Edit Step"
            value={{
              title: s.title,
              today: s.today,
              status: s.status,
              priority: s.priority,
              difficulty: s.difficulty,
              dueDate: s.dueDate,
              estimatedMinutes: s.estimatedMinutes,
              notes: s.notes,
            }}
            onSave={(v) => { updateStepMeta(projectId, s.id, v); setEditingStep(null); }}
            onClose={() => setEditingStep(null)}
          />
        );
      })()}

      {editingTaskId && (() => {
        const t = tasks.find(x => x.id === editingTaskId);
        if (!t) return null;
        return (
          <EditItemModal
            title="Edit Task"
            value={{
              title: t.title,
              today: t.today,
              status: t.status,
              priority: t.priority,
              difficulty: t.difficulty,
              dueDate: t.dueDate,
              estimatedMinutes: t.estimatedMinutes,
              notes: t.notes,
            }}
            onSave={(v) => { updateTaskMeta(t.id, v); setEditingTaskId(null); }}
            onClose={() => setEditingTaskId(null)}
          />
        );
      })()}
    </div>
  );
}

// Expose to window for index.html mount script
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ProjectCalmApp = ProjectCalmApp;




