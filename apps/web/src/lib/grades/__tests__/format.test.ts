import { describe, expect, it } from 'vitest';
import {
  formatEditableScore,
  formatScore,
  normalizeScoresEqual,
  parseGradeScoreInput,
} from '../format';

describe('grade formatting & score parser', () => {
  it('parses French comma and dot decimals up to 2 decimals within [0, 20]', () => {
    expect(parseGradeScoreInput('')).toEqual({ kind: 'empty' });
    expect(parseGradeScoreInput('  ')).toEqual({ kind: 'empty' });
    expect(parseGradeScoreInput('14')).toEqual({ kind: 'valid', score: 14 });
    expect(parseGradeScoreInput('14,5')).toEqual({ kind: 'valid', score: 14.5 });
    expect(parseGradeScoreInput('16.25')).toEqual({ kind: 'valid', score: 16.25 });
    expect(parseGradeScoreInput('0')).toEqual({ kind: 'valid', score: 0 });
    expect(parseGradeScoreInput('20')).toEqual({ kind: 'valid', score: 20 });
  });

  it('rejects out-of-range, non-numeric, or >2 decimal values', () => {
    expect(parseGradeScoreInput('20.01').kind).toBe('invalid');
    expect(parseGradeScoreInput('-1').kind).toBe('invalid');
    expect(parseGradeScoreInput('14.125').kind).toBe('invalid');
    expect(parseGradeScoreInput('abc').kind).toBe('invalid');
  });

  it('formats tabular and editable scores in French locale', () => {
    expect(formatScore(15.5)).toBe('15,50');
    expect(formatScore(null)).toBe('—');
    expect(formatEditableScore(15.5)).toBe('15,5');
    expect(formatEditableScore(undefined)).toBe('');
    expect(normalizeScoresEqual(14.5, 14.5001)).toBe(true);
    expect(normalizeScoresEqual(14.5, 14.25)).toBe(false);
  });
});
