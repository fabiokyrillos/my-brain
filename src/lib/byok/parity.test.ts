import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { composeAad, IV_BYTES, KEY_BYTES, TAG_BYTES } from "./envelope";

/**
 * BYOK-ADAPTER-004 — the Node/Deno parity lock.
 *
 * `src/lib/byok/crypto.ts` imports `server-only`, which throws under Deno, so
 * the worker carries its own copy in
 * `supabase/functions/_shared/byok-envelope.ts`. That is the same constraint
 * that already forces `process-jobs/entry.ts` to duplicate the extraction prompt
 * and schema, and the repository's answer is the same: not "share the file" but
 * **"prove the two agree"**, the way `extraction-parity.test.ts` does.
 *
 * Two instruments, because they catch different things:
 *
 *   * `scripts/byok-crypto-interop.mjs` (gate G-0.2) encrypts in one runtime and
 *     decrypts in the other, both directions. It is the *behavioural* proof and
 *     the only one that can catch a genuine format divergence;
 *   * this file digests the constants and the AAD composition out of both
 *     sources. It is the *cheap* proof, it runs on every `vitest` invocation,
 *     and it fails the moment somebody edits one file and not the other —
 *     before CI ever gets to run the interop script.
 *
 * A digest rather than a prose comparison, for the reason `policy-lock.test.ts`
 * records: a format regex over a version constant does not enforce agreement,
 * and a review demonstrated that by rewriting a policy table with a fully green
 * suite. Change the composition and the digest moves.
 */

const REPO = resolve(__dirname, "../../..");
const DENO_SOURCE = join(REPO, "supabase/functions/_shared/byok-envelope.ts");

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

/** The constants, read out of the Deno source rather than imported from it. */
function denoConstants(): Record<string, number> {
  const source = readFileSync(DENO_SOURCE, "utf8");
  const constants: Record<string, number> = {};
  for (const match of source.matchAll(/export const (IV_BYTES|TAG_BYTES|KEY_BYTES) = (\d+);/g)) {
    constants[match[1]] = Number(match[2]);
  }
  return constants;
}

describe("BYOK-ADAPTER-004: the two runtimes implement one format", () => {
  it("declares the same envelope constants in both sources", () => {
    expect(denoConstants()).toEqual({
      IV_BYTES,
      TAG_BYTES,
      KEY_BYTES,
    });
  });

  it("uses the same AAD separator byte in both sources", () => {
    // `0x1f` is chosen because it cannot appear in a uuid, an integer rendered
    // as text, or a provider slug — so `("ab","c")` and `("a","bc")` cannot
    // compose to the same AAD. A printable separator would be harmless until the
    // day one of those fields accepted a wider alphabet.
    const source = readFileSync(DENO_SOURCE, "utf8");
    expect(source).toMatch(/const SEPARATOR = 0x1f;/);

    const node = readFileSync(join(REPO, "src/lib/byok/envelope.ts"), "utf8");
    expect(node).toMatch(/const SEPARATOR = 0x1f;/);
  });

  it("composes the AAD to the same bytes for the same context", () => {
    // The Node composition is executed; the Deno one is compared structurally,
    // because importing it here would need a Deno runtime. The *behavioural*
    // equality is what `byok:interop` proves — this catches the edit, that
    // catches the divergence.
    const bytes = composeAad({
      userId: "11111111-1111-4111-8111-111111111111",
      keyVersion: 1,
      provider: "openai",
    });

    expect(digest([...bytes])).toBe("f6a0d60a758c944e");

    // The unit separators are present, and there are exactly two of them.
    expect([...bytes].filter((byte) => byte === 0x1f)).toHaveLength(2);
  });

  it("keeps the two compositions textually identical, function body for function body", () => {
    // The strongest cheap check available: the whole `composeAad` body from each
    // file, normalised for whitespace. A behavioural divergence has to pass
    // through an edit here first.
    const body = (source: string) => {
      const start = source.indexOf("export function composeAad");
      const end = source.indexOf("\n}", start);
      return source.slice(start, end).replace(/\s+/g, " ").trim();
    };

    const node = body(readFileSync(join(REPO, "src/lib/byok/envelope.ts"), "utf8"));
    const deno = body(readFileSync(DENO_SOURCE, "utf8"));

    expect(node.length).toBeGreaterThan(100);
    expect(deno).toBe(node);
  });

  it("fails the same way in both runtimes, with one word and no byte echo", () => {
    const node = readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8");
    const deno = readFileSync(DENO_SOURCE, "utf8");

    for (const [name, source] of [["node", node], ["deno", deno]] as const) {
      expect(source, `${name} must carry the single-word failure`).toMatch(
        /super\("credential_unreadable"\)/,
      );
      // A total catch, so an authentication failure and a malformed input are
      // indistinguishable to the caller.
      expect(source, `${name} must catch totally`).toMatch(/\}\s*catch\s*\{/);
    }
  });

  it("reads no environment inside either crypto core", () => {
    // The master key arrives as an argument in both. A module that found its own
    // key could encrypt under one the caller did not intend, and the only place
    // that is allowed to look is the explicit startup check.
    const node = readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8");
    const deno = readFileSync(DENO_SOURCE, "utf8");

    // `requireMasterKey` is the one sanctioned reader in each file.
    expect(node.match(/process\.env/g) ?? []).toHaveLength(1);
    expect(deno.match(/Deno\.env\.get/g) ?? []).toHaveLength(1);
    expect(node).toMatch(/export function requireMasterKey/);
    expect(deno).toMatch(/export function requireMasterKey/);
  });
});
