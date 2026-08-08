/**
 * `2I-PALETTE-004`, `2I-PALETTE-005`, `2I-PALETTE-008`, `2I-PALETTE-010` —
 * the structural boundary around the command palette.
 *
 * ## T-2I-02, and why it gets a guard rather than a review note
 *
 * The threat model rates *the palette becomes a second write path* **likelier
 * than the search oracle**, and the reason is uncomfortable: the generic
 * version — a map of strings to handlers, then handlers that take parameters,
 * then a handler that writes — is *better engineering* by every local measure.
 * Less duplication, trivially extensible, obviously correct in review.
 *
 * It is also a second write path into a product whose per-action
 * authorization, audit and undo all live on the first one.
 *
 * So the boundary is asserted three ways, each of which would have to be
 * defeated separately:
 *
 *  1. the palette directory constructs no client and calls no RPC;
 *  2. an action **has no field that could be invoked** — no handler, no run,
 *     no execute. An action names a destination and nothing else;
 *  3. the registry is **closed**: built from `capabilities.ts`, never from user
 *     input, and never from a string the user typed.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPaletteActions, filterPaletteActions } from "../../features/palette/actions-registry";
import { getPaletteCopy } from "../../features/palette/copy";

const REPO = process.cwd();
const PALETTE_DIR = join(REPO, "src/features/palette");

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** Comments and string literals removed — the headers name every forbidden
 *  construct in order to forbid it, and a raw scan reports documentation as the
 *  violation. Learned three times in slice 2I.1. */
function executable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');
}

const PALETTE_FILES = filesUnder(PALETTE_DIR);

const LABELS = {
  nav: { home: "Hoje", work: "Trabalho", chat: "Conversar", capture: "Captura rápida", files: "Arquivos" },
  createCapture: "Capturar",
  createConversation: "Conversar",
  createTask: "Criar tarefa",
  openSearch: "Buscar",
  keywords: getPaletteCopy("pt-BR").keywords,
};

describe("2I-PALETTE: the guard has something to read", () => {
  it("finds the palette feature", () => {
    expect(PALETTE_FILES.length).toBeGreaterThanOrEqual(3);
    const names = PALETTE_FILES.map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(names).toContain("src/features/palette/actions-registry.ts");
    expect(names).toContain("src/features/palette/command-palette.tsx");
  });
});

describe("2I-PALETTE-004: no new write path", () => {
  it("constructs no Supabase client", () => {
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /createClient|createBrowserClient|createServerClient|createServiceRoleClient|SUPABASE_SERVICE_ROLE/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders, `palette files constructing a client: ${offenders.join(", ")}`).toEqual([]);
  });

  it("calls no RPC and issues no table write", () => {
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8")).replace(/\b(?:Array|Object)\.from(?:Entries)?\(/g, "(");
      return /\.rpc\(|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders, `palette files reaching the database: ${offenders.join(", ")}`).toEqual([]);
  });

  it("declares no server action", () => {
    const offenders = PALETTE_FILES.filter((path) =>
      /^\s*["']use server["']/m.test(readFileSync(path, "utf8")),
    ).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});

describe("2I-PALETTE-005: no generic command executor", () => {
  it("gives an action no invocable field at all", () => {
    // The strongest form of the boundary: it is not that the palette declines
    // to call a handler, it is that an action HAS no handler to call.
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: LABELS,
    });
    expect(actions.length).toBeGreaterThan(3);
    for (const action of actions) {
      for (const key of Object.keys(action)) {
        expect(
          typeof (action as unknown as Record<string, unknown>)[key],
          `${action.id}.${key} is a function — an action must be data`,
        ).not.toBe("function");
      }
    }
  });

  it("declares no handler map keyed by a string", () => {
    // The shape the threat model names: `const COMMANDS = { "create-task": fn }`.
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /\bcommands?\s*\[|\bhandlers?\s*\[|\bregistry\s*\[\s*\w+\s*\]\s*\(/i.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders, `palette files indexing a handler map: ${offenders.join(", ")}`).toEqual([]);
  });

  it("never evaluates user text", () => {
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /\beval\(|new Function\(|dangerouslySetInnerHTML/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("treats the query as a filter over a fixed list, so it cannot invent an action", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: LABELS,
    });
    // Whatever the user types, the result is a SUBSET. There is no input that
    // produces an action the registry did not already contain.
    for (const query of ["", "trabalho", "'; drop table tasks; --", "<script>", "../../etc/passwd"]) {
      const filtered = filterPaletteActions(actions, query);
      for (const action of filtered) {
        expect(actions, `query ${JSON.stringify(query)} produced an unknown action`).toContain(action);
      }
    }
  });
});

describe("2I-PALETTE-002: destinations come from capabilities.ts, not a second list", () => {
  it("derives navigation from the shared registry", () => {
    const source = readFileSync(join(PALETTE_DIR, "actions-registry.ts"), "utf8");
    expect(source).toContain("navigationCapabilities");
    expect(source).toContain("getNavigationHref");
  });

  it("omits context-only destinations", () => {
    // `jobs` is an internal queue, not a product destination.
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: { ...LABELS, nav: { ...LABELS.nav, jobs: "Processamentos" } },
    });
    expect(actions.some((action) => action.navigationKey === "jobs")).toBe(false);
  });
});

describe("2I-PALETTE-008/010: fast, and not a second shell", () => {
  it("makes no network call on the open-and-filter path", () => {
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /\bfetch\(|XMLHttpRequest|axios/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(
      offenders,
      "the palette performs I/O, so its 150 ms open budget depends on a network",
    ).toEqual([]);
  });

  it("holds no state that outlives it", () => {
    // 2I-PALETTE-010. A palette that persists is a shell.
    const offenders = PALETTE_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /localStorage|sessionStorage|document\.cookie|indexedDB/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders, `palette files persisting state: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("2I-PALETTE: copy exists in both locales and adds no ternary", () => {
  it("covers both locales with distinct strings", () => {
    const pt = getPaletteCopy("pt-BR");
    const en = getPaletteCopy("en");
    expect(pt.title).not.toBe(en.title);
    expect(pt.noResults.length).toBeGreaterThan(0);
    expect(en.noResults.length).toBeGreaterThan(0);
  });

  it("adds no inline locale ternary", () => {
    for (const path of PALETTE_FILES) {
      const code = executable(readFileSync(path, "utf8"));
      expect(/\bpt \?/.test(code), `${relative(REPO, path)} uses an inline locale ternary`).toBe(false);
    }
  });
});
