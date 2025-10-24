/**
 * Design tokens and theme configuration
 * Centralized styling constants for consistent UI
 */

export const colors = {
  // Priority colors (1=critical to 5=low)
  priority: {
    1: '#f87171', // red-400 - Critical
    2: '#fbbf24', // amber-400 - High
    3: '#60a5fa', // blue-400 - Medium
    4: '#c084fc', // purple-400 - Low
    5: '#10b981', // green-500 - Trivial
  },
  // Difficulty colors (1=hard to 5=easy)
  difficulty: {
    1: '#f87171', // red-400 - Very Hard
    2: '#fbbf24', // amber-400 - Hard
    3: '#60a5fa', // blue-400 - Medium
    4: '#c084fc', // purple-400 - Easy
    5: '#10b981', // green-500 - Very Easy
  },
  // Semantic colors
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#60a5fa',
  },
  // Background variants
  background: {
    primary: '#0f172a',   // slate-900
    secondary: '#1e293b', // slate-800
    tertiary: '#334155',  // slate-700
  },
  // Text variants
  text: {
    primary: '#f8fafc',   // slate-50
    secondary: '#cbd5e1', // slate-300
    tertiary: '#94a3b8',  // slate-400
    muted: '#64748b',     // slate-500
  },
} as const;

export const spacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '2.5rem', // 40px
} as const;

export const fontSize = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
} as const;

export const borderRadius = {
  sm: '0.25rem',  // 4px
  md: '0.5rem',   // 8px
  lg: '0.75rem',  // 12px
  xl: '1rem',     // 16px
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Component styles
export const componentStyles = {
  // Button base styles
  button: {
    base: 'inline-flex items-center justify-center font-medium transition-all rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500',
    sizes: {
      xs: 'px-2 py-1 text-xs',
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    },
    variants: {
      primary: 'bg-sky-600 hover:bg-sky-700 text-white border border-sky-700',
      secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700',
      outline: 'bg-transparent hover:bg-slate-800/50 text-slate-200 border border-slate-600',
    },
  },

  // Card styles
  card: {
    base: 'rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm',
    padding: {
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },

  // Input styles
  input: {
    base: 'w-full rounded-lg border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all',
    error: 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20',
  },

  // Modal styles
  modal: {
    overlay: 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm',
    container: 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4',
    content: 'relative w-full bg-slate-800 border border-slate-700 rounded-t-xl sm:rounded-xl shadow-xl max-h-[90vh] overflow-y-auto',
    sizes: {
      sm: 'sm:max-w-sm',
      md: 'sm:max-w-md',
      lg: 'sm:max-w-lg',
      xl: 'sm:max-w-xl',
      '2xl': 'sm:max-w-2xl',
    },
  },

  // Badge/Chip styles
  badge: {
    base: 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
    tones: {
      neutral: 'bg-slate-700/40 text-slate-200',
      success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      danger: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
      info: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
    },
  },
} as const;

// Helper functions
export function getPriorityColor(priority: number): string {
  return colors.priority[priority as keyof typeof colors.priority] || colors.priority[3];
}

export function getDifficultyColor(difficulty: number): string {
  return colors.difficulty[difficulty as keyof typeof colors.difficulty] || colors.difficulty[3];
}

export function getPriorityTone(priority: number): keyof typeof componentStyles.badge.tones {
  if (priority <= 1) return 'danger';
  if (priority === 2) return 'warning';
  if (priority === 3) return 'info';
  return 'neutral';
}

export function getDifficultyTone(difficulty: number): keyof typeof componentStyles.badge.tones {
  if (difficulty <= 2) return 'danger';
  if (difficulty === 3) return 'warning';
  if (difficulty >= 4) return 'success';
  return 'neutral';
}
