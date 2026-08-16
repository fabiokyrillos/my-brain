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
 * ## It has a registry row after all — `2O-PREF-008`, decided in slice 2O.3
 *
 * This comment used to say it needed none, on the grounds that the guard governs
 * the controls the **preferences form** renders over persisted columns and this
 * reverses a per-browser cookie. **Half of that was wrong**, and the half that
 * was right was about `columns` rather than about the row.
 *
 * There is no column, so `columns` stays empty. But the cookie has a genuine
 * reader — `readDismissal` decides whether the guide renders — so the registry
 * does have something true to say, and `2O-PREF-008`'s word is *every control
 * in the centre*. The row is `onboarding_restore`, and the submit button carries
 * `name="restoreOnboarding"` so the guard can resolve it by the same mechanism
 * it resolves every other control: by name. Exempting it instead would have been
 * the too-weak half ADR-067 removed.
 *
 * The name is inert to the action — `restoreOnboarding` reads only `locale` —
 * and a named submit button is ordinary HTML rather than a marker invented for
 * a test.
 *
 * ## Why it lives on `/app/settings`
 *
 * That is the preferences surface, and slice 2O.3 made it the preferences centre
 * the requirement names. It stays exactly where slice 2O.2 put it.
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
        <button type="submit" name="restoreOnboarding" className="onboarding-restore-action">
          {copy.restore.action}
        </button>
      </form>
    </section>
  );
}
