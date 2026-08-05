/**
 * The quota and retention ceilings — SH-QUOTA-010, SH-RETENTION-001.
 *
 * ## One source, and the PRD is the other half of it
 *
 * PRD §20 is the table the owner signed (amendment P-1, "no value changed
 * between proposal and approval"). This module is that table in code, and
 * `quotas-parity.test.ts` compares the two **in both directions** — a value here
 * that §20 does not name fails, and a §20 row this module does not implement
 * fails too. A number that exists in only one of the two places is a number
 * nobody agreed to.
 *
 * ## Why these are constants and not DDL
 *
 * The same reason ADR-080 gives for the auth throttle: a ceiling frozen into a
 * migration cannot be changed without spending another one, and SH-QUOTA-010
 * requires exactly the opposite — "changing them is a constants change, not a
 * migration". The migrations carry the *mechanism* and take the numbers as
 * parameters.
 *
 * ## Why the copy layer reads from here too
 *
 * SH-QUOTA-010's second half: "no page can state a ceiling the database does not
 * enforce". A surface that says "300 entries a day" while the database refuses
 * at 250 is a lie the product tells with a straight face, and the only way to
 * make that impossible is to give both the same source.
 */

/** Bytes in a mebibyte, so the sizes below read as the PRD writes them. */
const MIB = 1024 * 1024;

export const QUOTAS = {
  /** SH-QUOTA-001 — entries per user per UTC day. */
  entriesPerDay: 300,

  /** SH-QUOTA-002 — live (`pending`/`failed`/`running`) job rows per user. */
  liveJobsPerUser: 50,

  /**
   * SH-QUOTA-003 — jobs one owner may be claimed for in a single drain tick.
   *
   * Five of the drain's twenty-five slots, so five owners make progress in the
   * worst case rather than one owner occupying every slot every minute. The
   * fairness property is not "each owner gets a fifth"; it is "no owner can
   * take all of it".
   */
  drainClaimsPerOwnerPerTick: 5,

  /** SH-QUOTA-004 — storage per user. */
  storageBytesPerUser: 500 * MIB,
  storageObjectsPerUser: 200,

  /** SH-QUOTA-005 — attachments, alongside the per-file size limit. */
  attachmentsPerEntry: 5,
  attachmentsPerDay: 50,
} as const;

/**
 * The attachment contract — SH-QUOTA-006, SH-STORAGE-004.
 *
 * FINDINGS F-22 counted three independent copies of the size limit and the MIME
 * allowlist: the `storage.buckets` row, the `attachments.size_bytes` CHECK, and
 * a `Set` literal inside the upload action. Three copies of one rule is two
 * chances for it to drift, and the drift is silent — a bucket that accepts what
 * the CHECK rejects produces an orphaned object every time.
 *
 * This is the source. `attachment-limits-parity.test.ts` reads the other three
 * out of the migration and the worker and fails if any disagrees. The two SQL
 * copies still exist because they are enforcement points that must hold against
 * a caller that never runs this code — but they are no longer *definitions*.
 */
export const ATTACHMENT_LIMITS = {
  /** 25 MiB, the value the bucket and the CHECK constraint both carry. */
  maxBytes: 25 * MIB,

  /**
   * SH-STORAGE-004 — how long a download link stays valid.
   *
   * Ten minutes, the approved maximum. Long enough for a slow connection to
   * finish a 25 MiB file, short enough that a link pasted somewhere it should
   * not have been stops working the same morning.
   */
  signedUrlSeconds: 600,

  /** SH-STORAGE-004's ceiling on the above, so the constant cannot drift up. */
  maxSignedUrlSeconds: 600,

  mimeAllowlist: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
} as const;

export type AllowedMimeType = (typeof ATTACHMENT_LIMITS.mimeAllowlist)[number];

/**
 * Retention windows, in days.
 *
 * `null` means **retained deliberately**, not "not yet decided" —
 * SH-RETENTION-006 requires the reason to be recorded, and the reasons are:
 * `auditLogs` for audit integrity, `aiUsageEvents` for billing reconciliation,
 * `interpretationVersions` for product history. All three are disclosed in the
 * Privacy Policy (SH-LEGAL-014), and SH-COPY-006 forbids any surface from
 * promising memory the schedule does not grant.
 */
export const RETENTION_DAYS = {
  /** Terminal rows only. Live jobs are never swept. */
  jobsTerminal: 90,
  notifications: 180,
  productEvents: 180,
  heartbeatRuns: 30,
  /** SH-RETENTION-005 — measured **past `expires_at`**, not past creation. */
  undoOperationsPastExpiry: 30,
  authEventAttempts: 30,
  credentialValidationAttempts: 30,

  auditLogs: null,
  aiUsageEvents: null,
  interpretationVersions: null,
} as const;

export type RetentionClass = keyof typeof RETENTION_DAYS;

/** The classes that are swept, in the order the schedule document lists them. */
export const SWEPT_CLASSES = (
  Object.entries(RETENTION_DAYS) as [RetentionClass, number | null][]
)
  .filter(([, days]) => days !== null)
  .map(([name]) => name);

/** The classes deliberately retained forever, each with a recorded reason. */
export const RETAINED_CLASSES: Readonly<Record<string, string>> = {
  auditLogs: "audit integrity — an audit trail with a horizon is not an audit trail",
  aiUsageEvents: "billing reconciliation — the ledger must outlive any dispute about it",
  interpretationVersions: "product history — the user's own record of what the agent understood",
};
