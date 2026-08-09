/**
 * `2K-CONT-003` / `2K-CONT-005` / `2K-CONT-006` / `2K-CONT-007` and **R17** —
 * the structural half of slice 2K.3.
 *
 * `continuity.test.ts` proves the payload refuses each forbidden field. This
 * proves the *repository* has not grown a second way to do it: no module in the
 * continuity path builds a handle with a clock in it, no return path applies
 * anything, and no text anywhere offers the implementer a **choice** between
 * transporting a clock and re-asking — which is the second half of the defect
 * ADR-100 corrected, and the half a field-by-field guard would miss.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CONTINUITY = "src/features/conversation-cards/continuity.ts";
const RESUME = "src/features/conversation-cards/resume.ts";
const THREAD = "src/app/[locale]/app/chat/[conversationId]/page.tsx";

/** The shapes a handle would take if it started carrying authority. */
const AUTHORITY_IN_PAYLOAD =
  /\b(issuedAt|observedBefore|confirmationId|operationKey|requestFingerprint|fingerprint)\s*:/;

describe("2K-CONT-003: nothing in the continuity path puts authority in the payload", () => {
  it("declares no authority-bearing field on the schema", () => {
    // The schema literal itself. `CONTINUITY_FORBIDDEN_FIELDS` is a list of
    // strings and is deliberately not matched by this — it names what is
    // refused, which is the opposite of declaring it.
    const schema = code(CONTINUITY).match(/const handleSchema = z[\s\S]*?\.strict\(\);/)?.[0] ?? "";
    expect(schema, "handleSchema not found").not.toBe("");
    expect(AUTHORITY_IN_PAYLOAD.test(schema)).toBe(false);
  });

  it("keeps the schema strict, which is what refuses a field nobody listed", () => {
    expect(code(CONTINUITY)).toMatch(/\.strict\(\)/);
  });

  it("fires on a planted violation, so the absence above means something", () => {
    for (const planted of [
      "const handleSchema = z.object({ issuedAt: z.string() }).strict();",
      "const handleSchema = z.object({ operationKey: z.string() }).strict();",
      "const handleSchema = z.object({ requestFingerprint: z.string() }).strict();",
    ]) {
      expect(AUTHORITY_IN_PAYLOAD.test(planted), planted).toBe(true);
    }
    expect(AUTHORITY_IN_PAYLOAD.test("const handleSchema = z.object({ c: z.string().uuid() }).strict();"))
      .toBe(false);
  });
});

describe("2K-CONT-005: the return mints its own clock and restores nothing computed", () => {
  it("mints a new instant on the return path", () => {
    expect(code(RESUME)).toMatch(/const issuedAt = new Date\(\)\.toISOString\(\)/);
  });

  it("accepts no clock from the handle", () => {
    // The other direction: not only does it mint one, there is no path by which
    // one could arrive. `handle.` is the only thing the resume reads from the
    // payload, and the schema has no clock on it.
    expect(code(RESUME)).not.toMatch(/handle\.(issuedAt|observedBefore|fingerprint|session|expected)/);
  });

  it("restores no stored preview, command or session", () => {
    expect(code(RESUME)).not.toMatch(/parseTaskCommandSession|deriveTaskCommand|buildTaskCommandPreview/);
  });
});

describe("2K-CONT-007: no path auto-reapplies on return", () => {
  it("issues no mutation of any kind", () => {
    const resume = code(RESUME);
    expect(resume).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });

  it("reads only the two tables a handle can name, and only the owner's rows", () => {
    const resume = code(RESUME);
    const tables = [...resume.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(["conversation_messages", "entries", "memories"]);
    // Ownership is RLS's answer; the explicit predicate is the repository's
    // "prove it twice" convention, and its absence would be a silent widening.
    expect(resume.match(/\.eq\("user_id", user\.id\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("constructs no service-role client", () => {
    expect(code(RESUME)).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient/);
  });
});

describe("2K-CONT-006 / R17: the contract has one reading, and no text offers a second", () => {
  it("types the fresh-confirmation requirement as the literal `true`", () => {
    // A boolean would let a future edit set it false and still compile. The
    // property "no branch reuses a prior confirmation" must not be reachable by
    // an edit, which is why it is a type rather than a value.
    expect(code(CONTINUITY)).toMatch(/requiresFreshConfirmation: true/);
  });

  it("has no shape in which a prior confirmation could be returned", () => {
    const resumption = code(CONTINUITY).match(/export type ContinuityResumption = \{[\s\S]*?\};/)?.[0] ?? "";
    expect(resumption, "ContinuityResumption not found").not.toBe("");
    /*
     * Named fields, not a word scan. `requiresFreshConfirmation` contains
     * "confirmation" and is the **opposite** of the thing being refused — it is
     * the literal `true` that makes reuse unreachable. A coarse match would
     * fire on the field that proves the property.
     */
    for (const forbidden of [
      "confirmationId",
      "confirmation:",
      "preview:",
      "session:",
      "fingerprint",
      "patch:",
      "command:",
      "observedBefore",
      "operationKey",
    ]) {
      expect(resumption, `ContinuityResumption carries ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("offers no CHOICE between carrying a clock and re-asking, in any 2K.3 file", () => {
    /*
     * R17's second half, and the one a field-by-field guard cannot catch. The
     * original defect was the word "or": *"must carry the original pinned
     * issuedAt … OR state plainly that a fresh confirmation is required"*. A
     * contract with two readings is not a contract.
     *
     * Matched on prose as well as code, because prose is where it appeared.
     */
    const OPTIONAL_CLOCK = /(carry|transport|reuse|preserve)[^.]{0,80}\b(issuedAt|clock|confirmation)\b[^.]{0,80}\bor\b[^.]{0,120}\bfresh confirmation\b/i;
    for (const file of [CONTINUITY, RESUME]) {
      expect(OPTIONAL_CLOCK.test(read(file)), file).toBe(false);
    }
    // Non-vacuity: the detector fires on the exact sentence ADR-100 removed.
    expect(
      OPTIONAL_CLOCK.test(
        "Continuity must carry the original pinned issuedAt across the navigation, or state plainly that a fresh confirmation is required.",
      ),
    ).toBe(true);
  });
});

describe("2K-CONT-001: the thread gives every message a stable anchor", () => {
  it("renders the derived anchor id, and derives it rather than inlining it", () => {
    const thread = code(THREAD);
    expect(thread).toMatch(/messageAnchorId\(/);
    // A hand-built `id={`message-${…}`}` beside the helper would be a second
    // place the anchor's shape is decided, and the two could drift.
    expect(thread).not.toMatch(/id=\{`message-\$\{/);
  });
});
