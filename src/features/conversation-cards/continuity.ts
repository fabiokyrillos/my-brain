/**
 * `2K-CONT-001` … `2K-CONT-008` — continuity between the conversation and the
 * product, by **server re-derivation** (OD-2K-D, ADR-100).
 *
 * ## The gap this closes
 *
 * The whole card, preview and proposal state lives in a client `useActionState`.
 * A user reads an answer, clicks a citation to check it, comes back — and the
 * pending confirmation is gone, silently. The product invites the user to
 * verify before they trust, and punishes them for accepting the invitation.
 *
 * ## The contract, which has exactly one reading
 *
 * **Returning always re-derives on the server, always with a new `issuedAt`,
 * and always requires a fresh confirmation.** There is no branch in which a
 * prior confirmation is reused, and no text here offers the implementer a
 * choice between transporting a clock and re-asking — that second reading was
 * the defect ADR-100 corrected, and R17 refuses its reintroduction.
 *
 * ## Why the payload is incapable rather than merely restricted
 *
 * T-2K-02: whatever travels across a navigation is tempted to carry enough to
 * skip a step — a confirmation id, an operation key already reserved, a
 * serialized patch. Then a link becomes an action, and replaying a URL performs
 * a mutation. Signing the handle would make it *authentic*, not *harmless*: an
 * authentic bearer token is still a bearer token.
 *
 * So the schema is **strict**. Five fields, all identifiers, and anything else
 * — forbidden by name or merely unknown — is refused rather than ignored. The
 * forbidden list below is a *statement of intent* that the strictness already
 * enforces; it exists so a reader can see what was ruled out, and so a test can
 * plant each one and watch it be refused.
 *
 * ## Why `issuedAt` in particular can never travel
 *
 * It is a hashed fingerprint input, reached through `observedBefore`. Carrying
 * it *in order to keep an earlier confirmation consumable* is carrying the very
 * value that makes the old confirmation match. A new clock on every return makes
 * that confirmation unusable **by construction**, which converts a rule someone
 * must remember into a mechanism that cannot be bypassed — the same reasoning
 * ADR-047 used in refusing to let a caller name a confirmation token.
 *
 * The distinction is easy to lose and worth restating: a pinned clock **inside**
 * one command is what makes its steps agree (ADR-050). A pinned clock **across**
 * a navigation would be what lets an old authorization survive one. Same value,
 * opposite property.
 */

import { z } from "zod";

import type { ConversationCard } from "./contracts";

/**
 * Bumped when the handle's shape changes.
 *
 * A handle minted by an older deployment is **refused** rather than
 * best-effort-read, for the reason `TASK_COMMAND_SESSION_VERSION` gives: a
 * field this version expects and an older one never wrote would arrive as
 * `undefined` and be silently defaulted.
 */
export const CONTINUITY_HANDLE_VERSION = "2026-08-09.1";

/**
 * The object types a conversation can refer to.
 *
 * Deliberately **two**, not seven. Chat retrieval reaches `entry` and `memory`
 * and nothing else (ADR-055, OD-2K-A), so a handle naming a person would
 * describe a reference that cannot exist. Narrowing here means the resume path
 * never has to invent an `unavailable` for a type it simply cannot read.
 */
export const CONTINUITY_OBJECT_TYPES = ["entry", "memory"] as const;
export type ContinuityObjectType = (typeof CONTINUITY_OBJECT_TYPES)[number];

/**
 * Fields the payload refuses **by name**, so the refusal is legible.
 *
 * Every one is either an authorization, a clock that reconstitutes one, or a
 * computed result the user would then be asked to confirm without having seen
 * it recomputed. `session` and `expected` are here too: the task-command
 * envelope carries `issuedAt` and the staleness witness inside it, so
 * transporting the envelope would transport the clock under a different name —
 * which is exactly the shape R17 refuses.
 */
export const CONTINUITY_FORBIDDEN_FIELDS = [
  "issuedAt",
  "observedBefore",
  "confirmationId",
  "operationKey",
  "requestFingerprint",
  "fingerprint",
  "patch",
  "preview",
  "mutation",
  "authorization",
  "session",
  "expected",
] as const;

/**
 * The schema. `.strict()` is the mechanism; the list above is the statement.
 *
 * Short keys because this travels in a URL, and a shorter payload is a smaller
 * thing to get wrong — not to obscure it. Each is an identifier and nothing
 * else: `c` the conversation, `m` the message, `t` the object's type, `o` the
 * object.
 */
const handleSchema = z
  .object({
    v: z.literal(CONTINUITY_HANDLE_VERSION),
    c: z.string().uuid(),
    m: z.string().uuid(),
    t: z.enum(CONTINUITY_OBJECT_TYPES),
    o: z.string().uuid(),
  })
  .strict();

export type ContinuityHandle = z.infer<typeof handleSchema>;

/**
 * `2K-CONT-001` / `2K-CONT-004` — the visual position, **derived**.
 *
 * The anchor is not a field on the handle. A separate one could name a position
 * the message id does not, and there is no case in which the two should differ:
 * the message *is* the position. One fewer thing to carry is one fewer thing
 * that can be wrong.
 */
export function messageAnchorId(messageId: string): string {
  return `message-${messageId}`;
}

export function serializeContinuityHandle(handle: ContinuityHandle): string {
  return Buffer.from(JSON.stringify(handle), "utf8").toString("base64url");
}

export type ContinuityParse =
  | { readonly status: "ok"; readonly handle: ContinuityHandle }
  | { readonly status: "invalid" };

/**
 * Parses an untrusted string from a URL.
 *
 * Never throws: a malformed handle is a user arriving with a stale or mangled
 * link, which is an ordinary state rather than an error. It resolves to
 * `invalid`, and the surface says the earlier position could not be restored.
 */
export function parseContinuityHandle(raw: unknown): ContinuityParse {
  if (typeof raw !== "string" || raw === "") return { status: "invalid" };
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return { status: "invalid" };
  }
  const parsed = handleSchema.safeParse(decoded);
  return parsed.success ? { status: "ok", handle: parsed.data } : { status: "invalid" };
}

/**
 * `2K-CONT-005` / `2K-CONT-006` — what a return produces.
 *
 * `requiresFreshConfirmation` is the **literal** `true`, as a type, mirroring
 * `willMutate: false` in `preview.ts`. A boolean would let a future edit set it
 * false and still compile, and "there is no branch in which a prior
 * confirmation is reused" is precisely the property that must not be reachable
 * by a future edit.
 *
 * `issuedAt` is minted **here**, on the return, and is not the one the departing
 * render used — no clock crosses the navigation.
 *
 * There is deliberately **no** field for a restored preview, a restored command
 * or a restored confirmation. `2K-CONT-006`'s third branch is therefore the only
 * one this shape can express: the earlier preview no longer applies, here is
 * what the object looks like now, and the action must be stated again. The
 * surface **does not invent** a difference it cannot reconstruct from the
 * authorized identifiers alone.
 */
export type ContinuityResumption = {
  readonly requiresFreshConfirmation: true;
  readonly issuedAt: string;
  /** Freshly derived under RLS, or the one `unavailable` shape. */
  readonly card: ConversationCard;
  /** Where to put the user back, derived from the message id. */
  readonly anchor: string;
  readonly conversationId: string;
  readonly messageId: string;
};
