/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Task, Tab } from '../lib/types';
import {
  classNames,
  smartExplain,
  statusLabel,
  daysUntilDue,
  formatHours,
} from '../lib/utils';
import { Button } from './Button';
import { ImprovedBadge, PriorityBadge, DifficultyBadge, DueBadge } from './ImprovedBadge';

interface TaskItemProps {
  task: Task;
  tab: Tab;
  ui: any;
  onToggleDone: (id: ID) => void;
  onToggleToday: (id: ID) => void;
  onEdit: (id: ID) => void;
  onFocus: (id: ID) => void;
  onSoftDelete: (id: ID) => void;
  onRestore: (id: ID) => void;
  onPurge: (id: ID) => void;
}

/**
 * Task item component
 * Displays a single task with all metadata and action buttons
 */
export function TaskItem({
  task: t,
  tab,
  ui,
  onToggleDone,
  onToggleToday,
  onEdit,
  onFocus,
  onSoftDelete,
  onRestore,
  onPurge,
}: TaskItemProps) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/30 p-3"
      role="article"
      aria-label={`Task: ${t.title}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div
            className={classNames(
              'text-[15px]',
              t.done ? 'line-through text-slate-500' : 'text-slate-200'
            )}
            title={smartExplain(t as any)}
            id={`task-title-${t.id}`}
          >
            {t.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!t.deletedAt && !t.done && t.today && (
              <ImprovedBadge tone="success">Today</ImprovedBadge>
            )}
            {ui.showStatus && t.status && !t.deletedAt && !t.done && (
              <ImprovedBadge
                tone={
                  t.status === 'waiting'
                    ? 'warning'
                    : t.status === 'in_progress'
                    ? 'info'
                    : t.status === 'todo'
                    ? 'neutral'
                    : 'neutral'
                }
              >
                {statusLabel(t.status)}
              </ImprovedBadge>
            )}
            {ui.showPriority && t.priority != null && (
              <PriorityBadge priority={t.priority as number} />
            )}
            {ui.showDifficulty && t.difficulty != null && (
              <DifficultyBadge difficulty={t.difficulty as number} />
            )}
            {ui.showDueDate && t.dueDate && (
              <DueBadge daysUntil={daysUntilDue(t.dueDate) ?? 0} />
            )}
            {ui.showEta && typeof t.estimatedMinutes === 'number' && (
              <ImprovedBadge tone="neutral" className="text-[11px]">
                {formatHours(t.estimatedMinutes)}h
              </ImprovedBadge>
            )}
            {t.done && <ImprovedBadge tone="success">Done</ImprovedBadge>}
            {t.notes && <ImprovedBadge tone="info">Note</ImprovedBadge>}
            {t.deletedAt && <ImprovedBadge tone="warning">Trash</ImprovedBadge>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-none shrink-0" role="group" aria-label="Task actions">
        {tab !== 'trash' ? (
          <>
            <Button
              size="sm"
              variant={t.done ? 'secondary' : 'success'}
              onClick={() => onToggleDone(t.id)}
              aria-label={t.done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
              aria-pressed={t.done}
            >
              {t.done ? 'Undo' : 'Done'}
            </Button>
            {!t.done && (
              <Button
                size="sm"
                variant={t.today ? 'secondary' : 'outline'}
                onClick={() => onToggleToday(t.id)}
                aria-label={t.today ? `Remove ${t.title} from today` : `Add ${t.title} to today`}
                aria-pressed={t.today}
              >
                {t.today ? 'Untoday' : 'Today'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(t.id)}
              aria-label={`Edit task ${t.title}`}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFocus(t.id)}
              aria-label={`Focus on task ${t.title}`}
            >
              Focus
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => onSoftDelete(t.id)}
              aria-label={`Delete task ${t.title}`}
            >
              Delete
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onRestore(t.id)}
              aria-label={`Restore task ${t.title} from trash`}
            >
              Restore
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => onPurge(t.id)}
              aria-label={`Permanently delete task ${t.title}`}
            >
              Purge
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
