/**
 * `2N-CORRECT-004…005`, `009…013` — what deletion means, as types the compiler
 * enforces rather than as prose a reader has to remember.
 *
 * ## Why the consequence keys are a closed tuple
 *
 * The database returns eleven counts, always all eleven, for every type. That
 * uniformity is not tidiness: the confirmation's fingerprint is a digest over
 * this object, so a key that appeared for one type and vanished for another
 * would make two different states hash alike. Declaring the tuple `as const`
 * here means a key added to the RPC without being added to the render is a
 * **type error**, not a number the preview silently stops showing.
 *
 * ## Why retention is a vocabulary and not a sentence
 *
 * `2N-CORRECT-012` requires the product to say what it keeps **before** the
 * owner confirms, and to call it retention rather than removal. The server
 * decides what is retained — it is the only party that knows — so the wire
 * carries identifiers and `copy.ts` turns each into a sentence. A UI that
 * composed that sentence itself would drift from the function the moment either
 * changed, and the drift would always be in the direction of promising more
 * removal than happened.
 */

/** The three subjects `OD-2N-11` B signed, and the only three M3 accepts. */
export const DELETABLE_ENTITY_TYPES = ["person", "project", "memory"] as const;
export type DeletableEntityType = (typeof DELETABLE_ENTITY_TYPES)[number];

export function isDeletableEntityType(value: unknown): value is DeletableEntityType {
  return typeof value === "string" && (DELETABLE_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * The eleven counts, in the order the preview lists them.
 *
 * `entryMentions`, `aliases`, `tags` and `linkedFiles` are the four the
 * intermediate re-audit found **no foreign key protects** — they are the whole
 * reason M3 exists as a database function rather than a client sequence, so
 * they are never omitted from a preview even when zero.
 */
export const CONSEQUENCE_KEYS = [
  "relations",
  "projectLinks",
  "taskLinks",
  "contextLinks",
  "taskAssignments",
  "tasksWaiting",
  "linkedMemories",
  "entryMentions",
  "aliases",
  "tags",
  "linkedFiles",
] as const;
export type ConsequenceKey = (typeof CONSEQUENCE_KEYS)[number];

export type DeletionConsequences = Readonly<Record<ConsequenceKey, number>>;

/**
 * What survives the deletion, named by the server.
 *
 * All four are things that *should* persist. Three of them are permanent and
 * one — the snapshot — is the price of the undo being true, and expires with
 * it.
 */
export const RETENTION_KINDS = [
  "audit_trail",
  "telemetry",
  "linked_files",
  "undo_snapshot_24h",
] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];

export type DeletionPreview = {
  readonly entityType: DeletableEntityType;
  readonly entityId: string;
  readonly consequences: DeletionConsequences;
  readonly undoAvailable: boolean;
  readonly retention: readonly RetentionKind[];
};

/**
 * The outcome vocabulary, closed on purpose.
 *
 * Phase 2E established that an outcome list a `copy.ts` exhaustiveness test
 * runs against is what stops a new failure mode being reported as an existing
 * one. The two refusals below are deliberately distinct:
 *
 * - `stale` — the consequences moved between preview and confirm. The owner
 *   saw a true list that is no longer true, and the honest response is to show
 *   them the new one.
 * - `unconfirmed` — there is no usable confirmation. Missing, already consumed,
 *   and issued for a different subject all land here **as one**, because
 *   telling them apart would describe another owner's confirmations to whoever
 *   guessed a key.
 *
 * `unavailable` covers absent, foreign and unreadable subjects, for the same
 * reason: three answers would be an existence oracle.
 */
export const DELETION_OUTCOMES = [
  "deleted",
  "undone",
  "stale",
  "unconfirmed",
  "unavailable",
  "failed",
] as const;
export type DeletionOutcome = (typeof DELETION_OUTCOMES)[number];

/** True when the preview describes an object whose removal touches nothing else. */
export function isIsolated(consequences: DeletionConsequences): boolean {
  return CONSEQUENCE_KEYS.every((key) => consequences[key] === 0);
}

/** The non-zero consequences, in declaration order, for a preview that lists only what applies. */
export function affectedConsequences(
  consequences: DeletionConsequences,
): readonly { readonly key: ConsequenceKey; readonly count: number }[] {
  return CONSEQUENCE_KEYS
    .filter((key) => consequences[key] > 0)
    .map((key) => ({ key, count: consequences[key] }));
}
