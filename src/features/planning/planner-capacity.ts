/**
 * `2M-PLAN-006` — overload made visible, without inventing an estimate.
 *
 * ## The trap this module exists to avoid
 *
 * The requirement is two clauses and the second is the hard one: "the planner
 * shows how much has been planned for a day relative to what the user has said
 * is available, **and shows it without inventing an estimate the user never
 * gave**."
 *
 * The obvious implementation assigns every task thirty minutes, sums them, and
 * draws a bar. That bar is a lie with a number on it: nobody told this product
 * how long anything takes, there is no duration column, and OD-2M-3 A explicitly
 * says an intention is **not a reserved time**. A user who saw "6h of 8h
 * planned" would reasonably believe the product knew something it does not, and
 * would plan against it.
 *
 * So this module reports **two facts and a relationship between them**:
 *
 *  - a **count** of what the user has put on the day, which is a fact;
 *  - the **hours the user has said they are available**, derived from the quiet
 *    hours they configured, which is also a fact and is the only thing in this
 *    product that any user has ever told it about availability;
 *  - and, explicitly, that **no duration is known**, so the product cannot say
 *    whether it fits.
 *
 * `overloaded` is therefore not "the work exceeds the time" — nothing here could
 * know that. It is "there are more items on this day than there are available
 * hours to hold them, at one item per hour" — a floor, stated as a floor, with
 * the assumption named in the copy rather than buried in a coefficient.
 *
 * ## Why quiet hours are the input
 *
 * They are the one preference in which a user has said *when they do not want to
 * be reached*, and the phase's own audit found the five scheduling preferences
 * inert. Using them here does not repurpose them — a quiet hour is not an
 * unavailable hour by definition — so the copy says what it is reading, and
 * `availabilityDeclared` is false when the user has left the defaults, in which
 * case the surface says it has nothing to compare against rather than comparing
 * against a default the user never chose.
 */

/** Minutes past local midnight, from a `HH:MM` or `HH:MM:SS` preference value. */
function minutesOfDay(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export type PlannerCapacity = {
  /** How many items the user has put on this day. A count, never an estimate. */
  readonly plannedCount: number;
  /**
   * Hours the user has said they are available, or null when they have said
   * nothing. **Null is not zero** and the surface must not render it as one.
   */
  readonly availableHours: number | null;
  /** Whether the user configured this, as against inheriting the defaults. */
  readonly availabilityDeclared: boolean;
  /**
   * `plannedCount > availableHours`, at one item per hour — and only when the
   * user declared availability. False whenever there is nothing to compare
   * against, which is the fail-quiet direction: a product that called a day
   * overloaded on the strength of a default nobody chose would be inventing the
   * estimate this requirement forbids.
   */
  readonly overloaded: boolean;
};

/**
 * What the day holds, against what the user said.
 *
 * `quietStart`/`quietEnd` come from `agent_preferences` as stored; a wrapping
 * window (22:00 → 07:00, the common case) is handled by measuring the quiet span
 * forward from its start, which is the same reading the heartbeat gives them.
 */
export function computePlannerCapacity(input: {
  readonly plannedCount: number;
  readonly quietStart: string | null | undefined;
  readonly quietEnd: string | null | undefined;
  /** The defaults, so "declared" means the user changed something. */
  readonly defaultQuietStart: string;
  readonly defaultQuietEnd: string;
}): PlannerCapacity {
  const start = minutesOfDay(input.quietStart);
  const end = minutesOfDay(input.quietEnd);

  const declared =
    start !== null
    && end !== null
    && (input.quietStart?.slice(0, 5) !== input.defaultQuietStart.slice(0, 5)
      || input.quietEnd?.slice(0, 5) !== input.defaultQuietEnd.slice(0, 5));

  if (start === null || end === null || !declared) {
    return {
      plannedCount: input.plannedCount,
      availableHours: null,
      availabilityDeclared: false,
      overloaded: false,
    };
  }

  const quietMinutes = end >= start ? end - start : 24 * 60 - start + end;
  // Clamped at zero: a preference pair that leaves no waking hour is a
  // configuration the user can make, and a negative "available" would render as
  // a nonsense number rather than as the zero it means.
  const availableHours = Math.max(0, Math.round((24 * 60 - quietMinutes) / 60));

  return {
    plannedCount: input.plannedCount,
    availableHours,
    availabilityDeclared: true,
    overloaded: input.plannedCount > availableHours,
  };
}
