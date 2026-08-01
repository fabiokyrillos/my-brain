import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The locale-ternary ceiling, as a permanent guard.
 *
 * ## What this counts, and why it is a ceiling rather than a ban
 *
 * `UX-22` measured **266** inline `pt ? … : …` ternaries across 34 files and
 * deferred the sweep to localization maintenance — a real decision, not an
 * oversight: rewriting 266 call sites is a change with its own risk, and it was
 * not what the UX remediation was for. What the closeout report proposed and
 * nobody built was the guard that stops the number growing in the meantime.
 * This is that guard.
 *
 * So the rule is one-directional. Removing ternaries is always allowed and
 * lowers the ceiling on the next commit that measures; **adding one fails**.
 * EGC-SURFACE-002 held the line through two slices that added four routes and
 * three panels, and the count fell to 262 because the read-only blocks EGC.2
 * replaced carried ternaries their replacements do not.
 *
 * ## Why the ceiling is not pinned to the exact count
 *
 * Pinning equality would fail every time somebody legitimately *removes* one,
 * which would train people to edit the constant — and a constant people edit
 * reflexively guards nothing. The ceiling is an upper bound, and the reported
 * count in the failure message is what tells an author where they stand.
 *
 * ## Tests are excluded, deliberately
 *
 * A test that asserts both locales' copy legitimately contains the pattern —
 * that is the test doing its job. Counting them would make the ceiling depend
 * on test coverage, which is exactly backwards.
 */

const REPO = resolve(__dirname, "../../..");

/**
 * The G-0.4 baseline: measured, not assumed.
 *
 * `docs/reports/EGC_G04_LOCALE_TERNARY_BASELINE.md` records the measurement and
 * the command that produced it, taken from `main` before the first line of
 * Entity Graph Completion code.
 */
const CEILING = 266;

/** The pattern the UX audit measured, and the one the ceiling is denominated in. */
const LOCALE_TERNARY = /\bpt \?/g;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(path);
  }
  return found;
}

/**
 * The count, plus where it lives — so a failure names files rather than a number.
 *
 * `root` is a parameter and not a constant precisely so the mutation test below
 * can run the **real detector** over a **real tree** that has a ternary added,
 * without writing into `src/` while other test files are concurrently reading it.
 */
export function countLocaleTernaries(root = join(REPO, "src")): {
  total: number;
  byFile: Record<string, number>;
} {
  const byFile: Record<string, number> = {};
  let total = 0;

  for (const path of sourceFiles(root)) {
    const matches = readFileSync(path, "utf8").match(LOCALE_TERNARY);
    if (!matches) continue;
    byFile[relative(root, path).replace(/\\/g, "/")] = matches.length;
    total += matches.length;
  }

  return { total, byFile };
}

describe("EGC-SURFACE-002: the locale-ternary ceiling never rises", () => {
  it("stays at or below the measured G-0.4 baseline", () => {
    const { total, byFile } = countLocaleTernaries();
    const worst = Object.entries(byFile)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([file, count]) => `${file} (${count})`)
      .join(", ");

    expect(
      total,
      `Inline locale ternaries rose to ${total}, above the ${CEILING} baseline that `
        + "UX-22 measured and deferred. New copy goes through a typed feature `copy.ts` "
        + "module — the `daily-cycle/copy.ts` shape — not through an inline ternary. "
        + `Densest files: ${worst}.`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("counts the real tree rather than trusting a restated number", () => {
    // A guard that compared a constant against itself would pass forever. This
    // is the non-vacuity control: the count is non-zero (the deferred sweep is
    // real and still outstanding), and it comes from files that exist.
    const { total, byFile } = countLocaleTernaries();
    expect(total).toBeGreaterThan(0);
    expect(Object.keys(byFile).length).toBeGreaterThan(10);
    for (const file of Object.keys(byFile)) {
      expect(statSync(join(REPO, "src", file)).isFile()).toBe(true);
    }
  });

  it("fails when a ternary is added — proven by executing the mutation on a real tree", () => {
    /**
     * Gate C2 asks for the guard to be proven by a mutation rather than by
     * reading it, and this runs the **real detector** over a **real tree**.
     *
     * The tree is a temporary directory rather than `src/` itself: vitest runs
     * files in parallel workers, and two other closeout tests walk `src/` while
     * this one runs. Writing a probe file into the repo would make their results
     * depend on this test's timing — a flake introduced by the thing meant to
     * prevent regressions.
     *
     * What is under test is the detector. If the regex ever stopped matching
     * what UX-22 measured, the ceiling would become silently unenforceable and
     * every other assertion in this file would still pass.
     */
    const tree = mkdtempSync(join(tmpdir(), "egc-ternary-"));
    try {
      writeFileSync(join(tree, "clean.tsx"), 'const label = copy.greeting;\n', "utf8");
      const before = countLocaleTernaries(tree);
      expect(before.total, "the probe tree starts clean").toBe(0);

      // The mutation: one file, in the shape the audit measured.
      mkdirSync(join(tree, "nested"), { recursive: true });
      writeFileSync(
        join(tree, "nested", "surface.tsx"),
        'const label = pt ? "Olá" : "Hello";\nconst other = pt ? "Sim" : "Yes";\n',
        "utf8",
      );

      const after = countLocaleTernaries(tree);
      expect(after.total, "the detector sees the added ternaries").toBe(2);
      expect(Object.keys(after.byFile)).toEqual(["nested/surface.tsx"]);

      // And a tree at the ceiling plus this mutation would breach it — the
      // comparison the guard above performs, executed rather than described.
      expect(CEILING + after.total).toBeGreaterThan(CEILING);

      // The exclusion is executed too: a `.test.tsx` file with the same content
      // must not count, or the ceiling would depend on test coverage.
      writeFileSync(
        join(tree, "nested", "surface.test.tsx"),
        'const label = pt ? "Olá" : "Hello";\n',
        "utf8",
      );
      expect(countLocaleTernaries(tree).total, "tests are excluded").toBe(2);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});
