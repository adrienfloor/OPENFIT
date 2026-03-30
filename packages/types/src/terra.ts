import { z } from 'zod';

export const TerraConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  terraUserId: z.string(),
  provider: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const TerraAuthTokenResponseSchema = z.object({
  token: z.string(),
  userId: z.string(),
  expiresAt: z.coerce.date(),
});

export type TerraConnection = z.infer<typeof TerraConnectionSchema>;
export type TerraAuthTokenResponse = z.infer<typeof TerraAuthTokenResponseSchema>;
