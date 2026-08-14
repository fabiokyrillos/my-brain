"use client";

/**
 * `2L-PRIVACY-003`/`-007` — the one place a Work surface withholds content.
 *
 * ## Why a component rather than a rule each surface follows
 *
 * OD-2L-1 option B requires the list and the task detail to "converge on the
 * same contract". A convergence maintained by two surfaces each remembering to
 * call `resolveTaskContent` is a convergence one refactor away from ending, and
 * the failure would be silent: the surface that stopped asking would simply
 * render everything.
 *
 * So the contract is a component. A surface does not decide what to render; it
 * wraps what it *would* have rendered and hands over the classification. There
 * is exactly one call to `resolveTaskContent` on the Work path, it is here, and
 * `sensitivity-convergence.test.ts` fails if a surface renders task content
 * without going through this.
 *
 * ## Why the reveal state lives in the component and not above it
 *
 * OD-2J-1 makes the reveal **local and transient**: no preference, no storage,
 * no serializer, and no shared state that could outlive the render. A reveal
 * held by a parent would be one `useEffect` away from being persisted "for
 * convenience"; a `useState` scoped to one item cannot be, and it also makes
 * "revealing one item does not reveal another" true by construction rather than
 * by a key comparison somebody has to get right.
 *
 * The `RevealState` shape from the central contract is still what
 * `resolveTaskContent` is asked with — this holds a boolean and builds that
 * shape, rather than inventing a second way to express "revealed".
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { NO_REVEALS } from "@/features/sensitivity/contracts";
import {
  resolveFileContent,
  resolveGraphContent,
  resolveMemoryContent,
  resolvePersonContent,
  resolveProjectContent,
} from "@/features/sensitivity/subject-derivation";
import {
  resolveCalendarContent,
  resolveTaskContent,
  type TaskSensitivity,
} from "@/features/sensitivity/task-derivation";
import type { Locale } from "@/lib/preferences";

import { getWorkCopy } from "./copy";

/**
 * The governed surfaces this component can render for.
 *
 * `2M-PRIVACY-001` adds the calendar, and it is the same component rather than a
 * second one for the reason the header gives: a convergence maintained by two
 * components each remembering the rule is a convergence one refactor away from
 * ending. The *resolver* differs per surface — the surface literals live in
 * `task-derivation.ts` and nowhere else — while the mask, the reveal and the
 * accessible name stay identical, which is what makes "a masked title looks the
 * same everywhere" true rather than a coincidence.
 *
 * `2N-PRIVACY-001`/`-002` add the four contextual surfaces, through this same
 * component and for a sharper version of the same reason. Those surfaces render
 * **more than one kind of subject each** — a person page shows entries, memories
 * and task titles together — so "each surface remembers the rule" would have
 * meant each surface remembering it several times. Here it is asked once per
 * item, and `sensitivity-convergence.test.ts` fails if a contextual page renders
 * classified content without going through this.
 *
 * The two derivations feeding it stay separate, because they answer different
 * questions: a task's level comes from its source entry (`task-derivation.ts`),
 * a subject's from its own row (`subject-derivation.ts`). Both produce the same
 * three-arm value, which is why one component can consume either.
 *
 * `2N-RELATION-006`/`-007` adds `graph` in slice 2N.6, through this same
 * component again. Its one governed subject is a relationship's own sentence,
 * and the reason it goes here rather than getting a bespoke mask is the sharpest
 * version of the header's argument: the **same field** renders on the person
 * page, so two components would be two chances for the two surfaces to disagree
 * about whether the owner's note about a human being is shown.
 */
export type ProtectedSurface =
  | "work"
  | "calendar"
  | "person"
  | "project"
  | "memory"
  | "file"
  | "graph";

const RESOLVER: Record<ProtectedSurface, typeof resolveTaskContent> = {
  work: resolveTaskContent,
  calendar: resolveCalendarContent,
  person: resolvePersonContent,
  project: resolveProjectContent,
  memory: resolveMemoryContent,
  file: resolveFileContent,
  graph: resolveGraphContent,
};

export function ProtectedContent({
  children,
  describedAs,
  href,
  locale,
  revealKey,
  sensitivity,
  surface = "work",
}: {
  /** What the surface would have rendered. Never read here, only withheld or passed through. */
  children: ReactNode;
  /**
   * The item's own label, for the control's accessible name (`2L-ACCESS-003`).
   *
   * Optional because a masked item's label may itself be the thing being
   * withheld — on the Work list the title *is* the protected content, so a
   * caller that passed it here would defeat the mask through the accessible
   * name. Callers pass it only where the label is something else.
   */
  describedAs?: string;
  /**
   * Where the item's own surface lives, when the withheld content *is* the way
   * in.
   *
   * On the Work list the title is both the content and the link, so masking it
   * naively would leave a row nobody can open — a functional loss the privacy
   * decision never asked for. `2L-PRIVACY-003` withholds the content and keeps
   * the row truthful, and being able to open a row is not content. When this is
   * given, the masked stub is itself the link.
   */
  href?: string;
  locale: Locale;
  /** Unique per item, so one reveal cannot leak into another. */
  revealKey: string;
  sensitivity: TaskSensitivity;
  /** Which governed surface is asking. Defaults to `work`, which shipped first. */
  surface?: ProtectedSurface;
}) {
  const copy = getWorkCopy(locale).protected;
  const [revealed, setRevealed] = useState(false);

  const content = RESOLVER[surface](
    sensitivity,
    revealKey,
    revealed ? { revealed: new Set([revealKey]) } : NO_REVEALS,
  );

  if (content.show && !content.masked) {
    // Shown, and — for an ordinary or a manual task — with no control at all:
    // an item that was never withheld has nothing to reveal, and offering the
    // button anyway would tell the user something about every other row.
    if (!content.revealable) return <>{children}</>;
    return (
      <span className="work-protected work-protected-revealed">
        {children}
        <button
          className="work-protected-toggle"
          onClick={() => setRevealed(false)}
          type="button"
        >
          {describedAs ? copy.hideFor(describedAs) : copy.hide}
        </button>
      </span>
    );
  }

  return (
    <span className="work-protected" data-masked="true">
      {href ? (
        // The link carries the stub, never the withheld text — and the reveal
        // control stays outside it, because a button inside an anchor is not
        // valid markup and would give the row two conflicting activations.
        <Link className="work-title-link work-protected-label" href={href}>{copy.label}</Link>
      ) : (
        <span className="work-protected-label">{copy.label}</span>
      )}
      {content.revealable ? (
        <button
          className="work-protected-toggle"
          onClick={() => setRevealed(true)}
          type="button"
        >
          {describedAs ? copy.revealFor(describedAs) : copy.reveal}
        </button>
      ) : null}
    </span>
  );
}
