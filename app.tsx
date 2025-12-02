/* @jsxRuntime classic */
/* @jsx React.createElement */
// Using global React in a standalone UMD build.
// Defines window.ProjectCalmApp so index.html can mount it.

// Grab hooks from global React injected by index.html
const { useEffect, useMemo, useState } = React as typeof React;

import type { ID, Project, SortMode, Step, Tab } from './lib/types';
import { useTheme } from './hooks/useTheme';
import { setStorageErrorCallback, getStorageQuota } from './lib/storage';
import { useProjectsState } from './hooks/useProjectsState';
import { useTasksState } from './hooks/useTasksState';
import { useViewState } from './hooks/useViewState';
import { useAppSettings } from './hooks/useAppSettings';
import { useImportExport } from './hooks/useImportExport';
import { useAuth } from './hooks/useAuth';
import { AppSettingsEditor } from './components/AppSettingsEditor';
import { BreatheGuide } from './components/BreatheGuide';
import { EditItemModal } from './components/EditItemModal';
import { PlanModal, type PlanCandidate } from './components/PlanModal';
import { FocusPane } from './components/FocusPane';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/Button';
import { SearchBox } from './components/SearchBox';
import { ProjectsView } from './components/views/ProjectsView';
import { EverythingView } from './components/views/EverythingView';
import { StepsView } from './components/views/StepsView';
import { TasksView } from './components/views/TasksView';
import { btnBase, btnNeutral, btnPositive, btnSelected, cardBase, cardTone, selectTone, strongText, subtleText } from './lib/styles';
import { filterStepsForTab, sortProjects, sortSteps, classNames } from './lib/utils';

type View = 'projects' | 'everything' | 'steps' | 'tasks' | 'focus';

export function ProjectCalmApp() {
  // Auth state
  const { user, loading: authLoading, signInWithGoogle, logout } = useAuth();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Storage error handling
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageQuota, setStorageQuota] = useState<{ used: number; available: number; percentage: number } | null>(null);

  // Set up storage error callback
  useEffect(() => {
    setStorageErrorCallback((error) => {
      setStorageError(error.message);
    });

    // Check storage quota on mount
    getStorageQuota().then((quota) => {
      setStorageQuota(quota);
      if (quota && quota.percentage > 90) {
        setStorageError(`Storage is ${quota.percentage.toFixed(0)}% full. Please export and clear old data.`);
      }
    });
  }, []);

  // Theme
  const [theme, setTheme] = useTheme();

  // Settings
  const { appSettings, setAppSettings, loading: settingsLoading } = useAppSettings(user?.uid);

  // Projects state
  const projectsHook = useProjectsState(appSettings.defaults, user?.uid);
  const { projects, setProjects, activeProjects, loading: projectsLoading } = projectsHook;

  // Tasks state
  const tasksHook = useTasksState(appSettings.defaults, user?.uid);
  const { tasks, setTasks, allOpenTasks, loading: tasksLoading } = tasksHook;

  const isLoading = authLoading || settingsLoading || projectsLoading || tasksLoading;


  // View state
  const viewState = useViewState();
  const {
    view,
    setView,
    tab,
    setTab,
    sortMode,
    setSortMode,
    showSettings,
    setShowSettings,
    showBreathe,
    setShowBreathe,
    showPlan,
    setShowPlan,
    editingStep,
    setEditingStep,
    editingTaskId,
    setEditingTaskId,
    focusTarget,
    setFocusTarget,
    planSel,
    togglePlanKey,
    clearPlanSelection,
  } = viewState;

  // Import/Export
  const importExportHook = useImportExport({
    projects,
    tasks,
    appSettings,
    setProjects,
    setTasks,
    setAppSettings,
  });


  // Computed values
  const sortedProjects = useMemo(
    () => sortProjects(activeProjects, sortMode, tab),
    [activeProjects, sortMode, tab]
  );

  // Search filtering
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return sortedProjects;

    const query = searchQuery.toLowerCase();
    return sortedProjects.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.steps.some(s =>
        s.title.toLowerCase().includes(query) ||
        (s.notes && s.notes.toLowerCase().includes(query))
      )
    );
  }, [sortedProjects, searchQuery]);

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;

    const query = searchQuery.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.notes && t.notes.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);

  const allOpenSteps = useMemo(() => {
    const out: Array<{ projectId: ID; step: Step; projectName: string }> = [];
    for (const p of activeProjects) {
      for (const s of p.steps) {
        if (!s.deletedAt && !s.done && !s.today)
          out.push({ projectId: p.id, step: s, projectName: p.name });
      }
    }
    return out;
  }, [activeProjects]);

  const planCandidates = useMemo<PlanCandidate[]>(() => {
    type RankItem = { rank: Step; cand: PlanCandidate };
    const stepItems: RankItem[] = allOpenSteps.map(({ projectId, step, projectName }) => ({
      rank: step as Step,
      cand: {
        key: 'step|' + projectId + '|' + step.id,
        kind: 'step',
        id: step.id,
        projectId,
        title: step.title,
        subtitle: projectName,
        checked: !!planSel.get('step|' + projectId + '|' + step.id),
      },
    }));
    const taskItems: RankItem[] = allOpenTasks.map((t) => ({
      rank: t as unknown as Step,
      cand: {
        key: 'task|' + t.id,
        kind: 'task',
        id: t.id,
        title: t.title,
        checked: !!planSel.get('task|' + t.id),
      },
    }));
    const combined = [...stepItems, ...taskItems];
    const sorted = sortSteps(
      combined.map((x) => x.rank),
      'smart'
    );
    const order = new Map(sorted.map((s, i) => [s.id, i] as const));
    combined.sort((a, b) => (order.get(a.rank.id) ?? 9999) - (order.get(b.rank.id) ?? 9999));
    return combined.map((x) => x.cand).slice(0, 12);
  }, [allOpenSteps, allOpenTasks, planSel]);

  const stepsByProjectForTab = useMemo(() => {
    const map = new Map<ID, Step[]>();
    for (const p of sortedProjects) {
      const filtered = filterStepsForTab(p.steps, tab);
      const sorted = sortSteps(filtered, sortMode);
      map.set(p.id, sorted);
    }
    return map;
  }, [sortedProjects, tab, sortMode]);

  // Apply plan
  function applyPlan() {
    const selected = Array.from(planSel.entries())
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (selected.length === 0) {
      setShowPlan(false);
      return;
    }
    // Apply to steps
    const stepKeys = selected.filter((k) => k.startsWith('step|'));
    if (stepKeys.length) {
      projectsHook.bulkUpdateStepsToday(stepKeys);
    }
    // Apply to tasks
    const taskIds = selected
      .filter((k) => k.startsWith('task|'))
      .map((k) => k.split('|')[1]);
    if (taskIds.length) {
      tasksHook.bulkUpdateTasksToday(taskIds);
    }
    setShowPlan(false);
    clearPlanSelection();
  }

  // Show loading state while auth is initializing or initial data sync is happening
  if (authLoading || (user && (projectsLoading || tasksLoading || settingsLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <div>Loading Project Calm...</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Storage Error Banner */}
        {storageError && (
          <div className="sticky top-0 z-50 bg-rose-900/90 border-l-4 border-rose-500 text-rose-100 px-4 py-3 rounded backdrop-blur">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">Storage Error</p>
                <p className="text-sm mt-1">{storageError}</p>
                {storageQuota && (
                  <p className="text-xs mt-1 opacity-90">
                    Using {(storageQuota.used / 1024 / 1024).toFixed(1)} MB of {(storageQuota.available / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
              <button
                onClick={() => setStorageError(null)}
                className="text-rose-200 hover:text-rose-50 transition-colors"
                aria-label="Dismiss error"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800/60">
          <div className="flex items-center px-2 py-2">
            {/* Left: title */}
            <div className="flex items-center gap-2">
              <div className={classNames('text-lg font-semibold', strongText)}>
                Project Calm
              </div>
              <div className={classNames('text-xs', subtleText)} title="Version">
                {(window as any).__APP_VERSION || 'vNext'}
              </div>
            </div>

            {/* Center: view buttons */}
            <div className="flex flex-1 items-center justify-center overflow-x-auto">
              <div className="flex items-center gap-1">
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    view === 'projects'
                      ? btnSelected
                      : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
                  )}
                  onClick={() => setView('projects')}
                  aria-pressed={view === 'projects'}
                >
                  Projects
                </button>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    view === 'everything'
                      ? btnSelected
                      : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
                  )}
                  onClick={() => setView('everything')}
                  aria-pressed={view === 'everything'}
                >
                  Everything
                </button>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    view === 'steps'
                      ? btnSelected
                      : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
                  )}
                  onClick={() => setView('steps')}
                  aria-pressed={view === 'steps'}
                >
                  Steps
                </button>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    view === 'tasks'
                      ? btnSelected
                      : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
                  )}
                  onClick={() => setView('tasks')}
                  aria-pressed={view === 'tasks'}
                >
                  Tasks
                </button>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <select
                className={classNames(
                  'sm:hidden text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-200'
                )}
                value={view}
                onChange={(e) => setView((e.target as HTMLSelectElement).value as View)}
                title="Change view"
                aria-label="Change view"
              >
                <option value="projects">Projects</option>
                <option value="everything">Everything</option>
                <option value="steps">Steps</option>
                <option value="tasks">Tasks</option>
              </select>
              <button
                className={classNames(btnBase, btnNeutral, 'hidden sm:inline-flex')}
                onClick={() => setShowPlan(true)}
              >
                Plan
              </button>
              <button
                className={classNames(btnBase, btnNeutral, 'hidden sm:inline-flex')}
                onClick={() => setShowBreathe(true)}
              >
                Breathe
              </button>
              <button
                className={classNames(btnBase, btnNeutral)}
                onClick={() => {
                  if (!user || user.isAnonymous) {
                    signInWithGoogle();
                  } else {
                    if (confirm('Sign out?')) logout();
                  }
                }}
              >
                {!user || user.isAnonymous ? 'Sign In' : 'Sign Out'}
              </button>
              <button
                className={classNames(btnBase, btnNeutral)}
                onClick={() => setShowSettings(true)}
              >
                Settings
              </button>
            </div>

            {/* Search Box Row */}
            {view !== 'focus' && (
              <div className="px-2 pb-2">
                <SearchBox
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={`Search ${view}...`}
                  className="max-w-md"
                />
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div>
            {view === 'focus' ? (
              (() => {
                const t = focusTarget;
                if (!t) return <div className={classNames('text-sm', subtleText)}>No focus target.</div>;
                const task = tasks.find((x) => x.id === t.id);
                if (!task) return <div className={classNames('text-sm', subtleText)}>Not found.</div>;
                return (
                  <FocusPane
                    title={task.title}
                    onDone={() => tasksHook.toggleTaskDone(task.id)}
                    onBack={() => setView('projects')}
                  />
                );
              })()
            ) : view === 'projects' ? (
              <button
                className={classNames(btnBase, btnPositive)}
                onClick={() => projectsHook.addProject()}
              >
                Add Project
              </button>
            ) : view === 'tasks' ? (
              <button
                className={classNames(btnBase, btnPositive)}
                onClick={() => tasksHook.addTask()}
              >
                Add Task
              </button>
            ) : null}
          </div>
        </div>

        {/* Mobile: secondary nav row */}
        <div className="sm:hidden px-2 pt-2">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <button
              className={classNames(
                'text-base px-3 py-2 rounded border',
                view === 'projects'
                  ? btnSelected
                  : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
              )}
              onClick={() => setView('projects')}
            >
              Projects
            </button>
            <button
              className={classNames(
                'text-base px-3 py-2 rounded border',
                view === 'everything'
                  ? btnSelected
                  : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
              )}
              onClick={() => setView('everything')}
            >
              Everything
            </button>
            <button
              className={classNames(
                'text-base px-3 py-2 rounded border',
                view === 'steps'
                  ? btnSelected
                  : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
              )}
              onClick={() => setView('steps')}
            >
              Steps
            </button>
            <button
              className={classNames(
                'text-base px-3 py-2 rounded border',
                view === 'tasks'
                  ? btnSelected
                  : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
              )}
              onClick={() => setView('tasks')}
            >
              Tasks
            </button>
          </div>
        </div>

        {/* Main Content Card */}
        <div className={classNames(cardBase, cardTone)}>
          <div className="p-3 flex items-center justify-between border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              {(['all', 'today', 'plan', 'done', 'trash'] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    t === tab
                      ? btnSelected
                      : 'border-slate-700 hover:bg-slate-800/30 text-slate-300'
                  )}
                  onClick={() => setTab(t)}
                  aria-pressed={t === tab}
                >
                  {t === 'plan' ? 'To Do' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" htmlFor="sort-select">
                Sort
              </label>
              <select
                id="sort-select"
                className={selectTone}
                value={sortMode}
                onChange={(e) =>
                  setSortMode((e.target as HTMLSelectElement).value as SortMode)
                }
                aria-label="Sort mode"
              >
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
              <ProjectsView
                sortedProjects={filteredProjects}
                stepsByProjectForTab={stepsByProjectForTab}
                tab={tab}
                appSettings={appSettings}
                onRename={projectsHook.renameProject}
                onAddStep={projectsHook.addProjectStep}
                onDeleteProject={projectsHook.softDeleteProject}
                onRestoreProject={projectsHook.restoreProject}
                onPurgeProject={projectsHook.purgeProject}
                onToggleDone={projectsHook.toggleStepDone}
                onToggleToday={projectsHook.toggleStepToday}
                onEdit={(projectId, step) => setEditingStep({ projectId, step })}
                onSoftDelete={projectsHook.softDeleteStep}
                onRestore={projectsHook.restoreStep}
                onPurge={projectsHook.purgeStep}
              />
            ) : view === 'everything' ? (
              <EverythingView
                projects={filteredProjects}
                tasks={filteredTasks}
                tab={tab}
                sortMode={sortMode}
                appSettings={appSettings}
                onToggleStepDone={projectsHook.toggleStepDone}
                onToggleStepToday={projectsHook.toggleStepToday}
                onEditStep={(projectId, step) => setEditingStep({ projectId, step })}
                onSoftDeleteStep={projectsHook.softDeleteStep}
                onRestoreStep={projectsHook.restoreStep}
                onPurgeStep={projectsHook.purgeStep}
                onToggleTaskDone={tasksHook.toggleTaskDone}
                onToggleTaskToday={tasksHook.toggleTaskToday}
                onEditTask={(taskId) => setEditingTaskId(taskId)}
                onFocusTask={(taskId) => {
                  setFocusTarget({ kind: 'task', id: taskId });
                  setView('focus');
                }}
                onSoftDeleteTask={tasksHook.softDeleteTask}
                onRestoreTask={tasksHook.restoreTask}
                onPurgeTask={tasksHook.purgeTask}
              />
            ) : view === 'steps' ? (
              <StepsView
                projects={filteredProjects}
                tab={tab}
                sortMode={sortMode}
                appSettings={appSettings}
                onToggleDone={projectsHook.toggleStepDone}
                onToggleToday={projectsHook.toggleStepToday}
                onEdit={(projectId, step) => setEditingStep({ projectId, step })}
                onSoftDelete={projectsHook.softDeleteStep}
                onRestore={projectsHook.restoreStep}
                onPurge={projectsHook.purgeStep}
              />
            ) : (
              <TasksView
                tasks={filteredTasks}
                tab={tab}
                sortMode={sortMode}
                appSettings={appSettings}
                onToggleDone={tasksHook.toggleTaskDone}
                onToggleToday={tasksHook.toggleTaskToday}
                onEdit={(taskId) => setEditingTaskId(taskId)}
                onFocus={(taskId) => {
                  setFocusTarget({ kind: 'task', id: taskId });
                  setView('focus');
                }}
                onSoftDelete={tasksHook.softDeleteTask}
                onRestore={tasksHook.restoreTask}
                onPurge={tasksHook.purgeTask}
              />
            )}
          </div>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-60 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-slate-900/60"
              onClick={() => setShowSettings(false)}
            />
            <div
              className={classNames(
                'relative w-full max-w-2xl mx-4 p-4',
                'rounded-xl border border-slate-700/50 bg-slate-800/40'
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">Settings</div>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    'border-slate-600'
                  )}
                  onClick={() => {
                    try {
                      const btn = document.getElementById(
                        'settings-save-button'
                      ) as HTMLButtonElement | null;
                      if (btn) btn.click();
                    } catch (_) { }
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
                onChange={(s) => setAppSettings(s)}
                onExport={importExportHook.exportJson}
                onImport={importExportHook.importJsonPaste}
                onImportJsonText={importExportHook.doImportFromJsonText}
                onExportCsv={importExportHook.exportCsv}
                onImportCsv={importExportHook.importCsvPaste}
                onImportCsvText={importExportHook.doImportFromCsvText}
                onImportFromPrevious={async () => {
                  try {
                    const api = (window as any).calmNative;
                    if (!api || !api.migrateProfile) {
                      alert('Import requires the desktop app. Please use the packaged EXE.');
                      return;
                    }
                    const res = await api.migrateProfile();
                    if (res && res.ok) {
                      if (
                        confirm('Imported data from previous profile. Reload app now to apply?')
                      ) {
                        location.reload();
                      }
                    } else {
                      alert('Import failed. ' + (res && res.error ? res.error : ''));
                    }
                  } catch (e) {
                    alert('Import failed. ' + (e as Error).message);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Plan Modal */}
        {showPlan && (
          <PlanModal
            items={planCandidates}
            onToggle={togglePlanKey}
            onApply={applyPlan}
            onClose={() => {
              setShowPlan(false);
              clearPlanSelection();
            }}
          />
        )}

        {/* Breathe Modal */}
        {showBreathe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-slate-900/60"
              onClick={() => setShowBreathe(false)}
            />
            <div
              className={classNames(
                'relative w-full max-w-sm mx-4 p-4',
                'rounded-xl border border-slate-700/50 bg-slate-800/40'
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">Box Breathing</div>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    'border-slate-600'
                  )}
                  onClick={() => setShowBreathe(false)}
                >
                  Close
                </button>
              </div>
              <BreatheGuide
                key={`${appSettings.breathe.inhale}-${appSettings.breathe.hold1}-${appSettings.breathe.exhale}-${appSettings.breathe.hold2}`}
                config={appSettings.breathe}
              />
              <div className="mt-4 flex justify-between">
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    'border-slate-600'
                  )}
                  onClick={() => {
                    setShowSettings(true);
                  }}
                  title="Adjust inhale/hold/exhale times"
                >
                  Settings
                </button>
                <button
                  className={classNames(
                    'sm:text-xs sm:px-2 sm:py-1 text-sm px-3 py-2 rounded border',
                    'border-slate-600'
                  )}
                  onClick={() => setShowBreathe(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Step Modal */}
        {editingStep &&
          (() => {
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
                onSave={(v) => {
                  projectsHook.updateStepMeta(projectId, s.id, v);
                  setEditingStep(null);
                }}
                onClose={() => setEditingStep(null)}
              />
            );
          })()}

        {/* Edit Task Modal */}
        {editingTaskId &&
          (() => {
            const t = tasks.find((x) => x.id === editingTaskId);
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
                onSave={(v) => {
                  tasksHook.updateTaskMeta(t.id, v);
                  setEditingTaskId(null);
                }}
                onClose={() => setEditingTaskId(null)}
              />
            );
          })()}
      </div>
    </ErrorBoundary>
  );
}

// Expose to window for index.html mount script
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ProjectCalmApp = ProjectCalmApp;
