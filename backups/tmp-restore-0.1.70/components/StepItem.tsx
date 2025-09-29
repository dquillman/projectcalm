/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Step, Tab } from '../lib/types';
import { classNames, formatHours, daysUntilDue, priorityLabel, difficultyLabel, smartExplain } from '../lib/utils';
import { btnDestructive, chipTone, listItemTone } from '../lib/styles';

export function StepItem(props: {
  projectId: ID;
  step: Step;
  tab: Tab;
  ui?: { showPriority: boolean; showDifficulty: boolean; showDueDate: boolean; showStatus: boolean; showEta: boolean };
  titlePrefix?: string;
  onToggleDone: (projectId: ID, stepId: ID) => void;
  onToggleToday: (projectId: ID, stepId: ID) => void;
  onEdit: (projectId: ID, step: Step) => void;
  onSoftDelete: (projectId: ID, stepId: ID) => void;
  onRestore: (projectId: ID, stepId: ID) => void;
  onPurge: (projectId: ID, stepId: ID) => void;
}) {
  const { projectId, step: s, tab } = props;
  const ui = props.ui || { showPriority: true, showDifficulty: true, showDueDate: true, showStatus: true, showEta: true };
  return (
    <li className={classNames('flex items-start justify-between gap-3 rounded-lg border p-3', listItemTone)}>
      <div className="flex items-start gap-3">
        <div>
          <div className={classNames('text-sm', s.done ? 'line-through text-slate-500' : 'text-slate-200')} title={smartExplain(s)}>
            {props.titlePrefix ? props.titlePrefix + ' • ' : ''}{s.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            {!s.deletedAt && !s.done && s.today && (
              <span className={classNames('px-1 rounded', chipTone.ok)}>today</span>
            )}
            {ui.showStatus && s.status && !s.deletedAt && !s.done && (
              <span className={classNames('px-1 rounded', s.status === 'waiting' ? chipTone.warn : chipTone.info)}>
                {s.status.replace('_', ' ')}
              </span>
            )}
            {ui.showPriority && s.priority != null && (
              <span className={classNames('px-1 rounded', chipTone.neutral)} title={`Priority ${s.priority} (${priorityLabel(s.priority)})`}>
                Priority: {priorityLabel(s.priority)} ({s.priority})
              </span>
            )}
            {ui.showDifficulty && s.difficulty != null && (
              <span className={classNames('px-1 rounded', chipTone.neutral)} title={`Difficulty ${s.difficulty} (${difficultyLabel(s.difficulty)})`}>
                Difficulty: {difficultyLabel(s.difficulty)} ({s.difficulty})
              </span>
            )}
            {ui.showDueDate && s.dueDate && (() => {
              const d = daysUntilDue(s.dueDate);
              const tone = (d ?? 9999) < 0 ? chipTone.danger : (d != null && d <= 5 ? chipTone.warn : chipTone.ok);
              return (
                <span className={classNames('px-1 rounded', tone)}>Due In: {d}</span>
              );
            })()}
            {ui.showEta && typeof s.estimatedMinutes === 'number' && (
              <span className={classNames('px-1 rounded', chipTone.neutral)} title="Estimated Time to Completion">
                ETC {formatHours(s.estimatedMinutes)} hrs
              </span>
            )}
            {s.done && <span className={classNames('px-1 rounded', chipTone.ok)}>done</span>}
            {s.notes && <span className={classNames('px-1 rounded', chipTone.neutral)}>note</span>}
            {s.deletedAt && <span className={classNames('px-1 rounded', chipTone.warn)}>trash</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tab !== 'trash' ? (
          <>
            <button
              className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')}
              onClick={() => props.onToggleDone(projectId, s.id)}
            >
              {s.done ? 'Undo' : 'Done'}
            </button>
            {!s.done && (
              <button
                className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')}
                onClick={() => props.onToggleToday(projectId, s.id)}
              >
                {s.today ? 'Untoday' : 'Today'}
              </button>
            )}
            <button
              className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')}
              onClick={() => props.onEdit(projectId, s)}
            >
              Edit
            </button>
            <button
              className={classNames('text-xs px-2 py-1 rounded border', btnDestructive)}
              onClick={() => props.onSoftDelete(projectId, s.id)}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')}
              onClick={() => props.onRestore(projectId, s.id)}
            >
              Restore
            </button>
            <button
              className={classNames('text-xs px-2 py-1 rounded border', btnDestructive)}
              onClick={() => props.onPurge(projectId, s.id)}
            >
              Purge
            </button>
          </>
        )}
      </div>
    </li>
  );
}
