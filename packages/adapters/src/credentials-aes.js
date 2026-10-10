/**
 * Local AES-256-GCM credentials crypto (story 5.2 / AR-29).
 *
 * Packs JSON `{ apiKey }` or `{ token }` (or both). Ciphertext is ciphertext∥authTag;
 * nonce is stored separately; `keyId` is recorded per ciphertext for offline re-encrypt.
 *
 * Satisfies `CredentialsCryptoPort` structurally — adapters never import `@momo/app` (AD-1).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { stringify } from '@momo/domain';
const ALGO = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
function decodeKey(keyBase64) {
    let key;
    try {
        key = Buffer.from(keyBase64, 'base64');
    }
    catch {
        throw new Error('Invalid configuration: CREDENTIALS_KEY must be base64-encoded 32 bytes');
    }
    if (key.length !== 32) {
        throw new Error(`Invalid configuration: CREDENTIALS_KEY must decode to 32 bytes (got ${key.length})`);
    }
    return key;
}
/** Builds the local AES-256-GCM adapter. Fails naming the key when the key is wrong-sized. */
export function credentialsAesOn(options) {
    const key = decodeKey(options.keyBase64);
    const { keyId } = options;
    if (keyId.trim().length === 0) {
        throw new Error('Invalid configuration: CREDENTIALS_KEY_ID must not be empty');
    }
    return {
        keyId,
        encrypt(plaintext) {
            const apiKey = plaintext.apiKey?.trim() ?? '';
            const token = plaintext.token?.trim() ?? '';
            if (!apiKey && !token) {
                throw new Error('credentials plaintext must include a non-empty apiKey or token');
            }
            const body = {};
            if (apiKey)
                body.apiKey = apiKey;
            if (token)
                body.token = token;
            const nonce = randomBytes(NONCE_BYTES);
            const cipher = createCipheriv(ALGO, key, nonce);
            const encrypted = Buffer.concat([
                cipher.update(stringify(body), 'utf8'),
                cipher.final(),
            ]);
            const tag = cipher.getAuthTag();
            return {
                ciphertext: Buffer.concat([encrypted, tag]),
                nonce,
                keyId,
            };
        },
        decrypt(stored) {
            if (stored.keyId !== keyId) {
                throw new Error(`credentials key_id mismatch: stored "${stored.keyId}", expected "${keyId}"`);
            }
            if (stored.ciphertext.length < TAG_BYTES) {
                throw new Error('credentials ciphertext too short');
            }
            const encrypted = stored.ciphertext.subarray(0, stored.ciphertext.length - TAG_BYTES);
            const tag = stored.ciphertext.subarray(stored.ciphertext.length - TAG_BYTES);
            const decipher = createDecipheriv(ALGO, key, stored.nonce);
            decipher.setAuthTag(tag);
            const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
            const parsed = JSON.parse(json);
            return {
                ...(parsed.apiKey !== undefined ? { apiKey: parsed.apiKey } : {}),
                ...(parsed.token !== undefined ? { token: parsed.token } : {}),
            };
        },
    };
}
