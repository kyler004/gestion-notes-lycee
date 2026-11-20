import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../pin';

describe('WebCrypto PIN hashing & verification', () => {
  it('hashes and verifies a 4-digit and 6-digit PIN with unique salts', async () => {
    const first = await hashPin('2468');
    const second = await hashPin('2468');

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPin('2468', first.hash, first.salt)).resolves.toBe(true);
    await expect(verifyPin('2468', second.hash, second.salt)).resolves.toBe(true);
    await expect(verifyPin('1357', first.hash, first.salt)).resolves.toBe(false);

    const sixDigit = await hashPin('123456');
    await expect(verifyPin('123456', sixDigit.hash, sixDigit.salt)).resolves.toBe(true);
  });

  it('rejects malformed PIN codes', async () => {
    await expect(hashPin('123')).rejects.toThrow();
    await expect(hashPin('1234567')).rejects.toThrow();
    await expect(hashPin('abcd')).rejects.toThrow();

    const { hash, salt } = await hashPin('4321');
    await expect(verifyPin('abc', hash, salt)).resolves.toBe(false);
    await expect(verifyPin('4321', 'not-base64-!!!', salt)).resolves.toBe(false);
  });
});
