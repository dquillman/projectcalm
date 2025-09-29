/* @jsxRuntime classic */
/* @jsx React.createElement */
import { classNames } from '../lib/utils';
import { btnDestructive, btnNeutral } from '../lib/styles';

export function BreatheGuide(props: {
  config: { inhale: number; hold1: number; exhale: number; hold2: number };
  initialState?: { phase?: 'inhale' | 'hold1' | 'exhale' | 'hold2'; count?: number };
  onState?: (s: { phase: 'inhale' | 'hold1' | 'exhale' | 'hold2'; count: number }) => void;
}) {
  const { config, initialState, onState } = props;
  const { useEffect, useRef, useState } = React as typeof React;
  const [phase, setPhase] = useState(initialState?.phase || 'inhale');
  const [count, setCount] = useState(
    typeof initialState?.count === 'number' ? initialState!.count : config.inhale
  );
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  const map = { inhale: 'Inhale', hold1: 'Hold', exhale: 'Exhale', hold2: 'Hold' } as const;

  function next(p: 'inhale' | 'hold1' | 'exhale' | 'hold2') {
    if (p === 'inhale') return 'hold1';
    if (p === 'hold1') return 'exhale';
    if (p === 'exhale') return 'hold2';
    return 'inhale';
  }
  function duration(p: 'inhale' | 'hold1' | 'exhale' | 'hold2') {
    return p === 'inhale' ? config.inhale : p === 'hold1' ? config.hold1 : p === 'exhale' ? config.exhale : config.hold2;
  }

  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current as unknown as number);
        timerRef.current = null;
      }
      onState && onState({ phase, count });
      return;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current as unknown as number);
      timerRef.current = null;
    }
    timerRef.current = setInterval(() => {
      setCount((c) => {
        if (c > 1) return c - 1;
        setPhase((ph) => {
          const n = next(ph);
          const d = duration(n);
          setCount(d);
          onState && onState({ phase: n, count: d });
          return n;
        });
        return 0;
      });
    }, 1000) as unknown as number;
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current as unknown as number);
        timerRef.current = null;
      }
    };
  }, [isRunning, config.inhale, config.hold1, config.exhale, config.hold2, phase, count, onState]);

  function handlePause() {
    setIsRunning(false);
  }
  function handleResume() {
    setIsRunning(true);
  }
  function handleStop() {
    if (timerRef.current) {
      clearInterval(timerRef.current as unknown as number);
      timerRef.current = null;
    }
    setIsRunning(false);
    setPhase('inhale');
    setCount(config.inhale);
    onState && onState({ phase: 'inhale', count: config.inhale });
  }

  return (
    <div className="text-center">
      <div className="text-3xl font-semibold mb-2">{map[phase]}</div>
      <div className="text-5xl font-bold tabular-nums mb-4">{count}</div>
      <div className="text-sm text-slate-400 mb-3">
        {config.inhale}s · {config.hold1}s · {config.exhale}s · {config.hold2}s
      </div>
      <div className="flex items-center justify-center gap-2">
        {isRunning ? (
          <button className={classNames('px-3 py-1.5 rounded border', btnNeutral)} onClick={handlePause}>
            Pause
          </button>
        ) : (
          <button className={classNames('px-3 py-1.5 rounded border', btnNeutral)} onClick={handleResume}>
            Resume
          </button>
        )}
        <button className={classNames('px-3 py-1.5 rounded border', btnDestructive)} onClick={handleStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
