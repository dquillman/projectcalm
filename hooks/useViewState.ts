/* @jsxRuntime classic */
/* @jsx React.createElement */
import React, { useMemo, useState } from 'react';

import type { ID, SortMode, Step, Tab, Task } from '../lib/types';

type View = 'projects' | 'everything' | 'steps' | 'tasks' | 'focus' | 'assistant';

export interface PlanCandidate {
  key: string;
  kind: 'step' | 'task';
  id: ID;
  projectId?: ID;
  title: string;
  subtitle?: string;
  checked: boolean;
}

/**
 * Custom hook to manage view state and UI interactions
 * Extracts view, modals, and plan-related logic from app.tsx
 */
export function useViewState() {
  const [view, setView] = useState<View>('projects');
  const [tab, setTab] = useState<Tab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [showSettings, setShowSettings] = useState(false);
  const [showBreathe, setShowBreathe] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [planSel, setPlanSel] = useState<Map<string, boolean>>(new Map());
  const [focusTarget, setFocusTarget] = useState<{ kind: 'task'; id: ID } | null>(null);

  // Editing states
  const [editingStep, setEditingStep] = useState<{ projectId: ID; step: Step } | null>(
    null
  );
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null);

  function togglePlanKey(key: string) {
    setPlanSel((prev) => {
      const m = new Map(prev);
      m.set(key, !m.get(key));
      return m;
    });
  }

  function clearPlanSelection() {
    setPlanSel(new Map());
  }

  return {
    // View navigation
    view,
    setView,
    tab,
    setTab,
    sortMode,
    setSortMode,
    // Modal states
    showSettings,
    setShowSettings,
    showBreathe,
    setShowBreathe,
    showPlan,
    setShowPlan,
    // Editing states
    editingStep,
    setEditingStep,
    editingTaskId,
    setEditingTaskId,
    // Focus mode
    focusTarget,
    setFocusTarget,
    // Plan selection
    planSel,
    setPlanSel,
    togglePlanKey,
    clearPlanSelection,
  };
}
