export type Theme = 'light' | 'dark';

export type ID = string;
export type Status = 'todo' | 'in_progress' | 'waiting' | 'done';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Tab = 'all' | 'today' | 'done' | 'trash' | 'plan';
export type SortMode = 'smart' | 'due' | 'priority' | 'created' | 'status';

export type Step = {
  id: ID;
  title: string;
  notes?: string;
  done: boolean;
  today: boolean;
  status?: Status;
  priority?: Priority;
  difficulty?: Difficulty;
  dueDate?: string; // ISO
  estimatedMinutes?: number;
  deletedAt?: string; // ISO
  createdAt: string; // ISO
};

export type Project = {
  id: ID;
  name: string;
  steps: Step[];
  deletedAt?: string;
  createdAt?: string;
};



export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export type Task = Step & { kind?: 'task'; recurrence?: RecurrenceType };

export type AppSettings = {
  breathe: { inhale: number; hold1: number; exhale: number; hold2: number };
  ui: {
    showPriority: boolean;
    showDifficulty: boolean;
    showDueDate: boolean;
    showStatus: boolean;
    showEta: boolean;
  };
  defaults: {
    step: { priority?: Priority; difficulty?: Difficulty; status?: Status; todayDefault?: boolean };
    task: { priority?: Priority; difficulty?: Difficulty; status?: Status; todayDefault?: boolean };
  };
};
