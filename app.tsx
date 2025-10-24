/* @jsxRuntime classic */
/* @jsx React.createElement */
// Using global React in a standalone UMD build.
// Defines window.ProjectCalmApp so index.html can mount it.

// Grab hooks from global React injected by index.html
const { useEffect, useMemo } = React as typeof React;

import type { ID, Project, SortMode, Step, Tab } from './lib/types';
import { useTheme } from './hooks/useTheme';
import { useProjectsState } from './hooks/useProjectsState';
import { useTasksState } from './hooks/useTasksState';
import { useViewState } from './hooks/useViewState';
import { useAppSettings } from './hooks/useAppSettings';
import { useSyncState } from './hooks/useSyncState';
import { useImportExport } from './hooks/useImportExport';
import { AppSettingsEditor } from './components/AppSettingsEditor';
import { BreatheGuide } from './components/BreatheGuide';
import { EditItemModal } from './components/EditItemModal';
import { PlanModal, type PlanCandidate } from './components/PlanModal';
import { FocusPane } from './components/FocusPane';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Button } from './components/Button';
import { ProjectsView } from './components/views/ProjectsView';
import { EverythingView } from './components/views/EverythingView';
import { StepsView } from './components/views/StepsView';
import { TasksView } from './components/views/TasksView';
import { btnBase, btnNeutral, btnPositive, btnSelected, cardBase, cardTone, selectTone, strongText, subtleText } from './lib/styles';
import { filterStepsForTab, sortProjects, sortSteps, classNames } from './lib/utils';

type View = 'projects' | 'everything' | 'steps' | 'tasks' | 'focus';

export function ProjectCalmApp() {
  // Theme
  const [theme, setTheme] = useTheme();

  // Settings
  const { appSettings, setAppSettings } = useAppSettings();

  // Projects state
  const projectsHook = useProjectsState(appSettings.defaults);
  const { projects, setProjects, activeProjects } = projectsHook;

  // Tasks state
  const tasksHook = useTasksState(appSettings.defaults);
  const { tasks, setTasks, allOpenTasks } = tasksHook;

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

  // Sync
  const syncHook = useSyncState(
    {
      setProjects,
      setTasks,
      setAppSettings,
      buildExportPayload: importExportHook.buildExportPayload,
    },
    projects,
    tasks
  );

  // Computed values
  const sortedProjects = useMemo(
    () => sortProjects(activeProjects, sortMode, tab),
    [activeProjects, sortMode, tab]
  );

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

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center sticky top-0 z-10 bg-slate-950/80 backdrop-blur px-2 py-2 border-b border-slate-800/60">
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
              onClick={() => setShowSettings(true)}
            >
              Settings
            </button>
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
                sortedProjects={sortedProjects}
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
                projects={projects}
                tasks={tasks}
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
                projects={projects}
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
                tasks={tasks}
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
                onSyncPush={syncHook.onSyncPush}
                onSyncPull={syncHook.onSyncPull}
                onCloudPush={syncHook.onCloudPush}
                onCloudPull={syncHook.onCloudPull}
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
