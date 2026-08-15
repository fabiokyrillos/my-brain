import { getOnboardingCopy } from "./copy";
import type { Locale } from "@/lib/preferences";

/**
 * `2O-ONBOARD-010`'s second half — dismissal is **reversible**.
 *
 * ## Why it renders only when there is something to reverse
 *
 * A permanent "show the guide again" control on an account that never dismissed
 * anything is a control that changes nothing, which is the inherited rule
 * `R-24` — and `R-2O-12` strengthened it rather than relaxing it. So this
 * returns `null` unless the cookie is actually set.
 *
 * It needs no capability-registry row: `capability-registry-guard.test.ts`
 * governs the controls the **preferences form** renders over persisted
 * preference columns, and this reverses a per-browser cookie that governs no
 * column at all. The registry would have nothing true to say about it.
 *
 * ## Why it lives on `/app/settings`
 *
 * That is the preferences surface today, and slice 2O.3 consolidates it into
 * the preferences centre the requirement names. Putting the control anywhere
 * else now would mean moving it in one slice's time for no gain.
 */

export function OnboardingRestore({
  locale,
  dismissed,
  restoreAction,
}: {
  locale: Locale;
  dismissed: boolean;
  /** Injected, so this component stays free of Server Actions. */
  restoreAction: (formData: FormData) => Promise<void>;
}) {
  if (!dismissed) return null;

  const copy = getOnboardingCopy(locale);

  return (
    <section className="onboarding-restore" aria-labelledby="onboarding-restore-title">
      <h2 id="onboarding-restore-title">{copy.restore.title}</h2>
      <p>{copy.restore.body}</p>
      <form action={restoreAction}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="onboarding-restore-action">
          {copy.restore.action}
        </button>
      </form>
    </section>
  );
}
