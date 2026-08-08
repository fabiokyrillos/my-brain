/**
 * Phase 2I structural guards — `2I-LANG-*`, `2I-TRUST-008`.
 *
 * These are the claims a component test cannot make, because they are about
 * what the code **does not** contain.
 *
 * The load-bearing one is `2I-TRUST-008`: **no component in
 * `src/features/experience/` constructs a write client.** Phase 2F established
 * one write path with per-action authorization, audit and undo, and a shared
 * component library is the single most attractive place to grow a second one —
 * a `<ConfirmationCard>` that "just" took a table name and an id would be less
 * duplicated code by every local measure. The threat model calls this T-2I-02
 * and rates it likelier than the search oracle for exactly that reason.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXPERIENCE_TONES,
  TONE_DEFINITIONS,
  UNIVERSAL_STATES,
  UNIVERSAL_STATE_DEFINITIONS,
} from "../../features/experience/state-vocabulary";
import { experienceLocales, getExperienceCopy } from "../../features/experience/copy";

const REPO = process.cwd();
const EXPERIENCE_DIR = join(REPO, "src/features/experience");

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** Source with comments and string literals stripped — the header names every
 *  forbidden construct in order to forbid it, and a raw scan would report the
 *  documentation as the violation. */
function executable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');
}

const EXPERIENCE_FILES = filesUnder(EXPERIENCE_DIR);

describe("2I: the guard has something to read", () => {
  it("finds the experience feature and its parts", () => {
    // Non-vacuity: an empty directory passes every absence check below.
    expect(EXPERIENCE_FILES.length).toBeGreaterThanOrEqual(4);
    const names = EXPERIENCE_FILES.map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(names).toContain("src/features/experience/state-vocabulary.ts");
    expect(names).toContain("src/features/experience/copy.ts");
    expect(names).toContain("src/features/experience/universal-state.tsx");
    expect(names).toContain("src/features/experience/trust-components.tsx");
  });
});

describe("2I-TRUST-008: the component library is not a write layer", () => {
  it("constructs no Supabase client of any kind", () => {
    const offenders = EXPERIENCE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /createClient|createBrowserClient|createServerClient|createServiceRoleClient|SUPABASE_SERVICE_ROLE/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));

    expect(
      offenders,
      `components constructing a Supabase client: ${offenders.join(", ")}. `
        + "2I-TRUST-008: components receive handlers; the handler is an existing "
        + "Server Action or RPC. A component that writes is a second write path.",
    ).toEqual([]);
  });

  it("calls no RPC and issues no table write directly", () => {
    const offenders = EXPERIENCE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      // `Array.from` and `Object.fromEntries` are not PostgREST. A bare
      // `\.from\(` flagged `Array.from({length: rows})` in the skeleton — the
      // detector was wrong, not the component.
      const postgrest = code.replace(/\b(?:Array|Object)\.from(?:Entries)?\(/g, "(");
      return /\.rpc\(|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(postgrest);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));

    expect(offenders, `components reaching the database: ${offenders.join(", ")}`).toEqual([]);
  });

  it("declares no server action of its own", () => {
    const offenders = EXPERIENCE_FILES.filter((path) =>
      /^\s*["']use server["']/m.test(readFileSync(path, "utf8")),
    ).map((path) => relative(REPO, path).replace(/\\/g, "/"));

    expect(offenders, `components declaring a server action: ${offenders.join(", ")}`).toEqual([]);
  });

  it("makes no network call of its own", () => {
    // A component that fetches is a component that can be pointed at anything.
    const offenders = EXPERIENCE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /\bfetch\(|XMLHttpRequest|axios/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));

    expect(offenders, `components performing their own I/O: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("2I-LANG-001/002: meaning is never carried by colour alone", () => {
  it("every tone declares a non-colour affordance", () => {
    for (const tone of EXPERIENCE_TONES) {
      const definition = TONE_DEFINITIONS[tone];
      expect(definition, `${tone} has no definition`).toBeDefined();
      expect(definition.icon.length, `${tone} has no icon, so its meaning is colour-only`).toBeGreaterThan(0);
    }
  });

  it("declares six tones and seven universal states, closed", () => {
    expect(EXPERIENCE_TONES).toHaveLength(6);
    expect(UNIVERSAL_STATES).toHaveLength(7);
    expect(Object.keys(TONE_DEFINITIONS).sort()).toEqual([...EXPERIENCE_TONES].sort());
    expect(Object.keys(UNIVERSAL_STATE_DEFINITIONS).sort()).toEqual([...UNIVERSAL_STATES].sort());
  });

  it("the stylesheet declares every tone token, and is the only place that does", () => {
    const css = readFileSync(join(REPO, "src/app/experience.css"), "utf8");
    for (const tone of EXPERIENCE_TONES) {
      const token = TONE_DEFINITIONS[tone].token;
      expect(css, `--tone-${token}-fg is not declared`).toContain(`--tone-${token}-fg:`);
      expect(css, `.tone-${token} has no class`).toContain(`.tone-${token}`);
    }
  });

  it("is imported by the global stylesheet, or none of it applies", () => {
    // A token set nobody imports is a design document.
    expect(readFileSync(join(REPO, "src/app/globals.css"), "utf8")).toContain('@import "./experience.css"');
  });
});

describe("2I-LANG-005: interpreting is first-class, and it says the content is safe", () => {
  it("is its own state rather than a flavour of loading", () => {
    expect(UNIVERSAL_STATES).toContain("interpreting");
    expect(UNIVERSAL_STATE_DEFINITIONS.interpreting.state).toBe("interpreting");
  });

  it("promises the content is already durable, in both locales", () => {
    // Capture is asynchronous since Phase 2X: the entry is persisted before the
    // AI runs. A state that reads as "this might be lost" is a false alarm the
    // architecture does not warrant.
    expect(UNIVERSAL_STATE_DEFINITIONS.interpreting.contentIsSafe).toBe(true);
    for (const locale of experienceLocales) {
      const text = getExperienceCopy(locale).states.interpreting;
      expect(text.safety, `${locale} interpreting has no safety line`).toBeTruthy();
    }
  });

  it("distinguishes a failed interpretation from a lost entry", () => {
    const failed = UNIVERSAL_STATE_DEFINITIONS.interpretation_failed;
    expect(failed.contentIsSafe, "a failed interpretation must not imply lost content").toBe(true);
    expect(failed.recoverable, "a failed interpretation must be retryable").toBe(true);
    for (const locale of experienceLocales) {
      expect(getExperienceCopy(locale).states.interpretation_failed.safety).toBeTruthy();
      expect(getExperienceCopy(locale).states.interpretation_failed.action).toBeTruthy();
    }
  });

  it("the one state that cannot promise safety does not", () => {
    // The control. Every other state claiming safety would be satisfied by a
    // vocabulary that always says yes.
    expect(UNIVERSAL_STATE_DEFINITIONS.error_terminal.contentIsSafe).toBe(false);
    expect(UNIVERSAL_STATE_DEFINITIONS.error_terminal.recoverable).toBe(false);
    for (const locale of experienceLocales) {
      expect(getExperienceCopy(locale).states.error_terminal.action).toBeNull();
    }
  });
});

describe("2I-LANG-004: every state has copy in both locales", () => {
  it("covers all seven states in pt-BR and en", () => {
    for (const locale of experienceLocales) {
      const copy = getExperienceCopy(locale);
      for (const state of UNIVERSAL_STATES) {
        const text = copy.states[state];
        expect(text, `${locale} is missing ${state}`).toBeDefined();
        expect(text.title.length, `${locale}/${state} has no title`).toBeGreaterThan(0);
        expect(text.description.length, `${locale}/${state} has no description`).toBeGreaterThan(0);
      }
      for (const tone of EXPERIENCE_TONES) {
        expect(copy.tones[tone]?.length, `${locale}/${tone} has no label`).toBeGreaterThan(0);
      }
    }
  });

  it("the two locales do not share a string by accident", () => {
    // Non-vacuity for the check above: a copy module that returned pt-BR for
    // both locales would satisfy it.
    const pt = getExperienceCopy("pt-BR").states.interpreting.title;
    const en = getExperienceCopy("en").states.interpreting.title;
    expect(pt).not.toBe(en);
  });

  it("adds no inline locale ternary", () => {
    // 2I-CLOSE-003's ratchet, applied to this phase's own new code.
    //
    // Over `executable()`, not the raw file: `copy.ts`'s header explains that
    // no inline `pt ?` ternary is added, and a raw scan reported that sentence
    // as the violation. A scan that reads comments reads documentation as
    // requirement — the same trap Phase 2H recorded against the Edge env scan.
    for (const path of EXPERIENCE_FILES) {
      const code = executable(readFileSync(path, "utf8"));
      expect(
        /\bpt \?/.test(code),
        `${relative(REPO, path)} uses an inline locale ternary instead of copy.ts`,
      ).toBe(false);
    }
  });
});

describe("2I-LANG-007: dark mode is out of scope and not partially implemented", () => {
  it("declares no dark token set", () => {
    // Comments stripped for the same reason as above: the stylesheet's own
    // header says there is no `prefers-color-scheme` block here, and the first
    // version of this assertion read that sentence and failed.
    const css = readFileSync(join(REPO, "src/app/experience.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/\[data-theme=/);
  });

  it("the comment-stripping is real, so the assertion above is not vacuous", () => {
    // If the stripper removed everything, "no dark mode" would pass over an
    // empty string. The tone tokens must survive it.
    const css = readFileSync(join(REPO, "src/app/experience.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toContain("--tone-risk-fg:");
    expect(css.length).toBeGreaterThan(1500);
  });
});
