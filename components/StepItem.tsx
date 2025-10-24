/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Step, Tab } from '../lib/types';
import { classNames, formatHours, daysUntilDue, smartExplain, statusLabel } from '../lib/utils';
import { btnDestructive, listItemTone } from '../lib/styles';
import { Button } from './Button';
import { ImprovedBadge, PriorityBadge, DifficultyBadge, DueBadge } from './ImprovedBadge';

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
    <li
      className={classNames('flex items-center justify-between gap-3 rounded-lg border p-3', listItemTone)}
      role="article"
      aria-label={`Step: ${s.title}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div
            className={classNames('text-sm', s.done ? 'line-through text-slate-500' : 'text-slate-200')}
            title={smartExplain(s)}
            id={`step-title-${s.id}`}
          >
            {props.titlePrefix ? props.titlePrefix + ': ' : ''}{s.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!s.deletedAt && !s.done && s.today && (
              <ImprovedBadge tone="success">Today</ImprovedBadge>
            )}
            {ui.showStatus && s.status && !s.deletedAt && !s.done && (
              <ImprovedBadge
                tone={
                  s.status === 'waiting'
                    ? 'warning'
                    : s.status === 'in_progress'
                    ? 'info'
                    : s.status === 'todo'
                    ? 'neutral'
                    : 'neutral'
                }
              >
                {statusLabel(s.status)}
              </ImprovedBadge>
            )}
            {ui.showPriority && s.priority != null && (
              <PriorityBadge priority={s.priority as number} />
            )}
            {ui.showDifficulty && s.difficulty != null && (
              <DifficultyBadge difficulty={s.difficulty as number} />
            )}
            {ui.showDueDate && s.dueDate && (
              <DueBadge daysUntil={daysUntilDue(s.dueDate) ?? 0} />
            )}
            {ui.showEta && typeof s.estimatedMinutes === 'number' && (
              <ImprovedBadge tone="neutral" className="text-[11px]">
                {formatHours(s.estimatedMinutes)}h
              </ImprovedBadge>
            )}
            {s.done && <ImprovedBadge tone="success">Done</ImprovedBadge>}
            {s.notes && <ImprovedBadge tone="info">Note</ImprovedBadge>}
            {s.deletedAt && <ImprovedBadge tone="warning">Trash</ImprovedBadge>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-none shrink-0" role="group" aria-label="Step actions">
        {tab !== 'trash' ? (
          <>
            <Button
              size="xs"
              variant={s.done ? 'secondary' : 'success'}
              onClick={() => props.onToggleDone(projectId, s.id)}
              aria-label={s.done ? `Mark ${s.title} as not done` : `Mark ${s.title} as done`}
              aria-pressed={s.done}
            >
              {s.done ? 'Undo' : 'Done'}
            </Button>
            {!s.done && (
              <Button
                size="xs"
                variant={s.today ? 'secondary' : 'outline'}
                onClick={() => props.onToggleToday(projectId, s.id)}
                aria-label={s.today ? `Remove ${s.title} from today` : `Add ${s.title} to today`}
                aria-pressed={s.today}
              >
                {s.today ? 'Untoday' : 'Today'}
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={() => props.onEdit(projectId, s)}
              aria-label={`Edit step ${s.title}`}
            >
              Edit
            </Button>
            <Button
              size="xs"
              variant="danger"
              onClick={() => props.onSoftDelete(projectId, s.id)}
              aria-label={`Delete step ${s.title}`}
            >
              Delete
            </Button>
          </>
        ) : (
          <>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => props.onRestore(projectId, s.id)}
              aria-label={`Restore step ${s.title} from trash`}
            >
              Restore
            </Button>
            <Button
              size="xs"
              variant="danger"
              onClick={() => props.onPurge(projectId, s.id)}
              aria-label={`Permanently delete step ${s.title}`}
            >
              Purge
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

