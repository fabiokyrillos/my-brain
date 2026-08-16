import Link from "next/link";

import { destinationHref, type OnboardingPath, type OnboardingStep } from "./contracts";
import { getOnboardingCopy } from "./copy";
import type { Locale } from "@/lib/preferences";

/**
 * The guided path, as a panel — `2O-ONBOARD-001` … `-011`.
 *
 * ## Offered, never imposed
 *
 * It is a `<section>` in the page flow beneath the composer. Not a modal, not a
 * route, not an interstitial and not a gate: every destination the product had
 * before stays exactly as reachable, and the composer sits **above** this in
 * `HomeView` so a first-time owner who wants to type reaches the one
 * interaction this product is built around without passing through anything.
 * `onboarding-guard.test.ts` asserts that ordering rather than trusting it.
 *
 * ## What is rendered for each state, and why it differs
 *
 * **satisfied** — the state, and **no call to action**. `2O-ONBOARD-003` says
 * the path never asks again once a thing is set, and a "done" row carrying a
 * button that still asks is the same nag with a tick beside it.
 *
 * **blocked** — the state, and **no call to action either**, which is
 * `2O-ONBOARD-011` exactly: a step that cannot succeed is not offered as the
 * thing to do. It stays visible so the path does not silently get shorter, and
 * the recovery above offers the one action that unblocks it.
 *
 * **unreadable** — the state, *and* the action. The product could not tell, so
 * it says so and still lets the owner go and look. Withdrawing the action here
 * would turn a failed read into a claim, which is what `2O-ACTIVATION-003`
 * exists to prevent.
 *
 * This component takes the already-derived path and its action, so it stays
 * free of Server Actions and of Supabase, and its test renders it in both
 * locales over every state without a double.
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
  /** Injected, so this component stays free of Server Actions. */
  dismissAction: (formData: FormData) => Promise<void>;
}) {
  // The one place the panel decides not to exist. `offered` already folds
  // dismissal and completion together, so there is a single answer rather than
  // two conditions that could disagree at different call sites.
  if (!path.offered) return null;

  const copy = getOnboardingCopy(locale);
  const hasUnreadable = path.steps.some((step) => step.state === "unreadable");
  const credentialAbsent = path.credential === "unsatisfied";

  return (
    <section className="onboarding" aria-labelledby="onboarding-title" data-onboarding="offered">
      <header className="onboarding-head">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="onboarding-title">{copy.title}</h2>
        <p className="onboarding-intro">{copy.intro}</p>
        <p className="onboarding-progress" data-done={path.satisfiedCount} data-total={path.total}>
          {copy.progress(path.satisfiedCount, path.total)}
        </p>
      </header>

      {/*
        Deliberately **not** `role="status"`. It renders with the page rather
        than in response to an action, so it announces nothing; and Hoje already
        carries one live region for the day's state, which a second one would
        compete with on every navigation. The heading above gives it its
        context, which is what a static explanation needs.
      */}
      {hasUnreadable ? (
        <p className="onboarding-notice" data-notice="unreadable">
          {copy.unreadableNotice}
        </p>
      ) : null}

      {/*
        `2O-ONBOARD-011`. It sits above the list rather than inside the blocked
        row, because it is the answer for every blocked step at once and because
        an owner with no credential should meet it before scrolling a path they
        cannot finish.
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
