/* @jsxRuntime classic */
/* @jsx React.createElement */
/* @jsxFrag React.Fragment */
import type { AppSettings, Difficulty, Priority, Status } from '../lib/types';
import { classNames, priorityLabel, difficultyLabel } from '../lib/utils';
import { chipTone } from '../lib/styles';
import { btnBase, btnNeutral } from '../lib/styles';

export function AppSettingsEditor(props: {
  value: AppSettings;
  onChange: (s: AppSettings) => void;
  onExport?: () => void;
  onImport?: () => void;
  onExportCsv?: () => void;
  onImportCsv?: () => void;
  onImportJsonText?: (text: string) => void;
  onImportCsvText?: (text: string) => void;
  currentTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onImportFromPrevious?: () => void;
}) {
  const { value, onChange, onExport, onImport, onExportCsv, onImportCsv, onImportJsonText, onImportCsvText, currentTheme, onToggleTheme, onImportFromPrevious } = props;
  const { useState } = React as typeof React;
  const [inhale, setInhale] = useState(value.breathe?.inhale ?? 4);
  const [hold1, setHold1] = useState(value.breathe?.hold1 ?? 4);
  const [exhale, setExhale] = useState(value.breathe?.exhale ?? 4);
  const [hold2, setHold2] = useState(value.breathe?.hold2 ?? 4);
  const [ui, setUi] = useState(value.ui || { showPriority: true, showDifficulty: true, showDueDate: true, showStatus: true, showEta: true });
  const [stepDefaults, setStepDefaults] = useState(value.defaults?.step || {});
  const [taskDefaults, setTaskDefaults] = useState(value.defaults?.task || {});

  function save() {
    const b = {
      inhale: Math.max(1, Number(inhale) || 4),
      hold1: Math.max(1, Number(hold1) || 4),
      exhale: Math.max(1, Number(exhale) || 4),
      hold2: Math.max(1, Number(hold2) || 4),
    };
    onChange({ ...value, breathe: b, ui, defaults: { step: stepDefaults, task: taskDefaults } });
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="mb-1 font-semibold">Breathe Timings</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2">
          <span className="w-24">Inhale (s)</span>
          <input type="number" min="1" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={inhale} onChange={(e) => setInhale((e.target as HTMLInputElement).value)} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-24">Hold 1 (s)</span>
          <input type="number" min="1" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={hold1} onChange={(e) => setHold1((e.target as HTMLInputElement).value)} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-24">Exhale (s)</span>
          <input type="number" min="1" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={exhale} onChange={(e) => setExhale((e.target as HTMLInputElement).value)} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-24">Hold 2 (s)</span>
          <input type="number" min="1" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={hold2} onChange={(e) => setHold2((e.target as HTMLInputElement).value)} />
        </label>
      </div>

      <div className="mt-4 mb-1 font-semibold">Display</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!ui.showPriority} onChange={(e) => setUi({ ...ui, showPriority: e.currentTarget.checked })} /> Show Priority</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!ui.showDifficulty} onChange={(e) => setUi({ ...ui, showDifficulty: e.currentTarget.checked })} /> Show Difficulty</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!ui.showDueDate} onChange={(e) => setUi({ ...ui, showDueDate: e.currentTarget.checked })} /> Show Due Date</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!ui.showStatus} onChange={(e) => setUi({ ...ui, showStatus: e.currentTarget.checked })} /> Show Status</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!ui.showEta} onChange={(e) => setUi({ ...ui, showEta: e.currentTarget.checked })} /> Show ETC</label>
      </div>

      <div className="mt-4 mb-1 font-semibold">Defaults for New Items</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 font-medium">Step Defaults</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2"><span className="w-24">Priority</span><input type="number" min="" max="" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={stepDefaults.priority ?? ''} onChange={(e) => setStepDefaults({ ...stepDefaults, priority: clampNum(e) as Priority | undefined })} /></label>
            <label className="flex items-center gap-2"><span className="w-24">Difficulty</span><input type="number" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={stepDefaults.difficulty ?? ''} onChange={(e) => setStepDefaults({ ...stepDefaults, difficulty: clampNum(e) as Difficulty | undefined })} /></label>
            <label className="flex items-center gap-2"><span className="w-24">Status</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={stepDefaults.status ?? ''} onChange={(e) => setStepDefaults({ ...stepDefaults, status: strToStatus((e.target as HTMLSelectElement).value) })}>
                <option value="">(none)</option>
                <option value="todo">todo</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!stepDefaults.todayDefault} onChange={(e) => setStepDefaults({ ...stepDefaults, todayDefault: e.currentTarget.checked })} /> Mark Today by default</label>
          </div>
        </div>
        <div>
          <div className="mb-1 font-medium">Task Defaults</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2"><span className="w-24">Priority</span><input type="number" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={taskDefaults.priority ?? ''} onChange={(e) => setTaskDefaults({ ...taskDefaults, priority: clampNum(e) as Priority | undefined })} /></label>
            <label className="flex items-center gap-2"><span className="w-24">Difficulty</span><input type="number" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={taskDefaults.difficulty ?? ''} onChange={(e) => setTaskDefaults({ ...taskDefaults, difficulty: clampNum(e) as Difficulty | undefined })} /></label>
            <label className="flex items-center gap-2"><span className="w-24">Status</span>
              <select className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={taskDefaults.status ?? ''} onChange={(e) => setTaskDefaults({ ...taskDefaults, status: strToStatus((e.target as HTMLSelectElement).value) })}>
                <option value="">(none)</option>
                <option value="todo">todo</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!taskDefaults.todayDefault} onChange={(e) => setTaskDefaults({ ...taskDefaults, todayDefault: e.currentTarget.checked })} /> Mark Today by default</label>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button id="settings-save-button" className={classNames(btnBase, btnNeutral)} onClick={save}>Save</button>
        {onToggleTheme && (
          <button className={classNames(btnBase, btnNeutral)} onClick={onToggleTheme}>Toggle Theme{currentTheme ? ` (${currentTheme})` : ''}</button>
        )}
        {onExport && (<button className={classNames(btnBase, btnNeutral)} onClick={onExport}>Export JSON</button>)}
        {onImport && (<button className={classNames(btnBase, btnNeutral)} onClick={onImport}>Import JSON (paste)</button>)}
        {onImportJsonText && (
          <>
            <input id="import-json-file" type="file" accept="application/json" className="hidden" onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { onImportJsonText(String(reader.result || '')); (e.target as HTMLInputElement).value = ''; }; reader.readAsText(f);
            }} />
            <label htmlFor="import-json-file" className={classNames(btnBase, btnNeutral)} style={{ cursor: 'pointer' }}>Import JSON (file)</label>
          </>
        )}
        {onExportCsv && (<button className={classNames(btnBase, btnNeutral)} onClick={onExportCsv}>Export CSV</button>)}
        {onImportCsv && (<button className={classNames(btnBase, btnNeutral)} onClick={onImportCsv}>Import CSV (paste)</button>)}
        {onImportCsvText && (
          <>
            <input id="import-csv-file" type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => { onImportCsvText(String(reader.result || '')); (e.target as HTMLInputElement).value = ''; }; reader.readAsText(f);
            }} />
            <label htmlFor="import-csv-file" className={classNames(btnBase, btnNeutral)} style={{ cursor: 'pointer' }}>Import CSV (file)</label>
          </>
        )}
      </div>
      <div className="text-xs text-slate-400">
        Export includes Projects and global Tasks as JSON. Import replaces current data with the provided JSON.
        {onImportFromPrevious && (
          <div className="mt-3">
            <button className={classNames(btnBase, btnNeutral)} onClick={onImportFromPrevious} title="Copy data from older Project Calm profile (first-run/dev)">Import From Previous Profile</button>
          </div>
        )}
        <div className="mt-4 border-t border-slate-700/40 pt-3">
          <div className="mb-2 font-medium">Legend</div>
          <div className="text-[11px] text-slate-300 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 w-16">Priority</span>
              {
                [1, 2, 3, 4, 5].map((p) => {
                  const tone = p <= 1 ? chipTone.danger : p === 2 ? chipTone.warn : p === 3 ? chipTone.info : p === 4 ? chipTone.purple : chipTone.ok;
                  return (
                    <span key={'prio' + p} className={classNames('px-1 rounded', tone)}>
                      {priorityLabel(p as any)} ({p})
                    </span>
                  );
                })
              }
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 w-16">Difficulty</span>
              {
                [1, 2, 3, 4, 5].map((d) => {
                  const tone = d <= 1 ? chipTone.danger : d === 2 ? chipTone.warn : d === 3 ? chipTone.info : d === 4 ? chipTone.purple : chipTone.ok;
                  return (
                    <span key={'diff' + d} className={classNames('px-1 rounded', tone)}>
                      {difficultyLabel(d as any)} ({d})
                    </span>
                  );
                })
              }
            </div>
          </div>
        </div>
        Export includes Projects and global Tasks as JSON. Import replaces current data with the provided JSON.
      </div>
    </div>
  );
}

function clampNum(e: Event): number | undefined {
  const v = (e.target as HTMLInputElement).value.trim();
  if (!v) return undefined;
  const n = Math.max(1, Math.min(5, Math.round(Number(v))));
  return Number.isNaN(n) ? undefined : n;
}
function strToStatus(v: string): Status | undefined {
  return v === 'todo' || v === 'in_progress' || v === 'blocked' || v === 'done' ? (v as Status) : undefined;
}

