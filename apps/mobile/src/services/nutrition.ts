import type {
  ConfirmFoodLogInput,
  FoodAnalysis,
  FoodLog,
  MacroTargets,
  UpdateFoodLogInput,
} from '@openfit/types';
import { apiClient } from './api';

export interface AnalyzeUploadInput {
  imageBase64: string;
  mimeType: string;
}

export async function analyzeFoodPhoto(
  input: AnalyzeUploadInput,
): Promise<FoodAnalysis> {
  const res = await apiClient.post<FoodAnalysis>('/nutrition/analyze', input, {
    // Photos can be a few MB even after compression — bump axios's default
    // upload timeout to allow for slower networks.
    timeout: 60_000,
  });
  return res.data;
}

export async function confirmFoodLog(
  input: ConfirmFoodLogInput,
): Promise<FoodLog> {
  const res = await apiClient.post<FoodLog>('/nutrition/logs', input);
  return res.data;
}

export async function listFoodLogs(range?: {
  from?: Date;
  to?: Date;
}): Promise<FoodLog[]> {
  const params: Record<string, string> = {};
  if (range?.from) params['from'] = range.from.toISOString();
  if (range?.to) params['to'] = range.to.toISOString();
  const res = await apiClient.get<FoodLog[]>('/nutrition/logs', { params });
  return res.data;
}

export async function getFoodLog(id: string): Promise<FoodLog> {
  const res = await apiClient.get<FoodLog>(`/nutrition/logs/${id}`);
  return res.data;
}

export async function updateFoodLog(
  id: string,
  input: UpdateFoodLogInput,
): Promise<FoodLog> {
  const res = await apiClient.patch<FoodLog>(`/nutrition/logs/${id}`, input);
  return res.data;
}

export async function deleteFoodLog(id: string): Promise<void> {
  await apiClient.delete(`/nutrition/logs/${id}`);
}

export async function getMacroTargets(): Promise<MacroTargets | null> {
  const res = await apiClient.get<{ targets: MacroTargets | null }>(
    '/nutrition/targets',
  );
  return res.data.targets;
}

export async function setMacroTargets(
  targets: MacroTargets,
): Promise<MacroTargets> {
  const res = await apiClient.put<{ targets: MacroTargets }>(
    '/nutrition/targets',
    targets,
  );
  return res.data.targets;
}
