/**
 * CREDENTIALS CRYPTO PORT (AR-29 / NFR-S2, story 5.2).
 *
 * AES-256-GCM ciphertext always stores the `key_id` that produced it so a maintenance job
 * can re-encrypt without downtime. Local uses `CREDENTIALS_KEY`; production KMS envelope
 * encryption is Epic 8 — composition refuses `CREDENTIALS_CRYPTO=kms` until then.
 *
 * Decrypt is for the trusted ingest/adapter composition path only; list/get use cases never
 * return secrets.
 */
export interface CredentialsPlaintext {
  readonly apiKey?: string;
  readonly token?: string;
}

export interface EncryptedCredentials {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyId: string;
}

export interface CredentialsCryptoPort {
  readonly keyId: string;
  encrypt(plaintext: CredentialsPlaintext): EncryptedCredentials;
  decrypt(stored: EncryptedCredentials): CredentialsPlaintext;
}
