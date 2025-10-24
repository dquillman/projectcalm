/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useState } = React as typeof React;

import type { AppSettings } from '../lib/types';
import { loadSettings, saveSettings } from '../lib/storage';

/**
 * Custom hook to manage application settings
 * Extracts settings-related logic from app.tsx
 */
export function useAppSettings() {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings());

  // Auto-save to localStorage whenever settings change
  useEffect(() => {
    saveSettings(appSettings);
  }, [appSettings]);

  return {
    appSettings,
    setAppSettings,
  };
}
