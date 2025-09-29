/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID } from '../lib/types';
import { classNames } from '../lib/utils';

export function FocusPane(props: {
  title: string;
  subtitle?: string;
  onDone?: () => void;
  onBack: () => void;
}) {
  const { title, subtitle, onDone, onBack } = props;
  const { useEffect, useRef, useState } = React as typeof React;
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) { if (timerRef.current) { clearInterval(timerRef.current as unknown as number); timerRef.current = null; } return; }
    if (timerRef.current) { clearInterval(timerRef.current as unknown as number); timerRef.current = null; }
    timerRef.current = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000) as unknown as number;
    return () => { if (timerRef.current) { clearInterval(timerRef.current as unknown as number); timerRef.current = null; } };
  }, [running]);

  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');

  return (
    <div className={classNames('rounded-xl border p-4', 'border-slate-700/50 bg-slate-800/40')}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Focus</div>
        <div className="flex items-center gap-2">
          <button className={classNames('text-xs px-2 py-1 rounded border','border-slate-600')} onClick={onBack}>Back</button>
          {onDone && (<button className={classNames('text-xs px-2 py-1 rounded border','border-slate-600')} onClick={onDone}>Done</button>)}
        </div>
      </div>
      {subtitle && (<div className="text-xs text-slate-400 mb-1">{subtitle}</div>)}
      <div className="text-xl text-slate-200 mb-4">{title}</div>
      <div className="text-5xl font-bold text-center tabular-nums mb-3">{mm}:{ss}</div>
      <div className="flex items-center justify-center gap-2">
        {!running ? (
          <button className={classNames('text-xs px-2 py-1 rounded border','border-slate-600')} onClick={()=>setRunning(true)}>Start</button>
        ) : (
          <button className={classNames('text-xs px-2 py-1 rounded border','border-slate-600')} onClick={()=>setRunning(false)}>Pause</button>
        )}
        <button className={classNames('text-xs px-2 py-1 rounded border','border-slate-600')} onClick={()=>setSeconds(25*60)}>Reset</button>
      </div>
    </div>
  );
}

