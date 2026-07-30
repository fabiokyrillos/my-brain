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
    expect(decideAssistantRoute("O que combinei com Jaime?")).toEqual({ kind: "command_first" });
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
