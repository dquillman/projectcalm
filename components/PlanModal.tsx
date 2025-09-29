/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID } from '../lib/types';
import { classNames } from '../lib/utils';

export type PlanCandidate = {
  key: string;
  kind: 'step' | 'task';
  id: ID;
  projectId?: ID;
  title: string;
  subtitle?: string; // e.g., Project name
  checked: boolean;
};

export function PlanModal(props: {
  items: PlanCandidate[];
  onToggle: (key: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const { items, onToggle, onApply, onClose } = props;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className={classNames('relative w-full max-w-xl mx-4 p-4', 'rounded-xl border border-slate-700/50 bg-slate-800/40')}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">Plan My Day</div>
          <button className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')} onClick={onClose}>Close</button>
        </div>
        <div className="text-xs text-slate-400 mb-2">Select items to mark as Today.</div>
        <ul className="space-y-2 max-h-[50vh] overflow-auto pr-1">
          {items.map(it => (
            <li key={it.key} className="flex items-start justify-between gap-3 rounded border border-slate-700/50 p-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={it.checked} onChange={()=>onToggle(it.key)} />
                <div>
                  <div className="text-sm text-slate-200">{it.subtitle ? (<><span className="text-slate-400">{it.subtitle}: </span>{it.title}</>) : it.title}</div>
                  <div className="text-[11px] text-slate-400">{it.kind}</div>
                </div>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')} onClick={onApply}>Mark Today</button>
          <button className={classNames('text-xs px-2 py-1 rounded border', 'border-slate-600')} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

