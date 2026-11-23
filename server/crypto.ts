import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Encrypted blob stored in the database; nonce and ct are base64 strings. */
export type SealedBlob = {
  scheme: "server-v1";
  keyVersion: number;
  nonce: string;
  ct: string;
};

const SCHEME = "server-v1";
/** All blobs use version 1 for now; key rotation lands in a later task. */
const KEY_VERSION = 1;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
/** Fixed AAD binding wrapped data keys to their purpose. */
const WRAPPED_KEY_AAD = "wrapped-key|server-v1";

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }
}

/** Blobs arrive from storage, so the scheme is validated as untrusted input. */
function assertScheme(scheme: string): void {
  if (scheme !== SCHEME) {
    // Fixed message: never echo untrusted input back into error text.
    throw new Error("unsupported blob scheme");
  }
}

/** Generates a fresh per-user data key (32 random bytes). */
export function generateDataKey(): Uint8Array {
  return new Uint8Array(randomBytes(KEY_BYTES));
}

/** Encrypts bytes with AES-256-GCM; the auth tag is appended to the ciphertext. */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): SealedBlob {
  assertKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const ct = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return {
    scheme: SCHEME,
    keyVersion: KEY_VERSION,
    nonce: nonce.toString("base64"),
    ct: ct.toString("base64"),
  };
}

/** Decrypts a blob; throws on a wrong key, aad, nonce or ciphertext. */
export function open(key: Uint8Array, blob: SealedBlob, aad: string): Uint8Array {
  assertKey(key);
  assertScheme(blob.scheme);
  const nonce = Buffer.from(blob.nonce, "base64");
  const payload = Buffer.from(blob.ct, "base64");
  if (nonce.length !== NONCE_BYTES || payload.length < AUTH_TAG_BYTES) {
    throw new Error("malformed sealed blob: bad nonce or ciphertext length");
  }
  const body = payload.subarray(0, payload.length - AUTH_TAG_BYTES);
  const tag = payload.subarray(payload.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  return new Uint8Array(decrypted);
}

/** Wraps a per-user data key with the master key from env. */
export function wrapKey(master: Uint8Array, key: Uint8Array): SealedBlob {
  return seal(master, key, WRAPPED_KEY_AAD);
}

/** Unwraps a data key; throws on a wrong master key or tampered blob. */
export function unwrapKey(master: Uint8Array, blob: SealedBlob): Uint8Array {
  return open(master, blob, WRAPPED_KEY_AAD);
}
