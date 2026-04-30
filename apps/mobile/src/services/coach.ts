import type {
  CoachAdjustmentContext,
  CoachAdjustmentResult,
  CoachingProfile,
  GeneratedProgram,
} from '@openfit/types';
import { apiClient } from './api';

export async function getCoachingProfile(): Promise<CoachingProfile | null> {
  const res = await apiClient.get<{ profile: CoachingProfile | null }>('/coach/profile');
  return res.data.profile;
}

export async function saveCoachingProfile(profile: CoachingProfile): Promise<CoachingProfile> {
  const res = await apiClient.put<{ profile: CoachingProfile }>('/coach/profile', profile);
  return res.data.profile;
}

export interface GenerateProgramResponse {
  programId: string;
  generated: GeneratedProgram;
}

export async function generateProgram(profile: CoachingProfile): Promise<GenerateProgramResponse> {
  const res = await apiClient.post<GenerateProgramResponse>(
    '/coach/generate-program',
    { profile },
  );
  return res.data;
}

export interface AdjustSessionInput {
  programId: string;
  weekNumber: number;
  sessionIndex: number;
  context: CoachAdjustmentContext;
}

export async function adjustSession(
  input: AdjustSessionInput,
): Promise<CoachAdjustmentResult> {
  const res = await apiClient.post<CoachAdjustmentResult>('/coach/adjust-session', input);
  return res.data;
}
