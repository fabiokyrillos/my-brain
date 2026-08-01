import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// The repository idiom for a `server-only` module under jsdom
// (`inbox-projection.test.ts` and twenty others). The guard is load-bearing in
// the build and inert here.
vi.mock("server-only", () => ({}));

import {
  CredentialUnreadableError,
  decryptCredential,
  encryptCredential,
  hmacSha256,
  requireFingerprintPepper,
  requireMasterKey,
} from "./crypto";
import { composeAad, fromBase64, IV_BYTES, KEY_BYTES, TAG_BYTES, type Bytes } from "./envelope";

/**
 * BYOK.1 acceptance gates A3 (Node half), A4, A5 and A6 (Node half).
 *
 * Every key here is generated per-test. Nothing reads `.env.local`,
 * `.env.test.local` or the CI environment, and nothing needs to: the provisioned
 * `test` secrets exist for running the *application*, not for running these.
 * A suite that depended on a persistent secret would either be unrunnable in CI
 * or would require putting one there, and neither is worth it for arithmetic
 * that ephemeral keys prove exactly as well.
 */

function master(): Bytes {
  return new Uint8Array(randomBytes(KEY_BYTES)) as Bytes;
}

const CONTEXT = {
  userId: "11111111-1111-4111-8111-111111111111",
  keyVersion: 1,
  provider: "openai",
} as const;

const OTHER_USER = {
  ...CONTEXT,
  userId: "22222222-2222-4222-8222-222222222222",
} as const;

const PLAINTEXT = "sk-proj-not-a-real-key-0000000000000000000000000000";

describe("BYOK crypto core — round trip", () => {
  it("A3: encrypt then decrypt returns the original plaintext", async () => {
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

    expect(envelope.keyVersion).toBe(CONTEXT.keyVersion);
    await expect(decryptCredential(envelope, key, CONTEXT)).resolves.toBe(PLAINTEXT);
  });

  it("produces a 12-byte IV and a ciphertext at least a tag longer than nothing", async () => {
    const envelope = await encryptCredential(PLAINTEXT, master(), CONTEXT);

    // The two facts migration 202608010065's length CHECKs also assert, so the
    // database constraint and the code that feeds it cannot disagree.
    expect(fromBase64(envelope.iv)).toHaveLength(IV_BYTES);
    expect(fromBase64(envelope.ciphertext)).toHaveLength(
      new TextEncoder().encode(PLAINTEXT).length + TAG_BYTES,
    );
  });
});

describe("BYOK crypto core — A5: no IV or ciphertext is ever reused", () => {
  it("two encryptions of the same plaintext under the same key differ in both", async () => {
    const key = master();
    const first = await encryptCredential(PLAINTEXT, key, CONTEXT);
    const second = await encryptCredential(PLAINTEXT, key, CONTEXT);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);

    // Both still decrypt, so the difference is a fresh IV and not a corrupted
    // write — the failure mode this assertion would otherwise hide.
    await expect(decryptCredential(first, key, CONTEXT)).resolves.toBe(PLAINTEXT);
    await expect(decryptCredential(second, key, CONTEXT)).resolves.toBe(PLAINTEXT);
  });

  it("stays unique across many encryptions, not just two", async () => {
    const key = master();
    const ivs = new Set<string>();
    for (let index = 0; index < 64; index += 1) {
      ivs.add((await encryptCredential(PLAINTEXT, key, CONTEXT)).iv);
    }
    expect(ivs.size).toBe(64);
  });
});

describe("BYOK crypto core — A4: the AAD binds a ciphertext to its owner", () => {
  it("a row copied into another user's identity cannot be decrypted", async () => {
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

    // The positive control first. Without it, the rejection below would pass
    // just as readily against a ciphertext that never decrypted at all.
    await expect(decryptCredential(envelope, key, CONTEXT)).resolves.toBe(PLAINTEXT);

    await expect(decryptCredential(envelope, key, OTHER_USER)).rejects.toBeInstanceOf(
      CredentialUnreadableError,
    );
  });

  it("rejects a changed key_version and a changed provider too", async () => {
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

    // All three AAD components are load-bearing. Testing only `user_id` would
    // let a composition that silently dropped the other two stay green.
    await expect(
      decryptCredential(envelope, key, { ...CONTEXT, keyVersion: 2 }),
    ).rejects.toBeInstanceOf(CredentialUnreadableError);
    await expect(
      decryptCredential(envelope, key, { ...CONTEXT, provider: "anthropic" }),
    ).rejects.toBeInstanceOf(CredentialUnreadableError);
  });

  it("rejects the right ciphertext under the wrong master key", async () => {
    const envelope = await encryptCredential(PLAINTEXT, master(), CONTEXT);
    await expect(decryptCredential(envelope, master(), CONTEXT)).rejects.toBeInstanceOf(
      CredentialUnreadableError,
    );
  });

  it("rejects a tampered ciphertext and a tampered IV", async () => {
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

    const flip = (base64: string) => {
      const bytes = fromBase64(base64);
      bytes[0] ^= 0xff;
      return Buffer.from(bytes).toString("base64");
    };

    await expect(
      decryptCredential({ ...envelope, ciphertext: flip(envelope.ciphertext) }, key, CONTEXT),
    ).rejects.toBeInstanceOf(CredentialUnreadableError);
    await expect(
      decryptCredential({ ...envelope, iv: flip(envelope.iv) }, key, CONTEXT),
    ).rejects.toBeInstanceOf(CredentialUnreadableError);
  });

  it("BYOK-CRYPTO-005: the failure says one word and echoes no bytes", async () => {
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, CONTEXT);

    const error = await decryptCredential(envelope, key, OTHER_USER).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    const rendered = `${(error as Error).name} ${(error as Error).message} ${(error as Error).stack ?? ""}`;

    expect((error as Error).message).toBe("credential_unreadable");
    // Nothing about *why*, and nothing from the row.
    for (const leak of [
      PLAINTEXT,
      envelope.ciphertext,
      envelope.iv,
      CONTEXT.userId,
      OTHER_USER.userId,
      Buffer.from(key).toString("base64"),
    ]) {
      expect(rendered).not.toContain(leak);
    }
    // And no hint at which of tag, key or AAD failed.
    expect(rendered.toLowerCase()).not.toMatch(/\b(tag|aad|authentication|key mismatch)\b/);
  });
});

describe("BYOK crypto core — the AAD composition itself", () => {
  it("is unambiguous across field boundaries", () => {
    // `("ab","c")` and `("a","bc")` must not compose to the same bytes. The unit
    // separator is what prevents it, and this is the test that would fail if
    // somebody switched to a printable joiner.
    const left = composeAad({ userId: "ab", keyVersion: 1, provider: "c" });
    const right = composeAad({ userId: "a", keyVersion: 1, provider: "bc" });
    expect([...left]).not.toEqual([...right]);
  });
});

describe("BYOK crypto core — A6: startup validation, Node half", () => {
  const valid = Buffer.from(randomBytes(KEY_BYTES)).toString("base64");

  it("accepts a well-formed value for both secrets", () => {
    expect(requireMasterKey({ BYOK_MASTER_KEY: valid })).toHaveLength(KEY_BYTES);
    expect(requireFingerprintPepper({ BYOK_FINGERPRINT_PEPPER: valid })).toHaveLength(KEY_BYTES);
  });

  it("fails on an absent value rather than falling back", () => {
    expect(() => requireMasterKey({})).toThrow(/BYOK_MASTER_KEY is not configured/);
    expect(() => requireFingerprintPepper({})).toThrow(
      /BYOK_FINGERPRINT_PEPPER is not configured/,
    );
  });

  it("fails on an empty value, which is what an unset platform secret looks like", () => {
    // `.env.example` ships both names with empty values, so this is the shape a
    // real misconfiguration takes far more often than a missing line.
    expect(() => requireMasterKey({ BYOK_MASTER_KEY: "" })).toThrow(/not configured/);
    expect(() => requireFingerprintPepper({ BYOK_FINGERPRINT_PEPPER: "" })).toThrow(
      /not configured/,
    );
  });

  it("fails on a value of the wrong length", () => {
    const short = Buffer.from(randomBytes(16)).toString("base64");
    const long = Buffer.from(randomBytes(64)).toString("base64");

    expect(() => requireMasterKey({ BYOK_MASTER_KEY: short })).toThrow(/must decode to 32 bytes/);
    expect(() => requireMasterKey({ BYOK_MASTER_KEY: long })).toThrow(/must decode to 32 bytes/);
  });

  it("fails on a value that is not base64 at all", () => {
    expect(() => requireMasterKey({ BYOK_MASTER_KEY: "not base64 !!!" })).toThrow(
      /BYOK_MASTER_KEY/,
    );
  });

  it("never puts the offending value in the message", () => {
    // A startup failure is logged, and a log that echoes the key it rejected has
    // published a secret that was merely mistyped.
    const wrong = Buffer.from(randomBytes(16)).toString("base64");
    const message = (() => {
      try {
        requireMasterKey({ BYOK_MASTER_KEY: wrong });
        return "";
      } catch (caught) {
        return (caught as Error).message;
      }
    })();

    expect(message).not.toContain(wrong);
    expect(message).toContain("BYOK_MASTER_KEY");
  });
});

describe("BYOK crypto core — hmacSha256", () => {
  it("is deterministic for a given pepper and message", async () => {
    const pepper = master();
    const first = await hmacSha256(pepper, "sk-proj-abc");
    const second = await hmacSha256(pepper, "sk-proj-abc");

    expect([...first]).toEqual([...second]);
    expect(first).toHaveLength(32);
  });

  it("changes with the pepper and with the message", async () => {
    const pepper = master();
    const base = await hmacSha256(pepper, "sk-proj-abc");

    expect([...(await hmacSha256(master(), "sk-proj-abc"))]).not.toEqual([...base]);
    expect([...(await hmacSha256(pepper, "sk-proj-abd"))]).not.toEqual([...base]);
  });
});
