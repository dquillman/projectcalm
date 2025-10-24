import { useEffect, useMemo, useState } from 'react';
import type { ID, Project, Step } from '../lib/types';
import { loadProjects, saveProjects } from '../lib/storage';
import { uid } from '../lib/utils';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Custom hook to manage projects state and operations
 * Extracts all project-related logic from app.tsx
 */
export function useProjectsState(appSettingsDefaults?: any) {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());

  // Auto-save to localStorage whenever projects change
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  // Computed: Active (non-deleted) projects
  const activeProjects = useMemo(
    () => projects.filter((p) => !p.deletedAt),
    [projects]
  );

  // Project CRUD operations
  function addProject(name?: string) {
    const projectName = name || (window.prompt('New project name?') || '').trim();
    if (!projectName) return;
    setProjects((ps) => [
      ...ps,
      { id: uid(), name: projectName, steps: [], createdAt: nowIso() } as any,
    ]);
  }

  function renameProject(projectId: ID, newName?: string) {
    const p = projects.find((x) => x.id === projectId);
    const name = newName || (window.prompt(`Rename project "${p?.name ?? ''}" to:`, p?.name || '') || '').trim();
    if (!name) return;
    setProjects((ps) => ps.map((x) => (x.id === projectId ? { ...x, name } : x)));
  }

  function softDeleteProject(projectId: ID) {
    setProjects((ps) =>
      ps.map((x) => (x.id === projectId ? { ...x, deletedAt: nowIso() } : x))
    );
  }

  function restoreProject(projectId: ID) {
    setProjects((ps) =>
      ps.map((x) => (x.id === projectId ? { ...x, deletedAt: undefined } : x))
    );
  }

  function purgeProject(projectId: ID) {
    setProjects((ps) => ps.filter((x) => x.id !== projectId));
  }

  // Step operations within projects
  function addProjectStep(projectId: ID, title?: string) {
    const stepTitle = title || (window.prompt('New step title?') || '').trim();
    if (!stepTitle) return;

    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: [
                ...p.steps,
                {
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
                  createdAt: nowIso(),
                },
              ],
            }
          : p
      )
    );
  }

  function updateStepMeta(projectId: ID, stepId: ID, meta: Partial<Step>) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      title: meta.title ?? s.title,
                      today: meta.today ?? s.today,
                      status: meta.status ?? s.status,
                      priority: meta.priority ?? s.priority,
                      difficulty: meta.difficulty ?? s.difficulty,
                      dueDate: meta.dueDate ?? s.dueDate,
                      estimatedMinutes: meta.estimatedMinutes ?? s.estimatedMinutes,
                      notes: meta.notes ?? s.notes,
                    }
                  : s
              ),
            }
          : p
      )
    );
  }

  function toggleStepDone(projectId: ID, stepId: ID) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
            }
          : p
      )
    );
  }

  function toggleStepToday(projectId: ID, stepId: ID) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) => (s.id === stepId ? { ...s, today: !s.today } : s)),
            }
          : p
      )
    );
  }

  function softDeleteStep(projectId: ID, stepId: ID) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId ? { ...s, deletedAt: nowIso() } : s
              ),
            }
          : p
      )
    );
  }

  function restoreStep(projectId: ID, stepId: ID) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId ? { ...s, deletedAt: undefined } : s
              ),
            }
          : p
      )
    );
  }

  function purgeStep(projectId: ID, stepId: ID) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.filter((s) => s.id !== stepId),
            }
          : p
      )
    );
  }

  function bulkUpdateStepsToday(stepKeys: string[]) {
    setProjects((ps) =>
      ps.map((p) => {
        const nextSteps = p.steps.map((s) =>
          stepKeys.some((k) => k === `step|${p.id}|${s.id}`) ? { ...s, today: true } : s
        );
        return { ...p, steps: nextSteps };
      })
    );
  }

  return {
    projects,
    setProjects,
    activeProjects,
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
