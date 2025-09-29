/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Project, Step, Tab } from '../lib/types';
import { classNames } from '../lib/utils';
import { cardBase, cardTone, btnPositive } from '../lib/styles';
import { StepItem } from './StepItem';

export function ProjectSection(props: {
  project: Project;
  steps: Step[];
  tab: Tab;
  ui?: { showPriority: boolean; showDifficulty: boolean; showDueDate: boolean; showStatus: boolean; showEta: boolean };
  headerMode?: 'normal' | 'trash';
  onRename: (projectId: ID) => void;
  onAddStep: (projectId: ID) => void;
  onDeleteProject: (projectId: ID) => void;
  onRestoreProject: (projectId: ID) => void;
  onPurgeProject: (projectId: ID) => void;
  onToggleDone: (projectId: ID, stepId: ID) => void;
  onToggleToday: (projectId: ID, stepId: ID) => void;
  onEdit: (projectId: ID, step: Step) => void;
  onSoftDelete: (projectId: ID, stepId: ID) => void;
  onRestore: (projectId: ID, stepId: ID) => void;
  onPurge: (projectId: ID, stepId: ID) => void;
}) {
  const { project: p, steps, tab } = props;
  const headerMode = props.headerMode || (tab === 'trash' ? 'trash' : 'normal');
  return (
    <div className={classNames(cardBase, cardTone)}>
      <div className="p-4 border-b border-slate-700/40 flex items-center justify-between">
        <div className="font-semibold">{p.name}</div>
        <div className="flex items-center gap-2">
          {headerMode !== 'trash' ? (
            <>
              {/* Required order: Add Step, Rename Project, Delete Project */}
              <button
                className={classNames('text-xs', 'px-2 py-1 rounded border', btnPositive)}
                onClick={() => props.onAddStep(p.id)}
              >
                Add Step
              </button>
              <button
                className={classNames('text-xs', 'px-2 py-1 rounded border', 'border-slate-600')}
                onClick={() => props.onRename(p.id)}
              >
                Rename Project
              </button>
              <button
                className={classNames('text-xs', 'px-2 py-1 rounded border', 'border-rose-600 text-rose-300')}
                onClick={() => props.onDeleteProject(p.id)}
              >
                Delete Project
              </button>
            </>
          ) : (
            <>
              <button
                className={classNames('text-xs', 'px-2 py-1 rounded border', 'border-slate-600')}
                onClick={() => props.onRestoreProject(p.id)}
              >
                Restore Project
              </button>
              <button
                className={classNames('text-xs', 'px-2 py-1 rounded border', 'border-rose-600 text-rose-300')}
                onClick={() => props.onPurgeProject(p.id)}
              >
                Purge Project
              </button>
            </>
          )}
        </div>
      </div>
      <div className="p-4">
        {steps.length === 0 ? (
          <div className="text-sm text-slate-400">No items in this view.</div>
        ) : (
          <ul className="space-y-2">
            {steps.map((s) => (
              <StepItem
                key={s.id}
                projectId={p.id}
                step={s}
                tab={tab}
                ui={props.ui}
                onToggleDone={props.onToggleDone}
                onToggleToday={props.onToggleToday}
                onEdit={props.onEdit}
                onSoftDelete={props.onSoftDelete}
                onRestore={props.onRestore}
                onPurge={props.onPurge}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
