import { describe, expect, it } from "vitest";

import { idleTaskCommandState, type TaskCommandConsoleState } from "@/features/task-commands/console-state";
import { TASK_COMMAND_UNSUPPORTED_REASONS } from "@/features/task-commands/taxonomy";
import { MAX_COMMAND_TEXT_LENGTH } from "@/lib/ai/task-command-schema";

import { commandTurnFallsThrough, decideAssistantRoute } from "./routing";

function refusedAs(reason: TaskCommandConsoleState["unsupportedReason"]): TaskCommandConsoleState {
  return { ...idleTaskCommandState, status: "resolved", unsupportedReason: reason, terminal: true };
}

describe("decideAssistantRoute", () => {
  it("sends a memory instruction to the memory branch before any provider call", () => {
    expect(decideAssistantRoute("Lembre disso sempre")).toEqual({ kind: "memory_intent" });
  });

  it("sends text longer than a command can be straight to the knowledge answer", () => {
    const tooLong = "a".repeat(MAX_COMMAND_TEXT_LENGTH + 1);
    expect(decideAssistantRoute(tooLong)).toEqual({
      kind: "knowledge",
      reason: "too_long_for_command",
    });
  });

  it("keeps text exactly at the command bound on the command path", () => {
    // The bound is inclusive in `commandTextSchema` (`.max()`), so the skip must
    // start one character later or the composer would refuse to parse commands
    // the pipeline still accepts.
    expect(decideAssistantRoute("a".repeat(MAX_COMMAND_TEXT_LENGTH))).toEqual({ kind: "command_first" });
  });

  it("tries the command path for everything else", () => {
    expect(decideAssistantRoute("Mude a prioridade da tarefa do relatório")).toEqual({ kind: "command_first" });
    // A statement with no change verb still goes through the parse: it may be
    // an implicit task the command model knows how to read.
    expect(decideAssistantRoute("Preciso comprar leite amanhã")).toEqual({ kind: "command_first" });
  });

  /*
   * Life Brain B.2, `LB-B-009`. A question with no change verb used to pay for a
   * task-command parse that could only answer `not_a_task_command` before the
   * knowledge answer ran — two text-model calls for one question
   * (`AUDIT_CHAT_RETRIEVAL.md` §1). It now goes straight to knowledge.
   */
  it.each([
    "O que combinei com Jaime?",
    "Quais exames estão pendentes?",
    "quando fui ao médico pela última vez",
    "Como está a viagem para Lisboa?",
    "What did I say about the trip?",
    "When did I last see the doctor",
    "Is the passport renewal still open?",
  ])("sends the question %j straight to knowledge (LB-B-009)", (question) => {
    expect(decideAssistantRoute(question)).toEqual({ kind: "knowledge", reason: "question_form" });
  });

  it.each([
    "Pode concluir a tarefa do exame?",
    "Você marca o relatório como feito?",
    "Dá para adiar a consulta para sexta?",
    "Can you mark the blood test as done?",
    "Could you move the dentist task to Friday?",
    "Crie uma tarefa: renovar passaporte?",
  ])("keeps the polite command %j on the command path", (command) => {
    expect(decideAssistantRoute(command)).toEqual({ kind: "command_first" });
  });

  it("answers an agenda question from the calendar, before any command parse (LB-B-005)", () => {
    expect(decideAssistantRoute("O que tenho amanhã?")).toEqual({
      kind: "agenda",
      span: { kind: "day", offset: 1 },
    });
    expect(decideAssistantRoute("What do I have this week?")).toEqual({
      kind: "agenda",
      span: { kind: "week", offset: 0 },
    });
  });

  it("keeps a command that names a day on the command path", () => {
    expect(decideAssistantRoute("Mova a tarefa do relatório para amanhã")).toEqual({ kind: "command_first" });
  });

  it("keeps the explicit filing instruction ahead of the agenda route", () => {
    // "Registre que…" writes the owner's own sentence; an agenda reading would
    // silently answer a question nobody asked instead.
    expect(decideAssistantRoute("Registre que amanhã tenho dentista")).toEqual({ kind: "capture_intent" });
  });

  it("prefers the memory branch over the length skip", () => {
    // A long memory instruction is still an instruction to remember, and the
    // memory branch costs nothing, so it must win.
    expect(decideAssistantRoute(`Lembre disso sempre: ${"x".repeat(MAX_COMMAND_TEXT_LENGTH)}`))
      .toEqual({ kind: "memory_intent" });
  });
});

describe("commandTurnFallsThrough", () => {
  it("falls through only on not_a_task_command", () => {
    expect(commandTurnFallsThrough(refusedAs("not_a_task_command"))).toBe(true);
  });

  it("never falls through on any other declared unsupported reason", () => {
    // Exhaustive against the taxonomy rather than a hand-listed sample, so a
    // reason added later is refused by default instead of silently becoming a
    // chat question.
    const others = TASK_COMMAND_UNSUPPORTED_REASONS.filter((reason) => reason !== "not_a_task_command");
    expect(others.length).toBeGreaterThan(0);
    for (const reason of others) {
      expect(commandTurnFallsThrough(refusedAs(reason))).toBe(false);
    }
  });

  it("never converts a provider failure or invalid model output into a question", () => {
    // Both are refusals with `unsupportedReason: null` — a lost response and a
    // truncated one. Masking either as a knowledge answer would hide an
    // infrastructure fault behind a plausible sentence.
    const providerFailure: TaskCommandConsoleState = {
      ...idleTaskCommandState,
      status: "resolved",
      reason: "The model did not answer.",
      retryable: true,
    };
    expect(commandTurnFallsThrough(providerFailure)).toBe(false);
  });

  it("never falls through on a turn that is still waiting for the user", () => {
    for (const control of ["apply", "confirm", "choose", "clarify", "create"] as const) {
      expect(commandTurnFallsThrough({ ...idleTaskCommandState, status: "resolved", control })).toBe(false);
    }
  });

  it("does not fall through on an idle state", () => {
    expect(commandTurnFallsThrough(idleTaskCommandState)).toBe(false);
  });
});
