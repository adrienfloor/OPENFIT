import { apiClient } from './api';

export type SyncItemType = 'workout_log' | 'run_session' | 'health_data';

export interface SyncItem {
  id: string;
  type: SyncItemType;
  payload: unknown;
  createdAt: Date;
  retries: number;
}

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

// In-memory queue backed by expo-sqlite when available
let queue: SyncItem[] = [];
let db: Awaited<ReturnType<typeof initDb>> | null = null;

async function initDb() {
  try {
    const SQLite = await import('expo-sqlite');
    const database = await SQLite.openDatabaseAsync('openfit_sync');
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retries INTEGER DEFAULT 0
      );
    `);
    return database;
  } catch {
    return null;
  }
}

async function getDb() {
  if (!db) {
    db = await initDb();
  }
  return db;
}

export async function addToSyncQueue(item: Omit<SyncItem, 'retries'>): Promise<void> {
  const syncItem: SyncItem = { ...item, retries: 0 };
  queue.push(syncItem);

  const database = await getDb();
  if (database) {
    await database.runAsync(
      'INSERT OR REPLACE INTO sync_queue (id, type, payload, created_at, retries) VALUES (?, ?, ?, ?, ?)',
      [syncItem.id, syncItem.type, JSON.stringify(syncItem.payload), syncItem.createdAt.toISOString(), 0],
    );
  }
}

export async function loadSyncQueue(): Promise<SyncItem[]> {
  const database = await getDb();
  if (!database) return queue;

  const rows = await database.getAllAsync<{
    id: string;
    type: string;
    payload: string;
    created_at: string;
    retries: number;
  }>('SELECT * FROM sync_queue ORDER BY created_at ASC');

  queue = rows.map((row) => ({
    id: row.id,
    type: row.type as SyncItemType,
    payload: JSON.parse(row.payload),
    createdAt: new Date(row.created_at),
    retries: row.retries,
  }));

  return queue;
}

export async function flushSyncQueue(items?: SyncItem[]): Promise<{ synced: string[]; failed: string[] }> {
  const toSync = items ?? await loadSyncQueue();
  const synced: string[] = [];
  const failed: string[] = [];

  for (const item of toSync) {
    if (item.retries >= MAX_RETRIES) {
      failed.push(item.id);
      continue;
    }

    try {
      const endpoint =
        item.type === 'workout_log'
          ? '/workouts/logs'
          : item.type === 'run_session'
            ? '/runs'
            : '/health';

      await apiClient.post(endpoint, item.payload);
      synced.push(item.id);

      // Remove from SQLite
      const database = await getDb();
      if (database) {
        await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      }
    } catch {
      failed.push(item.id);

      // Increment retry count with backoff
      item.retries += 1;
      const database = await getDb();
      if (database) {
        await database.runAsync('UPDATE sync_queue SET retries = ? WHERE id = ?', [item.retries, item.id]);
      }
    }
  }

  // Remove synced items from in-memory queue
  queue = queue.filter((item) => !synced.includes(item.id));

  return { synced, failed };
}

export async function getSyncQueueSize(): Promise<number> {
  const database = await getDb();
  if (!database) return queue.length;

  const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue');
  return result?.count ?? 0;
}

export async function clearSyncQueue(): Promise<void> {
  queue = [];
  const database = await getDb();
  if (database) {
    await database.execAsync('DELETE FROM sync_queue');
  }
}
