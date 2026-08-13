/**
 * `2N-PERSON-003` — the one place a contextual list says it is bounded.
 *
 * A component rather than a snippet each surface repeats, for the reason
 * `protected-content.tsx` gives one domain over: a convergence maintained by
 * eleven lists each remembering to render a notice is a convergence one refactor
 * away from ending, and the failure would be silent — the list that forgot would
 * simply look complete again.
 *
 * It renders **nothing at all** when the list is not bounded. That is the
 * property that makes it safe to mount unconditionally beside every list, and it
 * is also what keeps the notice meaningful: a banner that is always present is
 * one users stop reading.
 */

import type { Bounded } from "./contracts";
import { getBoundsCopy } from "./copy";
import type { Locale } from "@/lib/preferences";

export function BoundedNotice<T>({ list, locale }: { list: Bounded<T>; locale: Locale }) {
  if (!list.bounded) return null;
  const copy = getBoundsCopy(locale);
  return (
    <p aria-label={copy.boundedLabel} className="bounded-notice" data-bounded="true" role="note">
      {copy.bounded(list.items.length)}
    </p>
  );
}
