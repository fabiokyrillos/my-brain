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

import {
  LIBRARY_COUNTS,
  LIBRARY_MEMBERS,
  LIBRARY_RECENCY,
  LIBRARY_SUPPORTS_PINNING,
} from "../../features/library/contracts";
import { getLibraryCopy } from "../../features/library/copy";
import { BRAIN_DOMAIN_LENSES, BRAIN_LENSES } from "../../features/library/lenses";
import { navigationCapabilities } from "../../features/shell/capabilities";
import { getMessages } from "../../i18n/messages";

const REPO = process.cwd();
const TYPES = readFileSync(join(REPO, "src/lib/supabase/database.types.ts"), "utf8");
const PAGE = readFileSync(join(REPO, "src/app/[locale]/app/library/page.tsx"), "utf8");
const OVERVIEW = readFileSync(join(REPO, "src/features/library/overview.ts"), "utf8");
const CONTRACTS = readFileSync(join(REPO, "src/features/library/contracts.ts"), "utf8");

describe("2I-LIB-001: Library renders the grouping that already exists", () => {
  it("derives its members from capabilities.ts rather than restating them", () => {
    expect(CONTRACTS).toContain("navigationCapabilities");
    expect(CONTRACTS).toContain('capability.group === "context"');
  });

  it("holds exactly the eight context domains", () => {
    // Six until 2N.6 added `relations`; eight since the Papel e Console
    // recomposition made Brain a primary destination and moved Conversar inside
    // it as the Conversas lens (`02-arquitetura-e-rotas.md`). The list is
    // derived from the shell, so this is the transcription that makes an
    // accidental addition visible — and the test below asserts the two stay in
    // step in both directions.
    expect([...LIBRARY_MEMBERS].sort()).toEqual(
      ["chat", "contexts", "files", "memories", "organizations", "people", "projects", "relations"].sort(),
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

  /*
   * This used to read `expect(PAGE).toContain("getNavigationHref(locale, key)")`.
   *
   * The derivation moved into `overview.ts` when Brain's overview gained a
   * loader, and the assertion is **followed rather than deleted**: the failure it
   * prevents is a domain pointing somewhere other than its declared route, and
   * that failure now has two halves. The loader must derive the href from the
   * registry, and the page must render what the loader produced instead of
   * assembling a second URL of its own — a page that built `/app/${key}` by hand
   * would satisfy either half alone.
   */
  it("derives each domain's route from the registry, in the loader", () => {
    expect(OVERVIEW).toContain("getNavigationHref(locale, key)");
  });

  it("renders the derived href rather than assembling one", () => {
    expect(PAGE).toContain("domain.href");
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The one hand-written app URL the overview is allowed is `/app/search`,
    // which is not a domain and has no registry key. Any other is a second
    // source of truth for where a lens lives.
    const handWritten = [...code.matchAll(/`\/\$\{locale\}\/app\/([a-z-]+)/g)].map((m) => m[1]);
    expect(handWritten).toEqual(["search"]);
  });
});

describe("Brain's lenses reach every context destination, and none twice", () => {
  it("offers exactly the registry's members, plus the overview", () => {
    // The strip is built as "declared order first, then whatever the registry
    // has that the order does not name", so nothing can be lost. This asserts
    // the other half: nothing is duplicated and nothing foreign is added.
    expect([...BRAIN_DOMAIN_LENSES].sort()).toEqual([...LIBRARY_MEMBERS].sort());
    expect(new Set(BRAIN_LENSES).size).toBe(BRAIN_LENSES.length);
    expect(BRAIN_LENSES[0]).toBe("overview");
  });

  it("names every lens in both locales, through the shared nav labels", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const labels = getMessages(locale).nav as Record<string, string>;
      for (const key of BRAIN_DOMAIN_LENSES) {
        expect(labels[key], `${locale} has no nav label for the ${key} lens`).toBeTruthy();
      }
      expect(getLibraryCopy(locale).overviewLens).toBeTruthy();
      expect(getLibraryCopy(locale).lensesLabel).toBeTruthy();
    }
    // The proof the two are really translated rather than one string reused.
    expect(getLibraryCopy("pt-BR").overviewLens).not.toBe(getLibraryCopy("en").overviewLens);
    expect(getLibraryCopy("pt-BR").lensesLabel).not.toBe(getLibraryCopy("en").lensesLabel);
  });

  /**
   * The strip is mounted by hand on nine surfaces and told which one it is on.
   * A page passing another lens's key would light the wrong tab, and nothing
   * about the page would look wrong while it did.
   *
   * So the expected key is re-derived from each route file's own directory and
   * compared with what the file actually passes. `library` maps to `overview`
   * because Brain's own route is the overview lens rather than a member.
   */
  it("passes each surface its own lens key", () => {
    const mounts = new Map<string, string>([
      ["library", "overview"],
      ...BRAIN_DOMAIN_LENSES.map((key) => [key, key] as [string, string]),
    ]);

    for (const [route, expectedLens] of mounts) {
      const source = readFileSync(join(REPO, `src/app/[locale]/app/${route}/page.tsx`), "utf8");
      const mount = source.match(/<BrainLensTabs\s+active="([a-z]+)"/);
      expect(mount, `/app/${route} does not mount BrainLensTabs`).not.toBeNull();
      expect(mount![1], `/app/${route} marks the ${mount![1]} lens as current`).toBe(expectedLens);
    }
  });
});

describe("2I-LIB-003/007: the overview shows what it can read, and never what it must not", () => {
  it("counts only tables that already exist", () => {
    for (const table of Object.values(LIBRARY_COUNTS)) {
      expect(TYPES, `${table} is not in the schema`).toContain(`      ${table}: {`);
    }
  });

  /**
   * The leak this exists to prevent: an overview that prints a memory body or a
   * file name in the clear because somebody added a recency source and forgot
   * that its label is governed content.
   *
   * Re-derived from the generated types on every run rather than transcribed. A
   * recency table that carries a `sensitivity` column **must** name a
   * `ProtectedSurface`; one that does not must name `null`, because a surface
   * for a table with nothing to derive from would resolve every row to the
   * most-protective arm and mask a person's own name.
   */
  it("asks for a protected surface exactly where the label is governed content", () => {
    for (const [key, spec] of Object.entries(LIBRARY_RECENCY)) {
      const start = TYPES.indexOf(`      ${spec!.table}: {`);
      const row = TYPES.slice(TYPES.indexOf("Row: {", start), TYPES.indexOf("\n        }", start));
      const governed = /\n\s+sensitivity:/.test(row);

      expect(
        spec!.surface !== null,
        governed
          ? `${key} reads ${spec!.table}.${spec!.label}, and ${spec!.table} is classified — it must name a protected surface`
          : `${key} names a protected surface, but ${spec!.table} carries no sensitivity column to derive from`,
      ).toBe(governed);
    }
  });

  /*
   * Non-vacuity. The loop above passes trivially if `LIBRARY_RECENCY` is ever
   * emptied or if the type extraction stops matching — and it must find both
   * arms, or a change that made every table look unclassified would satisfy it.
   */
  it("has both arms to check", () => {
    const surfaces = Object.values(LIBRARY_RECENCY).map((spec) => spec!.surface);
    expect(surfaces.filter((surface) => surface !== null).length).toBeGreaterThan(0);
    expect(surfaces.filter((surface) => surface === null).length).toBeGreaterThan(0);
  });

  it("mounts the contract rather than printing the label directly", () => {
    expect(PAGE).toContain("<ProtectedContent");
    // `surface` is taken from the record, never written as a literal — a page
    // that hardcoded `surface="memory"` would govern file names by the memory
    // rule the day a sixth recency source arrived.
    expect(PAGE).toContain("surface={surface}");
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
    /*
      The proof that this copy is really translated, moved off the title.

      It used to assert the two titles differ — a cheap proxy for "somebody
      localized this". The title is now **Brain**, the destination's own name,
      and a proper noun is identical in both locales by design: "My Brain" is not
      translated in the brand either. Keeping the old assertion would have forced
      a worse name to satisfy a test.

      The descriptions are the honest subject: every one of them is a sentence,
      every one is translated, and one shared string among them would be the
      untranslated copy this guard exists to catch.
    */
    const pt = getLibraryCopy("pt-BR").descriptions;
    const en = getLibraryCopy("en").descriptions;
    for (const key of LIBRARY_MEMBERS) {
      expect(pt[key], `${key} carries the same sentence in both locales`).not.toBe(en[key]);
    }
  });

  it("adds no inline locale ternary", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(/\bpt \?/.test(code)).toBe(false);
  });
});
