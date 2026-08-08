/**
 * Phase 2J slice 2J.7 — the experience funnel's aggregation, as a pure module.
 *
 * `2J-METRICS-007` requires every declared event to have a **consumer** before
 * the phase closes. SH.6 is why: it shipped a producer with none, and its quota
 * refusals recorded nothing for weeks while the code read as though they did.
 * The three Phase 2J events exist because these are the questions worth asking;
 * an event nothing aggregates is an event nobody will notice failing.
 *
 * Split from its runner for the same reason `phase-2f-command-funnel.mjs` is:
 * aggregation is arithmetic and deserves unit tests, while fetching needs a
 * session, a network and a deployed project.
 *
 * ## The questions this answers
 *
 *   1. Which capture modality do people actually reach for?
 *   2. Does transcription work, and is the transcript good enough to use as-is?
 *   3. Is one recording enough, or do people need several?
 *   4. When an attention item can be resolved in place, is it quick?
 *
 * Every input is a closed enum or a boolean. This module never sees a
 * transcript, a filename or a title, because the payload has nowhere to put one.
 */

export const PHASE_2J_EVENT_NAMES = [
  "capture_mode_selected",
  "voice_transcription_finished",
  "attention_item_resolved",
];

const CAPTURE_MODES = ["text", "attachment", "voice"];
const RESOLUTION_BUCKETS = ["under_5s", "under_60s", "over_60s"];

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

/**
 * Aggregate one owner's events into the four answers above.
 *
 * Unknown values are counted under `unknown` rather than dropped. A silently
 * discarded row would make a vocabulary drift look like a quiet period, which
 * is the failure mode this whole file exists to prevent.
 */
export function aggregateExperienceFunnel(events) {
  const captureModes = { ...emptyCounts(CAPTURE_MODES), unknown: 0 };
  const transcription = { succeeded: 0, failed: 0, unknown: 0 };
  const draft = { edited: 0, unedited: 0 };
  const segments = { single: 0, additional: 0 };
  const attention = {
    byAction: { retry: 0, bulk_retry: 0, unknown: 0 },
    byBucket: { ...emptyCounts(RESOLUTION_BUCKETS), unknown: 0 },
  };

  let considered = 0;
  let ignored = 0;

  for (const event of events ?? []) {
    const name = event?.event_name;
    const properties = event?.properties ?? {};
    if (!PHASE_2J_EVENT_NAMES.includes(name)) {
      ignored += 1;
      continue;
    }
    considered += 1;

    if (name === "capture_mode_selected") {
      const mode = properties.captureMode;
      if (CAPTURE_MODES.includes(mode)) captureModes[mode] += 1;
      else captureModes.unknown += 1;
      continue;
    }

    if (name === "voice_transcription_finished") {
      const outcome = properties.outcome;
      if (outcome === "succeeded" || outcome === "failed") transcription[outcome] += 1;
      else transcription.unknown += 1;
      // Booleans are counted on both sides, so "how many said false" is
      // answerable rather than inferred from a total nobody recorded.
      if (properties.draftEdited === true) draft.edited += 1;
      else if (properties.draftEdited === false) draft.unedited += 1;
      if (properties.additionalSegment === true) segments.additional += 1;
      else if (properties.additionalSegment === false) segments.single += 1;
      continue;
    }

    const action = properties.resolutionAction;
    if (action === "retry" || action === "bulk_retry") attention.byAction[action] += 1;
    else attention.byAction.unknown += 1;
    const bucket = properties.resolutionBucket;
    if (RESOLUTION_BUCKETS.includes(bucket)) attention.byBucket[bucket] += 1;
    else attention.byBucket.unknown += 1;
  }

  return { considered, ignored, captureModes, transcription, draft, segments, attention };
}

/** A short, human-readable report. Counts only — no identifiers, no content. */
export function formatExperienceFunnel(summary) {
  const lines = [];
  lines.push(`events considered: ${summary.considered} (ignored: ${summary.ignored})`);
  lines.push("");
  lines.push("capture modality");
  for (const [mode, count] of Object.entries(summary.captureModes)) {
    lines.push(`  ${mode.padEnd(12)} ${count}`);
  }
  lines.push("");
  lines.push("voice transcription");
  lines.push(`  succeeded    ${summary.transcription.succeeded}`);
  lines.push(`  failed       ${summary.transcription.failed}`);
  lines.push(`  draft edited ${summary.draft.edited} / unedited ${summary.draft.unedited}`);
  lines.push(`  segments     single ${summary.segments.single} / additional ${summary.segments.additional}`);
  lines.push("");
  lines.push("attention resolved in place");
  for (const [action, count] of Object.entries(summary.attention.byAction)) {
    lines.push(`  ${action.padEnd(12)} ${count}`);
  }
  for (const [bucket, count] of Object.entries(summary.attention.byBucket)) {
    lines.push(`  ${bucket.padEnd(12)} ${count}`);
  }
  return lines.join("\n");
}
