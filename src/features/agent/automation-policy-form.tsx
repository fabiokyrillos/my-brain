"use client";

import { useTransition } from "react";

import type { AutomationCategory, AutomationPolicyState } from "./automation-policy";

/**
 * The policy control, as a client component — and it is one only so that the
 * page can be made to tell the truth after the owner presses save.
 *
 * ## What was measured, in a real browser against the deployed database
 *
 * With the action doing `revalidatePath` alone, the write committed and **the
 * page did not re-render**: the category's reason still read
 * `suggest_only_by_owner`, the history list stayed empty, and the undo control
 * never appeared until the owner reloaded by hand.
 *
 * Meanwhile the `<select>` *looked* updated, which is worse than it sounds. It
 * is uncontrolled, so `defaultValue` applies on mount and what was on screen
 * was the owner's own click. **A failed save would have looked identical**, and
 * so would a save that silently did nothing.
 *
 * Three mechanisms were tried against the deployed app before this one:
 *
 * 1. `revalidatePath` with the resolved path — no refresh at all. `/app/settings`
 *    lives under a dynamic `[locale]` segment, and Next matches those by route
 *    pattern plus a type, not by resolved URL.
 * 2. `revalidatePath("/[locale]/app/settings", "page")` — this is the form a
 *    dynamic segment needs, and it fixed the **save** on desktop. It is kept in
 *    the action for that reason.
 * 3. `router.refresh()` on top of it — the request is sent and the server
 *    answers, and the screen still kept the previous generation: for the undo
 *    on desktop, and for the save as well on a phone viewport.
 *
 * ## So both controls navigate for real
 *
 * A full reload is slower and it is **certain**: every fact on the page comes
 * back from the database — the reason, the history, the undo affordance and the
 * select. For a control that decides *who may write without asking the owner*,
 * showing something other than what was stored is the failure that matters, and
 * "it usually refreshes" is not a property worth keeping over that.
 *
 * The asymmetry that briefly existed here — `router.refresh()` for the save and
 * a reload for the undo — was removed rather than documented. It rested on the
 * save's refresh being reliable, and the mobile lane falsified that.
 *
 * ## What this component deliberately does not do
 *
 * It holds no state, decides nothing, and renders no copy of its own. The
 * options, the labels and the current value all arrive as props from the server
 * component, so the eligibility decision stays where slice 2P.4 put it — in the
 * database — and this file cannot become a second opinion about it.
 */
export function AutomationPolicyForm({
  category,
  headingId,
  evidenceId,
  locale,
  state,
  stateLabel,
  stateOptions,
  stateHelp,
  saveLabel,
  saveAction,
}: {
  category: AutomationCategory;
  headingId: string;
  evidenceId: string;
  locale: string;
  state: AutomationPolicyState;
  stateLabel: string;
  stateOptions: ReadonlyArray<{ value: AutomationPolicyState; label: string }>;
  stateHelp: string;
  saveLabel: string;
  /** Injected, so this component stays free of Server Actions. */
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const selectId = `automation-state-${category}`;

  return (
    <form
      className="automation-form"
      aria-labelledby={headingId}
      aria-busy={pending}
      action={async (formData) => {
        await saveAction(formData);
        startTransition(() => window.location.reload());
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="category" value={category} />
      <label htmlFor={selectId}>{stateLabel}</label>
      <select
        id={selectId}
        name="automationCategoryState"
        /*
          `key` on the server-rendered value, deliberately.

          The select is uncontrolled, so React keeps the DOM node across a
          re-render and `defaultValue` would never be applied again — leaving
          the owner's last click on screen even after an undo restored something
          else. Keying on the value remounts it when the server's answer really
          changes, so what is shown is always what the database holds.
        */
        key={state}
        defaultValue={state}
        aria-describedby={evidenceId}
        disabled={pending}
      >
        {stateOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="automation-state-help">{stateHelp}</p>
      <button type="submit" className="automation-save" disabled={pending}>
        {saveLabel}
      </button>
    </form>
  );
}
