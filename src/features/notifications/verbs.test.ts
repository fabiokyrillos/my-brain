import { describe, expect, it } from "vitest";

import {
  VERBS,
  getVerbCopy,
  menuVerbsFor,
  primaryVerbFor,
  verbsForRow,
  type VerbId,
} from "./verbs";

const LOCALES = ["pt-BR", "en"] as const;

describe("2S-ACT-011: the verb set is one source, not two that agree", () => {
  it("defines every verb exactly once", () => {
    const ids = VERBS.map((verb) => verb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries copy for every verb in both locales, with nothing missing and nothing extra", () => {
    const ids = [...VERBS].map((verb) => verb.id).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(getVerbCopy(locale)).sort(), `${locale} disagrees with the verb set`).toEqual(ids);
    }
  });

  it("gives every verb a non-empty label and meaning in both locales", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      for (const verb of VERBS) {
        expect(copy[verb.id].label.trim(), `${locale}/${verb.id} label`).not.toBe("");
        expect(copy[verb.id].meaning.trim(), `${locale}/${verb.id} meaning`).not.toBe("");
      }
    }
  });

  it("names the subject in every accessible name, so twenty rows are distinguishable", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      for (const verb of VERBS) {
        expect(copy[verb.id].accessibleName("Pagar o aluguel"), `${locale}/${verb.id}`)
          .toContain("Pagar o aluguel");
      }
    }
  });

  it("says something different in each locale, so neither is the other untranslated", () => {
    const pt = getVerbCopy("pt-BR");
    const en = getVerbCopy("en");
    for (const verb of VERBS) {
      expect(pt[verb.id].label, `${verb.id} was never translated`).not.toBe(en[verb.id].label);
    }
  });
});

describe("2S-ACT-006: a verb that changes the task says so, and one that changes the message says that", () => {
  /*
   * Asserted against the copy rather than trusted to review. The two groups are
   * worded around different nouns, and a control describing a task change in
   * message words must fail — which is exactly what these two tests do if the
   * nouns are ever swapped.
   */
  const TASK_NOUN = { "pt-BR": "tarefa", en: "task" } as const;
  const MESSAGE_NOUN = { "pt-BR": "aviso", en: "notice" } as const;

  it("uses the task noun in every task verb's label", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      for (const verb of VERBS.filter((candidate) => candidate.scope === "task")) {
        expect(copy[verb.id].label.toLowerCase(), `${locale}/${verb.id}`).toContain(TASK_NOUN[locale]);
      }
    }
  });

  it("uses the message noun, and never the task noun, in every message verb's label", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      for (const verb of VERBS.filter((candidate) => candidate.scope === "message")) {
        const label = copy[verb.id].label.toLowerCase();
        expect(label, `${locale}/${verb.id} should name the notice`).toContain(MESSAGE_NOUN[locale]);
        expect(label, `${locale}/${verb.id} describes a message change in task words`)
          .not.toContain(TASK_NOUN[locale]);
      }
    }
  });

  it("makes every cadence verb promise that neither the task nor this message moves", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      for (const verb of VERBS.filter((candidate) => candidate.scope === "cadence")) {
        expect(copy[verb.id].meaning.toLowerCase(), `${locale}/${verb.id}`).toContain(TASK_NOUN[locale]);
      }
    }
  });
});

describe("2S-ANSWER-003: marking read and dismissing are distinct, and neither is described as the other", () => {
  it("gives them different labels and different meanings in both locales", () => {
    for (const locale of LOCALES) {
      const copy = getVerbCopy(locale);
      expect(copy.mark_read.label).not.toBe(copy.dismiss.label);
      expect(copy.mark_read.meaning).not.toBe(copy.dismiss.meaning);
    }
  });

  it("keeps dismissal's promise that the cadence is untouched", () => {
    /*
     * `2S-ANSWER-008`: dismissing removes the message and nothing else — the
     * subject still produces a notice when the cadence next permits one. The
     * copy has to say that, because a sentence implying silence would be a
     * disposition whose words and behaviour disagree, which `2S-ANSWER-002`
     * exists to refuse. **Read the product's own copy before assigning meaning
     * to a word.**
     */
    expect(getVerbCopy("pt-BR").dismiss.meaning).toContain("ainda pode chegar");
    expect(getVerbCopy("en").dismiss.meaning).toContain("can still arrive");
  });
});

describe("2S-ACT-001 / -005: the primary action is derived from the subject's state", () => {
  it("leads with completing a task the subject admits completing", () => {
    const verbs = verbsForRow({ subjectType: "task", subjectStatus: "todo" });
    expect(primaryVerbFor(verbs)?.id).toBe("complete_task");
  });

  it("offers no completion when the subject does not admit it", () => {
    const verbs = verbsForRow({ subjectType: "task", subjectStatus: "completed" });
    expect(verbs.map((verb) => verb.id)).not.toContain("complete_task");
  });

  it("renders a DIFFERENT primary for two subjects in different states", () => {
    /*
     * This is the requirement's own control: *"two subjects in different states
     * render different primaries in the same list."* A component with the
     * primary hard-coded would pass every other test in this file.
     */
    const live = primaryVerbFor(verbsForRow({ subjectType: "task", subjectStatus: "todo" }));
    const settled = primaryVerbFor(verbsForRow({ subjectType: "task", subjectStatus: "completed" }));
    expect(live?.id).not.toBe(settled?.id);
  });

  it("gives a row with no derived subject its message verbs and no task verb", () => {
    const verbs = verbsForRow({ subjectType: null, subjectStatus: null });
    expect(verbs.map((verb) => verb.id)).toEqual(["mark_read", "dismiss"]);
  });

  it("never offers a task verb against a reminder", () => {
    const ids = verbsForRow({ subjectType: "reminder", subjectStatus: "todo" })
      .map((verb) => verb.id);
    expect(ids).not.toContain("complete_task");
    expect(ids).not.toContain("reschedule_task");
  });

  it("still offers both silencing verbs for a reminder", () => {
    const ids = verbsForRow({ subjectType: "reminder", subjectStatus: null }).map((verb) => verb.id);
    expect(ids).toContain("silence_until");
    expect(ids).toContain("silence_subject");
  });
});

describe("2S-ACT-002: everything that is not primary lives in one compact menu", () => {
  it("splits the row into exactly one primary plus the rest", () => {
    const verbs = verbsForRow({ subjectType: "task", subjectStatus: "todo" });
    const primary = primaryVerbFor(verbs);
    const menu = menuVerbsFor(verbs);
    expect(primary).not.toBeNull();
    expect(menu).toHaveLength(verbs.length - 1);
    expect(menu.map((verb) => verb.id)).not.toContain(primary?.id as VerbId);
  });
});

describe("2S-ACT-009 / -010: reversibility is declared, not assumed", () => {
  it("marks the two message dispositions irreversible and the rest reversible", () => {
    const reversible = Object.fromEntries(VERBS.map((verb) => [verb.id, verb.reversible]));
    expect(reversible).toEqual({
      complete_task: true,
      reschedule_task: true,
      mark_read: false,
      dismiss: false,
      silence_until: true,
      silence_subject: true,
    });
  });
});
