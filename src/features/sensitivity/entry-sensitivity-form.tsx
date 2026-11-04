"use client";

/**
 * Life Brain C.1 (`LB-C-006`) — the record's sensitivity, set by its owner.
 *
 * A plain form over an injected Server Action, the shape `Composer` and the
 * entity forms use: it works before hydration, and a test can drive every
 * outcome without a database.
 */

import { useActionState, useId } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";
import { SENSITIVITY_LEVELS, type SensitivityLevel } from "./contracts";
import { getEntrySensitivityCopy } from "./entry-sensitivity-copy";
import { idleEntrySensitivityState, type EntrySensitivityState } from "./entry-sensitivity-state";

export function EntrySensitivityForm({
  action,
  entryId,
  locale,
  sensitivity,
}: {
  action: (state: EntrySensitivityState, formData: FormData) => Promise<EntrySensitivityState>;
  entryId: string;
  locale: Locale;
  sensitivity: SensitivityLevel;
}) {
  const [state, formAction, pending] = useActionState(action, idleEntrySensitivityState);
  const copy = getEntrySensitivityCopy(locale);
  const id = useId();

  return (
    <form action={formAction} className="entry-sensitivity">
      <input name="locale" type="hidden" value={locale} />
      <input name="entryId" type="hidden" value={entryId} />
      <label htmlFor={`${id}-sensitivity`}>{copy.label}</label>
      <p className="entry-sensitivity-hint" id={`${id}-hint`}>{copy.hint}</p>
      <div className="entry-sensitivity-row">
        <select aria-describedby={`${id}-hint`} defaultValue={state.sensitivity ?? sensitivity} id={`${id}-sensitivity`} name="sensitivity">
          {SENSITIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>{copy.levels[level]}</option>
          ))}
        </select>
        <Button loading={pending} size="sm" type="submit" variant="secondary">{pending ? copy.saving : copy.save}</Button>
      </div>
      {state.status === "idle" ? null : (
        <p className="entry-sensitivity-outcome" role={state.status === "success" ? "status" : "alert"}>{state.message}</p>
      )}
    </form>
  );
}
