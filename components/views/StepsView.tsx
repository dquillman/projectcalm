import type { ID, Project, Step, Tab, SortMode } from '../../lib/types';
import { StepItem } from '../StepItem';
import { classNames, filterStepsForTab, sortSteps } from '../../lib/utils';
import { subtleText } from '../../lib/styles';

interface StepsViewProps {
  projects: Project[];
  tab: Tab;
  sortMode: SortMode;
  appSettings: any;
  onToggleDone: (projectId: ID, stepId: ID) => void;
  onToggleToday: (projectId: ID, stepId: ID) => void;
  onEdit: (projectId: ID, step: Step) => void;
  onSoftDelete: (projectId: ID, stepId: ID) => void;
  onRestore: (projectId: ID, stepId: ID) => void;
  onPurge: (projectId: ID, stepId: ID) => void;
}

/**
 * Steps view component
 * Displays all steps from all projects
 */
export function StepsView({
  projects,
  tab,
  sortMode,
  appSettings,
  onToggleDone,
  onToggleToday,
  onEdit,
  onSoftDelete,
  onRestore,
  onPurge,
}: StepsViewProps) {
  const entries = projects
    .filter((p) => !p.deletedAt)
    .flatMap((p) =>
      filterStepsForTab(p.steps, tab).map((s) => ({
        item: s,
        projectId: p.id,
        projectName: p.name,
      }))
    );

  if (entries.length === 0) {
    return <div className={classNames('text-sm', subtleText)}>No items.</div>;
  }

  const wm = new WeakMap<Step, { projectId: ID; projectName: string }>();
  entries.forEach((e) => wm.set(e.item, { projectId: e.projectId, projectName: e.projectName }));

  const sorted = sortSteps(
    entries.map((e) => e.item),
    sortMode
  );

  return (
    <ul className="space-y-2" role="list" aria-label="All steps">
      {sorted.map((s) => {
        const meta = wm.get(s)!;
        return (
          <StepItem
            key={s.id + '|step:steps'}
            projectId={meta.projectId}
            step={s}
            tab={tab}
            ui={appSettings.ui}
            titlePrefix={meta.projectName}
            onToggleDone={onToggleDone}
            onToggleToday={onToggleToday}
            onEdit={(pid: ID, step: Step) => onEdit(meta.projectId, step)}
            onSoftDelete={onSoftDelete}
            onRestore={onRestore}
            onPurge={onPurge}
          />
        );
      })}
    </ul>
  );
}
