import { describe, expect, it } from "vitest";

import { getHistoryCopy } from "@/features/history/copy";
import { getMemoryCopy } from "@/features/memories/copy";
import { getEntityCopy } from "@/features/entities/copy";
import { MEMORY_KINDS as MEMORY_KINDS_SCHEMA } from "@/features/memories/schema";
import { PROJECT_STATUSES as PROJECT_STATUSES_SCHEMA } from "@/features/entities/schema";
import { TASK_STATUSES as TASK_STATUSES_HISTORY } from "@/features/history/vocabulary";

import {
  ATTACHMENT_STATUSES,
  CONTEXT_KINDS,
  ENTITY_TYPES,
  JOB_STATUSES,
  KNOWN_JOB_TYPES,
  MEMORY_KINDS,
  PROJECT_STATUSES,
  TASK_STATUSES,
  attachmentStatusLabel,
  contextKindLabel,
  entityTypeLabel,
  getVocabularyCopy,
  jobStatusLabel,
  jobTypeLabel,
  memoryKindLabel,
  projectStatusLabel,
  taskStatusLabel,
} from "./copy";

const LOCALES = ["pt-BR", "en"] as const;

const VOCABULARIES = [
  ["taskStatuses", TASK_STATUSES],
  ["projectStatuses", PROJECT_STATUSES],
  ["contextKinds", CONTEXT_KINDS],
  ["memoryKinds", MEMORY_KINDS],
  ["attachmentStatuses", ATTACHMENT_STATUSES],
  ["jobStatuses", JOB_STATUSES],
  ["jobTypes", KNOWN_JOB_TYPES],
  ["entityTypes", ENTITY_TYPES],
] as const;

describe("the shared object-state vocabulary", () => {
  /**
   * The finding, restated as a test: every member of every closed set has a
   * label, in both locales, and none of them is the raw database value.
   * `Record<Union, string>` already makes a *missing* member a type error; this
   * catches the other half — a member "labelled" with its own enum value, which
   * type-checks and still shows the owner `recurring_info`.
   */
  it.each(LOCALES)("labels every member in %s, and never with the stored value", (locale) => {
    const copy = getVocabularyCopy(locale);

    for (const [name, members] of VOCABULARIES) {
      const labels = copy[name] as Readonly<Record<string, string>>;
      for (const member of members) {
        const label = labels[member];
        expect(label, `${name}.${member} in ${locale}`).toBeTruthy();
        expect(label, `${name}.${member} in ${locale} is the raw value`).not.toBe(member);
        expect(label, `${name}.${member} in ${locale} still has an underscore`).not.toMatch(/_/);
      }
    }
  });

  it.each(LOCALES)("gives each member of a set a distinct label in %s", (locale) => {
    const copy = getVocabularyCopy(locale);

    for (const [name, members] of VOCABULARIES) {
      const labels = copy[name] as Readonly<Record<string, string>>;
      // Tasks and projects both have `completed`; within one set, two members
      // reading the same word would make the badge meaningless.
      const rendered = members.map((member) => labels[member]);
      expect(new Set(rendered).size, `${name} in ${locale}`).toBe(members.length);
    }
  });

  it("differs between locales wherever the languages differ", () => {
    const pt = getVocabularyCopy("pt-BR");
    const english = getVocabularyCopy("en");

    // `Informal`-style coincidences are legitimate, so this asserts the sets are
    // not wholesale identical rather than that every single label differs.
    expect(JSON.stringify(pt)).not.toBe(JSON.stringify(english));
  });

  describe("lookups", () => {
    it("returns null for a value outside the closed set rather than inventing one", () => {
      expect(taskStatusLabel("pt-BR", "snoozed")).toBeNull();
      expect(projectStatusLabel("en", "todo")).toBeNull();
      expect(contextKindLabel("pt-BR", "")).toBeNull();
      expect(memoryKindLabel("en", "recurring info")).toBeNull();
      expect(attachmentStatusLabel("pt-BR", "interpreted")).toBeNull();
      expect(jobStatusLabel("en", "leased")).toBeNull();
      expect(entityTypeLabel("pt-BR", "task")).toBeNull();
    });

    it("localizes each vocabulary it owns", () => {
      expect(taskStatusLabel("pt-BR", "in_progress")).toBe("Em andamento");
      expect(taskStatusLabel("en", "in_progress")).toBe("In progress");
      expect(projectStatusLabel("pt-BR", "paused")).toBe("Pausado");
      expect(contextKindLabel("en", "work")).toBe("Work");
      expect(memoryKindLabel("en", "recurring_info")).toBe("Recurring information");
      expect(attachmentStatusLabel("pt-BR", "ready")).toBe("Pronto");
      expect(jobStatusLabel("pt-BR", "pending")).toBe("Na fila");
      expect(entityTypeLabel("en", "organization")).toBe("Company");
    });

    /**
     * `jobs.type` is the one column with no `check` constraint, so a worker can
     * be deployed without a migration. Falling back to the identifier on the
     * private technical queue is the documented exception, not an oversight.
     */
    it("falls back to the raw job type only for a worker it does not know", () => {
      expect(jobTypeLabel("pt-BR", "interpret_entry")).toBe("Interpretar registro");
      expect(jobTypeLabel("en", "process_attachment")).toBe("Process file");
      expect(jobTypeLabel("en", "rebuild_embeddings")).toBe("rebuild_embeddings");
    });
  });

  /**
   * Two typed homes for one vocabulary is two answers waiting to happen. These
   * pin the overlaps to the modules that already shipped them, so a label can
   * only be changed in both places at once.
   */
  describe("agreement with the modules that already own these sets", () => {
    it("carries exactly the task statuses History enumerates", () => {
      expect([...TASK_STATUSES]).toEqual([...TASK_STATUSES_HISTORY]);
    });

    it("carries exactly the project statuses the entity schema enforces", () => {
      expect([...PROJECT_STATUSES]).toEqual([...PROJECT_STATUSES_SCHEMA]);
    });

    it("carries exactly the memory kinds the memory schema enforces", () => {
      expect([...MEMORY_KINDS]).toEqual([...MEMORY_KINDS_SCHEMA]);
    });

    it.each(LOCALES)("agrees with History's task-status labels in %s", (locale) => {
      const mine = getVocabularyCopy(locale).taskStatuses;
      // The agent name only substitutes into History's *sentences*; the status
      // labels do not carry it, so any name serves for this comparison.
      const history = getHistoryCopy(locale, "Brain").taskStatuses;
      for (const status of TASK_STATUSES) {
        expect(mine[status], `${status} in ${locale}`).toBe(history[status]);
      }
    });

    it.each(LOCALES)("agrees with the Memories module's kind labels in %s", (locale) => {
      const mine = getVocabularyCopy(locale).memoryKinds;
      const memories = getMemoryCopy(locale).kinds;
      for (const kind of MEMORY_KINDS) {
        expect(mine[kind], `${kind} in ${locale}`).toBe(memories[kind]);
      }
    });

    it.each(LOCALES)("agrees with the entity edit form's project-status labels in %s", (locale) => {
      const mine = getVocabularyCopy(locale).projectStatuses;
      const entities = getEntityCopy(locale).statuses;
      for (const status of PROJECT_STATUSES) {
        expect(mine[status], `${status} in ${locale}`).toBe(entities[status]);
      }
    });
  });
});
