/**
 * Phase 2K slice 2K.8 — the Conversar funnel's aggregation, as a pure module.
 *
 * `2K-METRICS-007` requires every declared event to have a **consumer** before
 * the phase closes. SH.6 is why: it shipped a producer with none, and its quota
 * refusals recorded nothing for weeks while the code read as though they did.
 * The three Phase 2K events exist because these are the questions worth asking;
 * an event nothing aggregates is an event nobody will notice failing.
 *
 * Split from its runner for the reason `phase-2j-experience-funnel.mjs` is:
 * aggregation is arithmetic and deserves unit tests, while fetching needs a
 * session, a network and a deployed project.
 *
 * ## The questions this answers
 *
 *   1. Do the answers people read actually have personal evidence behind them,
 *      or is the Brain talking without sources? That is the phase's own thesis
 *      — "make the conversation honest about what it used" — and it is the one
 *      number that says whether the honesty is showing anything good.
 *   2. How often does an answer have something to explain?
 *   3. Do memory cards reach a resolution, and are they undone?
 *   4. Are suggestions ever shown at all?
 *
 * Every input is a closed enum or a boolean. This module never sees a question,
 * an answer, a source excerpt, or a person's or project's name, because the
 * payload has nowhere to put one.
 */

export const PHASE_2K_EVENT_NAMES = [
  "conversation_answer_shown",
  "conversation_memory_resolved",
  "conversation_suggestion_shown",
];

const EVIDENCE_STATES = ["evidenced", "no_qualifying_evidence", "unknown"];
const MEMORY_OUTCOMES = ["accepted", "no_change", "failed", "undone"];
const SUGGESTION_CATEGORIES = ["person", "project"];

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
export function aggregateConversationFunnel(rows) {
  const summary = {
    considered: 0,
    unrecognised: 0,
    answers: { total: 0, evidence: emptyCounts(EVIDENCE_STATES), explained: 0 },
    memories: { total: 0, outcomes: emptyCounts(MEMORY_OUTCOMES) },
    suggestions: { total: 0, categories: emptyCounts(SUGGESTION_CATEGORIES) },
  };

  for (const row of rows ?? []) {
    const properties = row?.properties ?? {};
    summary.considered += 1;

    if (row?.event_name === "conversation_answer_shown") {
      summary.answers.total += 1;
      const evidence = properties.evidence;
      if (EVIDENCE_STATES.includes(evidence)) summary.answers.evidence[evidence] += 1;
      else summary.unrecognised += 1;
      if (properties.explained === true) summary.answers.explained += 1;
      continue;
    }

    if (row?.event_name === "conversation_memory_resolved") {
      summary.memories.total += 1;
      const outcome = properties.outcome;
      if (MEMORY_OUTCOMES.includes(outcome)) summary.memories.outcomes[outcome] += 1;
      else summary.unrecognised += 1;
      continue;
    }

    if (row?.event_name === "conversation_suggestion_shown") {
      summary.suggestions.total += 1;
      const category = properties.category;
      if (SUGGESTION_CATEGORIES.includes(category)) summary.suggestions.categories[category] += 1;
      else summary.unrecognised += 1;
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

export function formatConversationFunnel(summary) {
  const lines = [];

  lines.push(`Answers shown: ${summary.answers.total}`);
  if (summary.answers.total > 0) {
    for (const state of EVIDENCE_STATES) {
      const count = summary.answers.evidence[state];
      lines.push(`  ${state.padEnd(24)} ${String(count).padStart(5)}  ${percentage(count, summary.answers.total)}`);
    }
    lines.push(
      `  ${"had something to explain".padEnd(24)} ${String(summary.answers.explained).padStart(5)}`
      + `  ${percentage(summary.answers.explained, summary.answers.total)}`,
    );
  }

  lines.push("");
  lines.push(`Memory cards resolved: ${summary.memories.total}`);
  if (summary.memories.total > 0) {
    for (const outcome of MEMORY_OUTCOMES) {
      const count = summary.memories.outcomes[outcome];
      lines.push(`  ${outcome.padEnd(24)} ${String(count).padStart(5)}  ${percentage(count, summary.memories.total)}`);
    }
  }

  lines.push("");
  lines.push(`Suggestions shown: ${summary.suggestions.total}`);
  if (summary.suggestions.total > 0) {
    for (const category of SUGGESTION_CATEGORIES) {
      const count = summary.suggestions.categories[category];
      lines.push(
        `  ${category.padEnd(24)} ${String(count).padStart(5)}  ${percentage(count, summary.suggestions.total)}`,
      );
    }
  }

  if (summary.unrecognised > 0) {
    lines.push("");
    lines.push(
      `WARNING: ${summary.unrecognised} row(s) carried a value this reader does not know.`,
    );
    lines.push("The vocabulary moved and the reader did not. Check the migration chain.");
  }

  return lines.join("\n");
}
