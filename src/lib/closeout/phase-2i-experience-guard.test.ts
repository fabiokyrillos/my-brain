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
  ERROR_STATES,
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
  });

  /*
   * **Superseded, and quoted rather than deleted.** This assertion used to
   * carry a third clause:
   *
   *     for (const locale of experienceLocales) {
   *       expect(getExperienceCopy(locale).states.error_terminal.action).toBeNull();
   *     }
   *
   * Under 2I that was right: a terminal error offered nothing, so a null label
   * was the honest encoding. `2O-RECOVER-003` changes the requirement — *"every
   * error state offers at least one action, and `error_terminal` offers a way
   * to leave rather than a way to retry"* — so a null label now encodes a dead
   * end rather than an honest refusal.
   *
   * Only that clause inverted. The property the original protected — **a
   * terminal error must never offer a retry** — is not weakened but stated
   * directly, and in a form the old assertion could not make: a null label was
   * only *evidence* that no retry was offered, and evidence is what
   * `2O-RECOVER-003` had to take away.
   */
  it("2O-RECOVER-003: a terminal error offers a way out, and never a retry", () => {
    const terminal = UNIVERSAL_STATE_DEFINITIONS.error_terminal;
    expect(terminal.offersExit).toBe(true);
    // The retry path is `recoverable`, and it stays false. This is the clause
    // that must never move.
    expect(terminal.recoverable).toBe(false);

    for (const locale of experienceLocales) {
      const action = getExperienceCopy(locale).states.error_terminal.action;
      expect(action, `${locale} leaves error_terminal with no way out`).not.toBeNull();
      expect(action!.length).toBeGreaterThan(0);
    }
  });

  it("2O-RECOVER-003: exit and retry are mutually exclusive across the whole vocabulary", () => {
    // Non-vacuity: the loop below is trivially satisfied by an empty set.
    expect(UNIVERSAL_STATES.length).toBe(7);

    const both = UNIVERSAL_STATES.filter((state) => {
      const definition = UNIVERSAL_STATE_DEFINITIONS[state];
      return definition.recoverable && definition.offersExit;
    });
    expect(
      both,
      `states claiming both a retry and an exit: ${both.join(", ")}. `
        + "2O-RECOVER-003 distinguishes them precisely because a control that "
        + "cannot work is worse than no control.",
    ).toEqual([]);

    // And exactly one state carries the exit, so "none of them do" cannot pass.
    const exits = UNIVERSAL_STATES.filter((state) => UNIVERSAL_STATE_DEFINITIONS[state].offersExit);
    expect(exits).toEqual(["error_terminal"]);
  });

  it("2O-RECOVER-003: every error state has something to offer", () => {
    // `ERROR_STATES` is derived from the tones, so a state added later is
    // included without anyone remembering to add it here.
    expect(ERROR_STATES.length).toBeGreaterThanOrEqual(4);

    for (const state of ERROR_STATES) {
      const definition = UNIVERSAL_STATE_DEFINITIONS[state];
      expect(
        definition.recoverable || definition.offersExit,
        `${state} is an error state that offers the reader nothing at all`,
      ).toBe(true);
      for (const locale of experienceLocales) {
        expect(
          getExperienceCopy(locale).states[state].action,
          `${locale}/${state} has no action label`,
        ).not.toBeNull();
      }
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

describe("2I-LANG-007: dark mode is complete, and not partially implemented", () => {
  /*
   * This guard inverted with ADR-114.
   *
   * Owner decision D5 put dark mode out of scope, and the assertion here was
   * that `experience.css` contained NO dark tokens — the failure it prevented
   * being a half-set that looked like support. The Papel e Console redesign
   * reverses the decision, so the assertion now runs from the other side: dark
   * exists, and every light tone token has a dark counterpart.
   *
   * The prevented failure is unchanged. A partial dark mode still fails; only
   * the direction of "partial" moved.
   */
  const stripped = () =>
    readFileSync(join(REPO, "src/app/experience.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  /** Every `--tone-*` declaration inside one brace-balanced block. */
  function toneTokensIn(css: string, selector: RegExp): Record<string, string> {
    const start = css.search(selector);
    if (start === -1) return {};
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = css.slice(open, end);
    const found: Record<string, string> = {};
    for (const [, name, value] of body.matchAll(/(--tone-[a-z-]+)\s*:\s*([^;]+);/g)) {
      found[name] = value.trim();
    }
    return found;
  }

  it("declares a dark set, applied both by explicit choice and by system default", () => {
    const css = stripped();
    expect(css, "no explicit dark theme selector").toMatch(/:root\[data-theme="dark"\]/);
    expect(css, "no system-preference dark block").toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("lets an explicit light choice win on a dark machine", () => {
    // Without the `:not([data-theme="light"])` qualifier the media query would
    // override the user's stored choice, and choosing light would do nothing on
    // a dark OS. That is a real bug, and it is invisible in a light-OS test run.
    expect(stripped()).toMatch(/:root:not\(\[data-theme="light"\]\)/);
  });

  it("gives every light tone token a dark counterpart", () => {
    const css = stripped();
    const light = toneTokensIn(css, /:root\s*\{/);
    const dark = toneTokensIn(css, /:root\[data-theme="dark"\]/);

    expect(Object.keys(light).length, "no light tone tokens were parsed").toBeGreaterThanOrEqual(18);

    const missing = Object.keys(light).filter((name) => !(name in dark));
    expect(
      missing,
      `tone tokens with no dark value: ${missing.join(", ")}. `
        + "2I-LANG-007: a tone that is themed in light and inherited in dark renders "
        + "a light wash on a dark canvas — the partial dark mode D5 refused to ship.",
    ).toEqual([]);
  });

  it("keeps the two dark blocks identical, since CSS cannot share a declaration set", () => {
    // The explicit block and the media-query block are hand-maintained copies.
    // Drift between them is the failure mode a duplicate actually has: the
    // stored preference and the system default would render different products.
    const css = stripped();
    const explicit = toneTokensIn(css, /:root\[data-theme="dark"\]/);
    const system = toneTokensIn(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);

    expect(Object.keys(system).length, "no tokens parsed from the media block").toBeGreaterThanOrEqual(18);
    expect(system).toEqual(explicit);
  });

  it("actually re-tints, rather than repeating the light value under a dark selector", () => {
    // The control. A dark block that copied the light values would satisfy
    // every completeness check above while shipping a light theme twice.
    const css = stripped();
    const light = toneTokensIn(css, /:root\s*\{/);
    const dark = toneTokensIn(css, /:root\[data-theme="dark"\]/);
    const unchanged = Object.keys(light).filter((name) => light[name] === dark[name]);
    expect(unchanged, `tone tokens identical in both themes: ${unchanged.join(", ")}`).toEqual([]);
  });

  it("the comment-stripping is real, so the assertions above are not vacuous", () => {
    // If the stripper removed everything, the parsers would find nothing and
    // the equality checks would pass over two empty objects.
    const css = stripped();
    expect(css).toContain("--tone-risk-fg:");
    expect(css.length).toBeGreaterThan(1500);
  });
});
