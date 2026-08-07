/**
 * The signed rate ceilings — `2H-RATE-001`, `2H-RATE-002`.
 *
 * ## One source, and the PRD is the other half of it
 *
 * PRD §14.2 is the table the owner signed on 2026-08-06 ("V-1 … V-6", with the
 * decision request that produced the numbers recorded beside it). This module is
 * that table in code, and `rate-limits-parity.test.ts` compares the two **in
 * both directions** — a value here that §14.2 does not name fails, and a §14.2
 * row this module does not implement fails too. It compares against migration
 * `202608070081`'s `private.rate_limit_parameters` seed as well, because the
 * drain claim path reads the numbers from those rows rather than from here.
 *
 * A number that exists in only one of the three places is a number nobody
 * agreed to.
 *
 * ## Why these are constants passed as arguments
 *
 * ADR-080's discipline, restated by `2H-RATE-002`: the migration carries the
 * *mechanism* and takes the numbers as **required** parameters, with no default
 * anywhere in the signature. A ceiling with a silent default is a ceiling
 * nobody has agreed to, and one frozen into DDL cannot be changed without
 * spending another migration.
 *
 * ## What these are NOT
 *
 * They are not a spend control (`2H-RATE-006`). Under BYOK the user is the
 * payer, ADR-083 §5 withdrew the per-user USD ceiling, and SH.6 owns the
 * infrastructure quotas. These bound availability and fairness — request rate —
 * and nothing here is denominated in money or tokens.
 */

export const RATE_LIMITS = {
  /**
   * PRD §14.2 V-1 — provider-reaching operations one owner may start per
   * rolling hour.
   *
   * Every user-initiated provider call consumes one, a user-initiated retry
   * consumes another, and background work consumes the owning user's slot
   * (V-5). A bounded automatic worker retry does not (V-4).
   */
  aiOperationsPerHour: 60,

  /**
   * PRD §14.2 V-2 — accepted upload requests one owner may make per rolling
   * hour.
   *
   * "Accepted" is load-bearing: a request refused for size, type, session or a
   * SH.6 storage quota never reaches admission and spends nothing. Admission is
   * the acceptance, and it happens before the storage write so a refusal leaves
   * no object and no metadata behind.
   */
  uploadsPerHour: 20,

  /**
   * PRD §14.2 V-3 — the window is rolling, and this is its width in seconds.
   *
   * Not a fixed clock hour. A `date_trunc('hour', …)` counter admits twice the
   * ceiling across its boundary — 120 AI operations in two minutes, at 59 and
   * 01 past — so the rolling window is the requirement rather than a refinement
   * of it.
   */
  rollingWindowSeconds: 3600,
} as const;

/**
 * The window as an interval literal for the claim RPC.
 *
 * Built from the constant rather than written out, so the sentence the database
 * reads and the number this module signs cannot diverge.
 */
export const RATE_LIMIT_WINDOW_INTERVAL = `${RATE_LIMITS.rollingWindowSeconds} seconds`;

/** The ceiling for one bucket. Exhaustive by type, so a new bucket must decide. */
export function rateLimitCeiling(bucket: "ai" | "upload"): number {
  return bucket === "ai" ? RATE_LIMITS.aiOperationsPerHour : RATE_LIMITS.uploadsPerHour;
}
