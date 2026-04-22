import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RegisterInput, LoginInput, AuthTokens, JWTPayload, UserProfile } from '@openfit/types';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48; // 384-bit token before hashing

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly signToken: (payload: JWTPayload) => string,
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens & { user: UserProfile }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new AuthError('Email already in use', 409);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        dateOfBirth: input.dateOfBirth,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
        sex: input.sex,
        role: 'user',
      },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role as 'user' | 'admin');

    return {
      ...tokens,
      user: this.toUserProfile(user),
    };
  }

  async login(input: LoginInput): Promise<AuthTokens & { user: UserProfile }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    // Use constant-time comparison to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingprotection00000000000000000000';
    const passwordHash = user?.passwordHash ?? dummyHash;

    const valid = await bcrypt.compare(input.password, passwordHash);

    if (!user || !valid) {
      throw new AuthError('Invalid email or password', 401);
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role as 'user' | 'admin');

    return {
      ...tokens,
      user: this.toUserProfile(user),
    };
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const hashedToken = this.hashToken(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { hashedToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new AuthError('Invalid refresh token', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new AuthError('Refresh token expired', 401);
    }

    // Rotation: delete old token and issue a new pair atomically
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    return this.issueTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role as 'user' | 'admin',
    );
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const hashedToken = this.hashToken(rawRefreshToken);

    // Silently ignore if token doesn't exist — idempotent logout
    await this.prisma.refreshToken.deleteMany({ where: { hashedToken } });
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AuthError('User not found', 404);
    }

    return this.toUserProfile(user);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: 'user' | 'admin',
  ): Promise<AuthTokens> {
    const payload: JWTPayload = { sub: userId, email, role };
    const accessToken = this.signToken(payload);

    const rawRefreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const hashedToken = this.hashToken(rawRefreshToken);

    const expiresIn = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d';
    const expiresAt = this.parseExpiresIn(expiresIn);

    await this.prisma.refreshToken.create({
      data: {
        hashedToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiresIn(expiresIn: string): Date {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) throw new Error(`Invalid expiresIn format: ${expiresIn}`);

    const amount = match[1] as string;
    const unit = match[2] as string;
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const multiplier = multipliers[unit];
    if (multiplier === undefined) throw new Error(`Unknown time unit: ${unit}`);

    return new Date(now + Number(amount) * multiplier);
  }

  private toUserProfile(user: {
    id: string;
    email: string;
    name: string;
    dateOfBirth: Date;
    weightKg: number;
    heightCm: number;
    sex: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      dateOfBirth: user.dateOfBirth,
      weightKg: user.weightKg,
      heightCm: user.heightCm,
      sex: user.sex as 'male' | 'female',
      role: user.role as 'user' | 'admin',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
