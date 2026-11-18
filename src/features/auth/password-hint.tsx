"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/preferences";

import type { PasswordHintCopy } from "./copy";
import { passwordGaps } from "./password-rules";

/**
 * The password rule as one caption that follows what is typed.
 *
 * It was a fixed sentence under the field, and the rule was only ever applied
 * by the server — so a password missing one symbol came back as a redirect, a
 * generic "revise os campos" and an emptied form. The caption now says what is
 * still missing while the reader types, and says so when nothing is.
 *
 * ## It reads the field; it does not own it
 *
 * The password input stays in the page, a plain server-rendered element with
 * the attributes it always had. This component finds it in its own form and
 * listens — it holds no value the form submits, changes nothing the form sends,
 * and with no script at all it is the same sentence it used to be. Validation
 * is `schema.ts` on the server, as before.
 *
 * `aria-live` is polite and the text only changes when a rule becomes met or
 * unmet, not on every key, so it is announced a handful of times at most.
 */
export function PasswordHint({
  id,
  locale,
  copy,
}: {
  /** The id the password input's `aria-describedby` points at. */
  readonly id: string;
  readonly locale: Locale;
  readonly copy: PasswordHintCopy;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const field = ref.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="password"]');
    if (!field) return;
    const read = () => setValue(field.value);
    field.addEventListener("input", read);
    return () => field.removeEventListener("input", read);
  }, []);

  const gaps = value === "" ? null : passwordGaps(value);
  const state = gaps === null ? "rule" : gaps.length === 0 ? "met" : "missing";

  return (
    <p aria-live="polite" className="auth-hint" data-state={state} id={id} ref={ref}>
      {gaps === null
        ? copy.rule
        : gaps.length === 0
          ? copy.met
          : `${copy.missingLead} ${new Intl.ListFormat(locale, { type: "conjunction" }).format(
            gaps.map((gap) => copy.missing[gap]),
          )}.`}
    </p>
  );
}
