import { z } from 'zod';

export const MAX_PIN_ATTEMPTS = 5;
export const IDLE_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

export const PinCodeSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'Le code PIN doit contenir entre 4 et 6 chiffres.');

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function derivePinBytes(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle indisponible dans cet environnement.');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_KEY_BITS,
  );

  return new Uint8Array(derivedBits);
}

export async function hashPin(
  pin: string,
): Promise<{ hash: string; salt: string }> {
  PinCodeSchema.parse(pin);

  const saltBuffer = new ArrayBuffer(SALT_BYTES);
  const salt = new Uint8Array(saltBuffer);
  globalThis.crypto.getRandomValues(salt);

  const derived = await derivePinBytes(pin, salt);
  return {
    hash: toBase64(derived),
    salt: toBase64(salt),
  };
}

export async function verifyPin(
  pin: string,
  expectedHash: string,
  saltBase64: string,
): Promise<boolean> {
  const parsed = PinCodeSchema.safeParse(pin);
  if (!parsed.success) {
    return false;
  }

  try {
    const salt = fromBase64(saltBase64);
    const expectedBytes = fromBase64(expectedHash);
    const actualBytes = await derivePinBytes(parsed.data, salt);
    return constantTimeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}
