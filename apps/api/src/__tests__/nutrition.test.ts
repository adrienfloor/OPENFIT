import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  NutritionService,
  NutritionError,
} from '../services/nutrition.service.js';

// 1×1 transparent PNG, base64-encoded.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfit-nutrition-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createMockPrisma() {
  return {
    user: { findUnique: vi.fn(), update: vi.fn() },
    foodAnalysis: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    foodLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function createMockAnthropic(toolInput: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'submit_food_analysis',
            input: toolInput,
          },
        ],
        usage: { input_tokens: 1000, output_tokens: 200 },
      }),
    },
  };
}

const goodVisionOutput = {
  items: [
    {
      name: 'grilled chicken breast',
      portionGrams: 150,
      kcal: 248,
      proteinG: 46,
      carbsG: 0,
      fatG: 5.4,
      confidence: 0.85,
    },
    {
      name: 'white rice',
      portionGrams: 200,
      kcal: 260,
      proteinG: 5,
      carbsG: 56,
      fatG: 0.5,
      confidence: 0.9,
    },
  ],
  notes: 'Lighting was good; portion guesses are tight.',
};

// ──────────────────────────────────────────────────────────────────────────
// analyzePhoto
// ──────────────────────────────────────────────────────────────────────────

describe('NutritionService.analyzePhoto', () => {
  it('rejects unsupported mime types', async () => {
    const prisma = createMockPrisma();
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });

    await expect(
      service.analyzePhoto('user_01', {
        imageBase64: TINY_PNG_BASE64,
        mimeType: 'image/gif',
      }),
    ).rejects.toThrowError(NutritionError);
  });

  it('rejects empty images', async () => {
    const prisma = createMockPrisma();
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });

    await expect(
      service.analyzePhoto('user_01', {
        imageBase64: '',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrowError(/empty/i);
  });

  it('saves photo to disk, calls vision, persists analysis', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.create.mockResolvedValue({
      id: 'an_01',
      userId: 'user_01',
      photoUrl: '/nutrition/photos/user_01/abc.png',
      items: { items: goodVisionOutput.items, notes: goodVisionOutput.notes },
      totals: { kcal: 508, proteinG: 51, carbsG: 56, fatG: 5.9 },
      model: 'claude-sonnet-4-6',
      notes: goodVisionOutput.notes,
      createdAt: new Date(),
      foodLogId: null,
    });
    const anthropic = createMockAnthropic(goodVisionOutput);

    const service = new NutritionService({
      prisma: prisma as never,
      anthropic,
      uploadsDir: tmpDir,
    });

    const analysis = await service.analyzePhoto('user_01', {
      imageBase64: TINY_PNG_BASE64,
      mimeType: 'image/png',
    });

    expect(anthropic.messages.create).toHaveBeenCalledOnce();
    expect(prisma.foodAnalysis.create).toHaveBeenCalledOnce();

    const userDir = path.join(tmpDir, 'user_01');
    const files = await fs.readdir(userDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.png$/);

    expect(analysis.items).toHaveLength(2);
    expect(analysis.totals.kcal).toBe(508);
    expect(analysis.foodLogId).toBeNull();
  });

  it('strips data-URL prefix from imageBase64 before decoding', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.create.mockResolvedValue({
      id: 'an_02',
      userId: 'user_01',
      photoUrl: '/x',
      items: { items: [] },
      totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      model: 'claude-sonnet-4-6',
      notes: null,
      createdAt: new Date(),
      foodLogId: null,
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await service.analyzePhoto('user_01', {
      imageBase64: `data:image/jpeg;base64,${TINY_PNG_BASE64}`,
      mimeType: 'image/jpeg',
    });
    const userDir = path.join(tmpDir, 'user_01');
    const files = await fs.readdir(userDir);
    const stat = await fs.stat(path.join(userDir, files[0]!));
    // Decoded byte length must match the raw base64 length, not the
    // length of the data-URL string.
    const expectedLength = Buffer.from(TINY_PNG_BASE64, 'base64').length;
    expect(stat.size).toBe(expectedLength);
  });

  it('retries once on Zod validation failure, then succeeds', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.create.mockResolvedValue({
      id: 'an_03',
      userId: 'user_01',
      photoUrl: '/x',
      items: { items: goodVisionOutput.items },
      totals: { kcal: 508, proteinG: 51, carbsG: 56, fatG: 5.9 },
      model: 'claude-sonnet-4-6',
      notes: null,
      createdAt: new Date(),
      foodLogId: null,
    });
    const anthropic = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_bad',
                name: 'submit_food_analysis',
                input: { items: 'not an array' },
              },
            ],
            usage: { input_tokens: 1000, output_tokens: 50 },
          })
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_good',
                name: 'submit_food_analysis',
                input: goodVisionOutput,
              },
            ],
            usage: { input_tokens: 1100, output_tokens: 200 },
          }),
      },
    };
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic,
      uploadsDir: tmpDir,
    });
    const analysis = await service.analyzePhoto('user_01', {
      imageBase64: TINY_PNG_BASE64,
      mimeType: 'image/png',
    });
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
    expect(analysis.items).toHaveLength(2);
  });

  it('throws after a second validation failure', async () => {
    const prisma = createMockPrisma();
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bad',
              name: 'submit_food_analysis',
              input: { items: 'still bad' },
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 50 },
        }),
      },
    };
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic,
      uploadsDir: tmpDir,
    });
    await expect(
      service.analyzePhoto('user_01', {
        imageBase64: TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    ).rejects.toThrowError(NutritionError);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// readPhoto — multi-tenancy + path traversal
// ──────────────────────────────────────────────────────────────────────────

describe('NutritionService.readPhoto', () => {
  it('blocks cross-user access', async () => {
    const service = new NutritionService({
      prisma: createMockPrisma() as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await expect(
      service.readPhoto('user_01', 'user_02', 'a.jpg'),
    ).rejects.toThrowError(/Forbidden/);
  });

  it('rejects path-traversal filenames', async () => {
    const service = new NutritionService({
      prisma: createMockPrisma() as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await expect(
      service.readPhoto('user_01', 'user_01', '../../etc/passwd'),
    ).rejects.toThrowError(/Invalid filename/);
  });

  it('returns the file when ownership and filename are valid', async () => {
    const dir = path.join(tmpDir, 'user_01');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'photo.png'), Buffer.from([0x89, 0x50]));
    const service = new NutritionService({
      prisma: createMockPrisma() as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    const result = await service.readPhoto('user_01', 'user_01', 'photo.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.buffer.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// confirmAnalysis — links analysis → log + multi-tenancy
// ──────────────────────────────────────────────────────────────────────────

describe('NutritionService.confirmAnalysis', () => {
  it('creates a FoodLog from a confirmed analysis and links them', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.findUnique.mockResolvedValue({
      id: 'an_01',
      userId: 'user_01',
      foodLogId: null,
    });
    prisma.foodLog.create.mockResolvedValue({
      id: 'log_01',
      userId: 'user_01',
      photoUrl: '/p',
      items: goodVisionOutput.items,
      totals: { kcal: 508, proteinG: 51, carbsG: 56, fatG: 5.9 },
      mealType: 'lunch',
      loggedAt: new Date('2026-05-01T12:00:00Z'),
      createdAt: new Date(),
    });
    prisma.foodAnalysis.update.mockResolvedValue({});

    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });

    const log = await service.confirmAnalysis('user_01', {
      analysisId: 'an_01',
      photoUrl: '/p',
      items: goodVisionOutput.items,
      mealType: 'lunch',
      loggedAt: new Date('2026-05-01T12:00:00Z'),
    });

    expect(log.id).toBe('log_01');
    expect(prisma.foodAnalysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'an_01' },
        data: { foodLogId: 'log_01' },
      }),
    );
  });

  it('rejects confirmation of another user\'s analysis', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.findUnique.mockResolvedValue({
      id: 'an_other',
      userId: 'user_other',
      foodLogId: null,
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });
    await expect(
      service.confirmAnalysis('user_01', {
        analysisId: 'an_other',
        photoUrl: null,
        items: goodVisionOutput.items,
      }),
    ).rejects.toThrowError(/not found/i);
  });

  it('rejects double-confirmation of an already-linked analysis', async () => {
    const prisma = createMockPrisma();
    prisma.foodAnalysis.findUnique.mockResolvedValue({
      id: 'an_01',
      userId: 'user_01',
      foodLogId: 'log_existing',
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });
    await expect(
      service.confirmAnalysis('user_01', {
        analysisId: 'an_01',
        photoUrl: null,
        items: goodVisionOutput.items,
      }),
    ).rejects.toThrowError(/already linked/i);
  });

  it('allows a fully-manual log (analysisId = null)', async () => {
    const prisma = createMockPrisma();
    prisma.foodLog.create.mockResolvedValue({
      id: 'log_manual',
      userId: 'user_01',
      photoUrl: null,
      items: goodVisionOutput.items,
      totals: { kcal: 508, proteinG: 51, carbsG: 56, fatG: 5.9 },
      mealType: null,
      loggedAt: new Date(),
      createdAt: new Date(),
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });
    const log = await service.confirmAnalysis('user_01', {
      analysisId: null,
      photoUrl: null,
      items: goodVisionOutput.items,
    });
    expect(log.id).toBe('log_manual');
    expect(prisma.foodAnalysis.update).not.toHaveBeenCalled();
  });

  it('recomputes totals from items so the client cannot send a wrong sum', async () => {
    const prisma = createMockPrisma();
    let capturedTotals: unknown;
    prisma.foodLog.create.mockImplementation(({ data }: { data: { totals: unknown } }) => {
      capturedTotals = data.totals;
      return Promise.resolve({
        id: 'log_x',
        userId: 'user_01',
        photoUrl: null,
        items: goodVisionOutput.items,
        totals: data.totals,
        mealType: null,
        loggedAt: new Date(),
        createdAt: new Date(),
      });
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic(goodVisionOutput),
      uploadsDir: tmpDir,
    });
    await service.confirmAnalysis('user_01', {
      analysisId: null,
      photoUrl: null,
      items: goodVisionOutput.items,
    });
    expect(capturedTotals).toEqual({
      kcal: 508,
      proteinG: 51,
      carbsG: 56,
      fatG: 5.9,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CRUD multi-tenancy guards
// ──────────────────────────────────────────────────────────────────────────

describe('NutritionService log CRUD multi-tenancy', () => {
  it('getLog refuses access to another user\'s log', async () => {
    const prisma = createMockPrisma();
    prisma.foodLog.findUnique.mockResolvedValue({
      id: 'log_x',
      userId: 'user_other',
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await expect(service.getLog('user_01', 'log_x')).rejects.toThrowError(/not found/i);
  });

  it('updateLog recomputes totals when items change', async () => {
    const prisma = createMockPrisma();
    prisma.foodLog.findUnique.mockResolvedValue({
      id: 'log_x',
      userId: 'user_01',
    });
    let captured: { items?: unknown; totals?: unknown } = {};
    prisma.foodLog.update.mockImplementation((args: { data: typeof captured }) => {
      captured = args.data;
      return Promise.resolve({
        id: 'log_x',
        userId: 'user_01',
        photoUrl: null,
        items: goodVisionOutput.items,
        totals: { kcal: 508, proteinG: 51, carbsG: 56, fatG: 5.9 },
        mealType: null,
        loggedAt: new Date(),
        createdAt: new Date(),
      });
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await service.updateLog('user_01', 'log_x', {
      items: goodVisionOutput.items,
    });
    expect(captured.totals).toEqual({
      kcal: 508,
      proteinG: 51,
      carbsG: 56,
      fatG: 5.9,
    });
  });

  it('deleteLog refuses cross-tenant deletion', async () => {
    const prisma = createMockPrisma();
    prisma.foodLog.findUnique.mockResolvedValue({
      id: 'log_x',
      userId: 'user_other',
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await expect(service.deleteLog('user_01', 'log_x')).rejects.toThrowError(/not found/i);
    expect(prisma.foodLog.delete).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Macro targets
// ──────────────────────────────────────────────────────────────────────────

describe('NutritionService macro targets', () => {
  it('returns null when no targets are stored', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({ macroTargets: null });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    expect(await service.getMacroTargets('user_01')).toBeNull();
  });

  it('returns parsed targets when valid', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      macroTargets: { kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 },
    });
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    const targets = await service.getMacroTargets('user_01');
    expect(targets).toEqual({ kcal: 2400, proteinG: 180, carbsG: 240, fatG: 80 });
  });

  it('persists new targets', async () => {
    const prisma = createMockPrisma();
    prisma.user.update.mockResolvedValue({});
    const service = new NutritionService({
      prisma: prisma as never,
      anthropic: createMockAnthropic({ items: [] }),
      uploadsDir: tmpDir,
    });
    await service.setMacroTargets('user_01', {
      kcal: 2200,
      proteinG: 165,
      carbsG: 220,
      fatG: 73,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_01' },
        data: { macroTargets: { kcal: 2200, proteinG: 165, carbsG: 220, fatG: 73 } },
      }),
    );
  });
});
