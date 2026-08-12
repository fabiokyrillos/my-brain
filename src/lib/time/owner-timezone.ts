/**
 * `LDC-CONTRACT-001` — **where the zone comes from**, in one place.
 *
 * ## Why this module exists
 *
 * `local-day.ts` answers *what a local day is*. It deliberately refuses to
 * answer *whose* — it throws on an unsupported zone rather than defaulting one,
 * because a module that invented a zone at 23:00 would produce a plausible wrong
 * day exactly when it matters. That refusal is correct, and it left every caller
 * to resolve the owner's zone itself.
 *
 * They did, and by the time this initiative ran the census there were **four
 * private answers** to the question —
 *
 * | Where | Rule | Shape |
 * |---|---|---|
 * | `features/operations/actions.ts` | `Intl.DateTimeFormat` constructs ⇒ valid | predicate |
 * | `features/task-commands/actions.ts` | identical | predicate |
 * | `features/task-commands/detail-actions.ts` | identical | predicate |
 * | `features/daily-cycle/review-projection.ts` | same, **plus its own hardcoded default string** | resolver |
 * | `lib/time/local-day.ts` (`isSupportedTimeZone`) | **and** `"/"` or `"UTC"` | the contract |
 *
 * — four of which accept a value the contract refuses. Nothing had noticed,
 * because all five agree about `America/Sao_Paulo` and disagree only about the
 * values that would hurt.
 *
 * The fourth is the one worth naming. `resolveProfileTimezone` is not an
 * `isValidTimeZone` clone: it is already a *resolver*, with `"America/Sao_Paulo"`
 * written into it as a literal rather than read from `defaultAgentPreferences`.
 * A second declaration of the default is a second thing to change, and it is
 * exactly the kind of copy a census of *formatters* would have walked past.
 *
 * ## The narrowing, stated rather than slipped in
 *
 * This resolver applies the **strict** rule: the contract's. A bare `"EST"`
 * constructs an `Intl.DateTimeFormat` without complaint and carries **no DST
 * rule**, so a day computed in it is silently fixed-offset — the first thing
 * this initiative forbids.
 *
 * Nothing reachable changes. `profiles.timezone` is written through
 * `profileSchema`, whose `ianaTimezone` already requires `"/"` or `"UTC"`, so
 * the product cannot store an abbreviation; `owner-timezone.test.ts` asserts the
 * two ends against each other rather than describing the agreement. A legacy row
 * carrying one now resolves to the declared default instead of to a zone that
 * lies about summer.
 *
 * ## What it does not do
 *
 * It does not read the database, and it takes no client. Loading
 * `profiles.timezone` is the caller's business — the surfaces that need it are
 * already selecting it, several of them alongside other columns in one round
 * trip — and a resolver that fetched would turn a pure function into an
 * awaitable one at eighteen call sites for no gain.
 */

import { defaultAgentPreferences } from "@/lib/preferences";

import { isSupportedTimeZone } from "./local-day";

/**
 * The owner's zone, or the declared default.
 *
 * Total: every input produces a zone `localDayBounds` and `formatInstant` will
 * accept, so a caller never has to guard the result. That totality is the point
 * — it is what makes passing `timeZone` mandatory at the formatting layer
 * affordable, and a mandatory parameter is what turns "forgot the zone" from a
 * rendering difference nobody notices into a type error.
 */
export function resolveOwnerTimeZone(value: unknown): string {
  return isSupportedTimeZone(value) ? value : defaultAgentPreferences.timezone;
}
