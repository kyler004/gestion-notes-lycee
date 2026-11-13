import { z } from 'zod';

/**
 * Échappe les caractères spéciaux (`\`, `%`, `_`) avant d'utiliser un terme dans une clause `ILIKE`.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
