/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
const { useEffect, useState } = React as typeof React;

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AppSettings } from '../lib/types';
import { loadSettings } from '../lib/storage'; // Keep loadSettings for initial default or fallback
import { sanitizeForFirestore } from '../lib/utils';

/**
 * Custom hook to manage application settings
 * Syncs with Firestore under users/{userId}/settings/global
 */
export function useAppSettings(userId?: string) {
  // Initialize with local defaults/storage to avoid flash of unstyled content
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings());
  const [loading, setLoading] = useState(true);

  // Sync with Firestore
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const settingsRef = doc(db, 'users', userId, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setAppSettings(docSnap.data() as AppSettings);
      } else {
        // If no settings exist in cloud, upload current local settings
        setDoc(settingsRef, sanitizeForFirestore(appSettings)).catch(console.error);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error syncing settings:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Save to Firestore whenever settings change (and we have a user)
  // We need to be careful not to create an infinite loop if onSnapshot updates state
  // But onSnapshot updates state -> effect triggers -> save -> onSnapshot triggers?
  // No, onSnapshot won't trigger if data hasn't changed remotely (usually).
  // However, it's safer to have an explicit save function or use a debounce.
  // Or, we can just update the local state and fire-and-forget the update to DB.
  // But `setAppSettings` is returned to the consumer.

  // Let's wrap setAppSettings to also update DB.
  const updateSettings = (newSettings: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setAppSettings((prev) => {
      const next = typeof newSettings === 'function' ? newSettings(prev) : newSettings;

      if (userId) {
        const settingsRef = doc(db, 'users', userId, 'settings', 'global');
        setDoc(settingsRef, sanitizeForFirestore(next)).catch(console.error);
      }

      return next;
    });
  };

  return {
    appSettings,
    setAppSettings: updateSettings,
    loading
  };
}
