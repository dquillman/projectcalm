/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Step, Tab } from '../lib/types';
import { classNames, formatHours, daysUntilDue, priorityLabel, difficultyLabel, smartExplain, statusLabel } from '../lib/utils';
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
    <li className={classNames('flex items-center justify-between gap-3 rounded-lg border p-3', listItemTone)}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div className={classNames('text-sm', s.done ? 'line-through text-slate-500' : 'text-slate-200')} title={smartExplain(s)}>
            {props.titlePrefix ? props.titlePrefix + ': ' : ''}{s.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-300">
            {!s.deletedAt && !s.done && s.today && (
              <span className={classNames('px-1 rounded', chipTone.ok)}>Today</span>
            )}
            {ui.showStatus && s.status && !s.deletedAt && !s.done && (
              <span className={classNames('px-1 rounded', (
                s.status === 'waiting' ? chipTone.warn :
                s.status === 'in_progress' ? chipTone.info :
                s.status === 'todo' ? chipTone.purple : chipTone.neutral
              ))}>
                {statusLabel(s.status)}
              </span>
            )}
            {ui.showPriority && s.priority != null && (() => {
              const p = s.priority as number;
              const tone = p <= 1 ? chipTone.danger : p === 2 ? chipTone.warn : p === 3 ? chipTone.info : p === 4 ? chipTone.purple : chipTone.ok;
              return (
                <span className={classNames('px-1 rounded', tone)} title={`Priority ${p} (${priorityLabel(p)})`}>
                  Priority: {priorityLabel(p)} ({p})
                </span>
              );
            })()}
            {ui.showDifficulty && s.difficulty != null && (() => {
              const d = s.difficulty as number;
              const tone = d <= 1 ? chipTone.danger : d === 2 ? chipTone.warn : d === 3 ? chipTone.info : d === 4 ? chipTone.purple : chipTone.ok;
              return (
                <span className={classNames('px-1 rounded', tone)} title={`Difficulty ${d} (${difficultyLabel(d)})`}>
                  Difficulty: {difficultyLabel(d)} ({d})
                </span>
              );
            })()}
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
            {s.done && <span className={classNames('px-1 rounded', chipTone.ok)}>Done</span>}
            {s.notes && <span className={classNames('px-1 rounded', chipTone.ok)}>Note</span>}
            {s.deletedAt && <span className={classNames('px-1 rounded', chipTone.warn)}>Trash</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-none shrink-0">
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

