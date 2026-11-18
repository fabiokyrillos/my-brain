import { Check } from "lucide-react";
import Link from "next/link";

import { destinationHref, type OnboardingPath, type OnboardingStep } from "./contracts";
import { getOnboardingCopy } from "./copy";
import type { Locale } from "@/lib/preferences";

/**
 * The guided path, offered on Hoje beneath the composer (`2O-ONBOARD-001`).
 *
 * Its contract has not changed since the baseline; its shape has, twice. The
 * baseline was seven stacked cards, each with its own black button. Life Brain
 * A.1 led with the next step in a tinted card and folded the list behind a
 * disclosure — a box inside a box, on a page that ADR-180 then made of
 * sections over hairlines.
 *
 * It is now **one section like its neighbours**: a heading over a hairline with
 * the progress said in words, and each step a row. A step that is done is quiet
 * and carries a check; the next one is in ink, with the one sentence that says
 * what it does and its one verb; the ones after it are their own links. Nothing
 * is folded — seven short rows are shorter than the card they replace — and
 * dismissing is one quiet line at the foot. Every row, state attribute and link
 * the tests and the reachability census read is still rendered.
 *
 * Reads only: the decision of what to show is `onboarding-view.ts`'s, and the
 * only write this component reaches is the dismissal form it is given.
 */

function StepRow({
  step,
  locale,
  isNext,
  copy,
}: {
  step: OnboardingStep;
  locale: Locale;
  isNext: boolean;
  copy: ReturnType<typeof getOnboardingCopy>;
}) {
  const text = copy.steps[step.key];
  const offersAction = step.state === "unsatisfied" || step.state === "unreadable";
  const href = destinationHref(step.destination, locale);
  // "Feito" is the check's name and "Pendente" is every other row's default:
  // both are said to a screen reader and not printed. The two states that
  // explain why a row offers nothing, or may be wrong, are words on the row.
  const stateIsCaption = step.state === "blocked" || step.state === "unreadable";

  return (
    <li
      className="onboarding-step"
      data-step={step.key}
      data-state={step.state}
      aria-current={isNext ? "step" : undefined}
    >
      <span aria-hidden="true" className="onboarding-step-mark">
        {step.state === "satisfied" ? <Check size={14} strokeWidth={2.5} /> : null}
      </span>
      <div className="onboarding-step-main">
        <h3 className="onboarding-step-title">
          {/* The row is the link: a step still to do opens where it is done.
              The next one keeps its title plain, because its verb is beside it. */}
          {offersAction && !isNext ? (
            <Link className="onboarding-step-link" href={href}>{text.title}</Link>
          ) : (
            text.title
          )}
        </h3>
        {isNext ? <p className="onboarding-step-body">{text.body}</p> : null}
        <span className={stateIsCaption ? "onboarding-step-state" : "onboarding-step-state sr-only"} data-state={step.state}>
          {copy.states[step.state]}
        </span>
      </div>
      {offersAction && isNext ? (
        <Link className="onboarding-step-action" href={href}>
          {text.action}
        </Link>
      ) : null}
    </li>
  );
}

export function OnboardingPanel({
  locale,
  path,
  dismissAction,
}: {
  locale: Locale;
  path: OnboardingPath;
  dismissAction: (formData: FormData) => Promise<void>;
}) {
  if (!path.offered) return null;

  const copy = getOnboardingCopy(locale);
  const hasUnreadable = path.steps.some((step) => step.state === "unreadable");
  const credentialAbsent = path.credential === "unsatisfied";

  return (
    <section className="onboarding" aria-labelledby="onboarding-title" data-onboarding="offered">
      <header className="onboarding-head">
        <h2 id="onboarding-title">{copy.title}</h2>
        <p className="onboarding-progress" data-done={path.satisfiedCount} data-total={path.total}>
          {copy.progress(path.satisfiedCount, path.total)}
        </p>
      </header>

      {/*
        Deliberately **not** `role="status"`. It renders with the page rather
        than in response to an action, so it announces nothing; and Hoje already
        carries one live region for the day's state, which a second one would
        compete with on every navigation.
      */}
      {hasUnreadable ? (
        <p className="onboarding-notice" data-notice="unreadable">
          {copy.unreadableNotice}
        </p>
      ) : null}

      {/*
        `2O-ONBOARD-011`. The recovery for every blocked step at once, met
        before the path rather than inside it.
      */}
      {credentialAbsent ? (
        <div className="onboarding-recovery" data-recovery="credential">
          <div className="onboarding-recovery-text">
            <h3>{copy.recovery.title}</h3>
            <p>{copy.recovery.body}</p>
          </div>
          <Link className="onboarding-recovery-action" href={destinationHref("settings", locale)}>
            {copy.recovery.action}
          </Link>
        </div>
      ) : null}

      {path.nextStep ? null : <p className="onboarding-notice">{copy.next.done}</p>}

      <ol className="onboarding-steps">
        {path.steps.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            locale={locale}
            isNext={path.nextStep?.key === step.key}
            copy={copy}
          />
        ))}
      </ol>

      <form className="onboarding-dismiss" action={dismissAction}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="onboarding-dismiss-action">
          {copy.dismiss.action}
        </button>
        <p className="onboarding-dismiss-hint">{copy.dismiss.hint}</p>
      </form>
    </section>
  );
}
