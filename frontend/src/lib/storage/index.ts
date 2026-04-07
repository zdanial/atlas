import type { StorageAdapter } from './adapter';
import { IndexedDBAdapter } from './indexeddb';

type DeploymentMode = 'local-browser' | 'local-server' | 'supabase';

function detectMode(): DeploymentMode {
  if (typeof window === 'undefined') return 'local-browser';
  if (import.meta.env.PUBLIC_SUPABASE_URL) return 'supabase';
  if (import.meta.env.PUBLIC_API_URL) return 'local-server';
  return 'local-browser';
}

export function createStorage(): StorageAdapter {
  const mode = detectMode();
  switch (mode) {
    case 'local-browser':
      return new IndexedDBAdapter();
    case 'local-server':
    case 'supabase':
      // TODO: Implement ApiAdapter and SupabaseAdapter
      return new IndexedDBAdapter();
  }
}

export type { StorageAdapter } from './adapter';
