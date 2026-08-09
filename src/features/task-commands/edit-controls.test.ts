/**
 * `2K-ACT-002` / `2K-ACT-003` — the console's edit and discard controls, and
 * the two properties they quietly depend on.
 *
 * The console renders **one** editable parameter per action and a single
 * labelled control for it. That is not a design preference: it is true of the
 * taxonomy today, and if it stops being true the component would silently edit
 * whichever field happened to sort first. So the property is asserted here
 * rather than assumed there.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  editableParameterSpec,
  editableParametersFor,
} from "@/features/conversation-cards/editable-parameters";

import { TASK_COMMAND_INTENTS } from "./console-state";
import { getTaskCommandCopy } from "./copy";
import { TASK_COMMAND_ACTIONS } from "./taxonomy";

const REPO = join(__dirname, "..", "..", "..");
const console_ = readFileSync(join(REPO, "src/features/task-commands/command-console.tsx"), "utf8");
const actions = readFileSync(join(REPO, "src/features/task-commands/actions.ts"), "utf8");

describe("2K-ACT-003: at most one editable parameter per action", () => {
  it("holds for every action the taxonomy declares", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(editableParametersFor(action).length, action).toBeLessThanOrEqual(1);
    }
  });

  it("is non-vacuous: at least five actions really have one", () => {
    const withOne = TASK_COMMAND_ACTIONS.filter((a) => editableParametersFor(a).length === 1);
    expect(withOne.length).toBeGreaterThanOrEqual(5);
  });
});

describe("2K-ACT-003: every choice a card can offer has a label in both locales", () => {
  it("covers the whole reachable choice set, walked from the taxonomy", () => {
    // Walked rather than listed: a second list of values beside the policy is
    // the drift this repository keeps paying for.
    const reachable = new Set<string>();
    for (const action of TASK_COMMAND_ACTIONS) {
      for (const field of editableParametersFor(action)) {
        const spec = editableParameterSpec(action, field);
        if (spec?.kind === "choice") for (const choice of spec.choices) reachable.add(choice);
      }
    }
    expect(reachable.size).toBeGreaterThan(0);
    for (const locale of ["pt-BR", "en"] as const) {
      for (const choice of reachable) {
        expect(getTaskCommandCopy(locale).console.editChoices[choice], `${locale}/${choice}`).toBeTruthy();
      }
    }
  });
});

describe("2K-ACT-002: the discard writes nothing, by shape", () => {
  it("is declared in the closed intent vocabulary", () => {
    expect(TASK_COMMAND_INTENTS).toContain("discard");
    expect(TASK_COMMAND_INTENTS).toContain("edit");
  });

  it("takes no command context, so it can reach no client at all", () => {
    // The property `2K-ACT-002` asks for is "leaves no trace of intent to act".
    // A reviewer should be able to check that by reading the handler's body and
    // seeing it never obtains a Supabase client — the same argument
    // `notificationCopy(locale)` makes by refusing to accept content.
    const body = actions.slice(
      actions.indexOf("export async function discardTaskCommand"),
      actions.indexOf("/** Creates the standalone task the no-match branch offered"),
    );
    expect(body, "discardTaskCommand not found").not.toBe("");
    expect(body).not.toMatch(/loadCommandContext|supabase|requireUser|rpc\(/);
  });

  it("carries no session forward, so the envelope does not survive the round", () => {
    const body = actions.slice(
      actions.indexOf("export async function discardTaskCommand"),
      actions.indexOf("/** Creates the standalone task the no-match branch offered"),
    );
    expect(body).not.toMatch(/serializeTaskCommandSession/);
  });
});

describe("2K-ACT-003: the server decides what may be edited, not the control", () => {
  it("asks `isEditableParameter` inside the action, not only in the component", () => {
    expect(actions).toMatch(/isEditableParameter\(\s*derived\.command\.action/);
  });

  it("reads the action from the re-derived command rather than from the form", () => {
    // A caller who could name the action could pair a permissive one with a
    // field the real action refuses.
    const body = actions.slice(
      actions.indexOf("export async function editTaskCommand"),
      actions.indexOf("export async function discardTaskCommand"),
    );
    expect(body).toMatch(/deriveTaskCommand\(session, context\.timeZone\)/);
    expect(body).not.toMatch(/formData\.get\("action"\)/);
  });

  it("renders the control from the preview's own action", () => {
    expect(console_).toMatch(/editableParametersFor\(state\.preview/);
  });
});
