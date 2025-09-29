/* @jsxRuntime classic */
/* @jsx React.createElement */
export function Card(props: { title: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">{props.title}</div>
        {props.footer}
      </div>
      <div className="text-sm text-slate-300">{props.children}</div>
    </div>
  );
}

