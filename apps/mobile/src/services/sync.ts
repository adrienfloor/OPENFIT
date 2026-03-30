import { apiClient } from './api';

export interface SyncItem {
  id: string;
  type: 'workout_log' | 'run_session' | 'health_data';
  payload: unknown;
  createdAt: Date;
  retries: number;
}

export async function flushSyncQueue(items: SyncItem[]): Promise<{ synced: string[]; failed: string[] }> {
  const synced: string[] = [];
  const failed: string[] = [];

  for (const item of items) {
    try {
      const endpoint =
        item.type === 'workout_log' ? '/workouts/logs'
          : item.type === 'run_session' ? '/runs'
          : '/health';

      await apiClient.post(endpoint, item.payload);
      synced.push(item.id);
    } catch {
      failed.push(item.id);
    }
  }

  return { synced, failed };
}
