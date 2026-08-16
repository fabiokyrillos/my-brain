"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";

import type { ExportState, GlobalSignOutState } from "./contracts";
import { buildAccountExport } from "./export";
import { getPrivacyCopy } from "./copy";

/**
 * The account's own data controls — `2O-PRIVACY-004` … `-006`, `-009`.
 *
 * Everything here runs under the **requesting user's** identity. `requireUser`
 * returns the request-scoped SSR client, forced RLS applies to every read, and
 * no service-role client, admin key or definer function is constructed anywhere
 * in this module (`2O-SEC-001`, `2O-SEC-002`, and ADR-118 Decision 9's stop
 * condition, which this path is written to stay clear of rather than to test).
 */

function safeLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : "pt-BR";
}

/**
 * Builds the archive synchronously and returns it — `OD-2O-4` **A**.
 *
 * **No job, no storage object, no migration.** The archive never touches the
 * database or a bucket: it is assembled in this request and returned to the
 * component, which offers it as a download the browser assembles locally. An
 * export needing any of the three would be a stop condition rather than a
 * design choice available to this slice.
 *
 * **A refusal is returned as a refusal.** `2O-PRIVACY-004` says the export is
 * complete over the enumeration or it refuses, so `buildAccountExport`'s
 * `refused` is surfaced with its reason and no archive at all. There is no
 * branch in this function that returns a partial, which is why the reason is
 * carried rather than flattened into a generic failure.
 */
export async function exportAccountData(
  _previous: ExportState,
  formData: FormData,
): Promise<ExportState> {
  const locale = safeLocale(formData.get("locale"));
  const copy = getPrivacyCopy(locale);

  try {
    const { supabase, user } = await requireUser(locale);
    const generatedAt = new Date().toISOString();
    const result = await buildAccountExport(supabase, user.id, generatedAt);

    if (result.status === "refused") {
      /*
       * The refusal is audited too. `2O-PRIVACY-006` asks for the record of the
       * *request* to be auditable, and a request that could not be honoured is
       * the one a reader most needs to find later — an export that silently
       * produced nothing is indistinguishable from one never asked for.
       */
      await recordExportRequest(supabase, user.id, `refused:${result.reason}`, 0);
      return {
        status: "refused",
        reason: result.reason,
        message:
          result.reason === "too-large" ? copy.export.refusedTooLarge : copy.export.refusedUnreadable,
      };
    }

    await recordExportRequest(supabase, user.id, "complete", result.rows);

    return {
      status: "ready",
      filename: `my-brain-export-${generatedAt.slice(0, 10)}.json`,
      archive: result.archive,
      rows: result.rows,
      generatedAt: result.generatedAt,
    };
  } catch (error) {
    // `requireUser` signals an unauthenticated caller by redirecting, which
    // throws. Swallowing that would turn a redirect into a rendered error.
    if (isRedirectError(error)) throw error;
    return { status: "failed", message: copy.export.failed };
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * `2O-PRIVACY-006` and `2O-SEC-004` — actor, source, reason, target, time and
 * resulting state, for an action the product performed on the account's data.
 *
 * `entity_type` is `activity`: `audit_logs` carries a closed check constraint
 * (`202607160007`) and `account` is not one of its eight values. Widening it
 * would be a migration, which this slice may not create — so the vocabulary is
 * used as it stands rather than grown to fit.
 *
 * **The audit row is not part of a transaction here and cannot be**, because the
 * export writes nothing to roll back. Its own failure is logged and not
 * surfaced: the export did happen, and telling the user it did not would be the
 * larger lie — the same call `entities/actions.ts` documents.
 */
async function recordExportRequest(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  outcome: string,
  rows: number,
): Promise<void> {
  const audit = await supabase.from("audit_logs").insert({
    user_id: userId,
    action_type: "export_account_data",
    entity_type: "activity",
    actor: "user",
    after_state: { outcome, rows },
    reason: "Owner requested a full export of their own data from Ajustes",
  });
  if (audit.error) console.error("Export audit failed", audit.error.message);
}

/**
 * Ends **every** session for this account — `2O-PRIVACY-009`, `OD-2O-5` **A**.
 *
 * `scope: "global"` revokes every refresh token the provider holds for this
 * user, not just this browser's. That is the cheap half the owner signed: the
 * account can say *"end everything"* without the product growing an
 * administrative device list, which would need a service-role read on an
 * authenticated path — ADR-118 Decision 9's stop condition, and the reason
 * `OD-2O-5` **B** was not taken.
 *
 * The local session is cleared as a consequence, so this action redirects to
 * login exactly as `signOut` does. `redirect()` is called **outside** the
 * `try` because it signals by throwing.
 */
export async function signOutEverywhere(
  _previous: GlobalSignOutState,
  formData: FormData,
): Promise<GlobalSignOutState> {
  const locale = safeLocale(formData.get("locale"));

  try {
    const { supabase } = await requireUser(locale);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    // An already-missing session means the desired end state is already true;
    // every other provider error is a real failure and is rendered, because a
    // sign-out that silently did nothing while claiming success is worse.
    const sessionAlreadyGone = error !== null && error.name === "AuthSessionMissingError";
    if (error !== null && !sessionAlreadyGone) {
      return { status: "failed", message: getPrivacyCopy(locale).sessions.failed };
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { status: "failed", message: getPrivacyCopy(locale).sessions.failed };
  }

  redirect(`/${locale}/auth/login?message=signed-out`);
}
