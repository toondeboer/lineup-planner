import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useStore as useZustand } from 'zustand';
import { useStore } from '../state/store';
import { api, isCloudEnabled } from './api';
import { createSyncEngine, createSyncStatus, type SyncStatus } from './engine';

/** How often to look for other coaches' changes while the app is open and visible. */
const POLL_MS = 15_000;

const status = createSyncStatus();

/** The sync state, for showing "Saving…" or "Offline". */
export function useSyncStatus(): SyncStatus {
  return useZustand(status);
}

export function dismissLostAccess() {
  status.setState({ lostAccess: false });
}

/**
 * Runs the sync engine while the app is mounted: saves local edits, and fetches other coaches' changes
 * every 15 s while the app is in the foreground and right away when it comes back. On the web,
 * AppState follows the tab's visibility, so a hidden tab doesn't poll.
 */
export function useSync() {
  useEffect(() => {
    if (!isCloudEnabled()) return;
    const engine = createSyncEngine(useStore, api, status);
    const syncIfShared = () => {
      if (useStore.getState().team && AppState.currentState !== 'background') engine.syncNow();
    };
    syncIfShared();
    const timer = setInterval(syncIfShared, POLL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIfShared();
    });
    // after joining, creating, or loading a saved membership from storage
    const unsubscribe = useStore.subscribe((next, prev) => {
      if (next.team && next.team.id !== prev.team?.id) syncIfShared();
    });
    // in a browser, save offline edits as soon as the connection is back instead of at the next retry
    const online = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (online) window.addEventListener('online', syncIfShared);
    return () => {
      if (online) window.removeEventListener('online', syncIfShared);
      clearInterval(timer);
      appState.remove();
      unsubscribe();
      engine.stop();
    };
  }, []);
}
