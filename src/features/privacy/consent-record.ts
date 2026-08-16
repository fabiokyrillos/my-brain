import type { SupabaseClient } from "@supabase/supabase-js";

import { POLICY_DOCUMENTS, POLICY_VERSIONS, type PolicyDocument } from "@/features/legal/versions";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The consent record — `2O-CONSENT-001` and `2O-CONSENT-002`.
 *
 * ## The table has had readers for months and no display
 *
 * `policy_acceptances` is read by the acceptance gate (`legal/acceptance.ts`)
 * and by `/consent`, and both use it to decide **one sentence**: may the product
 * render. Nothing has ever shown the account what it agreed to. That is
 * `2O-PREF-002`'s recorded remainder, and slice 2O.3's `account-centre/
 * contracts.ts` reserved the place for it rather than inventing one here.
 *
 * ## `2O-CONSENT-002` — it does not restate a version
 *
 * The current version comes from `POLICY_VERSIONS`, which is already the single
 * repository constant (`SH-LEGAL-004`) pinned to `private.current_policy_version`
 * in both directions by `version-parity.test.ts`. The accepted version comes from
 * the row. This module compares the two and holds neither: a third place for a
 * version string is exactly what that parity test exists to prevent.
 *
 * ## Fail-closed, and an unreadable record is not an empty one
 *
 * `acceptance.ts` treats an unreadable table as *"not accepted"* because the
 * cost of being wrong that way is one extra consent screen. Here the stakes
 * invert: rendering *"you have accepted nothing"* to an account that accepted
 * both documents is a false statement about a legal fact. So the read is
 * three-valued like the census — `unreadable` is its own outcome, never an empty
 * list — which is the same rule `2O-PRIVACY-010` and `2O-ACTIVATION-003` state.
 */

export type AcceptanceRecord = Readonly<{
  document: PolicyDocument;
  /** `null` when this account has no row for the document at all. */
  acceptedVersion: string | null;
  acceptedAt: string | null;
  currentVersion: string;
  /** Derived, never stored: the accepted version is the version now in force. */
  current: boolean;
}>;

export type ConsentRecord =
  | Readonly<{ status: "read"; records: readonly AcceptanceRecord[] }>
  | Readonly<{ status: "unreadable" }>;

export async function loadConsentRecord(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ConsentRecord> {
  const result = await supabase
    .from("policy_acceptances")
    .select("document,version,accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false });

  if (result.error) return { status: "unreadable" };

  const rows = result.data ?? [];

  return {
    status: "read",
    records: POLICY_DOCUMENTS.map((document) => {
      // Most recent first, so the first match is the acceptance in force.
      const row = rows.find((candidate) => candidate.document === document) ?? null;
      const currentVersion = POLICY_VERSIONS[document];
      return {
        document,
        acceptedVersion: row?.version ?? null,
        acceptedAt: row?.accepted_at ?? null,
        currentVersion,
        current: row?.version === currentVersion,
      };
    }),
  };
}
