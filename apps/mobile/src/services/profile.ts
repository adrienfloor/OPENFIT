import type { UpdateUserInput, UserProfile } from '@openfit/types';
import { apiClient } from './api';

interface RawUserProfile extends Omit<UserProfile, 'dateOfBirth' | 'createdAt' | 'updatedAt'> {
  dateOfBirth: string;
  createdAt: string;
  updatedAt: string;
}

function hydrate(raw: RawUserProfile): UserProfile {
  return {
    ...raw,
    dateOfBirth: new Date(raw.dateOfBirth),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

/**
 * PATCH /auth/me — update name, DOB, weight, height, and/or sex.
 * Returns the fresh user profile so the caller can update the cached
 * auth store without a follow-up GET.
 */
export async function updateProfile(input: UpdateUserInput): Promise<UserProfile> {
  const res = await apiClient.patch<RawUserProfile>('/auth/me', input);
  return hydrate(res.data);
}
