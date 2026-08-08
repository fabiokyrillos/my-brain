/**
 * `2J-PRIVACY-001`'s structural guard.
 *
 * OD-2J-1's operative sentence is *"do not let individual components invent
 * their own behaviour."* That is a property about code shape, so a test that
 * only checked rendered output would miss the case that matters: a new surface
 * quietly writing `if (row.sensitivity === "highly_sensitive")` and getting the
 * answer *almost* right.
 *
 * This guard fails the build when a Phase 2J surface names a literal
 * sensitivity level outside the contract module.
 *
 * ## The two exemptions, and why each is narrow
 *
 * 1. `src/features/sensitivity/**` — the contract and its own tests. A control
 *    exempt from the mechanism it controls proves nothing, so this exemption is
 *    bounded to the module that *is* the mechanism.
 * 2. `src/features/search/**` — ADR-093 signed search's behaviour in Phase 2I
 *    and OD-2J-1 explicitly does not redefine it. Search keeps its own
 *    `DEFAULT_SENSITIVITY` constant, which has its own guard
 *    (`phase-2i-search-guard.test.ts`). Folding it in here would silently
 *    re-open a closed decision.
 *
 * Everything else is in scope, including files that do not exist yet.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const SRC = join(REPO, "src");

/**
 * The literal a drifting surface would write.
 *
 * ## Declaring the vocabulary is not the offence — branching on it is
 *
 * The first draft of this guard flagged `src/features/memories/schema.ts`,
 * which declares `MEMORY_SENSITIVITIES = ["normal", "private",
 * "highly_sensitive"] as const` to mirror the `memories_sensitivity_check`
 * constraint. That is the **authoring** vocabulary — the closed set a user
 * picks from when classifying a memory — and it renders nothing. Exempting the
 * file by path would have worked and would have been wrong: the next schema to
 * declare the same set would need another exemption, and the allowlist would
 * grow until it stopped meaning anything.
 *
 * OD-2J-1 governs **presentation**, so the shape that actually violates it is a
 * *branch*: comparing, filtering, switching or ternary-ing on the level to
 * decide what to render. That is what this matches, and it is why a closed-set
 * declaration passes while `row.sensitivity === "highly_sensitive"` does not.
 */
const BRANCH = new RegExp(
  [
    // Comparison in either direction, ==/===/!=/!==.
    String.raw`[!=]==?\s*["'\`]highly_sensitive["'\`]`,
    String.raw`["'\`]highly_sensitive["'\`]\s*[!=]==?`,
    // Membership tests used as a filter.
    String.raw`\.includes\(\s*["'\`]highly_sensitive["'\`]`,
    String.raw`\.filter\([^)]*highly_sensitive`,
    // `case "highly_sensitive":`
    String.raw`case\s+["'\`]highly_sensitive["'\`]\s*:`,
  ].join("|"),
);

/**
 * An arm that was written and then deliberately removed, recorded so it is not
 * re-added by someone reasoning from first principles and reaching the same
 * wrong place.
 *
 * A draft also flagged object keys — `highly_sensitive: <value>` — as "a rule
 * table outside the contract". It fired on `src/features/memories/copy.ts`,
 * whose entry is `sensitivities: { normal: "Normal", private: "Privada",
 * highly_sensitive: "Muito sensível" }`. That is **i18n for the level's own
 * name** in the authoring UI, not a decision about what to render.
 *
 * A rule table and a label map are indistinguishable by shape, so the arm could
 * only ever be made to pass by exempting legitimate files one at a time. It was
 * removed rather than narrowed: the branch arms above catch the shapes that
 * unambiguously decide visibility, and the positive guard below carries the
 * part a negative scan cannot — that governed surfaces actually *consume* the
 * contract instead of merely avoiding the literal.
 */

const EXEMPT = [
  join("src", "features", "sensitivity"),
  join("src", "features", "search"),
  // The schema mirror is generated from the database and necessarily contains
  // the CHECK constraint's vocabulary. It renders nothing.
  join("src", "lib", "supabase", "database.types.ts"),
  // This guard itself, and the closeout suite that reasons about the rule.
  join("src", "lib", "closeout"),
];

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, found);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function isExempt(path: string) {
  const rel = relative(REPO, path);
  return EXEMPT.some((prefix) => rel.startsWith(prefix));
}

describe("2J-PRIVACY-001: no surface invents its own sensitivity behaviour", () => {
  const offenders = walk(SRC)
    .filter((path) => !isExempt(path))
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      // Strip comments before matching. A guard that reads its own explanatory
      // prose as a violation is the exact defect Phase 2I hit three times in
      // one day, and the fix there was the same: match code, not commentary.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return BRANCH.test(code);
    })
    .map((path) => relative(REPO, path));

  it("finds no literal sensitivity level outside the contract and its two exemptions", () => {
    expect(offenders).toEqual([]);
  });

  it("is not vacuous: it fires on the branch shapes it claims to catch", () => {
    // A guard that passes because it matches nothing is indistinguishable from
    // a guard that passes because the code is clean. Each shape below is a real
    // way a surface could drift, and each must be detected.
    for (const offending of [
      'if (row.sensitivity === "highly_sensitive") return null;',
      "if (level !== 'highly_sensitive') { show(); }",
      'const hidden = levels.includes("highly_sensitive");',
      'switch (l) { case "highly_sensitive": return mask; }',
    ]) {
      expect(BRANCH.test(offending), offending).toBe(true);
    }
  });

  it("permits a closed-vocabulary declaration, which is authoring, not presentation", () => {
    // `memories/schema.ts` mirrors the database CHECK constraint so the user can
    // classify a memory. It renders nothing and must not need an exemption.
    for (const legitimate of [
      'export const MEMORY_SENSITIVITIES = ["normal", "private", "highly_sensitive"] as const;',
      'sensitivity: z.enum(["normal", "private", "highly_sensitive"]),',
      // i18n for the level's own name, from `memories/copy.ts`.
      'sensitivities: { normal: "Normal", private: "Privada", highly_sensitive: "Muito sensivel" },',
    ]) {
      expect(BRANCH.test(legitimate), legitimate).toBe(false);
    }
  });

  it("scans a non-trivial number of files, so a broken walk cannot report clean", () => {
    const scanned = walk(SRC).filter((path) => !isExempt(path));
    expect(scanned.length).toBeGreaterThan(100);
  });
});

describe("2J-PRIVACY-001: the notification path cannot carry content", () => {
  it("exposes no content-taking notification builder anywhere in the contract", () => {
    const contract = readFileSync(join(SRC, "features", "sensitivity", "contracts.ts"), "utf8");
    // `notificationCopy(locale)` -- one parameter, and it is the locale. If a
    // second ever appears, the payload has somewhere to put user text.
    const signature = contract.match(/export function notificationCopy\(([^)]*)\)/);
    expect(signature, "notificationCopy must exist").toBeTruthy();
    expect(signature?.[1]).toBe('locale: "pt-BR" | "en"');
  });
});
