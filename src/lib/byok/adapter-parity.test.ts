import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Secret, SECRET_SERIALIZATION_MESSAGE } from "./secret";

/**
 * `BYOK-ADAPTER-004` — the adapter half of the Node/Deno parity lock, and gate
 * D9's deliberate-divergence proof.
 *
 * `parity.test.ts` already holds the **envelope** in step: constants, AAD
 * composition, the crypto core. This file holds the two layers above it — the
 * branded secret and the credential adapter — because those are where the two
 * runtimes are *allowed* to differ, and a permitted difference is exactly where
 * an unnoticed one hides.
 *
 * ## What is required to be identical, and what is required to differ
 *
 * Identical: the failure vocabulary, the `bytea` → base64 conversion, the
 * usability rule for a resolver row, and every member of `Secret` that closes a
 * leak path.
 *
 * Different, deliberately, and asserted **as** differences so they stay
 * decisions:
 *
 *   * `Secret`'s inspection hook — `nodejs.util.inspect.custom` in Node,
 *     `Deno.customInspect` in Deno. Installing Node's in the Deno copy would
 *     leave the most common accidental path open while looking correct;
 *   * the adapter's control flow — Node returns a discriminated union because
 *     its caller is a Server Action rendering copy; Deno throws a `JobFailure`
 *     because its caller is a job handler whose only next move is to fail the
 *     job with that code. Same words, different shape.
 *
 * ## Why a structural comparison rather than a digest
 *
 * `parity.test.ts` digests, because the envelope must be byte-identical. These
 * two files cannot be, so a digest would either fail permanently or be pinned to
 * a value nobody could interpret. What is compared instead is the *set of things
 * that matter*, extracted from both sources — and `assertDiverges` below proves
 * the comparison actually has teeth by feeding it a mutated copy.
 */

const REPO = path.resolve(__dirname, "../../..");

const NODE_ADAPTER = "src/lib/byok/adapter.ts";
const NODE_SECRET = "src/lib/byok/secret.ts";
const DENO_ADAPTER = "supabase/functions/_shared/byok-adapter.ts";
const DENO_SECRET = "supabase/functions/_shared/byok-secret.ts";

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8").replace(/\r\n/g, "\n");
}

/** Comments stripped: the two files document the same rules in different words. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

/** Every `credential_*` / failure code a source mentions, deduplicated. */
function vocabulary(source: string): string[] {
  return [
    ...new Set(
      [...code(source).matchAll(/"(credential_(?:required|unavailable|unreadable))"/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

/** The class members a `Secret` implementation declares. */
function secretMembers(source: string): string[] {
  const body = code(source);
  const members = new Set<string>();
  for (const match of body.matchAll(/^\s{2}(?:readonly\s+|get\s+|async\s+)?([#\w[\]".]+)\s*[(:=]/gm)) {
    members.add(match[1]);
  }
  for (const match of body.matchAll(/^\s{2}(?:get\s+)?\[(Symbol\.\w+|Symbol\.for\([^)]+\))\]/gm)) {
    members.add(match[1]);
  }
  return [...members].sort();
}

describe("BYOK-ADAPTER-004: the two adapters speak one vocabulary", () => {
  it("declares the same three credential failure codes", () => {
    const node = vocabulary(read(NODE_ADAPTER));
    const deno = vocabulary(read(DENO_ADAPTER));

    expect(node).toEqual(["credential_required", "credential_unavailable", "credential_unreadable"]);
    expect(deno).toEqual(node);
  });

  it("converts bytea identically, character for character", () => {
    // The seam where a wrong assumption is invisible until a real decryption
    // fails: PostgREST returns `bytea` as `\x`-prefixed hex, the envelope format
    // speaks base64. Both copies must do the same thing to the same input.
    const extract = (source: string) => {
      const body = /function byteaToBase64\(value: string\): string \{([\s\S]*?)\n\}/.exec(
        code(source),
      );
      expect(body, "both adapters must carry byteaToBase64").not.toBeNull();
      return body![1].replace(/\s+/g, " ").trim();
    };

    const node = extract(read(NODE_ADAPTER));
    const deno = extract(read(DENO_ADAPTER));

    expect(deno).toBe(node);
  });

  it("applies the same usability rule to a resolver row", () => {
    const extract = (source: string) => {
      const body = /function isUsable\(([\s\S]*?)\n\}/.exec(code(source));
      expect(body, "both adapters must carry isUsable").not.toBeNull();
      return body![1].replace(/\s+/g, " ").trim();
    };

    expect(extract(read(DENO_ADAPTER))).toBe(extract(read(NODE_ADAPTER)));
  });

  it("neither adapter accepts an owner it was handed", () => {
    // The invariant that makes the worker safe, stated against both sources so
    // a future signature change on either side fails here.
    const deno = code(read(DENO_ADAPTER));
    expect(deno).toMatch(/resolveJobCredential\(\s*service: SupabaseClient,\s*jobId: string,/);
    // No `userId` parameter, and the AAD owner is read from the row.
    expect(deno).not.toMatch(/resolveJobCredential\([^)]*userId/);
    expect(deno).toMatch(/\.from\("jobs"\)[\s\S]{0,200}\.select\("user_id"\)/);
    expect(deno).toMatch(/jobRow\.user_id/);

    // Node's synchronous resolver takes a `userId`, and that is not a
    // divergence — it composes the AAD only, the owner comes from `auth.uid()`
    // inside the RPC, and a mismatch fails decryption rather than escalating.
    // Asserted so the asymmetry stays documented rather than looking like drift.
    const node = code(read(NODE_ADAPTER));
    expect(node).toMatch(/resolve_own_ai_credential/);
    expect(node).not.toMatch(/p_user_id/);
    expect(deno).not.toMatch(/p_user_id/);
  });

  it("declares the divergence in control flow, in both directions", () => {
    const node = code(read(NODE_ADAPTER));
    const deno = code(read(DENO_ADAPTER));

    // Node returns; Deno throws. Each must do only its own thing.
    expect(node).toMatch(/return \{ outcome: "credential_required" \}/);
    expect(node).not.toMatch(/throw new JobFailure/);
    expect(deno).toMatch(/throw new JobFailure\("credential_required"\)/);
    expect(deno).not.toMatch(/outcome: "credential_required"/);
  });
});

describe("BYOK-ADAPTER-004: the two Secrets close the same leak paths", () => {
  it("declares the same members, apart from the runtime inspection hook", () => {
    const node = secretMembers(read(NODE_SECRET));
    const deno = secretMembers(read(DENO_SECRET));

    const nodeHook = 'Symbol.for("nodejs.util.inspect.custom")';
    const denoHook = 'Symbol.for("Deno.customInspect")';

    expect(node).toContain(nodeHook);
    expect(deno).toContain(denoHook);
    expect(node).not.toContain(denoHook);
    expect(deno).not.toContain(nodeHook);

    // Everything else is identical.
    expect(deno.filter((member) => member !== denoHook)).toEqual(
      node.filter((member) => member !== nodeHook),
    );

    // And the members that matter are actually present, so a copy that lost
    // `Symbol.toPrimitive` — the single most likely leak, since template
    // literals bypass `toString` entirely — fails rather than passes by
    // matching an equally impoverished counterpart.
    for (const required of ["expose", "toString", "toJSON", "Symbol.toPrimitive", "#value"]) {
      expect(node, `Node's Secret must declare ${required}`).toContain(required);
      expect(deno, `Deno's Secret must declare ${required}`).toContain(required);
    }
  });

  it("uses the same serialization message, so one grep finds every incident", () => {
    const message = /SECRET_SERIALIZATION_MESSAGE =\s*\n?\s*"([^"]+)"/;
    const nodeMessage = message.exec(read(NODE_SECRET))?.[1];
    const denoMessage = message.exec(read(DENO_SECRET))?.[1];

    expect(nodeMessage).toBeTruthy();
    expect(denoMessage).toBe(nodeMessage);
    expect(nodeMessage).toBe(SECRET_SERIALIZATION_MESSAGE);
  });

  it("throws on every accidental path, executed rather than read", () => {
    // The Node half, run. The Deno half is run by
    // `supabase/functions/_shared/byok-adapter.test.ts`, which asserts the same
    // four paths plus `Deno.inspect`.
    const secret = new Secret("sk-proj-fixture-not-a-real-key");
    expect(() => JSON.stringify(secret)).toThrow();
    expect(() => `${secret}`).toThrow();
    expect(() => String(secret)).toThrow();
    expect(() => secret.toString()).toThrow();
    expect(secret.expose()).toBe("sk-proj-fixture-not-a-real-key");
  });
});

describe("gate D9: the parity lock fails on a deliberate divergence", () => {
  /**
   * The comparison, applied to a mutated copy.
   *
   * A parity test that has never been shown to fail is a parity test nobody can
   * trust — `policy-lock.test.ts` records a review rewriting a policy table with
   * a fully green suite. So each mutation below is one a careless change would
   * actually make, and each must be caught.
   */
  const compareVocabulary = (a: string, b: string) => vocabulary(a).join() === vocabulary(b).join();
  const compareMembers = (a: string, b: string) => secretMembers(a).join() === secretMembers(b).join();

  it("catches a renamed failure code", () => {
    const node = read(NODE_ADAPTER);
    const drifted = read(DENO_ADAPTER).replace(/credential_unreadable/g, "credential_corrupt");

    expect(compareVocabulary(node, read(DENO_ADAPTER))).toBe(true);
    expect(compareVocabulary(node, drifted)).toBe(false);
  });

  it("catches a dropped failure code", () => {
    const node = read(NODE_ADAPTER);
    const drifted = read(DENO_ADAPTER).replace(/"credential_unavailable"/g, '"credential_required"');

    expect(compareVocabulary(node, drifted)).toBe(false);
  });

  it("catches a Secret that quietly lost a leak-closing member", () => {
    const node = read(NODE_SECRET);
    const drifted = read(DENO_SECRET).replace(
      /  \[Symbol\.toPrimitive\]\(\): never \{[\s\S]*?\n  \}\n/,
      "",
    );

    // Asserted against the extracted member set rather than the raw text: both
    // files *document* `Symbol.toPrimitive` in their headers, so a `toContain`
    // over the source would pass while the method was gone — which is precisely
    // the failure this test is here to catch.
    expect(secretMembers(drifted)).not.toContain("Symbol.toPrimitive");
    expect(compareMembers(node, drifted)).toBe(false);
  });

  it("catches a byteaToBase64 that stopped agreeing", () => {
    const extract = (source: string) =>
      /function byteaToBase64\(value: string\): string \{([\s\S]*?)\n\}/
        .exec(code(source))![1]
        .replace(/\s+/g, " ")
        .trim();

    const node = extract(read(NODE_ADAPTER));
    const drifted = extract(read(DENO_ADAPTER).replace("hex.length / 2", "hex.length"));

    expect(drifted).not.toBe(node);
  });
});
