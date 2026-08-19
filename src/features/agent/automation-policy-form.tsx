"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { UniversalStateLine } from "@/features/experience/universal-state";
import type { Locale } from "@/lib/preferences";
import type { AutomationCategory, AutomationPolicyState } from "./automation-policy";
import { idleAutomationState, type AutomationActionState } from "./automation-state";

/**
 * The policy control, as a client component — for two reasons, both measured.
 *
 * ## 1. The page has to tell the truth after the owner presses save
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
 * Three mechanisms were tried against the deployed app before slice 2P.5:
 *
 * 1. `revalidatePath` with the resolved path — no refresh at all. `/app/settings`
 *    lives under a dynamic `[locale]` segment, and Next matches those by route
 *    pattern plus a type, not by resolved URL.
 * 2. `revalidatePath("/[locale]/app/settings", "page")` — the form a dynamic
 *    segment needs, which fixed the **save** on desktop. It is kept in the
 *    action, now over both settings route patterns.
 * 3. `router.refresh()` on top of it — the request is sent and the server
 *    answers, and the screen still kept the previous generation: for the undo
 *    on desktop, and for the save as well on a phone viewport.
 *
 * Slice 2P.4 resolved that with `window.location.reload()`, which was correct
 * while Settings was one page. **It stops being correct here.** A full reload
 * discards a failure message the owner has not read yet, which is precisely
 * what `2P-SETTINGS-007` requires to survive — and the reload was chosen when
 * there was no message to lose.
 *
 * ## So: refresh on success, and never on failure
 *
 * A successful save has nothing to preserve — every fact on the page should
 * come back from the database — so it refreshes. A failed save preserves
 * everything and navigates nowhere. The `key` on the outcome is what makes a
 * second identical failure re-announce rather than sit silently.
 *
 * ## 2. `2P-SETTINGS-007` needs somewhere to put the failure
 *
 * `useActionState` is that place, and it is the shape `SettingsForm` and
 * `CredentialPanel` already use on this surface. The action returning a state
 * rather than throwing is what stopped a failed policy save from replacing the
 * whole page with the error boundary.
 *
 * ## What this component deliberately does not do
 *
 * It holds no state of its own, decides nothing, and renders no copy. The
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
  locale: Locale;
  state: AutomationPolicyState;
  stateLabel: string;
  stateOptions: ReadonlyArray<{ value: AutomationPolicyState; label: string }>;
  stateHelp: string;
  saveLabel: string;
  /** Injected, so this component stays free of Server Actions. */
  saveAction: (
    previous: AutomationActionState,
    formData: FormData,
  ) => Promise<AutomationActionState>;
}) {
  const router = useRouter();
  const [outcome, formAction, pending] = useActionState(saveAction, idleAutomationState);
  const refreshed = useRef<AutomationActionState | null>(null);
  const selectId = `automation-state-${category}`;

  useEffect(() => {
    if (outcome.status !== "success") return;
    // One refresh per outcome. Without the guard the effect re-runs on every
    // render the refresh itself causes, which is a loop rather than a refresh.
    if (refreshed.current === outcome) return;
    refreshed.current = outcome;
    router.refresh();
  }, [outcome, router]);

  return (
    <form className="automation-form" aria-labelledby={headingId} aria-busy={pending} action={formAction}>
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

          It keys on the SERVER's value and not on the outcome, which is what
          makes a failed save keep the owner's choice on screen while the
          message explains why it did not land.
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
      {/*
        The outcome, in this category's own row.

        Six categories share one section, so a message with no home would attach
        itself to all six.

        A failure goes through `UniversalStateLine` because a failure IS one of
        the seven universal states — `error_recoverable` — and `2O-RECOVER-001`
        requires every one of them to be rendered through the module. A success
        is **not** in that vocabulary, and inventing an eighth state to make the
        two symmetrical would widen a closed set for a cosmetic reason. It takes
        the shape its two neighbours on this surface already use:
        `settings-feedback` and `byok-feedback` are both a `<p role="status">`
        carrying the server's sentence.
      */}
      {outcome.status === "error" ? (
        <UniversalStateLine
          className="automation-outcome"
          description={outcome.message}
          locale={locale}
          state="error_recoverable"
        />
      ) : null}
      {outcome.status === "success" ? (
        <p className="automation-outcome automation-outcome-success" data-state="success" role="status">
          {outcome.message}
        </p>
      ) : null}
    </form>
  );
}
