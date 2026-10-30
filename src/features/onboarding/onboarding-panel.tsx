import Link from "next/link";

import { ButtonLink } from "@/components/ui";
import { destinationHref, type OnboardingPath, type OnboardingStep } from "./contracts";
import { getOnboardingCopy } from "./copy";
import type { Locale } from "@/lib/preferences";

/**
 * The guided path, offered on Hoje beneath the composer (`2O-ONBOARD-001`).
 *
 * Life Brain A.1 changed its shape, not its contract. The baseline rendered the
 * whole path as seven stacked cards, each with its own black button — on an
 * iPhone that was two screens of guide between the composer and the day. The
 * panel now leads with **the next step** (title, one sentence, one action) and
 * folds the complete list behind a disclosure. Every row, state attribute and
 * link is still rendered, so the tests and the reachability census read the
 * same facts; what changed is what is open by default.
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

  return (
    <li
      className="onboarding-step"
      data-step={step.key}
      data-state={step.state}
      aria-current={isNext ? "step" : undefined}
    >
      <div className="onboarding-step-head">
        <h3 className="onboarding-step-title">{text.title}</h3>
        <span className="onboarding-step-state" data-state={step.state}>
          {copy.states[step.state]}
        </span>
      </div>
      <p className="onboarding-step-body">{text.body}</p>
      {offersAction ? (
        <Link className="onboarding-step-action" href={destinationHref(step.destination, locale)}>
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
  const next = path.nextStep;
  const nextText = next ? copy.steps[next.key] : null;
  const nextOffersAction = next ? next.state === "unsatisfied" || next.state === "unreadable" : false;

  return (
    <section className="onboarding onboarding--compact" aria-labelledby="onboarding-title" data-onboarding="offered">
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
          <h3>{copy.recovery.title}</h3>
          <p>{copy.recovery.body}</p>
          <Link className="onboarding-recovery-action" href={destinationHref("settings", locale)}>
            {copy.recovery.action}
          </Link>
        </div>
      ) : null}

      {next && nextText ? (
        <div className="onboarding-next" data-next-step={next.key}>
          <p className="onboarding-next-label">{copy.next.label}</p>
          <p className="onboarding-next-title">{nextText.title}</p>
          <p className="onboarding-next-body">{nextText.body}</p>
          {nextOffersAction ? (
            <ButtonLink href={destinationHref(next.destination, locale)} size="md" variant="primary">
              {nextText.action}
            </ButtonLink>
          ) : null}
        </div>
      ) : (
        <p className="onboarding-next-body">{copy.next.done}</p>
      )}

      <details className="onboarding-all">
        <summary className="onboarding-all-summary">{copy.next.allSteps}</summary>
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
      </details>

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
