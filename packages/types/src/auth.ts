import { z } from 'zod';

export const SexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof SexSchema>;

export const RegisterInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1).max(100).trim(),
  dateOfBirth: z.coerce.date(),
  weightKg: z.number().positive().max(500),
  heightCm: z.number().positive().max(300),
  sex: SexSchema,
});

export const LoginInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const JWTPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export const RefreshInputSchema = z.object({
  refreshToken: z.string(),
});

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  dateOfBirth: z.coerce.date(),
  weightKg: z.number(),
  heightCm: z.number(),
  sex: SexSchema,
  role: z.enum(['user', 'admin']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
export type RefreshInput = z.infer<typeof RefreshInputSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
