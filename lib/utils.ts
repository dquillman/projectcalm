/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, SortMode, Step, Tab, Project } from './types';

export function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export function uid(): ID {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rnd = (crypto as any)?.randomUUID?.();
    if (rnd) return rnd;
  } catch (_) { }
  return 'id_' + Math.random().toString(36).slice(2, 10);
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function filterStepsForTab(steps: Step[], tab: Tab): Step[] {
  switch (tab) {
    case 'today':
      return steps.filter((s) => !s.deletedAt && !s.done && s.today);
    case 'done':
      return steps.filter((s) => !s.deletedAt && s.done);
    case 'trash':
      return steps.filter((s) => !!s.deletedAt);
    case 'plan':
      return steps.filter((s) => !s.deletedAt && !s.done && !s.today);
    case 'all':
    default:
      return steps.filter((s) => !s.deletedAt);
  }
}

export function sortSteps(steps: Step[], sortMode: SortMode): Step[] {
  const arr = steps.slice();

  const byDate = (a?: string, b?: string) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  };

  if (sortMode !== 'smart') {
    arr.sort((a, b) => {
      if (sortMode === 'created') return byDate(a.createdAt, b.createdAt);
      if (sortMode === 'status') {
        // Explicit status ranking: In Progress, Todo, Waiting, Done last
        const rank = (s: Step) => {
          if (s.done) return 999; // push done to the bottom regardless
          const val = s.status ?? 'todo';
          if (val === 'in_progress') return 0;
          if (val === 'todo') return 1;
          if (val === 'waiting') return 2;
          if (val === 'done') return 3;
          return 2.5; // any other/unknown just after waiting
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        // Tiebreakers: due date, then createdAt, then title
        const dueCmp = byDate(a.dueDate, b.dueDate);
        if (dueCmp) return dueCmp;
        const createdCmp = byDate(a.createdAt, b.createdAt);
        if (createdCmp) return createdCmp;
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortMode === 'due') {
        const dueCmp = byDate(a.dueDate, b.dueDate);
        if (dueCmp) return dueCmp;
        if (a.done !== b.done) return a.done ? 1 : -1;
        return byDate(a.createdAt, b.createdAt);
      }
      if (sortMode === 'priority') {
        const pa = a.priority ?? 99;
        const pb = b.priority ?? 99;
        if (pa !== pb) return pa - pb; // 1 (highest) first
        const dueCmp = byDate(a.dueDate, b.dueDate);
        if (dueCmp) return dueCmp;
        return byDate(a.createdAt, b.createdAt);
      }
      return 0;
    });
    return arr;
  }

  function smartKey(s: Step) {
    // Lower is better
    const done = s.done ? 1 : 0;
    const todayBoost = s.today ? -2 : 0;
    const d = daysUntilDue(s.dueDate);
    // Overdue very important (negative days): strong priority
    // Undefined due dates get neutral weight
    const dueWeight = d == null ? 5 : d; // earlier dates smaller numbers, overdue negative
    const waitingPenalty = s.status === 'waiting' ? 2 : 0;
    const inProgBoost = s.status === 'in_progress' ? -0.5 : 0;
    const pr = s.priority ?? 3; // 1..5 (1 highest)
    const priorityWeight = pr - 1; // 0..4
    const diff = s.difficulty ?? 3; // prefer easier slightly
    const difficultyWeight = (diff - 1) * 0.25; // small effect
    const etcH = minutesToHours(s.estimatedMinutes ?? 0) ?? 0;
    const etcWeight = etcH > 0 ? Math.min(etcH, 8) * 0.3 : 0.4; // prefer items with small ETC; unknown gets slight penalty
    const ageDays = (() => {
      try {
        if (!s.createdAt) return 0;
        const t0 = new Date(s.createdAt).getTime();
        const t1 = Date.now();
        return Math.max(0, Math.floor((t1 - t0) / (24 * 60 * 60 * 1000)));
      } catch { return 0; }
    })();
    const ageWeight = Math.min(ageDays, 30) * -0.01; // slightly prioritize older items

    const base = todayBoost + inProgBoost + waitingPenalty + priorityWeight + difficultyWeight + etcWeight + ageWeight;
    // Compose tuple: done status first, then due, then base, then createdAt
    return [done, dueWeight, base, s.createdAt ?? ''];
  }

  // expose for tooltips
  (sortSteps as any)._smartKey = smartKey;

  arr.sort((a, b) => {
    const ka = smartKey(a);
    const kb = smartKey(b);
    // Compare tuple
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    // Tiebreak by title
    const ta = (a.title || '').toLowerCase();
    const tb = (b.title || '').toLowerCase();
    if (ta < tb) return -1; if (ta > tb) return 1;
    return 0;
  });
  return arr;
}

export function smartExplain(s: Step): string {
  const d = daysUntilDue(s.dueDate);
  const pr = s.priority;
  const df = s.difficulty;
  const etc = minutesToHours(s.estimatedMinutes ?? 0) ?? 0;
  const ageDays = (() => {
    try { if (!s.createdAt) return 0; const t0 = new Date(s.createdAt).getTime(); const t1 = Date.now(); return Math.max(0, Math.floor((t1 - t0) / (24 * 60 * 60 * 1000))); } catch { return 0; }
  })();
  const parts = [
    `Done: ${s.done ? 'yes' : 'no'}`,
    `Today: ${s.today ? 'yes' : 'no'}`,
    `Status: ${s.status ?? '(none)'}${s.status === 'waiting' ? ' (penalized)' : s.status === 'in_progress' ? ' (boosted)' : ''}`,
    `Due in: ${d != null ? d : 'n/a'} days`,
    `Priority: ${pr != null ? `${priorityLabel(pr)} (${pr})` : 'n/a'}`,
    `Difficulty: ${df != null ? `${difficultyLabel(df)} (${df})` : 'n/a'}`,
    `ETC: ${etc ? `${Math.round(etc * 10) / 10} hrs` : 'n/a'}`,
    `Age: ${ageDays} days`,
  ];
  return parts.join(' | ');
}

function dateMin(a?: string, b?: string): string | undefined {
  if (!a) return b; if (!b) return a; return a < b ? a : b;
}

export function sortProjects(projects: Project[], sortMode: SortMode, tab: Tab): Project[] {
  const ps = projects.slice();
  const filteredSteps = (p: Project) => {
    // Use the same tab filter to scope which steps to consider per project
    return filterStepsForTab(p.steps, tab).filter(s => !s.deletedAt);
  };
  const byDate = (a?: string, b?: string) => {
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1; return a.localeCompare(b);
  };

  if (sortMode !== 'smart') {
    ps.sort((a, b) => {
      if (sortMode === 'created') {
        // Compare by earliest created step
        const aMin = filteredSteps(a).reduce<string | undefined>((acc, s) => dateMin(acc, s.createdAt), undefined);
        const bMin = filteredSteps(b).reduce<string | undefined>((acc, s) => dateMin(acc, s.createdAt), undefined);
        return byDate(aMin, bMin);
      }
      if (sortMode === 'status') {
        // Rank projects by best open status among filtered steps
        const rankStatus = (p: Project) => {
          const steps = filteredSteps(p);
          if (!steps.length) return 9999;
          // rank open steps; done steps push down
          const rankStep = (s: Step) => {
            if (s.done) return 100;
            const val = s.status ?? 'todo';
            if (val === 'in_progress') return 0;
            if (val === 'todo') return 1;
            if (val === 'waiting') return 2;
            if (val === 'done') return 3;
            return 2.5;
          };
          return steps.reduce<number>((acc, s) => Math.min(acc, rankStep(s)), 9999);
        };
        const ra = rankStatus(a);
        const rb = rankStatus(b);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'due') {
        const aDue = filteredSteps(a).reduce<string | undefined>((acc, s) => dateMin(acc, s.dueDate), undefined);
        const bDue = filteredSteps(b).reduce<string | undefined>((acc, s) => dateMin(acc, s.dueDate), undefined);
        const cmp = byDate(aDue, bDue);
        if (cmp) return cmp;
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'priority') {
        const aPr = filteredSteps(a).reduce<number>((acc, s) => Math.min(acc, s.priority ?? 99), 99);
        const bPr = filteredSteps(b).reduce<number>((acc, s) => Math.min(acc, s.priority ?? 99), 99);
        if (aPr !== bPr) return aPr - bPr;
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
    return ps;
  }

  function smartProjKey(p: Project) {
    const steps = filteredSteps(p);
    const open = steps.filter(s => !s.done);
    const hasToday = open.some(s => s.today);
    const earliestDue = open.reduce<string | undefined>((acc, s) => dateMin(acc, s.dueDate), undefined);
    const dueD = daysUntilDue(earliestDue);
    const waitPenalty = open.some(s => s.status === 'waiting') ? 1 : 0;
    const inProgBoost = open.some(s => s.status === 'in_progress') ? -0.5 : 0;
    const bestPriority = open.reduce<number>((acc, s) => Math.min(acc, s.priority ?? 99), 99);
    const etcH = open.reduce<number>((acc, s) => acc + (minutesToHours(s.estimatedMinutes ?? 0) ?? 0), 0);
    const etcWeight = etcH ? Math.min(etcH, 16) * 0.1 : 0.5;
    const todayBoost = hasToday ? -2 : 0;
    const base = todayBoost + inProgBoost + waitPenalty + (bestPriority - 1) * 0.25 + etcWeight;
    return [dueD == null ? 5 : dueD, base, p.name];
  }

  ps.sort((a, b) => {
    const ka = smartProjKey(a);
    const kb = smartProjKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  return ps;
}

export function minutesToHours(min?: number): number | undefined {
  if (typeof min !== 'number' || Number.isNaN(min)) return undefined;
  return min / 60;
}

export function formatHours(min?: number): string | undefined {
  const h = minutesToHours(min);
  if (h == null) return undefined;
  const val = Math.round(h * 10) / 10; // 1 decimal place
  return String(val);
}

export function daysUntilDue(dueDate?: string): number | undefined {
  if (!dueDate) return undefined;
  try {
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(dueDate + 'T00:00:00');
    const diff = Math.round((due.getTime() - today.getTime()) / msPerDay);
    return diff;
  } catch (_) {
    return undefined;
  }
}

export function priorityLabel(n?: number): string | undefined {
  if (typeof n !== 'number') return undefined;
  const levels = ['Critical', 'High', 'Medium', 'Low', 'Lowest']; // 1..5
  const idx = Math.min(5, Math.max(1, Math.round(n))) - 1;
  return levels[idx];
}

export function difficultyLabel(n?: number): string | undefined {
  if (typeof n !== 'number') return undefined;
  const levels = ['Very Hard', 'Hard', 'Moderate', 'Easy', 'Trivial']; // 1..5 (reversed)
  const idx = Math.min(5, Math.max(1, Math.round(n))) - 1;
  return levels[idx];
}

export function statusLabel(s?: string): string | undefined {
  if (!s) return undefined;
  if (s === 'in_progress') return 'In Progress';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Recursively removes undefined values from an object to make it Firestore-safe.
 * Firestore throws an error if a field is undefined.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}


/**
 * Date Hardening Helpers
 */

/**
 * Safely converts various date inputs to a Date object.
 * Handles Firestore Timestamp (with toDate()), ISO strings, Date objects, and null/undefined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDateSafe(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input?.toDate === 'function') return input.toDate(); // Firestore Timestamp
  if (typeof input === 'string') {
    // Attempt basic parsing
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Returns YYYY-MM-DD string in local time.
 * If date is invalid or null, returns null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toYMDLocal(input: any): string | null {
  // If input is already YYYY-MM-DD string, return it directly to avoid timezone shift issues
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  const d = toDateSafe(input);
  if (!d) return null;
  // Local YYYY-MM-DD
  const offset = d.getTimezoneOffset();
  // We want local date, but toISOString is UTC.
  // Trick: shift time by offset so UTC value matches local
  const local = new Date(d.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
}

/**
 * Checks if input date matches "today" in local time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDueToday(input: any): boolean {
  const ymd = toYMDLocal(input);
  if (!ymd) return false;
  return ymd === toYMDLocal(new Date());
}

/**
 * Checks if input date is strictly before "today" (overdue).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isOverdue(input: any): boolean {
  const ymd = toYMDLocal(input);
  if (!ymd) return false;
  const today = toYMDLocal(new Date())!;
  // Lexical comparison works for YYYY-MM-DD
  return ymd < today;
}

/**
 * Compare two due dates (asc). Null/Undefined treated as "upcoming/later" (infinity) 
 * so they appear after specific dates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareDue(a: any, b: any): number {
  const sa = toYMDLocal(a);
  const sb = toYMDLocal(b);
  if (sa === sb) return 0;
  if (!sa) return 1; // a is empty -> push end
  if (!sb) return -1; // b is empty -> push end
  return sa.localeCompare(sb);
}
