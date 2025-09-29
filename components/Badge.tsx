/* @jsxRuntime classic */
/* @jsx React.createElement */
export function Badge(props: { label: string; tone?: 'neutral' | 'info' | 'success' | 'warning' }) {
  const tone = props.tone ?? 'neutral';
  const styles = {
    neutral: 'bg-slate-200 text-slate-800',
    info: 'bg-blue-200 text-blue-800',
    success: 'bg-emerald-200 text-emerald-800',
    warning: 'bg-amber-200 text-amber-900',
  } as const;
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded ${styles[tone]}`}>{props.label}</span>
  );
}

