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

  it("reads the environment only inside the two sanctioned startup checks", () => {
    // Every secret arrives as an argument everywhere else. A module that found
    // its own key could encrypt under one the caller did not intend, and the
    // only places allowed to look are the explicit startup checks.
    const node = readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8");
    const deno = readFileSync(DENO_SOURCE, "utf8");

    // Three sanctioned readers in Node, two in Deno, and exactly those. The
    // counts are asserted rather than the names alone, so an extra read added
    // inside any function's body — the easiest place to hide one — moves the
    // number.
    //
    // The asymmetry is the third secret. `BYOK_RATE_LIMIT_PEPPER` (ADR-070)
    // keys the validation throttle's `ip_hash`, and validation happens on the
    // Node Settings path. The worker never validates and never throttles, so a
    // reader there would be a consumer-less contract — the same reasoning that
    // keeps `hmacSha256` out of the Deno core, asserted the same way below.
    //
    // In the Node file both occurrences are the `= process.env` default
    // parameter, one per function. That is the read, and it is a default rather
    // than a direct lookup so the tests can exercise absence and malformation by
    // passing an object instead of mutating the real environment — which under
    // a parallel test runner would be a shared mutable global.
    //
    // Four in Node since `BYOK-ROTATION`: `requireMasterKeyRing` is the fourth
    // sanctioned startup check, and it takes its environment through the same
    // `= process.env` default so absence and malformation stay testable without
    // mutating a shared global. The worker's count is unchanged — its rotation
    // window lives in `byok-rotation.ts`, which reads `Deno.env` itself because
    // the worker has no equivalent seam, and `rotation-parity.test.ts` asserts
    // that asymmetry so it stays a decision rather than drift.
    expect(node.match(/process\.env/g) ?? []).toHaveLength(4);
    expect(deno.match(/Deno\.env\.get/g) ?? []).toHaveLength(2);

    for (const [name, source] of [["node", node], ["deno", deno]] as const) {
      expect(source, `${name} validates the master key at startup`).toMatch(
        /export function requireMasterKey/,
      );
      expect(source, `${name} validates the fingerprint pepper at startup`).toMatch(
        /export function requireFingerprintPepper/,
      );
    }

    // Node only, and asserted in both directions so neither adding it to the
    // worker nor deleting it from Node passes silently.
    expect(node).toMatch(/export function requireRateLimitPepper/);
    expect(deno).not.toMatch(/export function requireRateLimitPepper/);
  });

  it("records the one asymmetry between the cores rather than letting it drift", () => {
    // BYOK-ADAPTER-004 locks envelope format, AAD composition, status handling
    // and failure vocabulary — all of which are identical above. `hmacSha256`
    // is none of those: it is the fingerprint primitive, the fingerprint is
    // computed once at save time on the Node Settings path, and the worker never
    // computes one. Exporting it from the Deno core would be a consumer-less
    // contract.
    //
    // So the asymmetry is intended — and asserted in **both** directions, so
    // neither "somebody added HMAC to the worker" nor "somebody deleted it from
    // Node" can pass silently. If BYOK.4 ever does need it, this test is the
    // thing that has to change first.
    const node = readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8");
    const deno = readFileSync(DENO_SOURCE, "utf8");

    // Matched on the *declaration*, not on any mention: the Deno file explains
    // the asymmetry in prose, and a bare `/hmacSha256/` would be failed by its
    // own comment — a guard that forbids documenting the thing it guards.
    expect(node).toMatch(/export async function hmacSha256/);
    expect(deno).not.toMatch(/(?:export\s+)?(?:async\s+)?(?:function|const|let|var)\s+hmacSha256/);
  });

  it("wires both startup checks to the one validator, in both runtimes", () => {
    // This assertion belongs to the Deno suite by subject and lives here by
    // necessity: it reads the worker source as text, `Deno.readTextFile` needs
    // `--allow-read`, and the worker job runs with no `--allow-*` flags so it can
    // never reach a network. The Node side already reads that file for the parity
    // lock, so the check costs nothing here and would cost the permission-free
    // guarantee there.
    //
    // What it proves: neither runtime validates a secret twice, differently. A
    // second implementation is how "fails to start" becomes "fails to start in
    // one of the two places".
    const sources = {
      node: readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8"),
      deno: readFileSync(DENO_SOURCE, "utf8"),
    } as const;

    const wiring = [
      ["requireMasterKey", "BYOK_MASTER_KEY"],
      ["requireFingerprintPepper", "BYOK_FINGERPRINT_PEPPER"],
    ] as const;

    for (const [runtime, source] of Object.entries(sources)) {
      for (const [fn, variable] of wiring) {
        const declaration = source.indexOf(`export function ${fn}(`);
        expect(declaration, `${runtime}.${fn} must exist`).toBeGreaterThan(-1);

        const body = source.slice(declaration, source.indexOf("\n}", declaration));
        expect(body, `${runtime}.${fn} must read ${variable}`).toContain(variable);
        expect(body, `${runtime}.${fn} must delegate to decodeMasterKey`).toContain(
          "decodeMasterKey(",
        );
      }
    }
  });
});
