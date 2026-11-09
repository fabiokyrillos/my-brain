/**
 * Life Brain slice C.0 — `LB-C-008`: copy and navigation stop assuming work.
 *
 * The audit (`docs/reports/life-brain/AUDIT_WORK_BIAS.md` §4) found the task
 * list named "Trabalho", every clinic, school, bank or airline called an
 * "Empresa", and placeholders whose only examples were a contract, a report and
 * an invoice. A blood test lived under "Trabalho". This guard holds the three
 * renames and the retired examples in place:
 *
 *  1. the destinations read **Tarefas**, **Organizações** and **Memória**
 *     (`Tasks`, `Organizations`, `Memory`) — the route keys `work`,
 *     `organizations` and `library` are unchanged, so no URL moves;
 *  2. no user-facing copy module still calls an organization a company — the
 *     palette's *keywords* are the one exception, on purpose: a reader who
 *     types the old word still finds the place;
 *  3. the work-only phrases the audit quoted are gone from product copy, in
 *     both locales;
 *  4. the extraction prompt is **untouched** — C.0 is copy only, and the
 *     prompt's life examples are C.1's (`LB-C-007`), behind the parity guards.
 *     When C.1 bumps the version it updates the pin below on purpose.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { getAutomationCopy } from "../../features/agent/automation-copy";
import { getEntityCopy } from "../../features/entities/copy";
import { getHistoryCopy } from "../../features/history/copy";
import { getLibraryCopy } from "../../features/library/copy";
import { getSearchCopy } from "../../features/search/copy";
import { getHomeCopy } from "../../features/shell/home-copy";
import { entityTypeLabel } from "../../features/vocabulary/copy";
import { getMessages } from "../../i18n/messages";
import type { Locale } from "../preferences";

const REPO = process.cwd();
const LOCALES: readonly Locale[] = ["pt-BR", "en"];

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

/** Comments removed, string literals kept: the headers of these files quote
 *  the old words to explain why they left, and copy lives in the literals. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Every string leaf of a copy record, so a renamed key cannot hide a word. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const PRODUCT_FILES = [...filesUnder(join(REPO, "src/features")), ...filesUnder(join(REPO, "src/app")), join(REPO, "src/i18n/messages.ts")];

/*
 * The extraction prompt lives in `src/lib/ai` and in the worker, outside the
 * scanned trees, and keeps its corporate examples until C.1 adds life ones
 * beside them (`LB-C-007` extends, never replaces).
 */
const RETIRED_PHRASES = [
  // pt-BR
  "Visões de Trabalho",
  "Modos de Trabalho",
  "Ver todo o trabalho",
  "Ver seu trabalho",
  "Trabalho em aberto",
  "Quem aparece no seu trabalho",
  "Empresas e clientes",
  "Aguardando outras pessoas",
  "Âmbitos que separam",
  "prefiro reuniões pela manhã",
  "tarefa do relatório",
  "nota fiscal da Acme",
  "revisora do contrato",
  "Aguardando terceiro",
  // en
  "Work views",
  "Work modes",
  "View all work",
  "See your work",
  "Open work",
  "Who shows up in your work",
  "Companies and clients",
  "Waiting on other people",
  "keep work apart from personal",
  "I prefer meetings in the morning",
  "the report task",
  "invoice for Acme",
  "contract reviewer",
] as const;

describe("Life Brain C.0 — destinations named for a whole life", () => {
  it.each([
    ["pt-BR", "Tarefas", "Organizações", "Memória"],
    ["en", "Tasks", "Organizations", "Memory"],
  ] as const)("%s names the task list, organizations and memory for what they hold", (locale, work, organizations, library) => {
    const { nav } = getMessages(locale);
    expect(nav.work).toBe(work);
    expect(nav.organizations).toBe(organizations);
    expect(nav.library).toBe(library);
  });

  it.each(LOCALES)("%s copy calls an organization an organization", (locale) => {
    const records = {
      entities: getEntityCopy(locale),
      library: getLibraryCopy(locale),
      search: getSearchCopy(locale),
      history: getHistoryCopy(locale, "Brain"),
      automation: getAutomationCopy(locale),
      vocabulary: entityTypeLabel(locale, "organization"),
      nav: getMessages(locale).nav,
    };
    for (const [name, record] of Object.entries(records)) {
      const offending = strings(record).filter((text) => /\bempresas?\b|\bcompan(y|ies)\b/i.test(text));
      expect(offending, name).toEqual([]);
    }
  });

  it.each(LOCALES)("%s Home no longer says other people or work for the waiting lane", (locale) => {
    const home = getHomeCopy(locale, "Brain");
    expect(home.sections.waiting.title).not.toMatch(/outras pessoas|other people/i);
    expect(home.viewAllWork).not.toMatch(/trabalho|work/i);
  });

  it("no product file still carries a work-only phrase the audit quoted", () => {
    const offending: string[] = [];
    for (const path of PRODUCT_FILES) {
      const source = withoutComments(readFileSync(path, "utf8"));
      for (const phrase of RETIRED_PHRASES) {
        if (source.includes(phrase)) offending.push(`${relative(REPO, path)}: ${phrase}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it("no product file hardcodes the assistant as \"Cérebro\"", () => {
    // Defect 2 of `FEEDBACK_DONO_2026-11-05.md`: Relações said "o Cérebro" while
    // the rest of the product said the configured name (UX-06). Copy carries
    // `{agent}` and the getter substitutes it; this holds every product file.
    const offending = PRODUCT_FILES.filter((path) => withoutComments(readFileSync(path, "utf8")).includes("Cérebro")).map((path) =>
      relative(REPO, path),
    );
    expect(offending).toEqual([]);
  });

  it("left the extraction prompt to C.1, which extended it rather than replacing it", () => {
    // C.0 pinned the version at "2026-08-22.1" and said C.1 would move it on
    // purpose. C.1 did (ADR-148): the life-area section was added and the
    // corporate examples stay beside it (`LB-C-007` extends, never replaces).
    // C.2 moved it again (ADR-151) for `people[].role`, and C.3 (ADR-152) for
    // `eventCandidates`; same rule. Backlog item 3 moved it to 2026-11-05.1
    // for `people[].birthday` (ADR-158); same rule.
    for (const file of ["src/lib/ai/openai-provider.ts", "supabase/functions/process-jobs/entry.ts"]) {
      const source = readFileSync(join(REPO, file), "utf8");
      expect(source, file).toContain('EXTRACTION_PROMPT_VERSION = "2026-11-05.1"');
      expect(source, file).toContain("such as Trabalho, Casa, Saúde or Estudos.");
      expect(source, file).toContain("Assinei o contrato com a Ambev");
    }
  });
});
