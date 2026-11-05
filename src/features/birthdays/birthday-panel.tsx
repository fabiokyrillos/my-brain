"use client";

/**
 * Life Brain C.5 (ADR-156) — a person's birthday on their page.
 *
 * Says the date when there is one ("Aniversário · 5 de maio"), and offers to
 * set, change or remove it behind one disclosure. Saving creates (or moves) the
 * yearly reminder; removing ends it. Native controls, no gesture, and the result
 * is announced in a polite live region.
 */

import { CalendarHeart } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import type { Locale } from "@/lib/preferences";

import { getBirthdayCopy } from "./copy";
import { idleBirthdayState, type BirthdayAction } from "./state";

export type PersonBirthday = { readonly day: number; readonly month: number; readonly year: number | null } | null;

export function BirthdayPanel({
  action,
  locale,
  personId,
  birthday,
}: {
  action: BirthdayAction;
  locale: Locale;
  personId: string;
  birthday: PersonBirthday;
}) {
  const copy = getBirthdayCopy(locale);
  const [state, formAction, pending] = useActionState(action, idleBirthdayState);
  const [cleared, clearAction, clearing] = useActionState(action, idleBirthdayState);
  const latest = cleared.status !== "idle" ? cleared : state;

  return (
    <section aria-label={copy.label} className="birthday-panel">
      <p className="birthday-line">
        <CalendarHeart aria-hidden="true" size={16} />
        <span className="birthday-label">{copy.label}</span>
        <strong>{birthday ? copy.format(birthday.day, birthday.month, birthday.year) : copy.none}</strong>
      </p>

      <details className="birthday-edit">
        <summary>{birthday ? copy.change : copy.set}</summary>
        <form action={formAction} className="birthday-form">
          <input name="personId" type="hidden" value={personId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="intent" type="hidden" value="set" />
          <label>
            {copy.day}
            <select defaultValue={birthday?.day ?? ""} disabled={pending} name="day" required>
              <option disabled value="">—</option>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.month}
            <select defaultValue={birthday?.month ?? ""} disabled={pending} name="month" required>
              <option disabled value="">—</option>
              {copy.months.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.year}
            <input
              defaultValue={birthday?.year ?? ""}
              disabled={pending}
              inputMode="numeric"
              max={2100}
              min={1900}
              name="year"
              type="number"
            />
          </label>
          <p className="birthday-hint">{copy.yearHint} {copy.reminderNote}</p>
          <Button loading={pending} type="submit" variant="primary">{pending ? copy.saving : copy.save}</Button>
        </form>
      </details>

      {birthday ? (
        <form action={clearAction}>
          <input name="personId" type="hidden" value={personId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="intent" type="hidden" value="clear" />
          <Button loading={clearing} size="sm" type="submit" variant="ghost">{copy.clear}</Button>
        </form>
      ) : null}

      <p aria-live="polite" className="birthday-status" data-status={latest.status} role="status">
        {latest.status === "idle" ? "" : latest.message}
      </p>
    </section>
  );
}
