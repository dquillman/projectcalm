/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { Theme } from '../lib/types';

export function useTheme(): [Theme, (t: Theme) => void] {
  // Grab hooks from the global React injected by index.html
  const { useEffect, useState } = React as typeof React;
  const key = 'projectcalm:theme';
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(key) as Theme | null;
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return 'dark';
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, theme);
    } catch (_) {}
    const body = document.body;
    if (!body) return;
    body.classList.remove(
      theme === 'dark' ? 'bg-white' : 'bg-slate-900',
      theme === 'dark' ? 'text-slate-900' : 'text-slate-100'
    );
    if (theme === 'dark') {
      body.classList.add('bg-slate-900', 'text-slate-100');
    } else {
      body.classList.add('bg-white', 'text-slate-900');
    }
  }, [theme]);
  return [theme, setTheme];
}

