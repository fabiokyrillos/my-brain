/**
 * `2K-CARD-001` … `2K-CARD-009` — the conversation card contract.
 *
 * ## What this is
 *
 * One grammar for everything the Conversar surface can put in front of the
 * user as a *thing it found or is about to do*. Phase 2K multiplies the states
 * a turn can resolve into — pending, previewed, requires_confirmation,
 * accepted, refused, failed, undone, expired, no_change, unavailable — and
 * T-2K-07 records the failure that follows from sharing a visual grammar
 * without sharing the decision: an `expired` that looks like a `done`.
 *
 * So the vocabulary is closed **here**, the state is decided **on the server**,
 * and the renderer draws it as itself. `console-state.ts:20-28` already states
 * the rule for task commands ("may this be applied in one step" is a domain
 * rule, and a component that re-derived it from `preview.disposition` would be
 * a second place the confirmation requirement is decided). `2K-CARD-002`
 * extends that rule to every state this module declares, and
 * `phase-2k-card-guard.test.ts` fails the build when a component breaks it.
 *
 * ## What "actionable card" does not mean (OD-2K-B, `2K-CARD-008`)
 *
 * It does **not** mean every card type may mutate. Tasks and memories may;
 * entries, people, projects, organizations and files are read-only previews
 * with a link and a source. That is a signed decision, not a current
 * limitation, and it is enforced by `mayRenderMutatingControl` rather than by
 * each caller remembering — a rule enforced at the call site is a rule that
 * holds until the next call site.
 *
 * ## What this module deliberately does not carry
 *
 * No free-text label. A person's name or a project's title is *content*, and
 * content on this surface is governed by the central sensitivity contract. The
 * card therefore carries its **type** (whose label is copy) and an optional
 * bounded **snippet** (which is content, and is classified). A card that
 * carried a name outside the snippet would be content that escaped the
 * contract.
 *
 * No authorization of any kind. A card is a description of something; it is
 * never the reason a write is allowed. Ownership is RLS.
 */

import { toSensitivityLevel, type SensitivityLevel } from "@/features/sensitivity/contracts";

/**
 * Every state a Phase 2K card can be in, as a closed list.
 *
 * These are **card** states, not task-command outcomes. `TASK_COMMAND_OUTCOMES`
 * is a separate closed vocabulary with no `expired` member, and ADR-047 refuses
 * to add one — so `expired` here is a *presentation* state that a task command
 * reaches through `rejected_stale`, and this list must never be read as an
 * instruction to widen that one.
 */
export const CONVERSATION_CARD_STATES = [
  /** Work is in flight; the surface has nothing to show yet. */
  "pending",
  /** A read-only description of something that exists. Writes nothing. */
  "previewed",
  /** The user must confirm before anything happens. */
  "requires_confirmation",
  /** It happened, and the card says what. */
  "accepted",
  /** The system declined, with a reason. */
  "refused",
  /** It was attempted and did not complete. */
  "failed",
  /** A previously accepted effect was reversed. */
  "undone",
  /** An earlier preview or confirmation no longer applies to current state. */
  "expired",
  /** It ran and there was nothing to change — a real outcome, not a failure. */
  "no_change",
  /** The object cannot be read. Deliberately says nothing about why. */
  "unavailable",
] as const;

export type ConversationCardState = (typeof CONVERSATION_CARD_STATES)[number];

export function isConversationCardState(value: unknown): value is ConversationCardState {
  return typeof value === "string"
    && (CONVERSATION_CARD_STATES as readonly string[]).includes(value);
}

/** The object types a card can describe. */
export const CONVERSATION_CARD_TYPES = [
  "task",
  "memory",
  "entry",
  "person",
  "project",
  "organization",
  "file",
] as const;

export type ConversationCardType = (typeof CONVERSATION_CARD_TYPES)[number];

/** OD-2K-B: exactly these two, and the list is the enforcement. */
export const MUTABLE_CONVERSATION_CARD_TYPES = ["task", "memory"] as const;
export type MutableConversationCardType = (typeof MUTABLE_CONVERSATION_CARD_TYPES)[number];

export const READ_ONLY_CONVERSATION_CARD_TYPES = [
  "entry",
  "person",
  "project",
  "organization",
  "file",
] as const;
export type ReadOnlyConversationCardType = (typeof READ_ONLY_CONVERSATION_CARD_TYPES)[number];

export type ConversationCardMutability = "mutable" | "read_only";

export function cardMutability(type: ConversationCardType): ConversationCardMutability {
  return (MUTABLE_CONVERSATION_CARD_TYPES as readonly string[]).includes(type)
    ? "mutable"
    : "read_only";
}

/**
 * `2K-CARD-009` — reversibility, as a value the card carries.
 *
 * Deliberately not a boolean. Task undo and memory undo are **honestly
 * different** (OD-2K-3): the task keeps a 24-hour window and restore
 * afterwards; the memory archives and claims no window, because it has none. A
 * boolean would let the memory card inherit the task card's sentence, which is
 * the comfortable lie the decision exists to forbid.
 */
export type ConversationCardReversal =
  | { readonly kind: "none" }
  | { readonly kind: "undo_window"; readonly windowHours: number }
  | { readonly kind: "archival" };

export const NOT_REVERSIBLE: ConversationCardReversal = { kind: "none" };

/** A card that cannot be truthfully reversed does not advertise reversal. */
export function advertisesReversal(reversal: ConversationCardReversal): boolean {
  return reversal.kind !== "none";
}

/**
 * The snippet ceiling.
 *
 * Bounded in the builder rather than trusted from the caller, for the reason
 * `notificationCopy` takes no content parameter: a privacy-adjacent property
 * enforced by "callers promise" is weaker than one enforced by the shape.
 */
export const CONVERSATION_CARD_SNIPPET_LIMIT = 240;

export function boundSnippet(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length <= CONVERSATION_CARD_SNIPPET_LIMIT
    ? trimmed
    : `${trimmed.slice(0, CONVERSATION_CARD_SNIPPET_LIMIT)}…`;
}

export type ConversationCard = {
  readonly cardType: ConversationCardType;
  /** Decided server-side (`2K-CARD-002`). The renderer draws it, never derives it. */
  readonly state: ConversationCardState;
  readonly mutability: ConversationCardMutability;
  readonly reversal: ConversationCardReversal;
  readonly objectId: string | null;
  /** Content, and therefore classified. `null` when there is nothing to show. */
  readonly snippet: string | null;
  readonly sensitivity: SensitivityLevel;
  readonly href: string | null;
};

/**
 * `2K-CARD-008` — the one place the read-only rule is decided.
 *
 * The renderer calls this and drops any control it was handed for a type that
 * may not have one, so a caller's mistake cannot become a mutating affordance
 * on a person card.
 */
export function mayRenderMutatingControl(card: ConversationCard): boolean {
  if (card.state === "unavailable") return false;
  return cardMutability(card.cardType) === "mutable";
}

/**
 * `2K-CARD-007` — a read-only preview.
 *
 * `sensitivity` is optional and defaults **closed**: a caller that has not
 * classified the source gets `highly_sensitive`, so an unclassified snippet is
 * masked until somebody classifies it rather than printed until somebody
 * notices.
 */
export function readOnlyPreviewCard(input: {
  readonly cardType: ReadOnlyConversationCardType;
  readonly objectId: string;
  readonly snippet?: string | null;
  readonly sensitivity?: SensitivityLevel | string | null;
  readonly href?: string | null;
}): ConversationCard {
  return {
    cardType: input.cardType,
    state: "previewed",
    mutability: "read_only",
    reversal: NOT_REVERSIBLE,
    objectId: input.objectId,
    snippet: boundSnippet(input.snippet),
    sensitivity: toSensitivityLevel(input.sensitivity ?? undefined),
    href: input.href ?? null,
  };
}

/**
 * `2K-CONT-008` groundwork — one shape for "you cannot read this".
 *
 * Takes **no cause parameter**, which is how deleted, foreign and suspended
 * stay indistinguishable. A builder that accepted a reason would eventually
 * render one, and an existence oracle is exactly what that would be.
 */
export function unavailableCard(cardType: ConversationCardType): ConversationCard {
  return {
    cardType,
    state: "unavailable",
    mutability: cardMutability(cardType),
    reversal: NOT_REVERSIBLE,
    objectId: null,
    snippet: null,
    sensitivity: "highly_sensitive",
    href: null,
  };
}
