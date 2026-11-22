import { roundGrade } from '@lycee/shared';

export type ParsedScoreResult =
  | { kind: 'empty' }
  | { kind: 'valid'; score: number }
  | { kind: 'invalid'; message: string };

/**
 * Analyse une note saisie au clavier (accepte la virgule ou le point décimal, 0 à 20, max 2 décimales).
 */
export function parseGradeScoreInput(raw: string): ParsedScoreResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { kind: 'empty' };
  }

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { kind: 'invalid', message: 'Saisissez un nombre valide entre 0 et 20.' };
  }

  const parts = normalized.split('.');
  if (parts[1] && parts[1].length > 2) {
    return { kind: 'invalid', message: 'Maximum 2 décimales autorisées.' };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 20) {
    return { kind: 'invalid', message: 'La note doit être comprise entre 0 et 20.' };
  }

  return { kind: 'valid', score: roundGrade(value, 2) };
}

/**
 * Formate une note ou moyenne pour affichage tabulaire (ex. 14,50 ou 14,5 selon besoin).
 */
export function formatScore(score: number | null | undefined, decimals = 2): string {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return '—';
  }
  return roundGrade(score, decimals).toFixed(decimals).replace('.', ',');
}

/**
 * Formate une note dans un champ d'édition (sans zéros superflus sauf si saisi, virgule FR).
 */
export function formatEditableScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return '';
  }
  const rounded = roundGrade(score, 2);
  return String(rounded).replace('.', ',');
}

export function normalizeScoresEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const normA = a === null || a === undefined ? null : roundGrade(a, 2);
  const normB = b === null || b === undefined ? null : roundGrade(b, 2);
  return normA === normB;
}
