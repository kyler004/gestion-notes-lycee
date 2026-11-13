import {
  UpdateSchoolProfileSchema,
  UploadSchoolLogoSchema,
  type SchoolProfileDto,
} from '@lycee/shared';
import { eq, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { schoolProfile } from '../db/schema.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';

export const SCHOOL_PROFILE_ROW_ID = 1;
export const MAX_SCHOOL_LOGO_BYTES = 512 * 1024;

export const DEFAULT_SCHOOL_PROFILE = {
  id: SCHOOL_PROFILE_ROW_ID,
  name: 'Lycée de Démonstration',
  motto: 'Travail - Discipline - Succès',
  country: 'République du Cameroun',
  ministry: 'Ministère des Enseignements Secondaires',
  region: '',
  delegation: '',
  city: '',
  phone: '',
  email: '',
} as const;

const schoolDtoColumns = {
  id: schoolProfile.id,
  name: schoolProfile.name,
  motto: schoolProfile.motto,
  country: schoolProfile.country,
  ministry: schoolProfile.ministry,
  region: schoolProfile.region,
  delegation: schoolProfile.delegation,
  city: schoolProfile.city,
  phone: schoolProfile.phone,
  email: schoolProfile.email,
  hasLogo: sql<boolean>`${schoolProfile.logoData} IS NOT NULL`,
  logoMimeType: schoolProfile.logoMimeType,
  updatedAt: schoolProfile.updatedAt,
};

function toSchoolProfileDto(row: {
  id: number;
  name: string;
  motto: string;
  country: string;
  ministry: string;
  region: string;
  delegation: string;
  city: string;
  phone: string;
  email: string;
  hasLogo: boolean;
  logoMimeType: string | null;
  updatedAt: Date;
}): SchoolProfileDto {
  return {
    id: row.id,
    name: row.name,
    motto: row.motto,
    country: row.country,
    ministry: row.ministry,
    region: row.region,
    delegation: row.delegation,
    city: row.city,
    phone: row.phone,
    email: row.email,
    hasLogo: Boolean(row.hasLogo),
    logoMimeType: row.logoMimeType,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createSchoolService(db: DbClient) {
  async function getProfile(): Promise<SchoolProfileDto> {
    const [row] = await db
      .select(schoolDtoColumns)
      .from(schoolProfile)
      .where(eq(schoolProfile.id, SCHOOL_PROFILE_ROW_ID))
      .limit(1);

    if (!row) {
      return {
        ...DEFAULT_SCHOOL_PROFILE,
        hasLogo: false,
        logoMimeType: null,
        updatedAt: new Date(0).toISOString(),
      };
    }

    return toSchoolProfileDto(row);
  }

  async function upsertProfile(input: unknown): Promise<SchoolProfileDto> {
    const data = UpdateSchoolProfileSchema.parse(input);
    const now = new Date();

    const [row] = await db
      .insert(schoolProfile)
      .values({
        id: SCHOOL_PROFILE_ROW_ID,
        name: data.name,
        motto: data.motto,
        country: data.country,
        ministry: data.ministry,
        region: data.region,
        delegation: data.delegation,
        city: data.city,
        phone: data.phone,
        email: data.email,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schoolProfile.id,
        set: {
          name: data.name,
          motto: data.motto,
          country: data.country,
          ministry: data.ministry,
          region: data.region,
          delegation: data.delegation,
          city: data.city,
          phone: data.phone,
          email: data.email,
          updatedAt: now,
        },
      })
      .returning(schoolDtoColumns);

    if (!row) {
      throw new Error('Échec de la mise à jour du profil de l’établissement.');
    }

    return toSchoolProfileDto(row);
  }

  async function uploadLogo(input: unknown): Promise<SchoolProfileDto> {
    const data = UploadSchoolLogoSchema.parse(input);
    const cleanedBase64 = data.dataBase64
      .replace(/^data:image\/(?:png|jpeg);base64,/i, '')
      .replace(/\s+/g, '');

    if (!cleanedBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanedBase64)) {
      throw new BadRequestError('Données base64 invalides pour le logo.');
    }

    const buffer = Buffer.from(cleanedBase64, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestError('Le fichier logo est vide.');
    }

    if (buffer.length > MAX_SCHOOL_LOGO_BYTES) {
      throw new BadRequestError('La taille du logo ne doit pas dépasser 512 Ko.');
    }

    const now = new Date();

    const [row] = await db
      .insert(schoolProfile)
      .values({
        ...DEFAULT_SCHOOL_PROFILE,
        logoData: buffer,
        logoMimeType: data.mimeType,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schoolProfile.id,
        set: {
          logoData: buffer,
          logoMimeType: data.mimeType,
          updatedAt: now,
        },
      })
      .returning(schoolDtoColumns);

    if (!row) {
      throw new Error('Échec de l’enregistrement du logo.');
    }

    return toSchoolProfileDto(row);
  }

  async function getLogo(): Promise<{ data: Buffer; mimeType: string }> {
    const [row] = await db
      .select({
        logoData: schoolProfile.logoData,
        logoMimeType: schoolProfile.logoMimeType,
      })
      .from(schoolProfile)
      .where(eq(schoolProfile.id, SCHOOL_PROFILE_ROW_ID))
      .limit(1);

    if (!row || !row.logoData || !row.logoMimeType || row.logoData.length === 0) {
      throw new NotFoundError('Aucun logo configuré pour cet établissement.');
    }

    return {
      data: row.logoData,
      mimeType: row.logoMimeType,
    };
  }

  return {
    getProfile,
    upsertProfile,
    uploadLogo,
    getLogo,
  };
}

export type SchoolService = ReturnType<typeof createSchoolService>;
