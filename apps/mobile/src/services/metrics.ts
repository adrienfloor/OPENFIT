import type { FitnessAgeResult } from '@openfit/fitness-core';
import { apiClient } from './api';

export interface FitnessAgeResponse extends FitnessAgeResult {
  chronoAge: number;
  vo2max: number | null;
  popVo2max: number;
  vo2maxSampleCount: number;
}

export async function getFitnessAge(): Promise<FitnessAgeResponse> {
  const res = await apiClient.get<FitnessAgeResponse>('/metrics/fitness-age');
  return res.data;
}
