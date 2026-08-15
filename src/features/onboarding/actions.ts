"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
import {
  ONBOARDING_DISMISSAL_COOKIE,
  ONBOARDING_DISMISSED_VALUE,
  dismissalCookieOptions,
} from "./dismissal";

/**
 * `2O-ONBOARD-010`, both directions.
 *
 * ## Why these authenticate at all
 *
 * The cookie carries no account data and belongs to the browser, so an
 * unauthenticated caller could gain nothing by setting it. They call
 * `requireUser` anyway, for the reason every other Server Action in this
 * repository does: the rule is *"no request without a session changes
 * anything"*, and a mutation that quietly exempts itself because the thing it
 * writes looks harmless is how the exemption becomes the convention. It also
 * puts the lifecycle and consent gates in front of these, which is what T-6
 * asks of every surface the guided path touches.
 *
 * ## Why the locale arrives in the form rather than as a bound argument
 *
 * It is the shape `updateProfile` and the BYOK actions already use, and it is
 * narrowed here rather than trusted: `isLocale` or `pt-BR`. A revalidation path
 * built from an unchecked string is a request-supplied path, and this
 * repository has paid for that shape once already.
 */

function resolveLocale(raw: FormDataEntryValue | null): Locale {
  return typeof raw === "string" && isLocale(raw) ? raw : "pt-BR";
}

/** Both surfaces the pair affects: the panel's home, and its reversal control. */
function revalidateBoth(locale: Locale): void {
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/settings`);
}

export async function dismissOnboarding(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  await requireUser(locale);
  const jar = await cookies();
  jar.set(ONBOARDING_DISMISSAL_COOKIE, ONBOARDING_DISMISSED_VALUE, dismissalCookieOptions());
  revalidateBoth(locale);
}

export async function restoreOnboarding(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  await requireUser(locale);
  const jar = await cookies();
  /*
   * Deleted rather than set to a "not dismissed" value. There is exactly one
   * value that means dismissed and no value that means the opposite, so an
   * absent cookie and a cookie that fell out of the closed set read the same —
   * which is the property `isDismissedValue` exists to hold.
   */
  jar.delete(ONBOARDING_DISMISSAL_COOKIE);
  revalidateBoth(locale);
}
