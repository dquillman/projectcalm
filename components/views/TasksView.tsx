import type { ID, Step, Tab, Task, SortMode } from '../../lib/types';
import { TaskItem } from '../TaskItem';
import { classNames, filterStepsForTab, sortSteps } from '../../lib/utils';
import { subtleText } from '../../lib/styles';

interface TasksViewProps {
  tasks: Task[];
  tab: Tab;
  sortMode: SortMode;
  appSettings: any;
  onToggleDone: (taskId: ID) => void;
  onToggleToday: (taskId: ID) => void;
  onEdit: (taskId: ID) => void;
  onFocus: (taskId: ID) => void;
  onSoftDelete: (taskId: ID) => void;
  onRestore: (taskId: ID) => void;
  onPurge: (taskId: ID) => void;
}

/**
 * Tasks view component
 * Displays all tasks
 */
export function TasksView({
  tasks,
  tab,
  sortMode,
  appSettings,
  onToggleDone,
  onToggleToday,
  onEdit,
  onFocus,
  onSoftDelete,
  onRestore,
  onPurge,
}: TasksViewProps) {
  const filtered = filterStepsForTab(tasks as unknown as Step[], tab) as unknown as Task[];

  if (filtered.length === 0) {
    return <div className={classNames('text-sm', subtleText)}>No items.</div>;
  }

  const sorted = sortSteps(filtered as unknown as Step[], sortMode) as unknown as Task[];

  return (
    <ul className="space-y-2" role="list" aria-label="All tasks">
      {sorted.map((t) => (
        <TaskItem
          key={t.id + '|task:tasks'}
          task={t}
          tab={tab}
          ui={appSettings.ui}
          onToggleDone={onToggleDone}
          onToggleToday={onToggleToday}
          onEdit={onEdit}
          onFocus={onFocus}
          onSoftDelete={onSoftDelete}
          onRestore={onRestore}
          onPurge={onPurge}
        />
      ))}
    </ul>
  );
}
