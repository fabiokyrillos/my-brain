/**
 * The stylesheet registry — ADR-114.
 *
 * ## The failure this exists to catch
 *
 * Four Playwright lanes build their fixture by reading `src/app/*.css` off disk
 * and inlining it into a bare document. Each keeps its own hand-written
 * `STYLESHEETS` array. Nothing connected those arrays to what `globals.css`
 * actually imports, so the arrays could go stale in **silence**: the fixture
 * still renders, the assertions still run, and they measure unstyled markup.
 *
 * That is worse than a red build. A contrast scan over a document with no
 * palette sees default black on default white and passes. A touch-target
 * assertion over a button with no padding measures the text box and passes. The
 * lane reports green for the one reason it must never report green.
 *
 * Landing Papel e Console moved the entire palette from `globals.css` into
 * `tokens.css`, which is exactly the change that would have gone unnoticed:
 * every `var(--ink)` in all four lanes would have resolved to nothing.
 *
 * ## What is asserted
 *
 * Not "the arrays match the imports exactly" — the lanes deliberately inline
 * only the sheets their own markup needs, and forcing them to carry all
 * twenty-three would be noise. The invariant is narrower and is the one that
 * actually breaks: **a lane that inlines any product CSS must also inline the
 * files that declare the tokens the rest of it reads.**
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const APP_CSS = join(REPO, "src/app");
const E2E = join(REPO, "e2e");

/** The files that declare custom properties every other stylesheet consumes. */
const TOKEN_SHEETS = ["tokens.css", "experience.css"] as const;

function read(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

/** The `STYLESHEETS = [...]` array a lane declares, in order. */
function declaredStylesheets(source: string): string[] {
  const match = source.match(/const STYLESHEETS = \[([\s\S]*?)\] as const;/);
  if (!match) return [];
  return [...match[1].matchAll(/"([a-z0-9-]+\.css)"/g)].map((entry) => entry[1]);
}

const LANES = readdirSync(E2E)
  .filter((name) => /\.spec\.ts$/.test(name))
  .map((name) => ({ name, source: readFileSync(join(E2E, name), "utf8") }))
  .filter((lane) => lane.source.includes("const STYLESHEETS = ["));

describe("the guard has something to read", () => {
  it("finds the lanes that inline product CSS", () => {
    // Non-vacuity: with no lanes discovered, every check below passes trivially.
    expect(LANES.length, "no Playwright lane inlines a stylesheet").toBeGreaterThanOrEqual(4);
  });

  it("finds the token sheets on disk", () => {
    const present = readdirSync(APP_CSS).filter((name) => name.endsWith(".css"));
    for (const sheet of TOKEN_SHEETS) {
      expect(present, `${sheet} is missing from src/app`).toContain(sheet);
    }
  });
});

describe("every lane that inlines product CSS also inlines the tokens", () => {
  it.each(LANES.map((lane) => lane.name))("%s carries the token sheets", (name) => {
    const lane = LANES.find((candidate) => candidate.name === name)!;
    const declared = declaredStylesheets(lane.source);

    expect(declared.length, `${name} declares STYLESHEETS but none were parsed`).toBeGreaterThan(0);

    for (const sheet of TOKEN_SHEETS) {
      expect(
        declared,
        `${name} inlines product CSS without ${sheet}. Since ADR-114 the palette `
          + "lives there, so every colour, measure and radius in this fixture resolves "
          + "to nothing — and a contrast or target-size assertion over unstyled markup "
          + "passes for the wrong reason.",
      ).toContain(sheet);
    }
  });

  it("declares the token sheets before the sheets that consume them", () => {
    // A custom property used before it is declared resolves to nothing, and the
    // lanes concatenate in array order.
    for (const lane of LANES) {
      const declared = declaredStylesheets(lane.source);
      const lastToken = Math.max(...TOKEN_SHEETS.map((sheet) => declared.indexOf(sheet)));
      const consumers = declared.filter((sheet) => !TOKEN_SHEETS.includes(sheet as never));
      const firstConsumer = declared.indexOf(consumers[0]);
      expect(
        lastToken,
        `${lane.name} lists ${declared[firstConsumer]} before the token sheets`,
      ).toBeLessThan(firstConsumer);
    }
  });
});

describe("every sheet a lane names exists, and every import resolves", () => {
  it("names no stylesheet that is not on disk", () => {
    const present = new Set(readdirSync(APP_CSS).filter((name) => name.endsWith(".css")));
    for (const lane of LANES) {
      for (const sheet of declaredStylesheets(lane.source)) {
        expect(present.has(sheet), `${lane.name} names ${sheet}, which does not exist`).toBe(true);
      }
    }
  });

  it("imports nothing from globals.css that is not on disk", () => {
    const present = new Set(readdirSync(APP_CSS).filter((name) => name.endsWith(".css")));
    const imported = [...read("src/app/globals.css").matchAll(/@import\s+"\.\/([^"]+)"/g)].map(
      (entry) => entry[1],
    );
    expect(imported.length, "globals.css imports nothing").toBeGreaterThan(10);
    for (const sheet of imported) {
      expect(present.has(sheet), `globals.css imports ${sheet}, which does not exist`).toBe(true);
    }
  });

  it("keeps every stylesheet name strippable by the lanes' own import regex", () => {
    // The lanes remove `@import "./x.css";` with `/@import\s+"\.\/[a-z-]+\.css";?/`.
    // A filename with a digit or a capital would survive that strip and leave an
    // unresolvable import in the fixture — which browsers ignore silently, so
    // the sheet would simply not apply.
    for (const sheet of readdirSync(APP_CSS).filter((name) => name.endsWith(".css"))) {
      expect(
        /^[a-z-]+\.css$/.test(sheet),
        `${sheet} cannot be stripped by the lanes' import regex; rename it to lowercase letters and hyphens`,
      ).toBe(true);
    }
  });
});

describe("tokens.css declares dark once per selector, and the two copies agree", () => {
  /*
   * `experience.css`'s two dark blocks are guarded in
   * `phase-2i-experience-guard.test.ts`. `tokens.css` has the same shape and the
   * same hazard, and it went unguarded until a hand edit put a duplicate
   * `--elevation-undo` and a second `--scrim` inside the media block. CSS took
   * the last one and nothing complained.
   *
   * Two failures are possible here and both are silent: the explicit choice and
   * the system default drifting apart, and a single block declaring the same
   * property twice.
   */
  const css = read("src/app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");

  /** Every custom property in one brace-balanced block, in order. */
  function propertiesIn(source: string, selector: RegExp): [string, string][] {
    const start = source.search(selector);
    if (start === -1) return [];
    const open = source.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    return [...source.slice(open, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]);
  }

  const explicit = propertiesIn(css, /:root\[data-theme="dark"\]/);
  const system = propertiesIn(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);

  it("parses both dark blocks", () => {
    // Non-vacuity: two empty lists are equal to each other.
    expect(explicit.length, "explicit dark block parsed empty").toBeGreaterThanOrEqual(20);
    expect(system.length, "system dark block parsed empty").toBeGreaterThanOrEqual(20);
  });

  it("declares no property twice inside one block", () => {
    for (const [label, block] of [
      ["explicit", explicit],
      ["system", system],
    ] as const) {
      const names = block.map(([name]) => name);
      const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
      expect(
        [...new Set(duplicated)],
        `the ${label} dark block declares these twice: ${[...new Set(duplicated)].join(", ")}`,
      ).toEqual([]);
    }
  });

  it("keeps the explicit choice and the system default identical", () => {
    expect(Object.fromEntries(system)).toEqual(Object.fromEntries(explicit));
  });

  it("re-tints rather than repeating light under a dark selector", () => {
    // The control, same as the tone guard's.
    const light = Object.fromEntries(propertiesIn(css, /:root\s*\{/));
    const unchanged = explicit
      .filter(([name, value]) => name in light && light[name] === value)
      .map(([name]) => name);
    expect(unchanged, `dark repeats the light value for: ${unchanged.join(", ")}`).toEqual([]);
  });
});

describe("no stylesheet outside tokens.css and experience.css holds a raw colour", () => {
  /*
   * The rule Papel e Console is built on, made enforceable.
   *
   * Before this, nothing stopped a surface picking its own colour — and 390 of
   * them had. Every one is a defect the moment dark mode exists: a literal
   * `background:white` paints a white card on a near-black canvas, and a literal
   * `#526078` body text becomes unreadable on it. The migration removed them
   * all; this keeps them gone.
   *
   * Comments are stripped first. `relations.css` documents a historical
   * contrast defect by quoting the hex that caused it, and a scan that reads
   * comments reports the documentation as the violation — the same trap this
   * repository recorded against the Edge env scan and the 2I dark-mode check.
   */
  const OWNS_COLOUR = ["tokens.css", "experience.css"];

  /** Declarations only, with comments removed. */
  function declarations(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  const sheets = readdirSync(APP_CSS)
    .filter((name) => name.endsWith(".css") && !OWNS_COLOUR.includes(name))
    .map((name) => ({ name, css: declarations(read(`src/app/${name}`)) }));

  it("finds stylesheets to scan", () => {
    // Non-vacuity: with no sheets, every absence check below passes trivially.
    expect(sheets.length).toBeGreaterThanOrEqual(15);
  });

  it.each(sheets.map((sheet) => sheet.name))("%s declares no hex colour", (name) => {
    const sheet = sheets.find((candidate) => candidate.name === name)!;
    const found = [...sheet.css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((entry) => entry[0]);
    expect(
      found,
      `${name} declares raw hex colours: ${[...new Set(found)].join(", ")}. `
        + "Every colour comes from a token in tokens.css or a tone in experience.css — "
        + "a literal does not change with the theme, so it is a dark-mode defect the "
        + "moment it is written.",
    ).toEqual([]);
  });

  it.each(sheets.map((sheet) => sheet.name))("%s uses no colour keyword", (name) => {
    const sheet = sheets.find((candidate) => candidate.name === name)!;
    // `white`/`black` are the two that actually appeared, and they are the two
    // that break hardest: both name a surface, and a surface is theme-dependent.
    const found = [...sheet.css.matchAll(/:\s*(white|black)\b/g)].map((entry) => entry[1]);
    expect(
      found,
      `${name} uses the literal colour keyword(s): ${[...new Set(found)].join(", ")}. `
        + "`white` names a surface, and a surface in dark mode is dark — use "
        + "var(--background-surface) or var(--action-primary-text).",
    ).toEqual([]);
  });

  it("the comment-stripping does not hide a real declaration", () => {
    // The control for the two checks above. If `declarations()` were over-eager
    // it would return empty strings and both would pass over nothing.
    for (const sheet of sheets) {
      expect(sheet.css.length, `${sheet.name} stripped to nothing`).toBeGreaterThan(20);
    }
    // And the stripper must genuinely remove comments, or the relations.css
    // comment quoting `#64748b` would be reported as a violation.
    expect(declarations("/* #ffffff */ .a{color:var(--x)}")).not.toContain("#ffffff");
  });

  it("still finds a hex when one is really declared, so the scan is not blind", () => {
    // Two-sided: the detector must fire on a planted literal.
    const planted = declarations(".a{background:#ff0000}");
    expect([...planted.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])).toEqual(["#ff0000"]);
    const keyword = declarations(".a{background: white}");
    expect([...keyword.matchAll(/:\s*(white|black)\b/g)].map((m) => m[1])).toEqual(["white"]);
  });
});

describe("the palette has exactly one home", () => {
  it("declares the base surface and text tokens only in tokens.css", () => {
    // The bridge in `tokens.css` is what keeps untouched surfaces correct in
    // both themes. A second declaration anywhere else would shadow it for the
    // sheets that follow, and the drift would show only in dark mode.
    const owned = ["--background-canvas", "--text-primary", "--border-default"];
    for (const sheet of readdirSync(APP_CSS).filter((name) => name.endsWith(".css"))) {
      if (sheet === "tokens.css") continue;
      const css = read(`src/app/${sheet}`).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const token of owned) {
        expect(
          css.includes(`${token}:`),
          `${sheet} redeclares ${token}; the palette is declared once, in tokens.css`,
        ).toBe(false);
      }
    }
  });

  it("still declares them in tokens.css, so the check above is not vacuous", () => {
    const css = read("src/app/tokens.css");
    expect(css).toContain("--background-canvas:");
    expect(css).toContain("--text-primary:");
    expect(css).toContain("--border-default:");
  });
});
