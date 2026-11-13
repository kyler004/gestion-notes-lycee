import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LEN = 64;
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024; // 64 MiB (Node default maxmem=32MiB est trop juste pour N=32768)

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function isValidHex(value: string, expectedBytes?: number): boolean {
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    return false;
  }
  if (expectedBytes !== undefined && value.length !== expectedBytes * 2) {
    return false;
  }
  return true;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `$scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$scrypt$')) {
    const parts = storedHash.split('$');
    // Format: ['', 'scrypt', 'N=...,r=...,p=...', saltHex, hashHex]
    if (parts.length !== 5) {
      return false;
    }
    const [, scheme, paramStr, salt, hexKey] = parts;
    if (scheme !== 'scrypt' || !paramStr || !salt || !hexKey) {
      return false;
    }
    const paramMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(paramStr);
    if (!paramMatch) {
      return false;
    }
    const N = Number(paramMatch[1]);
    const r = Number(paramMatch[2]);
    const p = Number(paramMatch[3]);
    // Bornes défensives anti-DoS sur les paramètres stockés
    if (
      !Number.isInteger(N) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      N < 1024 ||
      N > 65536 ||
      (N & (N - 1)) !== 0 ||
      r < 1 ||
      r > 16 ||
      p < 1 ||
      p > 4
    ) {
      return false;
    }
    if (!isValidHex(salt) || !isValidHex(hexKey, KEY_LEN)) {
      return false;
    }

    const expected = Buffer.from(hexKey, 'hex');
    const actual = await scryptAsync(password, salt, KEY_LEN, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    });
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }

  // Format historique : scrypt:<salt>:<hex>
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, hexKey] = parts;
  if (!salt || !hexKey || !isValidHex(hexKey, KEY_LEN)) {
    return false;
  }
  const expected = Buffer.from(hexKey, 'hex');
  const actual = await scryptAsync(password, salt, KEY_LEN);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function needsPasswordRehash(storedHash: string): boolean {
  const expectedPrefix = `$scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$`;
  return !storedHash.startsWith(expectedPrefix);
}

export function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
