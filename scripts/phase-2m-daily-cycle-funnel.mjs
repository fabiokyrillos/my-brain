/**
 * Phase 2M slice 2M.1 — the daily-cycle funnel's aggregation, as a pure module.
 *
 * `2M-METRICS-003` requires every declared event to have a **consumer** before
 * the phase closes: a reader that asks a question of it. SH.6 is why — it
 * shipped a producer with none, and its quota refusals recorded nothing for
 * weeks while the code read as though they did.
 *
 * Split from its runner for the reason `phase-2k-conversation-funnel.mjs` is:
 * aggregation is arithmetic and deserves unit tests, while fetching needs a
 * session, a network and a deployed project.
 *
 * ## The four questions this answers
 *
 * They were written down before any event name was chosen, which is what
 * `2M-METRICS-005` asks for, and they are the same four the migration's header
 * states:
 *
 *   Q1. **Is the calendar reached at all, and in which orientation?**
 *       The phase's own thesis is that the data was already there and had
 *       nowhere to be seen. This is the one number that says whether anybody
 *       went to look.
 *   Q2. **How often is a plan made — set or cleared, one item or many?**
 *       `planned_at` was write-then-display for four phases. Whether it is now
 *       *used* is the question that decides if giving it semantics was worth
 *       anything, and `cleared` matters because a funnel that could not see a
 *       removal would report planning as monotonic when it is not.
 *   Q3. **How often does a review produce an action?**
 *       A review that changes nothing is a report. The ratio of
 *       `day_review_action_applied` to `day_review_opened` is the difference,
 *       and it is reported per scope because a next-day review that produces
 *       nothing is a different fact from a daily one that does not.
 *   Q4. **How often is a notification silenced, and by which control?**
 *       "Silenced" is not one number. A user who set quiet hours and a user who
 *       hit the daily cap have said different things, and `2M-NOTIFY-004`'s
 *       claim that every control has a consumer is only checkable if the ledger
 *       can tell them apart. Consent transitions are counted beside them,
 *       because opting in and then revoking is the loudest silence there is.
 *
 * Every input is a closed enum or a bounded count. **This module never sees a
 * date or a time**, let alone a task title, a reminder title or review text,
 * because the payload has nowhere to put one.
 */

export const PHASE_2M_EVENT_NAMES = [
  "calendar_viewed",
  "day_planned",
  "day_review_opened",
  "day_review_action_applied",
  "notification_consent_changed",
  "notification_suppressed",
];

const ORIENTATIONS = ["day", "week", "agenda"];
const PLAN_OPERATIONS = ["set", "cleared"];
const REVIEW_SCOPES = ["day", "next_day"];
const REVIEW_ACTION_KINDS = ["carry_forward", "reschedule", "plan", "archive", "follow_up"];
const CONSENT_STATES = ["granted", "denied", "revoked", "unsupported", "expired"];
const SUPPRESSION_REASONS = [
  "quiet_hours",
  "daily_cap",
  "cooldown",
  "duplicate",
  "not_consented",
  "type_muted",
];

/** OD-2L-4's ceiling, reused. An `itemCount` above it means the ledger moved. */
const ITEM_COUNT_CEILING = 50;

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

/**
 * Aggregates raw rows into the report.
 *
 * Unknown values are counted under `unrecognised` rather than dropped. A row
 * the database accepted but this reader does not understand means the
 * vocabulary moved and the reader did not — which is a fact worth surfacing,
 * and exactly the kind of silent divergence `202608080087` was.
 */
export function aggregateDailyCycleFunnel(rows) {
  const summary = {
    considered: 0,
    unrecognised: 0,
    calendar: { total: 0, orientations: emptyCounts(ORIENTATIONS) },
    planning: { total: 0, operations: emptyCounts(PLAN_OPERATIONS), bulk: 0, itemsTouched: 0 },
    reviews: {
      opened: emptyCounts(REVIEW_SCOPES),
      acted: emptyCounts(REVIEW_SCOPES),
      actionKinds: emptyCounts(REVIEW_ACTION_KINDS),
    },
    notifications: {
      consent: emptyCounts(CONSENT_STATES),
      suppressed: emptyCounts(SUPPRESSION_REASONS),
      suppressedTotal: 0,
    },
  };

  for (const row of rows ?? []) {
    const properties = row?.properties ?? {};
    summary.considered += 1;

    if (row?.event_name === "calendar_viewed") {
      summary.calendar.total += 1;
      if (ORIENTATIONS.includes(properties.orientation)) {
        summary.calendar.orientations[properties.orientation] += 1;
      } else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "day_planned") {
      summary.planning.total += 1;
      if (PLAN_OPERATIONS.includes(properties.operation)) {
        summary.planning.operations[properties.operation] += 1;
      } else summary.unrecognised += 1;
      const count = properties.itemCount;
      if (Number.isInteger(count) && count >= 1 && count <= ITEM_COUNT_CEILING) {
        summary.planning.itemsTouched += count;
        if (count > 1) summary.planning.bulk += 1;
      } else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "day_review_opened") {
      if (REVIEW_SCOPES.includes(properties.scope)) summary.reviews.opened[properties.scope] += 1;
      else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "day_review_action_applied") {
      if (REVIEW_SCOPES.includes(properties.scope)) summary.reviews.acted[properties.scope] += 1;
      else summary.unrecognised += 1;
      if (REVIEW_ACTION_KINDS.includes(properties.actionKind)) {
        summary.reviews.actionKinds[properties.actionKind] += 1;
      } else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "notification_consent_changed") {
      if (CONSENT_STATES.includes(properties.state)) summary.notifications.consent[properties.state] += 1;
      else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "notification_suppressed") {
      summary.notifications.suppressedTotal += 1;
      if (SUPPRESSION_REASONS.includes(properties.reason)) {
        summary.notifications.suppressed[properties.reason] += 1;
      } else summary.unrecognised += 1;
      continue;
    }

    summary.unrecognised += 1;
  }

  return summary;
}

function percentage(part, whole) {
  if (whole === 0) return "  n/a";
  return `${String(Math.round((part / whole) * 100)).padStart(3, " ")}%`;
}

function row(label, count, whole) {
  const share = whole === undefined ? "" : `  ${percentage(count, whole)}`;
  return `  ${label.padEnd(24)} ${String(count).padStart(5)}${share}`;
}

export function formatDailyCycleFunnel(summary) {
  const lines = [];

  lines.push(`Q1  Calendar opened: ${summary.calendar.total}`);
  if (summary.calendar.total > 0) {
    for (const orientation of ORIENTATIONS) {
      lines.push(row(orientation, summary.calendar.orientations[orientation], summary.calendar.total));
    }
  }

  lines.push("");
  lines.push(`Q2  Planning actions: ${summary.planning.total}`);
  if (summary.planning.total > 0) {
    for (const operation of PLAN_OPERATIONS) {
      lines.push(row(operation, summary.planning.operations[operation], summary.planning.total));
    }
    lines.push(row("in bulk (>1 item)", summary.planning.bulk, summary.planning.total));
    lines.push(row("items touched", summary.planning.itemsTouched));
  }

  lines.push("");
  const openedTotal = REVIEW_SCOPES.reduce((sum, scope) => sum + summary.reviews.opened[scope], 0);
  lines.push(`Q3  Reviews opened: ${openedTotal}`);
  for (const scope of REVIEW_SCOPES) {
    const opened = summary.reviews.opened[scope];
    const acted = summary.reviews.acted[scope];
    lines.push(row(`${scope}: opened`, opened));
    // The ratio IS the question. A review that changes nothing is a report.
    lines.push(row(`${scope}: produced action`, acted, opened));
  }
  if (openedTotal > 0 || summary.reviews.acted.day > 0 || summary.reviews.acted.next_day > 0) {
    for (const kind of REVIEW_ACTION_KINDS) {
      lines.push(row(kind, summary.reviews.actionKinds[kind]));
    }
  }

  lines.push("");
  lines.push(`Q4  Notifications silenced: ${summary.notifications.suppressedTotal}`);
  if (summary.notifications.suppressedTotal > 0) {
    for (const reason of SUPPRESSION_REASONS) {
      lines.push(row(reason, summary.notifications.suppressed[reason], summary.notifications.suppressedTotal));
    }
  }
  const consentTotal = CONSENT_STATES.reduce((sum, state) => sum + summary.notifications.consent[state], 0);
  lines.push(`    Consent transitions: ${consentTotal}`);
  if (consentTotal > 0) {
    for (const state of CONSENT_STATES) {
      lines.push(row(state, summary.notifications.consent[state], consentTotal));
    }
  }

  if (summary.unrecognised > 0) {
    lines.push("");
    lines.push(
      `WARNING: ${summary.unrecognised} value(s) this reader does not know.`,
    );
    lines.push("The vocabulary moved and the reader did not. Check the migration chain.");
  }

  return lines.join("\n");
}
