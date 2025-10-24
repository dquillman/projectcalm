/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useMemo, useState } = React as typeof React;

import type { ID, Task } from '../lib/types';
import { loadTasks, saveTasks } from '../lib/storage';
import { uid } from '../lib/utils';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Custom hook to manage tasks state and operations
 * Extracts all task-related logic from app.tsx
 */
export function useTasksState(appSettingsDefaults?: any) {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());

  // Auto-save to localStorage whenever tasks change
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Computed: Active (non-deleted, non-done, non-today) tasks
  const allOpenTasks = useMemo(
    () => tasks.filter((t) => !t.deletedAt && !t.done && !t.today),
    [tasks]
  );

  // Task CRUD operations
  function addTask(title?: string) {
    const taskTitle = title || (window.prompt('New task title?') || '').trim();
    if (!taskTitle) return;

    const d = appSettingsDefaults?.task || {};
    setTasks((ts) => [
      ...ts,
      {
        id: uid(),
        title: taskTitle,
        notes: undefined,
        done: false,
        today: !!d.todayDefault,
        status: d.status,
        priority: d.priority,
        difficulty: d.difficulty,
        dueDate: undefined,
        estimatedMinutes: undefined,
        deletedAt: undefined,
        createdAt: nowIso(),
        kind: 'task',
      },
    ]);
  }

  function updateTaskMeta(taskId: ID, meta: Partial<Task>) {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: meta.title ?? t.title,
              today: meta.today ?? t.today,
              status: meta.status ?? t.status,
              priority: meta.priority ?? t.priority,
              difficulty: meta.difficulty ?? t.difficulty,
              dueDate: meta.dueDate ?? t.dueDate,
              estimatedMinutes: meta.estimatedMinutes ?? t.estimatedMinutes,
              notes: meta.notes ?? t.notes,
            }
          : t
      )
    );
  }

  function toggleTaskDone(taskId: ID) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
  }

  function toggleTaskToday(taskId: ID) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, today: !t.today } : t)));
  }

  function softDeleteTask(taskId: ID) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, deletedAt: nowIso() } : t)));
  }

  function restoreTask(taskId: ID) {
    setTasks((ts) =>
      ts.map((t) => (t.id === taskId ? { ...t, deletedAt: undefined } : t))
    );
  }

  function purgeTask(taskId: ID) {
    setTasks((ts) => ts.filter((t) => t.id !== taskId));
  }

  function bulkUpdateTasksToday(taskIds: ID[]) {
    setTasks((ts) => ts.map((t) => (taskIds.includes(t.id) ? { ...t, today: true } : t)));
  }

  return {
    tasks,
    setTasks,
    allOpenTasks,
    addTask,
    updateTaskMeta,
    toggleTaskDone,
    toggleTaskToday,
    softDeleteTask,
    restoreTask,
    purgeTask,
    bulkUpdateTasksToday,
  };
}
