/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { Difficulty, Priority, Status } from '../lib/types';
import { classNames, priorityLabel, difficultyLabel } from '../lib/utils';

export type EditItem = {
  title: string;
  today?: boolean;
  status?: Status;
  priority?: Priority;
  difficulty?: Difficulty;
  dueDate?: string;
  estimatedMinutes?: number;
  estimatedMinutes?: number;
  notes?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly';
};

export function EditItemModal(props: {
  title: string;
  value: EditItem;
  onSave: (v: EditItem) => void;
  onClose: () => void;
}) {
  const { useState } = React as typeof React;
  const [title, setTitle] = useState(props.value.title || '');
  const [today, setToday] = useState(!!props.value.today);
  const [status, setStatus] = useState<Status | ''>(props.value.status || '');
  const [priority, setPriority] = useState<number | ''>(
    typeof props.value.priority === 'number' ? props.value.priority : ''
  );
  const [difficulty, setDifficulty] = useState<number | ''>(
    typeof props.value.difficulty === 'number' ? props.value.difficulty : ''
  );
  const [dueDate, setDueDate] = useState(props.value.dueDate || '');
  const [etaHours, setEtaHours] = useState<string>(() => {
    const m = props.value.estimatedMinutes;
    if (typeof m === 'number') {
      const h = Math.round((m / 60) * 10) / 10;
      return String(h);
    }
    return '';
  });
  const [notes, setNotes] = useState(props.value.notes || '');
  const [recurrence, setRecurrence] = useState<string>(props.value.recurrence || '');

  function clampPD(n: number) {
    return Math.max(1, Math.min(5, Math.round(n)));
  }

  function save() {
    const out: EditItem = {
      title: (title || '').trim() || props.value.title,
      today,
      status: status || undefined,
      priority: priority === '' ? undefined : (clampPD(Number(priority)) as Priority),
      difficulty: difficulty === '' ? undefined : (clampPD(Number(difficulty)) as Difficulty),
      dueDate: (dueDate || '').trim() || undefined,
      estimatedMinutes: ((): number | undefined => {
        if (etaHours == null || etaHours === '') return undefined;
        const num = Number(String(etaHours).trim());
        if (Number.isNaN(num) || num < 0) return undefined;
        return Math.round(num * 60);
      })(),
      notes: (notes || '').trim() || undefined,
      recurrence: (recurrence || undefined) as 'daily' | 'weekly' | 'monthly' | undefined,
    };
    props.onSave(out);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60" onClick={props.onClose} />
      <div className={classNames('relative w-full max-w-xl mx-4 p-4', 'rounded-xl border border-slate-700/50 bg-slate-800/40')}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">{props.title}</div>
          <button className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')} onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="w-28">Title</span>
            <input className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={today} onChange={(e) => setToday(e.currentTarget.checked)} />
            <span>Mark Today</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2"><span className="w-28">Status</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={status} onChange={(e) => setStatus(((e.target as HTMLSelectElement).value || '') as any)}>
                <option value="">(none)</option>
                <option value="todo">todo</option>
                <option value="in_progress">in_progress</option>
                <option value="waiting">waiting</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><span className="w-28">Due date</span>
              <input type="date" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={dueDate} onChange={(e) => setDueDate((e.target as HTMLInputElement).value)} />
            </label>
            <label className="flex items-center gap-2"><span className="w-28">Priority</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={priority === '' ? '' : String(priority)} onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value; setPriority(v ? Number(v) : '');
              }}>
                <option value="">(none)</option>
                {([1, 2, 3, 4, 5] as const).map(n => (
                  <option key={n} value={n}>{n} - {priorityLabel(n)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2"><span className="w-28">Difficulty</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={difficulty === '' ? '' : String(difficulty)} onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value; setDifficulty(v ? Number(v) : '');
              }}>
                <option value="">(none)</option>
                {([1, 2, 3, 4, 5] as const).map(n => (
                  <option key={n} value={n}>{n} - {difficultyLabel(n)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2"><span className="w-28">ETC (hours)</span>
              <input type="number" min="0" step="0.1" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={etaHours} onChange={(e) => setEtaHours((e.target as HTMLInputElement).value)} />
            </label>
            <label className="flex items-center gap-2"><span className="w-28">Repeat</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={recurrence} onChange={(e) => setRecurrence((e.target as HTMLSelectElement).value)}>
                <option value="">(none)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>
          <label className="flex items-start gap-2">
            <span className="w-28 mt-1">Notes</span>
            <textarea rows={4} className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={notes} onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
          </label>
          <div className="flex items-center gap-2">
            <button className={classNames('px-3 py-1.5 rounded border', 'border-slate-600')} onClick={save}>Save</button>
            <button className={classNames('px-3 py-1.5 rounded border', 'border-slate-600')} onClick={props.onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
