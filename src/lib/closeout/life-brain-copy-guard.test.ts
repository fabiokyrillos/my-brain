import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/messages";
import { getEntityCopy } from "@/features/entities/copy";
import { getSearchCopy } from "@/features/search/copy";
import { getLibraryCopy } from "@/features/library/copy";
import { getTaskDetailCopy } from "@/features/daily-cycle/task-detail-copy";
import { getVocabularyCopy } from "@/features/vocabulary/copy";
import { getAutomationCopy } from "@/features/agent/automation-copy";

/**
 * Life Brain C.0 (`LB-C-008`, `IMPLEMENTATION_PLAN.md` §3): the copy stops
 * assuming work. Three names change everywhere at once — the task list is
 * "Tarefas", organizations are "Organizações", and the place is "Memória" (the
 * last one since A.2) — and the examples a person reads in a placeholder or an
 * intro come from a whole life, not an office.
 *
 * Two halves. The first pins the names through the copy modules the surfaces
 * actually read. The second reads the source of the copy files the
 * investigation listed (`AUDIT_WORK_BIAS.md` §4) and refuses the exact strings
 * it found, so a later edit cannot put one back without this test saying so.
 *
 * Out of scope on purpose: the context kind "Trabalho" / "Work" (a real value
 * of `contexts.kind`, and a real area of a life) and the extraction prompt,
 * which C.0 leaves byte-identical so the parity tests stay untouched — C.1
 * owns the prompt.
 */
describe("Life Brain C.0 — the names", () => {
  it("names the task list Tarefas and organizations Organizações in the navigation", () => {
    expect(getMessages("pt-BR").nav.work).toBe("Tarefas");
    expect(getMessages("en").nav.work).toBe("Tasks");
    expect(getMessages("pt-BR").nav.organizations).toBe("Organizações");
    expect(getMessages("en").nav.organizations).toBe("Organizations");
    expect(getMessages("pt-BR").nav.library).toBe("Memória");
    expect(getMessages("en").nav.library).toBe("Memory");
  });

  it("says the same word for the relation everywhere it is visible", () => {
    // EGC.1's rule: the destination and every control naming the same thing
    // use one word. C.0 changed the word, not the rule.
    for (const [locale, singular, plural] of [
      ["pt-BR", "Organização", "Organizações"],
      ["en", "Organization", "Organizations"],
    ] as const) {
      const entity = getEntityCopy(locale);
      expect(entity.organizations).toBe(plural);
      expect(entity.organizationLabel).toBe(singular);
      expect(entity.company).toBe(singular);
      expect(entity.companyDialogTitle).toBe(singular);
      expect(entity.companyChooseLabel).toBe(singular);
      expect(getSearchCopy(locale).domains.organizations).toBe(singular);
      expect(getVocabularyCopy(locale).entityTypes.organization).toBe(singular);
      expect(getAutomationCopy(locale).categories.organization.name).toBe(plural);
      expect(getMessages(locale).nav.organizations).toBe(plural);
    }
  });

  it("sends the task page's back link to Tarefas", () => {
    expect(getTaskDetailCopy("pt-BR", "Brain").back).toBe("Tarefas");
    expect(getTaskDetailCopy("en", "Brain").back).toBe("Tasks");
  });

  it("describes Memória's lenses through a life, not through work", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { descriptions } = getLibraryCopy(locale);
      for (const text of [descriptions.people, descriptions.projects, descriptions.organizations]) {
        expect(text).not.toMatch(/seu trabalho|trabalhando|clientes\.|your work|working on|and clients/i);
      }
    }
  });
});

const ROOT = join(__dirname, "..", "..", "..");

/**
 * The exact strings `AUDIT_WORK_BIAS.md` §4 recorded, by file. Each is a
 * sentence or a label a person read; none is a fixture or a comment.
 */
const RETIRED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["src/i18n/messages.ts", ['work: "Trabalho"', 'work: "Work"', 'organizations: "Empresas"', 'organizations: "Companies"']],
  ["src/features/daily-cycle/work-view.tsx", ['"EXECUÇÃO"', '"EXECUTION"', '"Visões de Trabalho"', 'title: "Trabalho"', "fase posterior", "later phase"]],
  ["src/features/daily-cycle/work-modes.tsx", ['"Modos de Trabalho"', '"Work modes"']],
  ["src/features/daily-cycle/copy.ts", ['"Ver seu trabalho"', '"See your work"']],
  ["src/features/daily-cycle/task-detail-copy.ts", ['back: "Trabalho"', 'back: "Work"']],
  ["src/features/shell/home-copy.ts", ['"Aguardando outras pessoas"', '"Ver todo o trabalho"', '"View all work"']],
  ["src/features/library/copy.ts", ['"Quem aparece no seu trabalho."', '"No que você está trabalhando."', '"Empresas e clientes."']],
  ["src/features/entities/copy.ts", ['"Nova empresa"', '"Empresas"', '"Âmbitos que separam o que é trabalho do que é pessoal."', '"Ex.: revisora do contrato"', '"Trabalho em aberto"', '"New company"', '"Companies"']],
  ["src/features/search/copy.ts", ['organizations: "Empresa"', 'organizations: "Company"']],
  ["src/features/agent/automation-copy.ts", ['name: "Empresas"', 'name: "Companies"']],
  ["src/features/history/copy.ts", ['"criou a empresa', '"created the company']],
  ["src/features/memories/copy.ts", ["prefiro reuniões pela manhã", "meetings in the morning"]],
  ["src/features/task-commands/copy.ts", ["tarefa do relatório", "nota fiscal da Acme", "the report task", "invoice for Acme"]],
  ["src/app/[locale]/app/projects/page.tsx", ["Frentes ativas", "Active workstreams"]],
];

describe("Life Brain C.0 — the retired copy stays retired", () => {
  it.each(RETIRED)("%s carries none of the work-only strings the audit found", (file, strings) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const retired of strings) {
      expect(source, `${file} still says ${retired}`).not.toContain(retired);
    }
  });
});
