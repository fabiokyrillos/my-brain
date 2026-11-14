import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Life Brain D.3 (ADR-167) — one pair of breakpoints around 600 and 900.
 *
 * `599px`, `600px`, `899px` and `900px` coexisted (A.6 left the consolidation
 * open). Two of them disagreed by a pixel with their neighbours:
 *
 * - `max-width: 599px` beside the far more common `max-width: 600px` — at
 *   exactly 600px one phone rule applied and the other did not;
 * - `max-width: 900px` beside `min-width: 900px` — at exactly 900px a "below
 *   desktop" rule and a "desktop" rule both applied.
 *
 * The contract: phone is `max-width: 600px`, below desktop is
 * `max-width: 899px`, desktop is `min-width: 900px`. Other widths (480px, 30rem,
 * 1080px…) are component-specific and not this guard's business.
 */

const APP = join(process.cwd(), "src", "app");

function queries(): { file: string; query: string }[] {
  const found: { file: string; query: string }[] = [];
  for (const file of readdirSync(APP).filter((name) => name.endsWith(".css"))) {
    const css = readFileSync(join(APP, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/@media[^{]*/g)) found.push({ file, query: match[0].replace(/\s+/g, " ").trim() });
  }
  return found;
}

const width = (query: string, kind: "max" | "min") =>
  [...query.matchAll(new RegExp(`${kind}-width:\\s*([0-9.]+)px`, "g"))].map((match) => Number(match[1]));

describe("the 600/900 breakpoints are one pair", () => {
  it("reads media queries at all (non-vacuity)", () => {
    expect(queries().length).toBeGreaterThan(50);
    expect(queries().some(({ query }) => width(query, "min").includes(900))).toBe(true);
  });

  it("has no 599px: the phone edge is max-width 600px", () => {
    const offenders = queries().filter(({ query }) => /\b599(\.\d+)?px/.test(query));
    expect(offenders).toEqual([]);
  });

  it("has no max-width 900px: below desktop ends at 899px, where min-width 900px begins", () => {
    const offenders = queries().filter(({ query }) => width(query, "max").includes(900));
    expect(offenders).toEqual([]);
  });

  it("has no min-width 600px or 899px, which would reopen the overlap from the other side", () => {
    const offenders = queries().filter(({ query }) => width(query, "min").some((value) => value === 600 || value === 899));
    expect(offenders).toEqual([]);
  });
});
