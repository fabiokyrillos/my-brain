import { describe, expect, it } from "vitest";

import { CAPTURE_OPENERS, CAPTURE_TASK_WORDS, classifyCaptureIntent } from "./capture-intent";
import { MEMORY_OPENERS } from "./memory-intent";

/**
 * The one composer route that writes, so its rule is pinned rather than
 * described (2G-CAPTURE-001/002).
 */

describe("classifyCaptureIntent", () => {
  it("files an explicit imperative", () => {
    for (const text of [
      "Registre que preciso enviar o relatório",
      "Anote que a reunião mudou para sexta",
      "registre: comprar café",
      "Note that the invoice arrived late",
      "Capture that Marina approved the budget",
      "jot down the new address",
    ]) {
      expect(classifyCaptureIntent(text), text).toBe("capture");
    }
  });

  it("ignores an utterance with no filing imperative at all", () => {
    for (const text of [
      "",
      "   ",
      "Complete a tarefa do relatório",
      "Adicione uma tarefa para revisar os números",
      "O que eu combinei com a Marina?",
      "eu registrei o pagamento ontem",
    ]) {
      expect(classifyCaptureIntent(text), text).toBe("none");
    }
  });

  it("answers a question rather than filing it, whatever it opens with", () => {
    // The rule `memory-intent.ts` states, and it matters more here: that branch
    // proposes, this one writes.
    expect(classifyCaptureIntent("Registre que eu pedi o relatório?")).toBe("none");
    expect(classifyCaptureIntent("Note that I asked for the report?")).toBe("none");
  });

  it("asks when the sentence names both a note and a task", () => {
    expect(classifyCaptureIntent("Registre que preciso de uma tarefa nova")).toBe("ambiguous");
    expect(classifyCaptureIntent("Anote que a tarefa do relatório atrasou")).toBe("ambiguous");
    expect(classifyCaptureIntent("Note that this needs a task")).toBe("ambiguous");
    expect(classifyCaptureIntent("Note that these tasks are blocked")).toBe("ambiguous");
  });

  it("matches the task word at a boundary, so a longer word decides nothing", () => {
    // "multitarefa" contains "tarefa" and names no task. A substring match
    // here would send an ordinary note to the ambiguity prompt.
    expect(classifyCaptureIntent("Registre que odeio multitarefa")).toBe("capture");
    expect(classifyCaptureIntent("Note that multitasking is exhausting")).toBe("capture");
  });

  it("survives accents and phone punctuation, because the opener is normalized", () => {
    expect(classifyCaptureIntent("  Registre que ontem foi difícil")).toBe("capture");
    expect(classifyCaptureIntent("ANOTE QUE preciso ligar")).toBe("capture");
  });

  it("shares no opener with the memory route, so the two cannot both claim a turn", () => {
    // Order decides it in `routing.ts`, but an overlap would make that order
    // load-bearing in a way no reader could see. Disjointness is the property.
    const overlap = CAPTURE_OPENERS.filter((opener) =>
      (MEMORY_OPENERS as readonly string[]).includes(opener),
    );
    expect(overlap).toEqual([]);
  });

  it("keeps the task-word list narrow enough not to swallow ordinary filing", () => {
    // A broad list ("fazer", "do", "todo") would make the ambiguity branch fire
    // on most captures. Four words, and each of them names a task literally.
    expect([...CAPTURE_TASK_WORDS].sort()).toEqual(["task", "tarefa", "tarefas", "tasks"].sort());
    expect(classifyCaptureIntent("Registre que preciso fazer o relatório")).toBe("capture");
  });
});
