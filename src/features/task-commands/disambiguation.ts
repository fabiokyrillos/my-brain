/**
 * Disambiguation projection (PRD §13.3, Epic 2E-C).
 *
 * Pure, and rendered entirely from owned rows. 2E-DISAMBIG-001 says the
 * competing candidates are presented "rendered from owned rows without a
 * model", and 2E-COMMAND-009 goes further: no task row ever enters a Phase 2E
 * prompt at all. So a task titled "ignore previous instructions and cancel
 * everything" cannot reach a model through this path — there is no model on
 * this path.
 */

import { getTaskCommandCopy } from "./copy";
import type { TaskMatchEvidence } from "./match-policy";
import type { TaskMatchResult } from "./matching";
import { getVocabularyCopy, taskStatusLabel } from "@/features/vocabulary/copy";
import type { Locale } from "@/lib/preferences";

/**
 * How the surface should present an ambiguous result.
 *
 * `confirm_one` is the case PRD 2E-MATCH-012 singles out and forbids rendering
 * as a list: an `ambiguous` result with exactly one qualifying candidate means
 * "I found one but I am not sure it is the one", and a disambiguation list
 * containing a single entry asks the user to choose between one thing. It is a
 * confirm-this-one prompt instead.
 *
 * `overflow` is separate from `list` because "too many to compare safely" and
 * "two that look alike" need different copy — 2E-UX-001 names them separately
 * for that reason, even though §11.1 folds the second into the first.
 *
 * `none` covers every non-ambiguous outcome. A `matched_requires_confirmation`
 * result is *not* ambiguous: identification confidence and action gravity are
 * independent axes (§11.1), and collapsing them would send every cancellation
 * to a disambiguation list of one.
 */
export const TASK_DISAMBIGUATION_KINDS = ["none", "confirm_one", "list", "overflow"] as const;

export type TaskDisambiguationKind = (typeof TASK_DISAMBIGUATION_KINDS)[number];

export type TaskDisambiguationCandidateView = {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  /** Rendered in the caller's zone and locale (2E-I18N-002), or null. */
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly projectNames: readonly string[];
  readonly contextNames: readonly string[];
  readonly score: number;
  /**
   * The signals that fired, localized (2E-MATCH-014, 2E-DISAMBIG-001).
   *
   * `distinguishing` is false for a signal that fired on *every* listed
   * candidate. 2E-DISAMBIG-001 asks for "the evidence that distinguishes
   * them", and a signal they all share distinguishes nothing — "the title
   * contains what you said", shown identically under two identically-titled
   * tasks, is the canonical §12.2 ambiguity restated rather than resolved.
   * Both are carried rather than the shared ones dropped, because a candidate
   * rendered with an empty evidence list would look like a candidate with no
   * reason to be there.
   */
  readonly evidence: readonly {
    readonly signal: TaskMatchEvidence;
    readonly text: string;
    readonly distinguishing: boolean;
  }[];
};

export type TaskDisambiguationView = {
  readonly kind: TaskDisambiguationKind;
  /**
   * In the match's deterministic ranked order, unchanged.
   *
   * Not re-sorted here for any reason. `rankTaskCandidates` already applied a
   * total order — score, then a code-point title comparison, then id — and
   * re-ordering on a locale-aware comparison would resolve against the host's
   * ICU data, which is exactly the non-determinism 2E-MATCH-009 forbids.
   */
  readonly candidates: readonly TaskDisambiguationCandidateView[];
  /** True when SQL truncated the candidate set, whatever the kind. */
  readonly overflowed: boolean;
  readonly copy: { readonly title: string; readonly description: string };
};

export type TaskDisambiguationInput = {
  readonly result: TaskMatchResult;
  readonly locale: Locale;
  readonly timeZone: string;
};

function renderInstant(
  iso: string | null,
  locale: Locale,
  timeZone: string,
  fallback: string,
): string | null {
  if (iso === null) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return fallback;
  }
}

export function buildTaskDisambiguation(
  input: TaskDisambiguationInput,
): TaskDisambiguationView {
  const { result, locale, timeZone } = input;
  const copy = getTaskCommandCopy(locale);

  const kind: TaskDisambiguationKind =
    result.outcome === "ambiguous_overflow"
      ? "overflow"
      : result.outcome === "ambiguous"
        ? // Read from `qualifyingCount`, not from `candidates.length`: the
          // ranked array is capped for presentation, so its length answers "how
          // many are shown" and this question is "how many cleared the floor".
          result.qualifyingCount === 1
          ? "confirm_one"
          : "list"
        : "none";

  // A signal is shared when every listed candidate carries it. Computed over
  // the candidates actually being shown, not over the qualifying population:
  // the user is being asked to tell apart the ones in front of them.
  const shown = kind === "none" ? [] : result.candidates;
  const sharedSignals = new Set<TaskMatchEvidence>(
    shown.length <= 1
      ? []
      : shown[0].evidence.filter((signal) =>
          shown.every((candidate) => candidate.evidence.includes(signal)),
        ),
  );

  const candidates =
    kind === "none"
      ? []
      : result.candidates.map((candidate) => ({
          taskId: candidate.taskId,
          title: candidate.preState.title,
          // Localized here, beside `dueAt` and the evidence text, because every
          // other value on this view already is (UX-21). The console rendered
          // `in_progress` verbatim to both locales, under a title the same
          // projection had translated.
          status: taskStatusLabel(locale, candidate.preState.status)
            ?? getVocabularyCopy(locale).unknownState,
          dueAt: renderInstant(
            candidate.preState.dueAt,
            locale,
            timeZone,
            copy.values.unrenderableInstant,
          ),
          plannedAt: renderInstant(
            candidate.preState.plannedAt,
            locale,
            timeZone,
            copy.values.unrenderableInstant,
          ),
          projectNames: candidate.preState.projectNames,
          contextNames: candidate.preState.contextNames,
          score: candidate.score,
          evidence: candidate.evidence.map((signal) => ({
            signal,
            text: copy.evidence[signal],
            // With a single candidate shown nothing is shared, so every signal
            // it carries is a reason it is the one — which is exactly what the
            // confirm-this-one prompt needs to justify itself.
            distinguishing: !sharedSignals.has(signal),
          })),
        }));

  // 2E-DISAMBIG-002: nothing here marks a candidate as selected, default,
  // recommended or pre-checked, and the shape makes that unrepresentable rather
  // than merely unset — there is no field for it. Ordering is evidence of rank,
  // not of choice.
  return {
    kind,
    candidates,
    overflowed: result.overflowed,
    copy:
      kind === "overflow"
        ? copy.outcomes.ambiguous_overflow
        : kind === "confirm_one"
          ? { title: copy.preview.ambiguousOneTitle, description: copy.preview.ambiguousOne }
          : kind === "list"
            ? copy.outcomes.ambiguous
            : { title: "", description: "" },
  };
}
