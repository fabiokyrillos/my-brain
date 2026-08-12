import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formatInstant } from "@/lib/time/instant-format";

/**
 * `LDC-CONTEXT-001`/`-002` — the contextual surfaces agree with each other.
 *
 * ## Why this test is not the guard
 *
 * `local-day-correction-guard.test.ts` proves an **absence**: no surface formats
 * without a zone. That is necessary and it is not sufficient. Seventeen call
 * sites could each carry a *different* zone, or a different presentation, and
 * every one of them would pass the guard while the product still told a user two
 * different things about one instant.
 *
 * `2M-TIME-006` is the requirement that forbids exactly that, and it was already
 * violated before this initiative — not by a missing zone, but by three
 * different option bags across four `daily-cycle` files. So the convergence is
 * asserted here directly, on two axes:
 *
 * - **presentation** — every contextual surface renders a stored instant with
 *   the same token, so a list and a detail cannot disagree about the format;
 * - **source** — a page that stamps more than one instant takes the zone from
 *   **one** place, so it cannot disagree with itself.
 *
 * The behavioural half — that a given instant lands on the right calendar day —
 * lives in `instant-format.test.ts` and `local-day.test.ts`, which prove it at
 * the contract. This test proves every surface is actually asking the contract.
 */

const REPO = process.cwd();

/*
 * Comments blanked in place, so describing a defect is not committing one and a
 * reported line stays a real line.
 *
 * Copied rather than imported from the guard: importing a symbol out of a
 * `*.test.ts` file executes that file's `describe` blocks inside this one, which
 * would run the guard's four hundred assertions a second time under this
 * suite's name and report its failures as this test's. Four lines duplicated is
 * cheaper than that.
 */
function blankComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => lead + blank(match.slice(lead.length)));
}

const read = (relative: string) => blankComments(readFileSync(join(REPO, relative), "utf8"));

/**
 * Every surface this initiative moved onto the contract, its zone source, and
 * **how** it uses the zone.
 *
 * The distinction matters and was found by this test failing: a page either
 * *formats* an instant itself, or it *threads* the zone into components that do.
 * `inbox/page.tsx` is the second kind — it renders rows and stamps nothing — so
 * requiring `formatInstant` of it would have been a rule that fits six of seven
 * files, and the honest fix is to say which kind each one is rather than to
 * loosen the assertion until everything passes.
 */
const CONTEXTUAL_SURFACES = [
  { file: "src/app/[locale]/app/people/[personId]/page.tsx", source: "getOwnerTimeZone", kind: "formats" },
  { file: "src/app/[locale]/app/projects/[projectId]/page.tsx", source: "getOwnerTimeZone", kind: "formats" },
  { file: "src/app/[locale]/app/memories/[memoryId]/page.tsx", source: "getOwnerTimeZone", kind: "formats" },
  { file: "src/app/[locale]/app/files/page.tsx", source: "getOwnerTimeZone", kind: "formats" },
  { file: "src/app/[locale]/app/chat/page.tsx", source: "getOwnerTimeZone", kind: "formats" },
  { file: "src/app/[locale]/app/inbox/page.tsx", source: "getOwnerTimeZone", kind: "threads" },
  // The entry detail is the exception, and deliberately: its projection already
  // carries the owner's zone, and its two child components stamp from the same
  // value. A second source here would be a page disagreeing with itself.
  { file: "src/app/[locale]/app/inbox/[entryId]/page.tsx", source: "review.timezone", kind: "formats" },
] as const;

describe("LDC-CONTEXT-001: every contextual surface stamps through the contract", () => {
  it.each(CONTEXTUAL_SURFACES)("$file $kind, with its zone from $source", ({ file, source, kind }) => {
    const code = read(file);
    expect(code, `${file} does not read its zone from ${source}`).toContain(source);
    if (kind === "formats") {
      expect(code, `${file} does not use the instant contract`).toMatch(/formatInstant|instantFormatter/);
    } else {
      // A threading surface must hand the zone to something. A page that reads
      // it and never passes it on is a query with no consumer.
      expect(code, `${file} reads a zone it never passes on`).toMatch(/timeZone=\{timeZone\}/);
    }
  });

  it("classifies each surface as the kind it actually is", () => {
    // Non-vacuity for the branch above: if every surface were listed as
    // "threads", the `formats` arm would never run and the contract assertion
    // would be silently unreachable.
    const kinds = new Set(CONTEXTUAL_SURFACES.map((surface) => surface.kind));
    expect(kinds).toEqual(new Set(["formats", "threads"]));
    expect(CONTEXTUAL_SURFACES.filter((s) => s.kind === "formats").length).toBe(6);
  });

  it("has no surface build its own formatter beside the contract", () => {
    // The failure this initiative found on `memories`: a *local* function called
    // `formatInstant`, shadowing the contract's own name while doing the thing
    // the contract exists to stop. A reader grepping for the contract would have
    // found it and concluded the page was already correct.
    for (const { file } of CONTEXTUAL_SURFACES) {
      expect(read(file), `${file} declares a formatter of its own`).not.toMatch(
        /function\s+format(Instant|Date|Day)\s*\(/,
      );
    }
  });

  it("passes a zone into every contract call, positionally", () => {
    // `formatInstant(value, presentation, locale, timeZone)` — four arguments.
    // A three-argument call is the old local helper's shape and would not
    // type-check, but it would also not be caught by a scan for the name alone.
    for (const { file, kind } of CONTEXTUAL_SURFACES) {
      if (kind !== "formats") continue;
      for (const call of read(file).matchAll(/formatInstant\(([^)]*)\)/g)) {
        const args = call[1].split(",").length;
        expect(args, `${file}: formatInstant called with ${args} arguments — ${call[0]}`)
          .toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe("LDC-CONTEXT-002: one instant, one day, across surfaces and locales", () => {
  /*
   * 23:30Z on 2026-08-15 is:
   *   - 2026-08-15 20:30 in Sao Paulo  (UTC-3)
   *   - 2026-08-16 09:30 in Auckland   (UTC+12)
   * so the two zones are on different calendar days at the same instant, which
   * is the condition under which a host-zone render is visibly wrong.
   */
  const INSTANT = "2026-08-15T23:30:00.000Z";
  const digits = (rendered: string | null) => (rendered ?? "").match(/\d+/g)?.join("-") ?? "";

  it("renders one instant identically wherever the presentation is the same", () => {
    // The property `2M-TIME-006` asks for, stated over the token every contextual
    // surface now uses. Two surfaces that call this with the same arguments
    // cannot disagree, and the arguments are what the test above pins.
    for (const zone of ["America/Sao_Paulo", "Pacific/Auckland"]) {
      for (const locale of ["pt-BR", "en"]) {
        const a = formatInstant(INSTANT, "dayAndTime", locale, zone);
        const b = formatInstant(INSTANT, "dayAndTime", locale, zone);
        expect(a).toBe(b);
        expect(a).not.toBeNull();
      }
    }
  });

  it("puts the instant on a different day in the two zones, and the same day in both locales", () => {
    const saoPaulo = digits(formatInstant(INSTANT, "day", "pt-BR", "America/Sao_Paulo"));
    const auckland = digits(formatInstant(INSTANT, "day", "pt-BR", "Pacific/Auckland"));
    expect(saoPaulo, "the two zones are on the same day — the fixture proves nothing").not.toBe(auckland);

    for (const zone of ["America/Sao_Paulo", "Pacific/Auckland"]) {
      expect(digits(formatInstant(INSTANT, "day", "pt-BR", zone)))
        .toBe(digits(formatInstant(INSTANT, "day", "en", zone)));
    }
  });

  it("keeps the day component of `dayAndTime` equal to `day`", () => {
    // A list showing "15 Aug 20:30" beside a detail showing "16 Aug" is the
    // divergence in its most confusing form: both are dated, and only one is
    // right. The contextual pages use `dayAndTime`; `people`'s relationship
    // panel uses `day`. They must not disagree.
    for (const zone of ["America/Sao_Paulo", "Pacific/Auckland"]) {
      const day = digits(formatInstant(INSTANT, "day", "pt-BR", zone));
      const dayAndTime = digits(formatInstant(INSTANT, "dayAndTime", "pt-BR", zone));
      expect(dayAndTime.startsWith(day), `${zone}: ${dayAndTime} should begin with ${day}`).toBe(true);
    }
  });
});
