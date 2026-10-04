import { describe, expect, it } from 'vitest';
import { credentialsAesOn } from './credentials-aes';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('credentialsAesOn (story 5.2 / AR-29)', () => {
  it('round-trips apiKey and stores key_id', () => {
    const crypto = credentialsAesOn({ keyBase64: KEY, keyId: 'local-test-1' });
    const sealed = crypto.encrypt({ apiKey: 'blg-secret' });
    expect(sealed.keyId).toBe('local-test-1');
    expect(sealed.nonce).toHaveLength(12);
    expect(sealed.ciphertext.length).toBeGreaterThan(16);
    expect(crypto.decrypt(sealed)).toEqual({ apiKey: 'blg-secret' });
  });

  it('round-trips token', () => {
    const crypto = credentialsAesOn({ keyBase64: KEY, keyId: 'k' });
    const sealed = crypto.encrypt({ token: 'tok-1' });
    expect(crypto.decrypt(sealed)).toEqual({ token: 'tok-1' });
  });

  it('refuses a wrong-sized CREDENTIALS_KEY naming the key', () => {
    expect(() =>
      credentialsAesOn({ keyBase64: Buffer.alloc(16).toString('base64'), keyId: 'k' }),
    ).toThrow(/CREDENTIALS_KEY must decode to 32 bytes/);
  });

  it('refuses decrypt when stored key_id does not match', () => {
    const a = credentialsAesOn({ keyBase64: KEY, keyId: 'local-a' });
    const b = credentialsAesOn({ keyBase64: KEY, keyId: 'local-b' });
    const sealed = a.encrypt({ apiKey: 'secret' });
    expect(() => b.decrypt(sealed)).toThrow(/key_id mismatch/);
  });

  it('refuses encrypt when neither apiKey nor token is a non-empty string', () => {
    const crypto = credentialsAesOn({ keyBase64: KEY, keyId: 'k' });
    expect(() => crypto.encrypt({})).toThrow(/non-empty apiKey or token/);
    expect(() => crypto.encrypt({ apiKey: '  ', token: '' })).toThrow(/non-empty apiKey or token/);
  });
});
