/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useMemo, useState } = React as typeof React;

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ID, Project, Step } from '../lib/types';
import { uid, sanitizeForFirestore } from '../lib/utils';

/**
 * Custom hook to manage projects state and operations
 * Syncs with Firestore under users/{userId}/projects
 */
export function useProjectsState(appSettingsDefaults?: any, userId?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync with Firestore
  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const projectsRef = collection(db, 'users', userId, 'projects');
    const unsubscribe = onSnapshot(projectsRef, (snapshot) => {
      const ps: Project[] = [];
      snapshot.forEach((doc) => {
        ps.push(doc.data() as Project);
      });
      setProjects(ps);
      setLoading(false);
    }, (error) => {
      console.error("Error syncing projects:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Computed: Active (non-deleted) projects
  const activeProjects = useMemo(
    () => projects.filter((p) => !p.deletedAt),
    [projects]
  );

  // Helper to update a project document
  const updateProjectDoc = async (projectId: ID, data: Partial<Project>) => {
    if (!userId) return;
    const ref = doc(db, 'users', userId, 'projects', projectId);
    try {
      await updateDoc(ref, sanitizeForFirestore(data));
    } catch (e) {
      console.error(`Project update failed: ${projectId}`, e);
      throw e;
    }
  };

  // Project CRUD operations
  async function addProject(name?: string) {
    if (!userId) return;
    const projectName = name || (window.prompt('New project name?') || '').trim();
    if (!projectName) return;

    const newId = uid();
    const newProject: Project = {
      id: newId,
      name: projectName,
      steps: [],
      createdAt: new Date().toISOString()
    };

    try {
      const payload = sanitizeForFirestore(newProject);
      await setDoc(doc(db, 'users', userId, 'projects', newId), payload);
    } catch (e) {
      console.error("Error adding project:", e);
      alert("Failed to add project. Check console.");
    }
  }

  async function renameProject(projectId: ID, newName?: string) {
    const p = projects.find((x) => x.id === projectId);
    const name = newName || (window.prompt(`Rename project "${p?.name ?? ''}" to:`, p?.name || '') || '').trim();
    if (!name) return;
    await updateProjectDoc(projectId, { name });
  }

  async function softDeleteProject(projectId: ID) {
    await updateProjectDoc(projectId, { deletedAt: new Date().toISOString() });
  }

  async function restoreProject(projectId: ID) {
    // We need to use deleteField() ideally but for now sending undefined/null might not work as expected in merge
    // Actually, updateDoc ignores undefined. We should send null or use deleteField.
    // But our types say string | undefined. Let's send null and cast or just empty string?
    // Firestore allows null.
    // Let's re-read the doc: "deletedAt?: string".
    // We can set it to null if we change the type or just use a specific "not deleted" marker?
    // Or we can just read the full object, modify it, and set it back.
    // For efficiency, let's just update.
    // Note: To delete a field, use deleteField().
    // For now, let's just keep the local logic style but push to DB.
    // Actually, let's just overwrite the field with null (if schema allows) or a special value?
    // Let's try deleteField imported from firestore.
    // But I didn't import it. Let's just set it to null for now, assuming the app handles it.
    // Wait, the app checks `!p.deletedAt`. `null` is falsy.
    await updateProjectDoc(projectId, { deletedAt: null as any });
  }

  async function purgeProject(projectId: ID) {
    if (!userId) return;
    await deleteDoc(doc(db, 'users', userId, 'projects', projectId));
  }

  // Step operations within projects
  // Note: Steps are nested in the Project document. We must update the entire steps array.

  async function addProjectStep(projectId: ID, title?: string) {
    const p = projects.find(x => x.id === projectId);
    if (!p) return;

    const stepTitle = title || (window.prompt('New step title?') || '').trim();
    if (!stepTitle) return;

    const newStep: Step = {
      id: uid(),
      title: stepTitle,
      notes: undefined,
      done: false,
      today: !!appSettingsDefaults?.step?.todayDefault,
      status: appSettingsDefaults?.step?.status,
      priority: appSettingsDefaults?.step?.priority,
      difficulty: appSettingsDefaults?.step?.difficulty,
      dueDate: undefined,
      estimatedMinutes: undefined,
      deletedAt: undefined,
      createdAt: new Date().toISOString(),
    };

    const newSteps = [...p.steps, newStep];
    await updateProjectDoc(projectId, { steps: newSteps });
  }

  async function updateStepMeta(projectId: ID, stepId: ID, meta: Partial<Step>) {
    if (!userId) return;
    const ref = doc(db, 'users', userId, 'projects', projectId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const p = snap.data() as Project;
      const newSteps = p.steps.map(s => s.id === stepId ? { ...s, ...meta } : s);
      await updateDoc(ref, { steps: newSteps });
    } catch (e) {
      console.error("Failed to update step meta", e);
    }
  }

  async function toggleStepDone(projectId: ID, stepId: ID) {
    if (!userId) return;
    const ref = doc(db, 'users', userId, 'projects', projectId);
    try {
      // Fetch fresh to avoid stale cloures
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const p = snap.data() as Project;
      const newSteps = p.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
      await updateDoc(ref, { steps: newSteps });
    } catch (e) { console.error("toggleStepDone failed", e); }
  }

  async function toggleStepToday(projectId: ID, stepId: ID) {
    if (!userId) return;
    const ref = doc(db, 'users', userId, 'projects', projectId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const p = snap.data() as Project;
      const newSteps = p.steps.map(s => s.id === stepId ? { ...s, today: !s.today } : s);
      await updateDoc(ref, { steps: newSteps });
    } catch (e) { console.error("toggleStepToday failed", e); }
  }

  async function softDeleteStep(projectId: ID, stepId: ID) {
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    const newSteps = p.steps.map(s => s.id === stepId ? { ...s, deletedAt: new Date().toISOString() } : s);
    await updateProjectDoc(projectId, { steps: newSteps });
  }

  async function restoreStep(projectId: ID, stepId: ID) {
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    const newSteps = p.steps.map(s => s.id === stepId ? { ...s, deletedAt: undefined } : s);
    await updateProjectDoc(projectId, { steps: newSteps });
  }

  async function purgeStep(projectId: ID, stepId: ID) {
    const p = projects.find(x => x.id === projectId);
    if (!p) return;
    const newSteps = p.steps.filter(s => s.id !== stepId);
    await updateProjectDoc(projectId, { steps: newSteps });
  }

  async function bulkUpdateStepsToday(stepKeys: string[]) {
    // Group by project to minimize writes
    const updates = new Map<ID, Step[]>();

    for (const key of stepKeys) {
      // key format: step|projectId|stepId
      const parts = key.split('|');
      if (parts.length !== 3) continue;
      const pid = parts[1];
      const sid = parts[2];

      const p = projects.find(x => x.id === pid);
      if (!p) continue;

      // If we haven't started tracking this project's updates, copy current steps
      if (!updates.has(pid)) {
        updates.set(pid, [...p.steps]);
      }

      const steps = updates.get(pid)!;
      const idx = steps.findIndex(s => s.id === sid);
      if (idx !== -1) {
        steps[idx] = { ...steps[idx], today: true };
      }
    }

    // Execute updates
    for (const [pid, steps] of updates.entries()) {
      await updateProjectDoc(pid, { steps });
    }
  }

  return {
    projects,
    setProjects, // Kept for compatibility but shouldn't be used directly often
    activeProjects,
    loading,
    // Project operations
    addProject,
    renameProject,
    softDeleteProject,
    restoreProject,
    purgeProject,
    // Step operations
    addProjectStep,
    updateStepMeta,
    toggleStepDone,
    toggleStepToday,
    softDeleteStep,
    restoreStep,
    purgeStep,
    bulkUpdateStepsToday,
  };
}
