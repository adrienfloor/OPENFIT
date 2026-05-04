import type { InsightFocus, InsightOutput } from '@openfit/types';
import { apiClient } from './api';

export type { InsightFocus, InsightOutput, InsightWindow } from '@openfit/types';

export async function getTodayInsight(focus: InsightFocus = 'general'): Promise<InsightOutput> {
  const res = await apiClient.get<InsightOutput>('/insights/today', {
    params: { focus },
  });
  return res.data;
}
