/**
 * `2K-ACT-003` / `2K-ACT-004` — OD-2K-1's closed, per-action editable set.
 *
 * The decision's operative sentence is that the surface must be **incapable**
 * of expressing an arbitrary edit, not merely unlikely to. So these tests are
 * mostly about what the module refuses, and about where its answers come from:
 * the taxonomy that already governs the command, never a second list.
 */

import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_PATCH_FIELDS,
  TASK_PRIORITIES,
  actionPolicy,
} from "@/features/task-commands/taxonomy";

import {
  EDITABLE_PARAMETER_EXCLUSIONS,
  editableParameterSpec,
  editableParametersFor,
  isEditableParameter,
} from "./editable-parameters";

describe("2K-ACT-003: the editable set is derived from the taxonomy, never declared beside it", () => {
  it("is always a subset of the action's own allowed patch fields", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const allowed = actionPolicy(action).allowedPatchFields;
      for (const field of editableParametersFor(action)) {
        expect(allowed, `${action}/${field} is not an allowed patch field`).toContain(field);
      }
    }
  });

  it("is non-vacuous: several actions really do expose a parameter", () => {
    // A module that returned `[]` for everything would satisfy every refusal
    // below and deliver nothing.
    const withParameters = TASK_COMMAND_ACTIONS.filter(
      (action) => editableParametersFor(action).length > 0,
    );
    expect(withParameters.length).toBeGreaterThanOrEqual(5);
    expect(editableParametersFor("rename_task")).toEqual(["title"]);
    expect(editableParametersFor("reschedule_due")).toEqual(["dueAt"]);
    expect(editableParametersFor("set_priority")).toEqual(["priority"]);
  });

  it("excludes every relation reference, by decision rather than by omission", () => {
    // OD-2K-1: anything whose authority and validation are not already proved
    // for a card-side edit is excluded by default. A relation reference would
    // need a name-to-entity resolution whose ambiguous, foreign and
    // non-existent outcomes this phase does not model as card states.
    expect([...EDITABLE_PARAMETER_EXCLUSIONS].sort())
      .toEqual(["contextRef", "personRef", "projectRef"]);
    for (const action of TASK_COMMAND_ACTIONS) {
      for (const excluded of EDITABLE_PARAMETER_EXCLUSIONS) {
        expect(isEditableParameter(action, excluded), `${action}/${excluded}`).toBe(false);
      }
    }
  });

  it("exposes nothing for an action whose only patch field is excluded", () => {
    expect(editableParametersFor("assign_project")).toEqual([]);
    expect(editableParametersFor("assign_person")).toEqual([]);
  });
});

describe("2K-ACT-003: an arbitrary field name is refused", () => {
  it("refuses a field the patch vocabulary does not contain", () => {
    for (const invented of ["userId", "user_id", "status_", "__proto__", "", "sensitivity"]) {
      expect(isEditableParameter("rename_task", invented), invented).toBe(false);
    }
  });

  it("refuses a real patch field the action does not allow", () => {
    // `title` is a genuine patch field, but `set_priority` does not accept one.
    // The refusal is per action, not per vocabulary.
    expect(TASK_COMMAND_PATCH_FIELDS).toContain("title");
    expect(isEditableParameter("set_priority", "title")).toBe(false);
  });

  it("refuses every field for an action with no patch surface at all", () => {
    for (const field of TASK_COMMAND_PATCH_FIELDS) {
      expect(isEditableParameter("complete_task", field), field).toBe(false);
    }
  });
});

describe("2K-ACT-003: each parameter declares how it may be edited", () => {
  it("gives a closed-choice parameter its legal values, from the policy", () => {
    const spec = editableParameterSpec("set_priority", "priority");
    expect(spec?.kind).toBe("choice");
    expect(spec?.choices).toEqual([...TASK_PRIORITIES]);
  });

  it("keeps a status edit inside the action's own allowed target values", () => {
    // The taxonomy notes why this matters: `set_status` patched to `cancelled`
    // would be a non-destructive, one-step, unconfirmed route to the
    // destructive cancel. The choices offered are the policy's, so the card
    // cannot offer one the validator would have to catch.
    const spec = editableParameterSpec("set_status", "status");
    expect(spec?.kind).toBe("choice");
    expect(spec?.choices).toEqual([...(actionPolicy("set_status").allowedTargetValues ?? [])]);
    expect(spec?.choices).not.toContain("cancelled");
  });

  it("marks free text and temporal phrases as what they are", () => {
    expect(editableParameterSpec("rename_task", "title")?.kind).toBe("text");
    expect(editableParameterSpec("append_note", "note")?.kind).toBe("text");
    expect(editableParameterSpec("reschedule_due", "dueAt")?.kind).toBe("instant");
    expect(editableParameterSpec("set_planned", "plannedAt")?.kind).toBe("instant");
  });

  it("returns null rather than a default for a parameter it refuses", () => {
    expect(editableParameterSpec("rename_task", "projectRef")).toBeNull();
    expect(editableParameterSpec("complete_task", "title")).toBeNull();
  });
});
