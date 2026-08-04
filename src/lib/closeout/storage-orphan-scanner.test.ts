/**
 * SH-STORAGE-001/003 and SH-DELETE-013: the scanner classifies by structure,
 * and it cannot delete.
 *
 * The destructive-capability assertions are the same shape
 * `egc-operations.test.ts` uses on the EGC verifier, and for the same stated
 * reason: a scanner that *could* delete would eventually be pointed at
 * production by somebody trying to turn a red gate green.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyObject, ORPHAN_CLASSES } from "../../../scripts/verify-storage-orphans.mjs";

const rawSource = readFileSync(
  join(process.cwd(), "scripts/verify-storage-orphans.mjs"),
  "utf8",
);

/**
 * Comments stripped before scanning — the fourth time in this initiative's
 * guard family that a scan would otherwise fail on its own explanation. The
 * file must be able to say "this holds no delete call" without that sentence
 * counting as one.
 */
const source = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

describe("the scanner holds no destructive capability", () => {
  it.each([".delete(", ".remove(", ".rpc(", "deleteUser", ".upsert(", ".update("])(
    "contains no %s",
    (fragment) => {
      expect(source).not.toContain(fragment);
    },
  );

  it("says in its own text that removal is a separate owner-authorized step", () => {
    // Against the RAW source: this one is about the prose, which the scan above
    // deliberately removes.
    expect(rawSource).toContain("SH-DELETE-015");
  });

  it("does not scan on import, so a unit test cannot reach a live project", () => {
    expect(source).toContain("import.meta.url === pathToFileURL(process.argv[1]).href");
  });
});

describe("classification is structural, never by name", () => {
  const owners = new Set([OWNER, OTHER]);

  it("a referenced object of a live owner is live", () => {
    const byPath = new Map([[`${OWNER}/a.pdf`, OWNER]]);
    expect(classifyObject(`${OWNER}/a.pdf`, owners, byPath)).toBe("live");
  });

  it("an object whose prefix is not a live account is absent-owner", () => {
    const byPath = new Map();
    expect(classifyObject(`${GONE}/a.pdf`, owners, byPath)).toBe("absent-owner");
  });

  it("an unreferenced object of a live owner is absent-row", () => {
    const byPath = new Map();
    expect(classifyObject(`${OWNER}/a.pdf`, owners, byPath)).toBe("absent-row");
  });

  it("an object referenced by a different owner's row is cross-owner", () => {
    const byPath = new Map([[`${OWNER}/a.pdf`, OTHER]]);
    expect(classifyObject(`${OWNER}/a.pdf`, owners, byPath)).toBe("cross-owner");
  });

  it("cross-owner outranks absent-owner: a dead prefix with a live foreign reference still refuses", () => {
    const byPath = new Map([[`${GONE}/a.pdf`, OTHER]]);
    expect(classifyObject(`${GONE}/a.pdf`, owners, byPath)).toBe("cross-owner");
  });

  it("a path with no uuid prefix is unparseable rather than assumed orphaned", () => {
    const byPath = new Map();
    expect(classifyObject("loose-file.pdf", owners, byPath)).toBe("unparseable");
    expect(classifyObject("not-a-uuid/a.pdf", owners, byPath)).toBe("unparseable");
  });

  it("identical names under different prefixes classify independently", () => {
    // The T-09 property at the classification level: the name carries no
    // weight at all, only the prefix does.
    const byPath = new Map([[`${OWNER}/fatura.pdf`, OWNER]]);
    expect(classifyObject(`${OWNER}/fatura.pdf`, owners, byPath)).toBe("live");
    expect(classifyObject(`${GONE}/fatura.pdf`, owners, byPath)).toBe("absent-owner");
  });

  it("every class the scanner can return is declared", () => {
    const byPath = new Map([[`${OWNER}/x.pdf`, OTHER]]);
    const produced = new Set([
      classifyObject(`${OWNER}/a.pdf`, owners, new Map([[`${OWNER}/a.pdf`, OWNER]])),
      classifyObject(`${GONE}/a.pdf`, owners, new Map()),
      classifyObject(`${OWNER}/b.pdf`, owners, new Map()),
      classifyObject(`${OWNER}/x.pdf`, owners, byPath),
      classifyObject("loose.pdf", owners, new Map()),
    ]);
    for (const name of produced) expect(ORPHAN_CLASSES).toContain(name);
    expect(produced.size).toBe(ORPHAN_CLASSES.length);
  });
});
