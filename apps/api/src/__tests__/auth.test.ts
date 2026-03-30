import { describe, it, expect, vi } from 'vitest';
import { AuthService, AuthError } from '../services/auth.service.js';
import type { RegisterInput } from '@openfit/types';

// Mock PrismaClient
const mockUser = {
  id: 'user_01',
  email: 'test@example.com',
  passwordHash: '',
  name: 'Test User',
  dateOfBirth: new Date('1990-01-01'),
  weightKg: 75,
  role: 'user' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRefreshToken = {
  id: 'rt_01',
  hashedToken: '',
  userId: 'user_01',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  user: mockUser,
};

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function createSignToken() {
  return vi.fn(() => 'mock.access.token');
}

describe('AuthService.register', () => {
  it('creates a user and returns tokens', async () => {
    const prisma = createMockPrisma();
    const signToken = createSignToken();
    const service = new AuthService(prisma as never, signToken);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(mockUser);
    prisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

    const input: RegisterInput = {
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
      dateOfBirth: new Date('1990-01-01'),
      weightKg: 75,
    };

    const result = await service.register(input);

    expect(result.accessToken).toBe('mock.access.token');
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe('test@example.com');
    expect(prisma.user.create).toHaveBeenCalledOnce();
    // Ensure password hash is never returned
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('throws 409 if email already exists', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.user.findUnique.mockResolvedValue(mockUser);

    const input: RegisterInput = {
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
      dateOfBirth: new Date('1990-01-01'),
      weightKg: 75,
    };

    await expect(service.register(input)).rejects.toThrow(AuthError);
    await expect(service.register(input)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('AuthService.login', () => {
  it('returns tokens for valid credentials', async () => {
    const prisma = createMockPrisma();
    const signToken = createSignToken();
    const service = new AuthService(prisma as never, signToken);

    // bcrypt hash of 'Password123' with 12 rounds
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Password123', 12);
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
    prisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

    const result = await service.login({ email: 'test@example.com', password: 'Password123' });

    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe('test@example.com');
  });

  it('throws 401 for wrong password', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Password123', 12);
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

    await expect(service.login({ email: 'test@example.com', password: 'WrongPassword1' })).rejects.toThrow(AuthError);
    await expect(service.login({ email: 'test@example.com', password: 'WrongPassword1' })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for non-existent email (timing-safe)', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.user.findUnique.mockResolvedValue(null);

    // Should still run bcrypt (timing protection) and throw 401
    await expect(service.login({ email: 'nobody@example.com', password: 'Password123' })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('AuthService.refresh', () => {
  it('rotates refresh token and returns new pair', async () => {
    const prisma = createMockPrisma();
    const signToken = createSignToken();
    const service = new AuthService(prisma as never, signToken);

    const rawToken = 'a'.repeat(96); // 48 bytes as hex
    const crypto = await import('node:crypto');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    prisma.refreshToken.findUnique.mockResolvedValue({
      ...mockRefreshToken,
      hashedToken,
    });
    prisma.refreshToken.delete.mockResolvedValue(mockRefreshToken);
    prisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

    const result = await service.refresh(rawToken);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // Token must be rotated — old token deleted, new one created
    expect(prisma.refreshToken.delete).toHaveBeenCalledOnce();
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
  });

  it('throws 401 for invalid token', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refresh('invalidtoken')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 and cleans up expired token', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    const rawToken = 'b'.repeat(96);
    prisma.refreshToken.findUnique.mockResolvedValue({
      ...mockRefreshToken,
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    prisma.refreshToken.delete.mockResolvedValue(mockRefreshToken);

    await expect(service.refresh(rawToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.refreshToken.delete).toHaveBeenCalledOnce();
  });
});

describe('AuthService.logout', () => {
  it('deletes refresh token', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.logout('sometoken')).resolves.toBeUndefined();
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledOnce();
  });

  it('is idempotent — does not throw if token does not exist', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.logout('nonexistenttoken')).resolves.toBeUndefined();
  });
});

describe('Multi-tenancy: accessing other user data', () => {
  it('getProfile throws 404 for unknown userId', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma as never, createSignToken());

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getProfile('other_user_id')).rejects.toMatchObject({ statusCode: 404 });
  });
});
