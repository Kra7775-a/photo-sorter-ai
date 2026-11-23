import { describe, expect, test } from "bun:test";

import type { SealedBlob } from "./crypto.ts";
import { generateDataKey, open, seal, unwrapKey, wrapKey } from "./crypto.ts";

const key = generateDataKey();
const master = generateDataKey();
const otherKey = generateDataKey();
const aad = "user-1|run-1|server-v1";
const plaintext = new TextEncoder().encode("IMG_0001.jpg -> cats");

/** Flips the first byte of a base64 payload to simulate tampering. */
function tamper(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  bytes[0] ^= 0xff;
  return bytes.toString("base64");
}

/** Flips the last byte of a base64 payload (the auth tag for ciphertext). */
function tamperLast(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  bytes[bytes.length - 1] ^= 0xff;
  return bytes.toString("base64");
}

describe("generateDataKey", () => {
  test("returns 32 random bytes", () => {
    const generated = generateDataKey();
    expect(generated).toBeInstanceOf(Uint8Array);
    expect(generated.length).toBe(32);
  });

  test("two calls return different keys", () => {
    expect(generateDataKey()).not.toEqual(generateDataKey());
  });
});

describe("seal/open", () => {
  test("round-trip returns the original bytes", () => {
    const blob = seal(key, plaintext, aad);
    expect(blob.scheme).toBe("server-v1");
    expect(blob.keyVersion).toBe(1);
    expect(open(key, blob, aad)).toEqual(plaintext);
  });

  test("round-trips an empty plaintext", () => {
    const empty = new Uint8Array(0);
    expect(open(key, seal(key, empty, aad), aad)).toEqual(empty);
  });

  test("open throws on mutated ciphertext", () => {
    const blob = seal(key, plaintext, aad);
    const mutated: SealedBlob = { ...blob, ct: tamper(blob.ct) };
    expect(() => open(key, mutated, aad)).toThrow();
  });

  test("open throws when the auth tag (last ciphertext byte) is flipped", () => {
    const blob = seal(key, plaintext, aad);
    const mutated: SealedBlob = { ...blob, ct: tamperLast(blob.ct) };
    expect(() => open(key, mutated, aad)).toThrow();
  });

  test("open throws on mutated nonce", () => {
    const blob = seal(key, plaintext, aad);
    const mutated: SealedBlob = { ...blob, nonce: tamper(blob.nonce) };
    expect(() => open(key, mutated, aad)).toThrow();
  });

  test("open throws on a different aad", () => {
    const blob = seal(key, plaintext, aad);
    expect(() => open(key, blob, "user-2|run-1|server-v1")).toThrow();
  });

  test("open throws on a different key", () => {
    const blob = seal(key, plaintext, aad);
    expect(() => open(otherKey, blob, aad)).toThrow();
  });

  test("two seals of the same plaintext produce different nonces", () => {
    const first = seal(key, plaintext, aad);
    const second = seal(key, plaintext, aad);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ct).not.toBe(second.ct);
  });

  test("open rejects a key that is not 32 bytes", () => {
    const blob = seal(key, plaintext, aad);
    expect(() => open(new Uint8Array(16), blob, aad)).toThrow(/32/);
  });

  test("open rejects an unknown scheme", () => {
    const blob = seal(key, plaintext, aad);
    const foreign = { ...blob, scheme: "client-v9" } as unknown as SealedBlob;
    expect(() => open(key, foreign, aad)).toThrow(/scheme/);
  });

  test("open rejects a ciphertext too short to hold an auth tag", () => {
    const blob = seal(key, plaintext, aad);
    const truncated: SealedBlob = { ...blob, ct: Buffer.alloc(8).toString("base64") };
    expect(() => open(key, truncated, aad)).toThrow();
  });

  test("open rejects a nonce that is not 12 bytes", () => {
    const blob = seal(key, plaintext, aad);
    const shortNonce: SealedBlob = { ...blob, nonce: Buffer.alloc(8).toString("base64") };
    expect(() => open(key, shortNonce, aad)).toThrow();
  });

  test("open rejects a nonce longer than 12 bytes", () => {
    const blob = seal(key, plaintext, aad);
    const longNonce: SealedBlob = { ...blob, nonce: Buffer.alloc(16).toString("base64") };
    expect(() => open(key, longNonce, aad)).toThrow();
  });
});

describe("wrapKey/unwrapKey", () => {
  test("round-trip returns the original key bytes", () => {
    const wrapped = wrapKey(master, key);
    expect(wrapped.scheme).toBe("server-v1");
    expect(wrapped.keyVersion).toBe(1);
    expect(unwrapKey(master, wrapped)).toEqual(key);
  });

  test("unwrapKey throws with a different master key", () => {
    const wrapped = wrapKey(master, key);
    expect(() => unwrapKey(otherKey, wrapped)).toThrow();
  });

  test("unwrapKey throws on mutated ciphertext", () => {
    const wrapped = wrapKey(master, key);
    const mutated: SealedBlob = { ...wrapped, ct: tamper(wrapped.ct) };
    expect(() => unwrapKey(master, mutated)).toThrow();
  });

  test("unwrapKey throws on mutated nonce", () => {
    const wrapped = wrapKey(master, key);
    const mutated: SealedBlob = { ...wrapped, nonce: tamper(wrapped.nonce) };
    expect(() => unwrapKey(master, mutated)).toThrow();
  });

  test("unwrapKey rejects a master key that is not 32 bytes", () => {
    const wrapped = wrapKey(master, key);
    expect(() => unwrapKey(new Uint8Array(16), wrapped)).toThrow(/32/);
  });

  test("unwrapKey rejects an unknown scheme", () => {
    const wrapped = wrapKey(master, key);
    const foreign = { ...wrapped, scheme: "client-v9" } as unknown as SealedBlob;
    expect(() => unwrapKey(master, foreign)).toThrow(/scheme/);
  });
});
