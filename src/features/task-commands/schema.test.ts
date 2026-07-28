import { describe, expect, it } from "vitest";

import {
  MAX_HINT_LENGTH,
  MAX_TITLE_WORDS,
  TASK_COMMAND_SCHEMA_VERSION,
  validateTaskCommand,
} from "./schema";
import type { TemporalContext } from "./temporal";

// PRD §13.1. The model's proposal is untrusted structured data: this module is
// the only thing standing between it and the matcher. Every rejection is a
// closed reason code, never free text, and never a silent coercion to a
// neighbouring action.

const CONTEXT: TemporalContext = {
  now: "2026-07-25T13:00:00Z",
  timeZone: "America/Sao_Paulo",
};
const KEY = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function command(overrides: Record<string, unknown> = {}) {
  return { action: "complete_task", targetHints: { titleWords: ["report"] }, patch: {}, operationKey: KEY, ...overrides };
}

function validate(input: unknown, context = CONTEXT) {
  return validateTaskCommand(input, context);
}

describe("schema versioning", () => {
  it("declares a version", () => {
    expect(TASK_COMMAND_SCHEMA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe("closed shape", () => {
  it("accepts a well-formed command", () => {
    const result = validate(command());
    expect(result.status).toBe("ok");
  });

  it("rejects an unknown top-level key rather than ignoring it", () => {
    const result = validate({ ...command(), taskId: "00000000-0000-0000-0000-000000000000" });
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("rejects an unknown target hint", () => {
    const result = validate(command({ targetHints: { titleWords: ["x"], sql: "drop table tasks" } }));
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("rejects an unknown patch field", () => {
    const result = validate(command({ action: "rename_task", patch: { title: "New", userId: "someone" } }));
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("rejects a non-object payload", () => {
    for (const value of [null, "complete", 42, []]) {
      expect(validate(value).status, String(value)).toBe("invalid");
    }
  });

  it("makes a task id unrepresentable, so the model can never select the target", () => {
    const result = validate(command({ targetHints: { titleWords: ["report"], taskId: KEY } }));
    expect(result).toMatchObject({ status: "invalid" });
  });
});

describe("action validation", () => {
  it("rejects an action outside the closed enum", () => {
    expect(validate(command({ action: "delete_task" }))).toMatchObject({
      status: "unsupported",
      reason: "unsupported_action",
    });
  });

  it("reports a missing action as unsupported rather than defaulting", () => {
    const rest: Record<string, unknown> = command();
    delete rest.action;
    expect(validate(rest)).toMatchObject({ status: "unsupported", reason: "unsupported_action" });
  });
});

describe("per-action patch contracts", () => {
  it("requires the field the action changes", () => {
    expect(validate(command({ action: "rename_task", patch: {} }))).toMatchObject({
      status: "invalid",
      reason: "missing_patch_field",
      field: "title",
    });
  });

  it("rejects a field the action forbids, before any search happens", () => {
    expect(validate(command({ action: "complete_task", patch: { title: "Sneaky" } }))).toMatchObject({
      status: "invalid",
      reason: "forbidden_patch_field",
      field: "title",
    });
  });

  it("accepts each single-field action with its own field", () => {
    expect(validate(command({ action: "rename_task", patch: { title: "Quarterly report" } })).status).toBe("ok");
    expect(validate(command({ action: "append_note", patch: { note: "Called Maria" } })).status).toBe("ok");
    expect(validate(command({ action: "set_priority", patch: { priority: "high" } })).status).toBe("ok");
  });
});

describe("allowed target values", () => {
  it("refuses set_status reaching cancelled, which is the destructive contract's back door", () => {
    expect(validate(command({ action: "set_status", patch: { status: "cancelled" } }))).toMatchObject({
      status: "unsupported",
      reason: "value_not_allowed_for_action",
      field: "status",
    });
  });

  it("refuses set_status reaching completed", () => {
    expect(validate(command({ action: "set_status", patch: { status: "completed" } }))).toMatchObject({
      status: "unsupported",
      reason: "value_not_allowed_for_action",
    });
  });

  it("accepts set_status within the six non-terminal statuses", () => {
    for (const status of ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"]) {
      expect(validate(command({ action: "set_status", patch: { status } })).status, status).toBe("ok");
    }
  });

  it("refuses a word that names no priority this product has", () => {
    expect(validate(command({ action: "set_priority", patch: { priority: "extremely spicy" } }))).toMatchObject({
      status: "invalid",
      reason: "unrecognized_value",
      field: "priority",
    });
  });

  it("distinguishes an unknown value from one this action may not reach", () => {
    // 2E-COMMAND-017 reserves `value_not_allowed_for_action` for a value that
    // is legal for the column but not for the requested action. Telling a user
    // that "cancelled" belongs to a different action is true; telling them the
    // same about a word that names no status at all is not.
    expect(validate(command({ action: "set_status", patch: { status: "cancelled" } })).status)
      .toBe("unsupported");
    expect(validate(command({ action: "set_status", patch: { status: "borogove" } })).status)
      .toBe("invalid");
  });
});

describe("bilingual target values", () => {
  // PRD Goal 1: the user's own words, in pt-BR or English. The model is told to
  // copy what the user wrote, and this product's first language is Portuguese.
  it("accepts Portuguese status words and canonicalizes them", () => {
    for (const [term, canonical] of [
      ["bloqueada", "blocked"],
      ["em andamento", "in_progress"],
      ["aguardando", "waiting"],
      ["adiado", "deferred"],
      ["a fazer", "todo"],
    ] as const) {
      const result = validate(command({ action: "set_status", patch: { status: term } }));
      expect(result.status, term).toBe("ok");
      if (result.status === "ok") expect(result.command.patch.status).toBe(canonical);
    }
  });

  it("accepts Portuguese priority words and canonicalizes them", () => {
    for (const [term, canonical] of [
      ["alta", "high"],
      ["baixa", "low"],
      ["media", "medium"],
      ["urgente", "urgent"],
      ["crítica", "urgent"],
    ] as const) {
      const result = validate(command({ action: "set_priority", patch: { priority: term } }));
      expect(result.status, term).toBe("ok");
      if (result.status === "ok") expect(result.command.patch.priority).toBe(canonical);
    }
  });

  it("refuses a Portuguese word for a state this action may not reach", () => {
    expect(validate(command({ action: "set_status", patch: { status: "cancelada" } }))).toMatchObject({
      status: "unsupported",
      reason: "value_not_allowed_for_action",
    });
  });

  it("canonicalizes a status hint instead of destroying the command over it", () => {
    const result = validate(command({ targetHints: { titleWords: ["relatorio"], status: "bloqueada" } }));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.command.targetHints.status).toBe("blocked");
  });

  it("refuses a hint word that names no status", () => {
    expect(validate(command({ targetHints: { titleWords: ["x"], status: "borogove" } }))).toMatchObject({
      status: "invalid",
      reason: "unrecognized_value",
      field: "status",
    });
  });
});

describe("value bounds", () => {
  it("rejects a title beyond the column bound", () => {
    expect(validate(command({ action: "rename_task", patch: { title: "x".repeat(241) } }))).toMatchObject({
      status: "invalid",
      field: "title",
    });
  });

  it("rejects a blank title", () => {
    expect(validate(command({ action: "rename_task", patch: { title: "   " } }))).toMatchObject({ status: "invalid" });
  });

  it("rejects a note beyond the description bound", () => {
    expect(validate(command({ action: "append_note", patch: { note: "x".repeat(2001) } }))).toMatchObject({
      status: "invalid",
    });
  });

  it("trims a title rather than storing the user's stray whitespace", () => {
    const result = validate(command({ action: "rename_task", patch: { title: "  Quarterly report  " } }));
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.patch.title).toBe("Quarterly report");
  });

  it("bounds the number of title words a hint may carry", () => {
    const tooMany = Array.from({ length: MAX_TITLE_WORDS + 1 }, (_, i) => `w${i}`);
    expect(validate(command({ targetHints: { titleWords: tooMany } }))).toMatchObject({ status: "invalid" });
  });

  it("rejects an operation key that is not a uuid", () => {
    expect(validate(command({ operationKey: "short" }))).toMatchObject({ status: "invalid" });
  });
});

describe("temporal resolution", () => {
  it("resolves a relative phrase deterministically into an instant", () => {
    const result = validate(command({ action: "reschedule_due", patch: { dueAt: "tomorrow" } }));
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.patch.dueAt).toBe("2026-07-26T23:59:59-03:00");
  });

  it("resolves a Portuguese phrase in a Portuguese session", () => {
    const result = validate(
      command({ action: "reschedule_due", patch: { dueAt: "sexta-feira" } }),
      CONTEXT,
    );
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.patch.dueAt).toBe("2026-07-31T23:59:59-03:00");
  });

  it("asks for clarification instead of guessing an unresolvable phrase", () => {
    expect(validate(command({ action: "reschedule_due", patch: { dueAt: "sometime soon" } }))).toMatchObject({
      status: "needs_clarification",
      reason: "unresolved_temporal_phrase",
      field: "dueAt",
    });
  });

  it("never accepts a model-supplied bare date, because a timezone-less date is what broke capture", () => {
    // A bare date is resolved through the lexicon (end of that local day), not
    // passed through as-is to a timestamptz column.
    const result = validate(command({ action: "reschedule_due", patch: { dueAt: "2026-09-01" } }));
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.patch.dueAt).toBe("2026-09-01T23:59:59-03:00");
  });

  it("resolves plannedAt by the same rules", () => {
    const result = validate(command({ action: "set_planned", patch: { plannedAt: "tomorrow" } }));
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.patch.plannedAt).toBe("2026-07-26T23:59:59-03:00");
  });

  it("refuses an unknown timezone rather than resolving in UTC", () => {
    const result = validate(
      command({ action: "reschedule_due", patch: { dueAt: "tomorrow" } }),
      { ...CONTEXT, timeZone: "Not/AZone" },
    );
    expect(result.status).toBe("needs_clarification");
  });
});

describe("multi-target", () => {
  // Deliberately NOT claiming the validator enforces 2E-COMMAND-007's
  // `multiple_targets`. It cannot: the closed shape has no multi-target signal
  // to read, so the model reports it (see task-command-schema.test.ts) and the
  // deterministic backstop is the matcher's ambiguity rule in Slice 2E.2. The
  // test this replaces asserted only that `.strict()` rejects an unknown key —
  // a duplicate of "rejects an unknown target hint" wearing a name that claimed
  // a guarantee the layer does not provide.
  it("carries exactly one target's worth of hints, with no field for a second", () => {
    const hintFields = ["titleWords", "project", "person", "context", "status", "temporalPhrase"];
    const result = validate(command({ targetHints: { titleWords: ["invoice"] } }));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      for (const key of Object.keys(result.command.targetHints)) {
        expect(hintFields).toContain(key);
      }
    }
    // A second target cannot be expressed by adding a field.
    expect(validate(command({ targetHints: { titleWords: ["a"], secondTarget: "b" } })).status)
      .toBe("invalid");
  });
});

describe("normalization and determinism", () => {
  it("produces a canonical command whose serialization is stable under key order", () => {
    const a = validate(command({ action: "rename_task", patch: { title: "A" }, targetHints: { titleWords: ["b"], project: "P" } }));
    const b = validate({ operationKey: KEY, patch: { title: "A" }, targetHints: { project: "P", titleWords: ["b"] }, action: "rename_task" });
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    if (a.status === "ok" && b.status === "ok") {
      expect(JSON.stringify(a.command)).toBe(JSON.stringify(b.command));
    }
  });

  it("carries the policy and lexicon versions on the accepted command", () => {
    const result = validate(command());
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") {
      expect(result.command.policyVersion).toBeTruthy();
      expect(result.command.schemaVersion).toBe(TASK_COMMAND_SCHEMA_VERSION);
    }
  });
});

describe("untrusted content is never interpreted", () => {
  it("treats an injection string in a hint as an ordinary, bounded value", () => {
    const result = validate(command({ targetHints: { titleWords: ["ignore"], project: "'; drop table tasks; --" } }));
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") expect(result.command.targetHints.project).toBe("'; drop table tasks; --");
  });
});

describe("total hint size", () => {
  // 2E-COMMAND-005. Per-field caps are not a bound on the whole: twelve title
  // words plus five hints at 160 characters each is over 2.7 KB of
  // attacker-chosen text flowing into normalization and into every candidate
  // comparison.
  const long = (length: number) => "a".repeat(length);

  it("rejects a single hint beyond its own cap", () => {
    // The per-field half of 2E-COMMAND-005. Every total-cap case below uses a
    // hint of exactly MAX_HINT_LENGTH, so the field cap itself was untested.
    expect(validate(command({ targetHints: { project: long(MAX_HINT_LENGTH + 1) } }))).toMatchObject({
      status: "invalid",
      reason: "value_too_long",
      field: "project",
    });
    expect(validate(command({ targetHints: { titleWords: [long(MAX_HINT_LENGTH + 1)] } })).status)
      .toBe("invalid");
  });

  it("accepts hints within the total serialized cap", () => {
    const words = Array.from({ length: MAX_TITLE_WORDS }, () => long(40));
    expect(validate(command({ targetHints: { titleWords: words } }))).toMatchObject({ status: "ok" });
  });

  it("rejects hints that pass every field cap but blow the total", () => {
    const words = Array.from({ length: MAX_TITLE_WORDS }, () => long(MAX_HINT_LENGTH));
    const result = validate(command({ targetHints: { titleWords: words } }));
    expect(result).toMatchObject({
      status: "invalid",
      reason: "target_hints_too_large",
      field: "targetHints",
    });
  });

  it("rejects an oversized total spread across different hint fields", () => {
    const result = validate(command({
      targetHints: {
        titleWords: [long(MAX_HINT_LENGTH), long(MAX_HINT_LENGTH)],
        project: long(MAX_HINT_LENGTH),
        person: long(MAX_HINT_LENGTH),
        context: long(MAX_HINT_LENGTH),
        temporalPhrase: long(MAX_HINT_LENGTH),
      },
    }));
    expect(result).toMatchObject({ status: "invalid", reason: "target_hints_too_large" });
  });

  it("measures the cap on the canonical form, so key order cannot change the verdict", () => {
    // Both orderings must reach the *same, named* verdict. Asserting only that
    // they agree is satisfied by any implementation, including one with no cap
    // at all — which a review proved by disabling the cap and watching this
    // pass.
    const hints = {
      project: long(MAX_HINT_LENGTH), person: long(MAX_HINT_LENGTH),
      context: long(MAX_HINT_LENGTH), temporalPhrase: long(MAX_HINT_LENGTH),
      titleWords: [long(MAX_HINT_LENGTH), long(MAX_HINT_LENGTH)],
    };
    const reordered = {
      titleWords: hints.titleWords, temporalPhrase: hints.temporalPhrase,
      context: hints.context, person: hints.person, project: hints.project,
    };
    for (const payload of [hints, reordered]) {
      expect(validate(command({ targetHints: payload }))).toMatchObject({
        status: "invalid",
        reason: "target_hints_too_large",
      });
    }
  });
});

describe("temporal fail-closed paths reachable from a command", () => {
  it("asks for clarification on a date the calendar does not contain", () => {
    expect(validate(command({ action: "reschedule_due", patch: { dueAt: "2026-02-30" } })))
      .toMatchObject({ status: "needs_clarification", reason: "unresolved_temporal_phrase", field: "dueAt" });
  });

  it("asks for clarification on a local day that never existed in the caller's zone", () => {
    // Samoa skipped 2011-12-30 entirely when it crossed the date line. The
    // phrase is well-formed and the zone is real; the wall time simply never
    // happened, and `resolveLocal` refuses rather than sliding to a neighbour.
    // The clock sits beside the date so the ±730-day explicit-date bound is not
    // what does the refusing.
    const apia = { now: "2011-12-20T12:00:00Z", timeZone: "Pacific/Apia" };
    expect(validate(command({ action: "reschedule_due", patch: { dueAt: "2011-12-30" } }), apia))
      .toMatchObject({ status: "needs_clarification", field: "dueAt" });
  });

  it("resolves the surrounding days in that same zone, so the refusal is specific", () => {
    const apia = { now: "2011-12-20T12:00:00Z", timeZone: "Pacific/Apia" };
    expect(validate(command({ action: "reschedule_due", patch: { dueAt: "2011-12-29" } }), apia))
      .toMatchObject({ status: "ok" });
    expect(validate(command({ action: "reschedule_due", patch: { dueAt: "2011-12-31" } }), apia))
      .toMatchObject({ status: "ok" });
  });

  it("refuses an explicit date far outside the bounded window", () => {
    // `tasks.due_at` is an unbounded timestamptz, so a transcription typo would
    // otherwise persist in silence.
    for (const far of ["9999-12-31", "5000-06-15", "1900-01-01"]) {
      expect(validate(command({ action: "reschedule_due", patch: { dueAt: far } })).status, far)
        .toBe("needs_clarification");
    }
  });
});
