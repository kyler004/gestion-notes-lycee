import { execFile } from 'node:child_process';
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

type ReportPayloadWithSchool = {
  school: {
    logoBase64DataUri: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export class TypstPdfRenderer implements PdfRenderer {
  private readonly typstBin: string;
  private readonly templatesDir: string;

  constructor(typstBin = 'typst', templatesDir = defaultTemplatesDir) {
    this.typstBin = typstBin;
    this.templatesDir = templatesDir;
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

  private async renderTemplate(
    templateFileName: string,
    payload: ReportPayloadWithSchool,
  ): Promise<Buffer> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lycee-pdf-'));

    try {
      const srcTemplatePath = path.join(this.templatesDir, templateFileName);
      const tempTemplatePath = path.join(tempDir, templateFileName);
      const dataJsonPath = path.join(tempDir, 'data.json');
      const outPdfPath = path.join(tempDir, 'output.pdf');

      await copyFile(srcTemplatePath, tempTemplatePath);

      let logoFile: string | null = null;
      const parsedLogo = parseImageDataUri(payload.school.logoBase64DataUri);
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
