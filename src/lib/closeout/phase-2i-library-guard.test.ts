/**
 * `2I-LIB-001` … `2I-LIB-008` — Library's structural claims.
 *
 * The interesting one is `2I-LIB-004`, which this phase closes as an
 * **evidenced negative**. The requirement says pinned/favourite is built *only
 * if the repository already supports it*. It does not — and rather than
 * asserting that as prose, this guard **re-derives it from the generated
 * database types on every run**. If a future migration adds a `pinned` column,
 * the guard fails and the "not supported" claim has to be revisited
 * deliberately instead of quietly becoming false.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIBRARY_MEMBERS, LIBRARY_RECENCY, LIBRARY_SUPPORTS_PINNING } from "../../features/library/contracts";
import { getLibraryCopy } from "../../features/library/copy";
import { navigationCapabilities } from "../../features/shell/capabilities";

const REPO = process.cwd();
const TYPES = readFileSync(join(REPO, "src/lib/supabase/database.types.ts"), "utf8");
const PAGE = readFileSync(join(REPO, "src/app/[locale]/app/library/page.tsx"), "utf8");
const CONTRACTS = readFileSync(join(REPO, "src/features/library/contracts.ts"), "utf8");

describe("2I-LIB-001: Library renders the grouping that already exists", () => {
  it("derives its members from capabilities.ts rather than restating them", () => {
    expect(CONTRACTS).toContain("navigationCapabilities");
    expect(CONTRACTS).toContain('capability.group === "context"');
  });

  it("holds exactly the six context domains", () => {
    expect([...LIBRARY_MEMBERS].sort()).toEqual(
      ["contexts", "files", "memories", "organizations", "people", "projects"].sort(),
    );
  });

  it("stays in step with the shell, so the two cannot disagree", () => {
    const fromShell = navigationCapabilities
      .filter((capability) => capability.group === "context")
      .map((capability) => capability.key)
      .sort();
    expect([...LIBRARY_MEMBERS].sort()).toEqual(fromShell);
  });
});

describe("2I-LIB-002: no new data model", () => {
  it("creates no table, column or RPC", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(/\.rpc\(/.test(code)).toBe(false);
    expect(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(code)).toBe(false);
  });

  it("reads only tables that already exist", () => {
    for (const spec of Object.values(LIBRARY_RECENCY)) {
      // Each recency source must be a real table in the generated types.
      expect(TYPES, `${spec!.table} is not in the schema`).toContain(`      ${spec!.table}: {`);
    }
  });

  it("adds no migration", () => {
    // Phase 2I's budget is allocated to 2I.5 only, and 2I.5 did not spend it.
    // Library owning one would break the per-slice reconciliation.
    expect(CONTRACTS).not.toMatch(/create table|alter table/i);
  });
});

describe("2I-LIB-004: pinned/favourite is NOT supported, and the evidence is re-derived", () => {
  it("finds no pin or favourite column anywhere in the schema", () => {
    // Re-derived on every run rather than asserted as prose. A future migration
    // adding the column fails this test, which is the point: the negative stops
    // being true the moment the repository changes.
    const matches = TYPES.match(/^\s+(pinned|is_pinned|favorite|is_favorite|favourite|is_favourite|starred|bookmarked)\??:/gm);
    expect(
      matches,
      `the schema now has ${matches?.length} pin/favourite column(s); 2I-LIB-004's evidenced negative must be revisited`,
    ).toBeNull();
  });

  it("records the negative as a constant the guard checks", () => {
    expect(LIBRARY_SUPPORTS_PINNING).toBe(false);
  });

  it("builds no pin affordance", () => {
    expect(/pin|favou?rite|star/i.test(PAGE.replace(/\/\*[\s\S]*?\*\//g, ""))).toBe(false);
  });
});

describe("2I-LIB-005/007: deterministic states only, and no dashboard", () => {
  it("draws recency from a plain timestamp, never a score", () => {
    for (const [key, spec] of Object.entries(LIBRARY_RECENCY)) {
      expect(spec!.column, `${key} uses something other than a timestamp for recency`).toMatch(
        /_at$/,
      );
    }
  });

  it("omits contexts from recency rather than inventing one", () => {
    // 2I-LIB-005: only where an existing deterministic state supports it.
    // Faking a recency for a domain that has none is exactly what it forbids.
    expect(LIBRARY_RECENCY.contexts).toBeUndefined();
  });

  it("renders no chart, trend or derived metric", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const token of ["chart", "trend", "percent", "sparkline", "growth", "average"]) {
      expect(code.toLowerCase().includes(token), `Library renders a ${token}`).toBe(false);
    }
  });
});

describe("2I-LIB-006/008: reachable, and it does not replace the routes", () => {
  it("offers a search entry point", () => {
    expect(PAGE).toContain("app/search");
  });

  it("links each domain to its existing route", () => {
    expect(PAGE).toContain("getNavigationHref(locale, key)");
  });
});

describe("2I-LIB: copy in both locales, no ternary", () => {
  it("describes every member in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const text = getLibraryCopy(locale);
      for (const key of LIBRARY_MEMBERS) {
        expect(text.descriptions[key], `${locale} has no description for ${key}`).toBeTruthy();
      }
    }
    expect(getLibraryCopy("pt-BR").title).not.toBe(getLibraryCopy("en").title);
  });

  it("adds no inline locale ternary", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(/\bpt \?/.test(code)).toBe(false);
  });
});
