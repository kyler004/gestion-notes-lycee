import { CreateStudentSchema, type StudentSex } from '@lycee/shared';
import { BadRequestError } from './errors.js';

export const MAX_CSV_IMPORT_ROWS = 500;

export type CsvDelimiterOption = 'auto' | ',' | ';';

export interface ParsedStudentCsvRow {
  line: number;
  raw: {
    matricule: string;
    lastName: string;
    firstName: string;
    birthDate: string;
    birthPlace: string;
    sex: string;
    isRepeater: string;
    className: string;
  };
}

export interface NormalizedCsvStudentRow {
  line: number;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  sex: StudentSex;
  isRepeater: boolean;
  className: string;
}

export interface CsvRowValidationError {
  line: number;
  matricule: string | null;
  field: string | null;
  message: string;
}

type CanonicalStudentField =
  | 'matricule'
  | 'lastName'
  | 'firstName'
  | 'birthDate'
  | 'birthPlace'
  | 'sex'
  | 'isRepeater'
  | 'className';

const HEADER_ALIASES: Record<string, CanonicalStudentField> = {
  matricule: 'matricule',
  nummatricule: 'matricule',
  numeromatricule: 'matricule',
  lastname: 'lastName',
  nom: 'lastName',
  noms: 'lastName',
  nomdefamille: 'lastName',
  firstname: 'firstName',
  prenom: 'firstName',
  prenoms: 'firstName',
  birthdate: 'birthDate',
  datedenaissance: 'birthDate',
  datenaissance: 'birthDate',
  birthplace: 'birthPlace',
  lieudenaissance: 'birthPlace',
  lieunaissance: 'birthPlace',
  sex: 'sex',
  sexe: 'sex',
  genre: 'sex',
  isrepeater: 'isRepeater',
  redoublant: 'isRepeater',
  redoublante: 'isRepeater',
  classname: 'className',
  classe: 'className',
};

const REQUIRED_FIELDS: ReadonlyArray<{ field: CanonicalStudentField; label: string }> = [
  { field: 'matricule', label: 'matricule' },
  { field: 'lastName', label: 'nom / lastName' },
  { field: 'firstName', label: 'prénom / firstName' },
  { field: 'birthDate', label: 'date de naissance / birthDate' },
  { field: 'sex', label: 'sexe / sex' },
];

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_'-]+/g, '');
}

function detectDelimiter(content: string): ',' | ';' {
  let inQuotes = false;
  let commaCount = 0;
  let semicolonCount = 0;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      break;
    }
    if (!inQuotes) {
      if (ch === ',') commaCount += 1;
      if (ch === ';') semicolonCount += 1;
    }
  }

  return semicolonCount >= commaCount && semicolonCount > 0 ? ';' : ',';
}

interface RawCsvRecord {
  line: number;
  cells: string[];
}

function tokenizeCsv(content: string, delimiter: ',' | ';'): RawCsvRecord[] {
  const records: RawCsvRecord[] = [];
  let currentCells: string[] = [];
  let currentValue = '';
  let inQuotes = false;
  let justClosedQuote = false;
  let currentLine = 1;
  let recordStartLine = 1;
  let atFieldStart = true;

  const pushCurrentRecord = () => {
    currentCells.push(currentValue);
    const hasNonEmpty = currentCells.some((cell) => cell.trim().length > 0);
    if (hasNonEmpty) {
      records.push({
        line: recordStartLine,
        cells: currentCells,
      });
    }
    currentCells = [];
    currentValue = '';
    inQuotes = false;
    justClosedQuote = false;
    atFieldStart = true;
  };

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          currentValue += '"';
          i += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        if (ch === '\r') {
          if (content[i + 1] === '\n') {
            i += 1;
          }
          currentLine += 1;
          currentValue += '\n';
        } else if (ch === '\n') {
          currentLine += 1;
          currentValue += '\n';
        } else {
          currentValue += ch;
        }
      }
      continue;
    }

    if (atFieldStart && ch === '"') {
      if (currentCells.length === 0 && currentValue === '') {
        recordStartLine = currentLine;
      }
      inQuotes = true;
      atFieldStart = false;
      justClosedQuote = false;
      continue;
    }

    if (justClosedQuote) {
      if (ch === delimiter) {
        currentCells.push(currentValue);
        currentValue = '';
        atFieldStart = true;
        justClosedQuote = false;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && content[i + 1] === '\n') {
          i += 1;
        }
        currentLine += 1;
        pushCurrentRecord();
        recordStartLine = currentLine;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        continue;
      }
      throw new BadRequestError(
        `Syntaxe CSV invalide à la ligne ${currentLine} : caractère inattendu après un guillemet fermant.`,
      );
    }

    if (ch === delimiter) {
      if (currentCells.length === 0 && currentValue === '') {
        recordStartLine = currentLine;
      }
      currentCells.push(currentValue);
      currentValue = '';
      atFieldStart = true;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && content[i + 1] === '\n') {
        i += 1;
      }
      currentLine += 1;
      pushCurrentRecord();
      recordStartLine = currentLine;
      continue;
    }

    if (currentCells.length === 0 && currentValue === '') {
      recordStartLine = currentLine;
    }
    atFieldStart = false;
    currentValue += ch;
  }

  if (inQuotes) {
    throw new BadRequestError(
      `Syntaxe CSV invalide à la ligne ${recordStartLine} : guillemet non fermé.`,
    );
  }

  if (currentCells.length > 0 || currentValue.trim().length > 0) {
    pushCurrentRecord();
  }

  return records;
}

export function parseStudentsCsv(
  rawCsv: string,
  delimiterOption: CsvDelimiterOption = 'auto',
): ParsedStudentCsvRow[] {
  if (rawCsv.includes('\0')) {
    throw new BadRequestError('Le fichier CSV contient des caractères nuls non autorisés.');
  }

  const sanitized = rawCsv.startsWith('\uFEFF') ? rawCsv.slice(1) : rawCsv;
  if (sanitized.trim().length === 0) {
    throw new BadRequestError('Le fichier CSV est vide.');
  }

  const delimiter = delimiterOption === 'auto' ? detectDelimiter(sanitized) : delimiterOption;
  const records = tokenizeCsv(sanitized, delimiter);

  if (records.length === 0) {
    throw new BadRequestError('Le fichier CSV est vide.');
  }

  const headerRecord = records[0]!;
  const fieldIndexes = new Map<CanonicalStudentField, number>();

  for (let colIdx = 0; colIdx < headerRecord.cells.length; colIdx += 1) {
    const rawHeader = headerRecord.cells[colIdx] ?? '';
    const normalized = normalizeHeaderKey(rawHeader);
    const canonical = HEADER_ALIASES[normalized];
    if (!canonical) {
      continue;
    }
    if (fieldIndexes.has(canonical)) {
      throw new BadRequestError(
        `Colonne dupliquée dans l’en-tête CSV pour le champ "${canonical}".`,
      );
    }
    fieldIndexes.set(canonical, colIdx);
  }

  const missingLabels = REQUIRED_FIELDS.filter(({ field }) => !fieldIndexes.has(field)).map(
    ({ label }) => label,
  );
  if (missingLabels.length > 0) {
    throw new BadRequestError(
      `Colonnes obligatoires manquantes dans l’en-tête CSV : ${missingLabels.join(', ')}.`,
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    throw new BadRequestError('Le fichier CSV ne contient aucune ligne d’élève à importer.');
  }
  if (dataRecords.length > MAX_CSV_IMPORT_ROWS) {
    throw new BadRequestError(
      `Le fichier CSV dépasse la limite maximale de ${MAX_CSV_IMPORT_ROWS} lignes par import.`,
    );
  }

  const readCell = (cells: string[], field: CanonicalStudentField): string => {
    const idx = fieldIndexes.get(field);
    if (idx === undefined) return '';
    return (cells[idx] ?? '').trim();
  };

  return dataRecords.map((rec) => ({
    line: rec.line,
    raw: {
      matricule: readCell(rec.cells, 'matricule'),
      lastName: readCell(rec.cells, 'lastName'),
      firstName: readCell(rec.cells, 'firstName'),
      birthDate: readCell(rec.cells, 'birthDate'),
      birthPlace: readCell(rec.cells, 'birthPlace'),
      sex: readCell(rec.cells, 'sex'),
      isRepeater: readCell(rec.cells, 'isRepeater'),
      className: readCell(rec.cells, 'className'),
    },
  }));
}

function normalizeBirthDateToIso(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const slashOrDash = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
  if (slashOrDash) {
    const [, day, month, year] = slashOrDash;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function isRealCalendarDate(isoDate: string): boolean {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return false;
  const [year, month, day] = parts;
  if (!year || !month || !day) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function normalizeSexValue(raw: string): StudentSex | null {
  const cleaned = raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (cleaned === 'M' || cleaned === 'H' || cleaned === 'MASCULIN' || cleaned === 'HOMME') {
    return 'M';
  }
  if (cleaned === 'F' || cleaned === 'FEMININ' || cleaned === 'FEMME') {
    return 'F';
  }
  return null;
}

function normalizeRepeaterValue(raw: string): boolean | null {
  if (!raw) return false;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'oui' || cleaned === 'yes' || cleaned === 'true' || cleaned === '1') {
    return true;
  }
  if (cleaned === 'non' || cleaned === 'no' || cleaned === 'false' || cleaned === '0') {
    return false;
  }
  return null;
}

function hasDisallowedControlChars(value: string): boolean {
  return /[\p{Cc}]/u.test(value);
}

export function validateParsedCsvRow(
  row: ParsedStudentCsvRow,
): { ok: true; data: NormalizedCsvStudentRow } | { ok: false; error: CsvRowValidationError } {
  const matricule = row.raw.matricule;
  const matriculeForError = matricule || null;

  for (const [field, val] of Object.entries(row.raw)) {
    if (hasDisallowedControlChars(val)) {
      return {
        ok: false,
        error: {
          line: row.line,
          matricule: matriculeForError,
          field,
          message: `Le champ "${field}" contient des caractères de contrôle interdits.`,
        },
      };
    }
  }

  const isoBirthDate = normalizeBirthDateToIso(row.raw.birthDate);
  if (!isoBirthDate || !isRealCalendarDate(isoBirthDate)) {
    return {
      ok: false,
      error: {
        line: row.line,
        matricule: matriculeForError,
        field: 'birthDate',
        message: `Date de naissance invalide "${row.raw.birthDate}" (formats attendus : YYYY-MM-DD ou DD/MM/YYYY).`,
      },
    };
  }

  const normalizedSex = normalizeSexValue(row.raw.sex);
  if (!normalizedSex) {
    return {
      ok: false,
      error: {
        line: row.line,
        matricule: matriculeForError,
        field: 'sex',
        message: `Sexe invalide "${row.raw.sex}" (valeurs attendues : M ou F).`,
      },
    };
  }

  const normalizedRepeater = normalizeRepeaterValue(row.raw.isRepeater);
  if (normalizedRepeater === null) {
    return {
      ok: false,
      error: {
        line: row.line,
        matricule: matriculeForError,
        field: 'isRepeater',
        message: `Valeur redoublant invalide "${row.raw.isRepeater}" (attendu : oui/non ou true/false).`,
      },
    };
  }

  const studentParsed = CreateStudentSchema.safeParse({
    matricule: row.raw.matricule,
    lastName: row.raw.lastName,
    firstName: row.raw.firstName,
    birthDate: isoBirthDate,
    birthPlace: row.raw.birthPlace,
    sex: normalizedSex,
  });

  if (!studentParsed.success) {
    const firstIssue = studentParsed.error.issues[0];
    const issueField = firstIssue?.path[0] ? String(firstIssue.path[0]) : null;
    return {
      ok: false,
      error: {
        line: row.line,
        matricule: matriculeForError,
        field: issueField,
        message: firstIssue?.message ?? 'Données élève invalides.',
      },
    };
  }

  return {
    ok: true,
    data: {
      line: row.line,
      matricule: studentParsed.data.matricule,
      lastName: studentParsed.data.lastName,
      firstName: studentParsed.data.firstName,
      birthDate: studentParsed.data.birthDate,
      birthPlace: studentParsed.data.birthPlace,
      sex: studentParsed.data.sex,
      isRepeater: normalizedRepeater,
      className: row.raw.className,
    },
  };
}
