import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import {
  ConfirmFoodLogInputSchema,
  FoodItemSchema,
  MacroTargetsSchema,
  UpdateFoodLogInputSchema,
  VisionAnalysisOutputSchema,
  type ConfirmFoodLogInput,
  type FoodAnalysis,
  type FoodItem,
  type FoodLog,
  type MacroTargets,
  type MacroTotals,
  type MealType,
  type UpdateFoodLogInput,
  type VisionAnalysisOutput,
} from '@openfit/types';
import { sumItems } from '@openfit/fitness-core';

export class NutritionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'NutritionError';
  }
}

export const NUTRITION_MODEL = 'claude-sonnet-4-6';

/**
 * Anthropic SDK shape needed by NutritionService — narrowed so tests can
 * pass a lightweight mock instead of the full SDK.
 */
export interface AnthropicClient {
  messages: {
    create: (params: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message>;
  };
}

export interface NutritionLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface NutritionServiceDeps {
  prisma: PrismaClient;
  anthropic: AnthropicClient;
  /** Override for tests / cost control. Default `claude-sonnet-4-6`. */
  model?: string;
  /**
   * Filesystem root for uploaded photos. Defaults to `apps/api/uploads`.
   * Tests pass an isolated temp directory.
   */
  uploadsDir?: string;
  logger?: NutritionLogger;
}

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export interface AnalyzeInput {
  imageBase64: string;
  mimeType: string;
}

export class NutritionService {
  private readonly prisma: PrismaClient;
  private readonly anthropic: AnthropicClient;
  private readonly model: string;
  private readonly uploadsDir: string;
  private readonly logger: NutritionLogger;

  constructor(deps: NutritionServiceDeps) {
    this.prisma = deps.prisma;
    this.anthropic = deps.anthropic;
    this.model = deps.model ?? NUTRITION_MODEL;
    this.uploadsDir =
      deps.uploadsDir ?? path.resolve(process.cwd(), 'uploads');
    this.logger = deps.logger ?? console;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Photo analysis
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Decode + persist the photo, send it to Claude vision with a structured
   * output tool, and store the resulting FoodAnalysis row. Returns the
   * full analysis so the mobile UI can show it for confirmation.
   *
   * Mobile is expected to compress the image before upload (we don't do
   * server-side resizing); the API caps the body to a generous 6 MB to
   * accommodate uncompressed pictures from older devices.
   */
  async analyzePhoto(userId: string, input: AnalyzeInput): Promise<FoodAnalysis> {
    if (!isSupportedMime(input.mimeType)) {
      throw new NutritionError(
        `Unsupported image mime type: ${input.mimeType}`,
        400,
      );
    }
    const buffer = decodeBase64Image(input.imageBase64);
    if (buffer.length === 0) {
      throw new NutritionError('Image is empty', 400);
    }
    if (buffer.length > 6 * 1024 * 1024) {
      throw new NutritionError('Image too large (max 6 MB)', 413);
    }

    const photoUrl = await this.persistPhoto(userId, buffer, input.mimeType);

    let visionOutput: VisionAnalysisOutput;
    try {
      visionOutput = await this.callVision(input.imageBase64, input.mimeType);
    } catch (err) {
      // The photo is on disk and the analysis row never got created — that
      // is the desired state when vision fails (the mobile UI will surface
      // the error and the user can retry). No cleanup needed since the
      // upload directory is per-user and easy to GC if it ever grows.
      throw err;
    }

    const totals = sumItems(visionOutput.items);

    const created = await this.prisma.foodAnalysis.create({
      data: {
        userId,
        photoUrl,
        items: { items: visionOutput.items, notes: visionOutput.notes ?? null },
        totals: totals as unknown as object,
        model: this.model,
        notes: visionOutput.notes ?? null,
      },
    });

    return toFoodAnalysis(created);
  }

  /**
   * Persist (compressed-by-client) image bytes to disk under
   * `{uploadsDir}/{userId}/{cuid}.{ext}`. Returns the relative URL the
   * mobile app uses to fetch the photo back later.
   */
  private async persistPhoto(
    userId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = mimeToExt(mimeType);
    const dir = path.join(this.uploadsDir, userId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${cuidLite()}.${ext}`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buffer);

    // Stored as a server-relative URL so the mobile client can request it
    // via an authenticated GET. Ownership is enforced server-side from the
    // path segments, not from cuid unguessability.
    return `/nutrition/photos/${userId}/${filename}`;
  }

  /**
   * Stream a stored photo back to the user. Enforces that the userId in
   * the URL matches the authenticated user — preventing cross-tenant
   * access even if a URL leaks.
   */
  async readPhoto(
    userId: string,
    pathUserId: string,
    filename: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (userId !== pathUserId) {
      throw new NutritionError('Forbidden', 403);
    }
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      throw new NutritionError('Invalid filename', 400);
    }
    const filePath = path.join(this.uploadsDir, pathUserId, filename);
    try {
      const buffer = await fs.readFile(filePath);
      const mimeType = extToMime(path.extname(filename));
      return { buffer, mimeType };
    } catch {
      throw new NutritionError('Photo not found', 404);
    }
  }

  /**
   * Calls Claude vision with the structured-output tool-use trick. The
   * model fills in the tool input rather than writing prose, so we get
   * back a clean { items, notes? } object that we Zod-validate. One retry
   * on validation failure with the error fed back to the model.
   */
  private async callVision(
    imageBase64: string,
    mimeType: string,
  ): Promise<VisionAnalysisOutput> {
    const tool: Anthropic.Messages.Tool = {
      name: 'submit_food_analysis',
      description: 'Submit the structured nutrition analysis of the meal photo.',
      input_schema: VISION_TOOL_SCHEMA,
    };

    const initialContent: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType as SupportedMimeType,
          data: imageBase64,
        },
      },
      {
        type: 'text',
        text: VISION_USER_PROMPT,
      },
    ];

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: initialContent },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: VISION_SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'submit_food_analysis' },
        messages,
      });

      this.logger.info(
        {
          attempt,
          stopReason: response.stop_reason,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        },
        'Nutrition vision call complete',
      );

      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) {
        throw new NutritionError('Vision response missing tool call', 502);
      }

      const parsed = VisionAnalysisOutputSchema.safeParse(toolUse.input);
      if (parsed.success) return parsed.data;

      const flat = parsed.error.flatten();
      this.logger.warn(
        {
          attempt,
          stopReason: response.stop_reason,
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        },
        'Nutrition vision output failed Zod validation',
      );

      if (attempt === 0) {
        const issuesText = parsed.error.errors
          .map((e) => `- ${e.path.join('.')}: ${e.message}`)
          .join('\n');
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content:
                `The submitted analysis failed schema validation. Issues:\n${issuesText}\n\n` +
                `Please call submit_food_analysis again with corrected data. ` +
                `Make sure portionGrams/kcal/proteinG/carbsG/fatG are non-negative numbers.`,
            },
          ],
        });
        continue;
      }

      throw new NutritionError(
        `Vision returned invalid analysis after retry: ${JSON.stringify(flat)}`,
        422,
      );
    }

    throw new NutritionError('Vision call exhausted retries', 500);
  }

  // ──────────────────────────────────────────────────────────────────────
  // FoodLog CRUD
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Create a FoodLog from a confirmed analysis (or a fully-manual entry
   * when `analysisId === null`). Recomputes totals from the items so the
   * UI can't desync them.
   */
  async confirmAnalysis(
    userId: string,
    raw: unknown,
  ): Promise<FoodLog> {
    const parsed = ConfirmFoodLogInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new NutritionError(
        `Invalid confirmation: ${JSON.stringify(parsed.error.flatten())}`,
        400,
      );
    }
    const input: ConfirmFoodLogInput = parsed.data;

    if (input.analysisId !== null) {
      const analysis = await this.prisma.foodAnalysis.findUnique({
        where: { id: input.analysisId },
      });
      if (!analysis || analysis.userId !== userId) {
        throw new NutritionError('Analysis not found', 404);
      }
      if (analysis.foodLogId !== null) {
        throw new NutritionError(
          'Analysis already linked to a food log',
          409,
        );
      }
    }

    const totals = sumItems(input.items);
    const loggedAt = input.loggedAt ?? new Date();

    const log = await this.prisma.foodLog.create({
      data: {
        userId,
        photoUrl: input.photoUrl ?? null,
        items: input.items as unknown as object,
        totals: totals as unknown as object,
        mealType: input.mealType ?? null,
        loggedAt,
      },
    });

    if (input.analysisId !== null) {
      await this.prisma.foodAnalysis.update({
        where: { id: input.analysisId },
        data: { foodLogId: log.id },
      });
    }

    return toFoodLog(log);
  }

  async listLogs(
    userId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<FoodLog[]> {
    const where: { userId: string; loggedAt?: { gte?: Date; lte?: Date } } = {
      userId,
    };
    if (range?.from || range?.to) {
      where.loggedAt = {};
      if (range.from) where.loggedAt.gte = range.from;
      if (range.to) where.loggedAt.lte = range.to;
    }
    const logs = await this.prisma.foodLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
    });
    return logs.map(toFoodLog);
  }

  async getLog(userId: string, logId: string): Promise<FoodLog> {
    const log = await this.prisma.foodLog.findUnique({ where: { id: logId } });
    if (!log || log.userId !== userId) {
      throw new NutritionError('Log not found', 404);
    }
    return toFoodLog(log);
  }

  async updateLog(
    userId: string,
    logId: string,
    raw: unknown,
  ): Promise<FoodLog> {
    const parsed = UpdateFoodLogInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new NutritionError(
        `Invalid update: ${JSON.stringify(parsed.error.flatten())}`,
        400,
      );
    }
    const input: UpdateFoodLogInput = parsed.data;

    const existing = await this.prisma.foodLog.findUnique({ where: { id: logId } });
    if (!existing || existing.userId !== userId) {
      throw new NutritionError('Log not found', 404);
    }

    const data: Record<string, unknown> = {};
    if (input.items !== undefined) {
      data['items'] = input.items as unknown as object;
      data['totals'] = sumItems(input.items) as unknown as object;
    }
    if (input.mealType !== undefined) data['mealType'] = input.mealType;
    if (input.loggedAt !== undefined) data['loggedAt'] = input.loggedAt;

    const updated = await this.prisma.foodLog.update({
      where: { id: logId },
      data,
    });
    return toFoodLog(updated);
  }

  async deleteLog(userId: string, logId: string): Promise<void> {
    const existing = await this.prisma.foodLog.findUnique({ where: { id: logId } });
    if (!existing || existing.userId !== userId) {
      throw new NutritionError('Log not found', 404);
    }
    await this.prisma.foodLog.delete({ where: { id: logId } });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Macro targets
  // ──────────────────────────────────────────────────────────────────────

  async getMacroTargets(userId: string): Promise<MacroTargets | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { macroTargets: true },
    });
    if (!user?.macroTargets) return null;
    const parsed = MacroTargetsSchema.safeParse(user.macroTargets);
    return parsed.success ? parsed.data : null;
  }

  async setMacroTargets(
    userId: string,
    targets: MacroTargets,
  ): Promise<MacroTargets> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { macroTargets: targets as unknown as object },
    });
    return targets;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isSupportedMime(mime: string): mime is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

function decodeBase64Image(b64: string): Buffer {
  // Handle data-URL-prefixed input gracefully — strip the prefix if present.
  const stripped = b64.startsWith('data:') ? b64.split(',', 2)[1] ?? '' : b64;
  return Buffer.from(stripped, 'base64');
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function extToMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Compact filename token. We don't pull in @paralleldrive/cuid2 just for
 * filenames — Math.random + timestamp is unguessable enough for a path
 * that's already namespaced under {userId}/ and gated by ownership checks
 * on read.
 */
function cuidLite(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

interface PrismaFoodAnalysis {
  id: string;
  userId: string;
  photoUrl: string;
  items: unknown;
  totals: unknown;
  model: string;
  notes: string | null;
  createdAt: Date;
  foodLogId: string | null;
}

interface PrismaFoodLog {
  id: string;
  userId: string;
  photoUrl: string | null;
  items: unknown;
  totals: unknown;
  mealType: MealType | null;
  loggedAt: Date;
  createdAt: Date;
}

function toFoodAnalysis(row: PrismaFoodAnalysis): FoodAnalysis {
  const itemsValue = row.items as { items?: unknown } | null;
  const items = Array.isArray(itemsValue?.items)
    ? (itemsValue.items as unknown[]).flatMap((i) => {
        const p = FoodItemSchema.safeParse(i);
        return p.success ? [p.data] : [];
      })
    : [];
  return {
    id: row.id,
    userId: row.userId,
    photoUrl: row.photoUrl,
    items,
    totals: parseTotals(row.totals),
    model: row.model,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    foodLogId: row.foodLogId,
  };
}

function toFoodLog(row: PrismaFoodLog): FoodLog {
  const items = Array.isArray(row.items)
    ? (row.items as unknown[]).flatMap((i) => {
        const p = FoodItemSchema.safeParse(i);
        return p.success ? [p.data] : [];
      })
    : [];
  return {
    id: row.id,
    userId: row.userId,
    photoUrl: row.photoUrl,
    items: items as [FoodItem, ...FoodItem[]],
    totals: parseTotals(row.totals),
    mealType: row.mealType,
    loggedAt: row.loggedAt,
    analysisId: null, // populated by route handler if needed
    createdAt: row.createdAt,
  };
}

function parseTotals(raw: unknown): MacroTotals {
  const t = raw as Partial<MacroTotals> | null;
  return {
    kcal: typeof t?.kcal === 'number' ? t.kcal : 0,
    proteinG: typeof t?.proteinG === 'number' ? t.proteinG : 0,
    carbsG: typeof t?.carbsG === 'number' ? t.carbsG : 0,
    fatG: typeof t?.fatG === 'number' ? t.fatG : 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Vision prompt + JSON schema
// ──────────────────────────────────────────────────────────────────────────

const VISION_SYSTEM_PROMPT = `You are a careful nutrition coach analyzing photos of meals.

For each visible food item, estimate:
- portion in grams (most common source of error — be conservative when unsure)
- total kcal for that portion
- macros in grams: protein, carbs, fat

Use widely cited nutrition databases as your reference (USDA, food labels). Round
kcal to the nearest 5 and macros to the nearest 0.5 g. Set the confidence field
between 0 and 1 for each item; lower it when lighting, plating, or angle make
estimation hard.

If the photo doesn't show food at all, return an empty items array and explain
in the notes why. If the photo is blurry or partial, do your best on what's
visible and say so in the notes — don't refuse.`;

const VISION_USER_PROMPT = `Analyze the food in this photo and submit your structured analysis using the submit_food_analysis tool. List each item separately (don't merge "rice + chicken" into one row). Per-item macros are absolute for the estimated portion, not per-100g.`;

export const VISION_TOOL_SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 80 },
          portionGrams: { type: 'number', minimum: 0, maximum: 5000 },
          kcal: { type: 'number', minimum: 0, maximum: 5000 },
          proteinG: { type: 'number', minimum: 0, maximum: 500 },
          carbsG: { type: 'number', minimum: 0, maximum: 1000 },
          fatG: { type: 'number', minimum: 0, maximum: 500 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['name', 'portionGrams', 'kcal', 'proteinG', 'carbsG', 'fatG'],
      },
    },
    notes: { type: 'string', maxLength: 300 },
  },
  required: ['items'],
};
