import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyPrefix,
  computeFingerprint,
  FINGERPRINT_HEX_LENGTH,
  FINGERPRINT_PREFIXES,
  formatFingerprint,
  UNKNOWN_PREFIX,
} from "./fingerprint";
import { KEY_BYTES, type Bytes } from "./envelope";

/**
 * BYOK-FINGERPRINT-001…005.
 *
 * The load-bearing assertion in this file is the last one: the closed prefix
 * vocabulary exists twice — once in TypeScript, once as a CHECK constraint in
 * migration `202608010065` — and a vocabulary duplicated in two places is a
 * vocabulary that drifts. It is read out of the migration and compared, rather
 * than restated here, so adding a prefix in one place and not the other reds the
 * build.
 */

const MIGRATION = "supabase/migrations/202608010065_byok_credential_store.sql";

function pepper(): Bytes {
  return new Uint8Array(randomBytes(KEY_BYTES)) as Bytes;
}

/** Line endings normalized: CRLF on a Windows checkout, LF in CI. */
function migrationSource(): string {
  return readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8").replace(/\r\n/g, "\n");
}

const PROJECT_KEY = "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LEGACY_KEY = "sk-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("BYOK-FINGERPRINT-004: the prefix comes from a closed allowlist", () => {
  it("classifies the two known shapes", () => {
    expect(classifyPrefix(PROJECT_KEY)).toBe("sk-proj");
    expect(classifyPrefix(LEGACY_KEY)).toBe("sk");
  });

  it("prefers the longest match, so a project key is never classified as legacy", () => {
    // Every `sk-proj-…` key also starts with `sk-`. If the allowlist were an
    // unordered set, or tested shortest-first, this would silently return "sk".
    expect(FINGERPRINT_PREFIXES.indexOf("sk-proj")).toBeLessThan(
      FINGERPRINT_PREFIXES.indexOf("sk"),
    );
    expect(classifyPrefix(PROJECT_KEY)).not.toBe("sk");
  });

  it("falls back to `unknown` and never to a slice of the input", () => {
    for (const value of [
      "",
      "nope",
      "SK-PROJ-uppercase",
      "xk-proj-almost",
      "  sk-proj-leading-space",
      "sk_proj-underscore",
      "skmissing",
      "sk",
    ]) {
      expect(classifyPrefix(value)).toBe(UNKNOWN_PREFIX);
    }
  });

  it("classifies `sk-projwithoutdash` as legacy, which is what it is", () => {
    // Not an oversight in the classifier and not a project key: `sk-proj` only
    // matches when followed by its own separator, so a legacy key that merely
    // starts with those letters falls to `sk`. Asserted because the first draft
    // of the test above expected `unknown` here and was wrong — the classifier
    // was right, and pinning the real answer stops the next reader "fixing" it.
    expect(classifyPrefix("sk-projwithoutdash")).toBe("sk");

    // Same reasoning for the degenerate `"sk-"`: the classifier is a
    // *classifier*, not a validator. Whether a key is well-formed enough to send
    // to a provider is BYOK.3's boundary check; this function's only contract is
    // that it returns a vocabulary member and never a slice of its input.
    expect(classifyPrefix("sk-")).toBe("sk");
  });

  it("is total: no input produces anything outside the vocabulary", () => {
    const vocabulary: string[] = [...FINGERPRINT_PREFIXES, UNKNOWN_PREFIX];
    for (let index = 0; index < 200; index += 1) {
      const random = randomBytes(24).toString("base64url");
      expect(vocabulary).toContain(classifyPrefix(random));
    }
  });
});

describe("BYOK-FINGERPRINT-002/003: the value identifies without revealing", () => {
  it("is `<prefix>:<6 hex>` and matches the database CHECK", async () => {
    const fingerprint = await computeFingerprint(PROJECT_KEY, pepper());

    expect(fingerprint).toMatch(/^(sk-proj|sk|unknown):[0-9a-f]{6}$/);
    expect(fingerprint.split(":")[1]).toHaveLength(FINGERPRINT_HEX_LENGTH);
  });

  it("contains no substring of the key — including the tail", async () => {
    const fingerprint = await computeFingerprint(PROJECT_KEY, pepper());
    const hex = fingerprint.split(":")[1];

    // The tail is the part BYOK-FINGERPRINT-003 names explicitly, because it
    // carries the entropy and it is what a screenshot captures.
    expect(fingerprint).not.toContain(PROJECT_KEY.slice(-4));
    expect(fingerprint).not.toContain(PROJECT_KEY.slice(-6));
    expect(fingerprint).not.toContain(PROJECT_KEY.slice(8));

    // And the reverse direction: no six-character window of the key equals the
    // digest. A weaker assertion would pass for a fingerprint that simply *was*
    // a slice, as long as it was not one of the three tested above.
    const windows = new Set<string>();
    for (let index = 0; index + 6 <= PROJECT_KEY.length; index += 1) {
      windows.add(PROJECT_KEY.slice(index, index + 6));
    }
    expect(windows.has(hex)).toBe(false);
  });

  it("is stable for the same key and pepper, so a re-paste is detectable", async () => {
    const secret = pepper();
    await expect(computeFingerprint(PROJECT_KEY, secret)).resolves.toBe(
      await computeFingerprint(PROJECT_KEY, secret),
    );
  });

  it("differs for a different key under the same pepper", async () => {
    const secret = pepper();
    const first = await computeFingerprint(PROJECT_KEY, secret);
    const second = await computeFingerprint(`${PROJECT_KEY}b`, secret);
    expect(first).not.toBe(second);
  });

  it("differs for the same key under a different pepper", async () => {
    // This is what makes a stolen database unable to confirm a guessed key by
    // recomputation: without the pepper the six characters cannot be reproduced.
    const first = await computeFingerprint(PROJECT_KEY, pepper());
    const second = await computeFingerprint(PROJECT_KEY, pepper());
    expect(first).not.toBe(second);
  });
});

describe("formatFingerprint parses rather than trusts", () => {
  it("renders the stored shape for humans", () => {
    expect(formatFingerprint("sk-proj:a3f9c1")).toBe("sk-proj · a3f9c1");
    expect(formatFingerprint("unknown:000000")).toBe("unknown · 000000");
  });

  it("refuses to echo anything that is not the stored shape", () => {
    // A row written past the CHECK constraint — by a future migration bug, or by
    // a privileged path — still cannot put arbitrary text on a page.
    for (const hostile of [
      "<script>alert(1)</script>",
      "sk-proj:ZZZZZZ",
      "sk-proj:a3f9c",
      "sk-proj:a3f9c1extra",
      "evil:a3f9c1",
      "",
    ]) {
      expect(formatFingerprint(hostile)).toBe(UNKNOWN_PREFIX);
    }
  });
});

describe("the vocabulary exists once, in two languages, and cannot drift", () => {
  it("the migration's CHECK lists exactly the TypeScript prefixes plus `unknown`", () => {
    const source = migrationSource();
    const match = /fingerprint ~ '\^\(([^)]+)\):\[0-9a-f\]\{(\d+)\}\$'/.exec(source);

    expect(match, "the fingerprint CHECK must be findable in the migration").not.toBeNull();

    const inMigration = match![1].split("|");
    const inTypeScript = [...FINGERPRINT_PREFIXES, UNKNOWN_PREFIX];

    // Compared as sorted sets in both directions: a prefix added to either side
    // alone fails, and so does one removed from either side alone.
    expect([...inMigration].sort()).toEqual([...inTypeScript].sort());
    expect(Number(match![2])).toBe(FINGERPRINT_HEX_LENGTH);
  });

  it("the migration's CHECK preserves longest-match order for the overlapping pair", () => {
    // Postgres alternation is ordered too, and `^(sk|sk-proj):` would classify
    // every project key as legacy. The TypeScript order is asserted above; this
    // is the same property on the SQL side.
    const source = migrationSource();
    const alternation = /fingerprint ~ '\^\(([^)]+)\)/.exec(source)![1].split("|");
    expect(alternation.indexOf("sk-proj")).toBeLessThan(alternation.indexOf("sk"));
  });
});
