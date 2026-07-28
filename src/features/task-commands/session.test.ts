import { describe, expect, it } from "vitest";

import { normalizeTaskCommandProposal } from "@/lib/ai/task-command-schema";
import {
  TASK_COMMAND_SESSION_VERSION,
  clarificationUsed,
  createTaskCommandSession,
  deriveBaseTaskCommand,
  deriveTaskCommand,
  parseTaskCommandSession,
  requireApplicableSession,
  serializeTaskCommandSession,
  TaskCommandSessionError,
  withClarification,
  withSelectedTask,
  withStalenessWitness,
  type TaskCommandSession,
} from "./session";

const ISSUED_AT = "2026-07-28T12:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const OPERATION_KEY = "3f1d5a20-4d5b-4c2e-9c3a-6f7b8d9e0a1b";
const TASK_ID = "11111111-2222-4333-8444-555555555555";

/**
 * Built through the real `normalizeTaskCommandProposal` rather than as a bare
 * object literal, for the same reason every other fixture in this directory is:
 * a hand-written payload is a second declaration of the wire shape, and the
 * defect it cannot catch is the bridge and the envelope drifting apart.
 */
function proposalPayload(overrides: Partial<{ titleWords: string[]; action: "complete_task" | "cancel_task" }> = {}) {
  const normalized = normalizeTaskCommandProposal(
    {
      outcome: "proposal",
      action: overrides.action ?? "complete_task",
      unsupportedReason: null,
      targetHints: {
        titleWords: overrides.titleWords ?? ["relatorio"],
        project: null,
        person: null,
        context: null,
        status: null,
        temporalPhrase: null,
      },
      patch: {
        title: null,
        note: null,
        status: null,
        priority: null,
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

function session(overrides: Partial<TaskCommandSession> = {}): TaskCommandSession {
  return {
    ...createTaskCommandSession({
      proposal: proposalPayload(),
      issuedAt: ISSUED_AT,
      model: "gpt-5.6-luna",
      promptVersion: "2026-07-25.1",
      strategyVersion: "task-command-v1",
    }),
    ...overrides,
  };
}

describe("task command session envelope", () => {
  it("pins the clock it was created with and starts with no selection or witness", () => {
    const created = session();
    expect(created.version).toBe(TASK_COMMAND_SESSION_VERSION);
    expect(created.issuedAt).toBe(ISSUED_AT);
    expect(created.selectedTaskId).toBeNull();
    expect(created.expected).toBeNull();
    expect(created.clarification).toBeNull();
  });

  it("refuses to mint a session against an instant with no timezone designator", () => {
    // The exact hazard `candidates.ts` refuses one layer down: `2026-07-28T12:00`
    // is *local* time by definition, so the whole session would be host-dependent.
    expect(() =>
      createTaskCommandSession({
        proposal: proposalPayload(),
        issuedAt: "2026-07-28T12:00",
        model: "gpt-5.6-luna",
        promptVersion: "p",
        strategyVersion: "s",
      }),
    ).toThrow(TaskCommandSessionError);
  });

  it("round-trips through a form field", () => {
    const before = withStalenessWitness(session(), { taskId: TASK_ID, updatedAt: ISSUED_AT });
    const parsed = parseTaskCommandSession(serializeTaskCommandSession(before));
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.session).toEqual(before);
  });

  it("refuses an envelope minted by another version of the shape", () => {
    const stale = { ...session(), version: "2026-01-01.0" };
    const parsed = parseTaskCommandSession(JSON.stringify(stale));
    expect(parsed).toEqual({ status: "invalid", field: "version" });
  });

  it("refuses an envelope carrying an unknown field", () => {
    const parsed = parseTaskCommandSession(
      JSON.stringify({ ...session(), previewFingerprint: "deadbeef" }),
    );
    expect(parsed.status).toBe("invalid");
  });

  it("refuses text that is not JSON at all", () => {
    expect(parseTaskCommandSession("{")).toEqual({ status: "invalid", field: "<root>" });
  });

  it("refuses a clarification longer than the bounded hint rules allow", () => {
    const parsed = parseTaskCommandSession(
      JSON.stringify({ ...session(), clarification: { project: "x".repeat(400) } }),
    );
    expect(parsed.status).toBe("invalid");
  });

  describe("re-derivation", () => {
    it("produces the identical command every time, at the pinned instant", () => {
      const created = session();
      const first = deriveTaskCommand(created, TIME_ZONE);
      const second = deriveTaskCommand(created, TIME_ZONE);
      expect(first.status).toBe("ok");
      expect(first).toEqual(second);
      if (first.status !== "ok") return;
      expect(first.command.operationKey).toBe(OPERATION_KEY);
      expect(first.command.action).toBe("complete_task");
    });

    it("resolves a relative phrase against the pinned instant, not against now", () => {
      // Two derivations of one envelope must agree even though wall-clock time
      // moved between them. Pinning is what makes that true, and it is what the
      // fingerprint depends on.
      const normalized = normalizeTaskCommandProposal(
        {
          outcome: "proposal",
          action: "reschedule_due",
          unsupportedReason: null,
          targetHints: {
            titleWords: ["dentista"],
            project: null,
            person: null,
            context: null,
            status: null,
            temporalPhrase: null,
          },
          patch: {
            title: null,
            note: null,
            status: null,
            priority: null,
            dueAt: "amanhã",
            plannedAt: null,
            projectRef: null,
            contextRef: null,
            personRef: null,
          },
        },
        OPERATION_KEY,
      );
      if (normalized.kind !== "proposal") throw new Error("fixture must normalize");
      const created = session({ proposal: normalized.payload });
      const first = deriveTaskCommand(created, TIME_ZONE);
      const second = deriveTaskCommand(created, TIME_ZONE);
      expect(first.status).toBe("ok");
      if (first.status !== "ok" || second.status !== "ok") return;
      expect(first.command.patch.dueAt).toBe(second.command.patch.dueAt);
      expect(typeof first.command.patch.dueAt).toBe("string");
    });

    it("reports an unsupported verb as a product outcome rather than a defect", () => {
      const created = session({ proposal: { ...proposalPayload(), action: "delete_everything" } });
      const derived = deriveTaskCommand(created, TIME_ZONE);
      expect(derived.status).toBe("unsupported");
    });

    it("reports a malformed envelope payload as invalid", () => {
      const created = session({ proposal: { action: "complete_task" } });
      expect(deriveTaskCommand(created, TIME_ZONE).status).toBe("invalid");
    });

    it("merges the clarification through the real validator, then canonicalizes", () => {
      const created = withClarification(session({ proposal: proposalPayload({ titleWords: ["x"] }) }), {
        titleWords: ["voo", "lisboa"],
      });
      const derived = deriveTaskCommand(created, TIME_ZONE);
      expect(derived.status).toBe("ok");
      if (derived.status !== "ok") return;
      expect(derived.command.targetHints.titleWords).toEqual(["voo", "lisboa"]);
    });

    it("keeps the base command free of the clarification", () => {
      const created = withClarification(session({ proposal: proposalPayload({ titleWords: ["x"] }) }), {
        titleWords: ["voo", "lisboa"],
      });
      const base = deriveBaseTaskCommand(created, TIME_ZONE);
      expect(base.status).toBe("ok");
      if (base.status !== "ok") return;
      expect(base.command.targetHints.titleWords).toEqual(["x"]);
    });

    it("derives whether the clarification slot was spent instead of carrying a boolean", () => {
      expect(clarificationUsed(session())).toBe(false);
      expect(clarificationUsed(withClarification(session(), { project: "Acme" }))).toBe(true);
    });
  });

  describe("the applicable-session gate", () => {
    it("refuses a session with no selection", () => {
      expect(requireApplicableSession(session())).toBeNull();
    });

    it("refuses a selection that never carried a witness", () => {
      // 2E-PREVIEW-006. A witness-free envelope is one no server render
      // produced, and honouring it would make the staleness check unreachable.
      expect(requireApplicableSession(withSelectedTask(session(), TASK_ID))).toBeNull();
    });

    it("refuses a witness describing a different task than the selection", () => {
      const tampered = {
        ...session(),
        selectedTaskId: TASK_ID,
        expected: { taskId: "99999999-8888-4777-8666-555555555555", updatedAt: ISSUED_AT },
      };
      expect(requireApplicableSession(tampered)).toBeNull();
    });

    it("admits a session whose witness matches its selection", () => {
      const ready = withStalenessWitness(session(), { taskId: TASK_ID, updatedAt: ISSUED_AT });
      const applicable = requireApplicableSession(ready);
      expect(applicable?.selectedTaskId).toBe(TASK_ID);
      expect(applicable?.expected.updatedAt).toBe(ISSUED_AT);
    });

    it("drops a witness when the user selects a different candidate", () => {
      const ready = withStalenessWitness(session(), { taskId: TASK_ID, updatedAt: ISSUED_AT });
      const moved = withSelectedTask(ready, "99999999-8888-4777-8666-555555555555");
      expect(moved.expected).toBeNull();
      expect(requireApplicableSession(moved)).toBeNull();
    });

    it("keeps a witness when the user re-selects the same candidate", () => {
      const ready = withStalenessWitness(session(), { taskId: TASK_ID, updatedAt: ISSUED_AT });
      expect(withSelectedTask(ready, TASK_ID).expected).toEqual(ready.expected);
    });
  });
});
