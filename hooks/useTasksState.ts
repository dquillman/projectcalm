/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useMemo, useState } = React as typeof React;

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ID, Task } from '../lib/types';
import { uid, sanitizeForFirestore } from '../lib/utils';

/**
 * Custom hook to manage tasks state and operations
 * Syncs with Firestore under users/{userId}/tasks
 */
export function useTasksState(appSettingsDefaults?: any, userId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync with Firestore
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const tasksRef = collection(db, 'users', userId, 'tasks');
    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const ts: Task[] = [];
      snapshot.forEach((doc) => {
        ts.push(doc.data() as Task);
      });
      setTasks(ts);
      setLoading(false);
    }, (error) => {
      console.error("Error syncing tasks:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Computed: Active (non-deleted, non-done, non-today) tasks
  const allOpenTasks = useMemo(
    () => tasks.filter((t) => !t.deletedAt && !t.done && !t.today),
    [tasks]
  );

  // Helper to update a task document
  const updateTaskDoc = async (taskId: ID, data: Partial<Task>) => {
    if (!userId) return;
    const ref = doc(db, 'users', userId, 'tasks', taskId);
    await updateDoc(ref, sanitizeForFirestore(data));
  };

  // Task CRUD operations
  async function addTask(title?: string) {
    if (!userId) return;
    const taskTitle = title || (window.prompt('New task title?') || '').trim();
    if (!taskTitle) return;

    const d = appSettingsDefaults?.task || {};
    const newId = uid();
    const newTask: Task = {
      id: newId,
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
      createdAt: new Date().toISOString(),
      kind: 'task',
    };

    try {
      await setDoc(doc(db, 'users', userId, 'tasks', newId), sanitizeForFirestore(newTask));
    } catch (e) {
      console.error("Error adding task:", e);
      alert("Failed to add task. Check console.");
    }
  }

  async function updateTaskMeta(taskId: ID, meta: Partial<Task>) {
    await updateTaskDoc(taskId, meta);
  }

  async function toggleTaskDone(taskId: ID) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    await updateTaskDoc(taskId, { done: !t.done });
  }

  async function toggleTaskToday(taskId: ID) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    await updateTaskDoc(taskId, { today: !t.today });
  }

  async function softDeleteTask(taskId: ID) {
    await updateTaskDoc(taskId, { deletedAt: new Date().toISOString() });
  }

  async function restoreTask(taskId: ID) {
    // We use null to clear the field in Firestore (if merge:true or updateDoc)
    // But updateDoc doesn't accept undefined.
    // sanitizeForFirestore removes undefined keys.
    // To DELETE a field, we should use deleteField(), but setting to null is often accepted if schema allows.
    // However, our sanitize function removes undefined.
    // If we want to clear it, we should pass null.
    await updateTaskDoc(taskId, { deletedAt: null as any });
  }

  async function purgeTask(taskId: ID) {
    if (!userId) return;
    await deleteDoc(doc(db, 'users', userId, 'tasks', taskId));
  }

  async function bulkUpdateTasksToday(taskIds: ID[]) {
    // We can use a batch here if we want, but for now simple parallel updates
    // or sequential. Let's do parallel.
    await Promise.all(taskIds.map(id => updateTaskDoc(id, { today: true })));
  }

  return {
    tasks,
    setTasks,
    allOpenTasks,
    loading,
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
