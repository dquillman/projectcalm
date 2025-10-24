/* @jsxRuntime classic */
/* @jsx React.createElement */
import type { ID, Project, Step, Tab, SortMode } from '../../lib/types';
import { ProjectSection } from '../ProjectSection';
import { classNames } from '../../lib/utils';
import { subtleText } from '../../lib/styles';

interface ProjectsViewProps {
  sortedProjects: Project[];
  stepsByProjectForTab: Map<ID, Step[]>;
  tab: Tab;
  appSettings: any;
  onRename: (projectId: ID) => void;
  onAddStep: (projectId: ID) => void;
  onDeleteProject: (projectId: ID) => void;
  onRestoreProject: (projectId: ID) => void;
  onPurgeProject: (projectId: ID) => void;
  onToggleDone: (projectId: ID, stepId: ID) => void;
  onToggleToday: (projectId: ID, stepId: ID) => void;
  onEdit: (projectId: ID, step: Step) => void;
  onSoftDelete: (projectId: ID, stepId: ID) => void;
  onRestore: (projectId: ID, stepId: ID) => void;
  onPurge: (projectId: ID, stepId: ID) => void;
}

/**
 * Projects view component
 * Displays all projects with their steps
 */
export function ProjectsView({
  sortedProjects,
  stepsByProjectForTab,
  tab,
  appSettings,
  onRename,
  onAddStep,
  onDeleteProject,
  onRestoreProject,
  onPurgeProject,
  onToggleDone,
  onToggleToday,
  onEdit,
  onSoftDelete,
  onRestore,
  onPurge,
}: ProjectsViewProps) {
  if (sortedProjects.length === 0) {
    return (
      <div className={classNames('text-sm', subtleText)}>No projects yet.</div>
    );
  }

  return (
    <div role="region" aria-label="Projects list">
      {sortedProjects.map((p) => (
        <ProjectSection
          key={p.id}
          project={p}
          steps={stepsByProjectForTab.get(p.id) || []}
          tab={tab}
          ui={appSettings.ui}
          onRename={onRename}
          onAddStep={onAddStep}
          onDeleteProject={onDeleteProject}
          onRestoreProject={onRestoreProject}
          onPurgeProject={onPurgeProject}
          onToggleDone={onToggleDone}
          onToggleToday={onToggleToday}
          onEdit={(projectId, step) => onEdit(projectId, step)}
          onSoftDelete={onSoftDelete}
          onRestore={onRestore}
          onPurge={onPurge}
        />
      ))}
    </div>
  );
}
