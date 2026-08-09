/**
 * `2K-ACT-002` / `2K-ACT-003` / `2K-ACT-004` — editing a parameter before
 * confirmation, and discarding.
 *
 * The edit is not a new pipeline. It writes one validated value into the
 * envelope's proposal and hands the envelope back to the same
 * `deriveTaskCommand` every other step uses — the shape `withClarification`
 * already established. So what these tests check is that the value really does
 * reach the derivation, that the derived command changes, and that nothing
 * about the envelope's *authority* changes with it.
 */

import { describe, expect, it } from "vitest";

import { normalizeTaskCommandProposal } from "@/lib/ai/task-command-schema";

import {
  TASK_COMMAND_SESSION_VERSION,
  createTaskCommandSession,
  deriveTaskCommand,
  withEditedParameter,
  type TaskCommandSession,
} from "./session";

const ISSUED_AT = "2026-08-09T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OPERATION_KEY = "3f1d5a20-4d5b-4c2e-9c3a-6f7b8d9e0a1b";

function proposalPayload(action: "rename_task" | "set_priority" = "rename_task") {
  const normalized = normalizeTaskCommandProposal(
    {
      outcome: "proposal",
      action,
      unsupportedReason: null,
      targetHints: {
        titleWords: ["relatorio"],
        project: null,
        person: null,
        context: null,
        status: null,
        temporalPhrase: null,
      },
      patch: {
        title: action === "rename_task" ? "Relatório trimestral" : null,
        note: null,
        status: null,
        priority: action === "set_priority" ? "low" : null,
        dueAt: null,
        plannedAt: null,
        projectRef: null,
        contextRef: null,
        personRef: null,
      },
    },
    OPERATION_KEY,
  );
  if (normalized.kind !== "proposal") throw new Error("fixture must normalize to a proposal");
  return normalized.payload;
}

function session(action: "rename_task" | "set_priority" = "rename_task"): TaskCommandSession {
  return createTaskCommandSession({
    proposal: proposalPayload(action),
    issuedAt: ISSUED_AT,
    model: "gpt-5.6-luna",
    promptVersion: "2026-07-25.1",
    strategyVersion: "task-command-v1",
  });
}

describe("2K-ACT-004: an edit re-derives the command", () => {
  it("carries the new value into the derived command", () => {
    const before = deriveTaskCommand(session(), TIME_ZONE);
    expect(before.status).toBe("ok");
    if (before.status !== "ok") return;
    expect(before.command.patch.title).toBe("Relatório trimestral");

    const edited = withEditedParameter(session(), "title", "Relatório anual");
    const after = deriveTaskCommand(edited, TIME_ZONE);
    expect(after.status).toBe("ok");
    if (after.status !== "ok") return;
    expect(after.command.patch.title).toBe("Relatório anual");
  });

  it("changes the canonical patch, which is a fingerprint input", () => {
    // The request fingerprint is a digest over the canonical patch, the
    // pre-state and the observed instant. Asserting the patch changed is
    // asserting the fingerprint changed, without reaching into the database
    // that computes it — and it is why an earlier confirmation, bound to the
    // pre-edit digest, can no longer be consumed.
    const before = deriveTaskCommand(session(), TIME_ZONE);
    const after = deriveTaskCommand(withEditedParameter(session(), "title", "Outro título"), TIME_ZONE);
    if (before.status !== "ok" || after.status !== "ok") throw new Error("both must derive");
    expect(JSON.stringify(after.command.patch)).not.toBe(JSON.stringify(before.command.patch));
  });

  it("keeps the operation key, so an edit is the same operation re-proposed", () => {
    // The key identifies the request; the fingerprint identifies its content.
    // Minting a new key on an edit would make a double-submit of the edited
    // command reserve a second row rather than replay the first.
    const edited = withEditedParameter(session(), "title", "Outro título");
    const derived = deriveTaskCommand(edited, TIME_ZONE);
    const original = deriveTaskCommand(session(), TIME_ZONE);
    if (derived.status !== "ok" || original.status !== "ok") throw new Error("both must derive");
    expect(derived.command.operationKey).toBe(original.command.operationKey);
  });
});

describe("2K-ACT-004: the edit changes the payload and nothing else", () => {
  it("does not touch the pinned clock, the witness, or the selection", () => {
    const base = session();
    const edited = withEditedParameter(base, "title", "Outro título");
    expect(edited.issuedAt).toBe(base.issuedAt);
    expect(edited.expected).toBe(base.expected);
    expect(edited.selectedTaskId).toBe(base.selectedTaskId);
    expect(edited.clarification).toBe(base.clarification);
    expect(edited.create).toBe(base.create);
  });

  it("does not change the envelope's shape, so no version bump is owed", () => {
    // `TASK_COMMAND_SESSION_VERSION` guards the *shape*. An edit writes into
    // `proposal`, which has always been an opaque payload, so an envelope
    // minted before this slice still parses and still means the same thing.
    expect(withEditedParameter(session(), "title", "x").version)
      .toBe(TASK_COMMAND_SESSION_VERSION);
  });

  it("returns a new envelope rather than mutating the one it was given", () => {
    const base = session();
    const snapshot = JSON.stringify(base.proposal);
    withEditedParameter(base, "title", "Outro título");
    expect(JSON.stringify(base.proposal)).toBe(snapshot);
  });
});

describe("2K-ACT-003: the derivation still refuses what the taxonomy refuses", () => {
  it("re-validates the edited value rather than trusting it", () => {
    // A status the action's policy does not admit must be refused by the same
    // validator that refuses it from the model. The edit path adds no
    // authority, so it inherits every bound.
    const edited = withEditedParameter(session("set_priority"), "priority", "catastrophic");
    const derived = deriveTaskCommand(edited, TIME_ZONE);
    expect(derived.status).not.toBe("ok");
  });

  it("still derives when the edited value is legal", () => {
    // The positive control for the refusal above: the same field, a legal
    // value, and the derivation succeeds.
    const edited = withEditedParameter(session("set_priority"), "priority", "urgent");
    const derived = deriveTaskCommand(edited, TIME_ZONE);
    expect(derived.status).toBe("ok");
    if (derived.status !== "ok") return;
    expect(derived.command.patch.priority).toBe("urgent");
  });
});
