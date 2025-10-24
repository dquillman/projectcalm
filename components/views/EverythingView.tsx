/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Project, Step, Tab, Task, SortMode } from '../../lib/types';
import { StepItem } from '../StepItem';
import { TaskItem } from '../TaskItem';
import { classNames, filterStepsForTab, sortSteps } from '../../lib/utils';
import { subtleText } from '../../lib/styles';

interface EverythingViewProps {
  projects: Project[];
  tasks: Task[];
  tab: Tab;
  sortMode: SortMode;
  appSettings: any;
  onToggleStepDone: (projectId: ID, stepId: ID) => void;
  onToggleStepToday: (projectId: ID, stepId: ID) => void;
  onEditStep: (projectId: ID, step: Step) => void;
  onSoftDeleteStep: (projectId: ID, stepId: ID) => void;
  onRestoreStep: (projectId: ID, stepId: ID) => void;
  onPurgeStep: (projectId: ID, stepId: ID) => void;
  onToggleTaskDone: (taskId: ID) => void;
  onToggleTaskToday: (taskId: ID) => void;
  onEditTask: (taskId: ID) => void;
  onFocusTask: (taskId: ID) => void;
  onSoftDeleteTask: (taskId: ID) => void;
  onRestoreTask: (taskId: ID) => void;
  onPurgeTask: (taskId: ID) => void;
}

/**
 * Everything view component
 * Displays all steps and tasks combined and sorted
 */
export function EverythingView({
  projects,
  tasks,
  tab,
  sortMode,
  appSettings,
  onToggleStepDone,
  onToggleStepToday,
  onEditStep,
  onSoftDeleteStep,
  onRestoreStep,
  onPurgeStep,
  onToggleTaskDone,
  onToggleTaskToday,
  onEditTask,
  onFocusTask,
  onSoftDeleteTask,
  onRestoreTask,
  onPurgeTask,
}: EverythingViewProps) {
  const stepEntries = projects
    .filter((p) => !p.deletedAt)
    .flatMap((p) =>
      filterStepsForTab(p.steps, tab).map((s) => ({
        kind: 'step' as const,
        item: s,
        projectId: p.id,
        projectName: p.name,
      }))
    );

  const taskEntries = filterStepsForTab(tasks as unknown as Step[], tab).map((t) => ({
    kind: 'task' as const,
    item: t as unknown as Step,
  }));

  const entries = [...stepEntries, ...taskEntries];
  const wm = new WeakMap<Step, typeof entries[number]>();
  entries.forEach((e) => wm.set(e.item, e));

  const sorted = sortSteps(
    entries.map((e) => e.item),
    sortMode
  );

  if (sorted.length === 0) {
    return <div className={classNames('text-sm', subtleText)}>No items.</div>;
  }

  return (
    <ul className="space-y-2" role="list" aria-label="All steps and tasks">
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
              onToggleDone={onToggleStepDone}
              onToggleToday={onToggleStepToday}
              onEdit={(_pid: ID, step: Step) =>
                onEditStep(meta.projectId as ID, step)
              }
              onSoftDelete={onSoftDeleteStep}
              onRestore={onRestoreStep}
              onPurge={onPurgeStep}
            />
          );
        } else {
          const t = it as unknown as Task;
          return (
            <TaskItem
              key={t.id + '|task:everything'}
              task={t}
              tab={tab}
              ui={appSettings.ui}
              onToggleDone={onToggleTaskDone}
              onToggleToday={onToggleTaskToday}
              onEdit={onEditTask}
              onFocus={onFocusTask}
              onSoftDelete={onSoftDeleteTask}
              onRestore={onRestoreTask}
              onPurge={onPurgeTask}
            />
          );
        }
      })}
    </ul>
  );
}
