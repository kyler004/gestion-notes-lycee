import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type {
  BulletinReportPayload,
  ClassListReportPayload,
  HonorRollReportPayload,
} from '@lycee/shared';
import { AppError } from '../lib/errors.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultTemplatesDir(): string {
  const siblingTemplates = path.resolve(__dirname, '../templates');
  if (existsSync(path.join(siblingTemplates, 'bulletin.typ'))) {
    return siblingTemplates;
  }
  return path.resolve(__dirname, '../../src/templates');
}

export const defaultTemplatesDir = resolveDefaultTemplatesDir();

export interface PdfRenderer {
  renderBulletin(payload: BulletinReportPayload): Promise<Buffer>;
  renderClassList(payload: ClassListReportPayload): Promise<Buffer>;
  renderHonorRoll(payload: HonorRollReportPayload): Promise<Buffer>;
}

export interface TypstPdfRendererOptions {
  maxConcurrent?: number;
  maxQueue?: number;
  maxCacheEntries?: number;
}

interface ParsedImageDataUri {
  ext: string;
  buffer: Buffer;
}

function parseImageDataUri(dataUri: string | null | undefined): ParsedImageDataUri | null {
  if (!dataUri) return null;
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) return null;

  const mime = match[1]?.toLowerCase();
  const base64Body = match[2];
  if (!mime || !base64Body) return null;

  let ext = 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    ext = 'jpg';
  } else if (mime === 'image/png') {
    ext = 'png';
  } else if (mime === 'image/webp') {
    ext = 'webp';
  } else if (mime === 'image/svg+xml') {
    ext = 'svg';
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) return null;
  return { ext, buffer };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
}

type ReportPayloadWithSchool = {
  generatedAt?: string;
  period?: {
    isOfficial?: boolean;
    [key: string]: unknown;
  };
  school: {
    logoBase64DataUri: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export class TypstPdfRenderer implements PdfRenderer {
  private readonly typstBin: string;
  private readonly templatesDir: string;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly maxCacheEntries: number;
  private activeRenders = 0;
  private readonly waitQueue: Array<() => void> = [];
  private readonly officialCache = new Map<string, Buffer>();

  constructor(
    typstBin = 'typst',
    templatesDir = defaultTemplatesDir,
    opts: TypstPdfRendererOptions = {},
  ) {
    this.typstBin = typstBin;
    this.templatesDir = templatesDir;
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 2);
    this.maxQueue = Math.max(0, opts.maxQueue ?? 8);
    this.maxCacheEntries = Math.max(0, opts.maxCacheEntries ?? 20);
  }

  async renderBulletin(payload: BulletinReportPayload): Promise<Buffer> {
    return this.renderTemplate('bulletin.typ', payload as unknown as ReportPayloadWithSchool);
  }

  async renderClassList(payload: ClassListReportPayload): Promise<Buffer> {
    return this.renderTemplate('class-list.typ', payload as unknown as ReportPayloadWithSchool);
  }

  async renderHonorRoll(payload: HonorRollReportPayload): Promise<Buffer> {
    return this.renderTemplate('honor-roll.typ', payload as unknown as ReportPayloadWithSchool);
  }

  private buildOfficialCacheKey(
    templateFileName: string,
    payload: ReportPayloadWithSchool,
    parsedLogo: ParsedImageDataUri | null,
  ): string | null {
    if (payload.period?.isOfficial !== true || this.maxCacheEntries <= 0) {
      return null;
    }

    const logoBytesHash = parsedLogo
      ? createHash('sha256')
          .update(parsedLogo.ext)
          .update(':')
          .update(parsedLogo.buffer)
          .digest('hex')
      : 'no-logo';

    const { generatedAt: _ignoredGeneratedAt, ...restPayload } = payload;
    const deterministicPayload = {
      ...restPayload,
      school: {
        ...payload.school,
        logoBase64DataUri: null,
      },
    };

    return createHash('sha256')
      .update(templateFileName)
      .update(':')
      .update(logoBytesHash)
      .update(':')
      .update(canonicalStringify(deterministicPayload))
      .digest('hex');
  }

  private getCachedPdf(cacheKey: string): Buffer | null {
    const cached = this.officialCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    this.officialCache.delete(cacheKey);
    this.officialCache.set(cacheKey, cached);
    return cached;
  }

  private setCachedPdf(cacheKey: string, pdfBuffer: Buffer): void {
    if (this.maxCacheEntries <= 0) {
      return;
    }
    if (this.officialCache.has(cacheKey)) {
      this.officialCache.delete(cacheKey);
    } else if (this.officialCache.size >= this.maxCacheEntries) {
      const oldestKey = this.officialCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.officialCache.delete(oldestKey);
      }
    }
    this.officialCache.set(cacheKey, pdfBuffer);
  }

  private async acquireRenderSlot(): Promise<void> {
    if (this.activeRenders < this.maxConcurrent) {
      this.activeRenders += 1;
      return;
    }

    if (this.waitQueue.length >= this.maxQueue) {
      throw new AppError(
        503,
        'PDF_SERVICE_BUSY',
        'Le service de génération PDF est saturé. Veuillez réessayer dans quelques instants.',
      );
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private releaseRenderSlot(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
      return;
    }
    this.activeRenders = Math.max(0, this.activeRenders - 1);
  }

  private async renderTemplate(
    templateFileName: string,
    payload: ReportPayloadWithSchool,
  ): Promise<Buffer> {
    const parsedLogo = parseImageDataUri(payload.school.logoBase64DataUri);
    const cacheKey = this.buildOfficialCacheKey(templateFileName, payload, parsedLogo);
    if (cacheKey !== null) {
      const cached = this.getCachedPdf(cacheKey);
      if (cached) {
        return cached;
      }
    }

    await this.acquireRenderSlot();
    try {
      const pdfBuffer = await this.compileTemplate(templateFileName, payload, parsedLogo);
      if (cacheKey !== null) {
        this.setCachedPdf(cacheKey, pdfBuffer);
      }
      return pdfBuffer;
    } finally {
      this.releaseRenderSlot();
    }
  }

  private async compileTemplate(
    templateFileName: string,
    payload: ReportPayloadWithSchool,
    parsedLogo: ParsedImageDataUri | null,
  ): Promise<Buffer> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lycee-pdf-'));

    try {
      const srcTemplatePath = path.join(this.templatesDir, templateFileName);
      const tempTemplatePath = path.join(tempDir, templateFileName);
      const dataJsonPath = path.join(tempDir, 'data.json');
      const outPdfPath = path.join(tempDir, 'output.pdf');

      await copyFile(srcTemplatePath, tempTemplatePath);

      let logoFile: string | null = null;
      if (parsedLogo) {
        logoFile = `logo.${parsedLogo.ext}`;
        await writeFile(path.join(tempDir, logoFile), parsedLogo.buffer);
      }

      const templateData = {
        ...payload,
        school: {
          ...payload.school,
          logoBase64DataUri: null,
        },
        logoFile,
      };

      await writeFile(dataJsonPath, JSON.stringify(templateData), 'utf8');

      await execFileAsync(
        this.typstBin,
        ['compile', '--root', tempDir, tempTemplatePath, outPdfPath],
        {
          cwd: tempDir,
          timeout: 20000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      return await readFile(outPdfPath);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      const detail = err.stderr?.trim() || err.message || 'Erreur inconnue';
      throw new AppError(
        500,
        'PDF_GENERATION_FAILED',
        `Échec de la génération PDF (${templateFileName}) : ${detail}`,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
