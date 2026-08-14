import { boundedList, type Bounded } from "@/features/bounds/contracts";

/**
 * `2N-FILES-003`, `2N-FILES-005`, `2N-FILES-009`, `2N-PERSON-008` — the
 * vocabulary and the rules for reading `entity_attachments`, with no I/O.
 *
 * ## The fact this module is built around, stated before the code
 *
 * The slice's re-audit measured `entity_attachments` against `main` and the
 * hosted database and found it carries **neither a reader nor a writer** in
 * product code. `202607170016:239` revoked `insert, update, delete` from
 * `authenticated` deliberately, and the live grants confirm it: the role holds
 * `REFERENCES, SELECT, TRIGGER, TRUNCATE` and nothing else. The only thing in
 * the repository that inserts a row is M3's deletion **undo**
 * (`202608140094:803`), which re-inserts links that already existed.
 *
 * So this family is the read half of a relationship the product **cannot
 * currently create**. That is an owner decision (option A), not an oversight,
 * and it has two consequences that are load-bearing for everything below:
 *
 *   1. **There is deliberately no writer anywhere in this feature.** Not a stub,
 *      not a disabled export, not a TODO for a later caller to reach for. The
 *      requirement is kept true by there being no write path at all, exactly as
 *      `entities/aliases.ts` does one domain over.
 *   2. **An empty result is the expected result**, for every user without legacy
 *      or restored links. Surfaces must render that emptiness honestly — as *no
 *      linked files*, never as an error, and never behind a control that
 *      promises an action the product does not offer.
 *
 * ## Why this is separate from the loaders
 *
 * `attachment-links.ts` is `server-only` because it holds a client. Everything
 * that *decides* something — which types may be rendered, what a malformed row
 * means, how a bound is reported — is here instead, so it can be exercised
 * exhaustively without a database and imported by modules that never touch one.
 */

/**
 * The entity kinds a rendered file link may point at.
 *
 * `2N-FILES-003` names exactly three — entry, person, project — and this list is
 * **narrower than the column's CHECK constraint**, which also admits `task`,
 * `conversation`, `reminder`, `decision` and `activity`. The narrowing is
 * deliberate and is the validation `2N-SEC` asks for: a row whose `entity_type`
 * is outside this list is dropped rather than rendered through a resolver that
 * has no page to send the user to.
 *
 * Adding a member here is a claim that the type has a resolvable subject and a
 * route, which is the kind of claim that should be hard to make by accident.
 */
export const LINKED_ENTITY_TYPES = ["entry", "person", "project"] as const;
export type LinkedEntityType = (typeof LINKED_ENTITY_TYPES)[number];

/**
 * The two kinds whose own page renders the reverse direction (`2N-FILES-009`).
 *
 * Separate from the list above because the two directions are not symmetric:
 * a file names the entry it came from, and an entry page carries no file
 * section. Typed so `loadLinksForEntity("entry", …)` does not compile.
 */
export const REVERSE_LINKED_ENTITY_TYPES = ["person", "project"] as const;
export type ReverseLinkedEntityType = (typeof REVERSE_LINKED_ENTITY_TYPES)[number];

export function isLinkedEntityType(value: unknown): value is LinkedEntityType {
  return typeof value === "string" && (LINKED_ENTITY_TYPES as readonly string[]).includes(value);
}

/** One link, narrowed to the types this product can actually resolve. */
export type AttachmentLink = {
  readonly attachmentId: string;
  readonly entityType: LinkedEntityType;
  readonly entityId: string;
};

/**
 * How many links one subject renders before saying it is bounded.
 *
 * Follows `FAILED_JOB_LIMIT` rather than `CONTEXTUAL_LIMIT`: a file's linked
 * subjects, and a person's linked files, answer *what is attached here* — a
 * hundred rows would answer a different question, and the notice states the
 * truncation honestly when there are more.
 */
export const ATTACHMENT_LINK_LIMIT = 20;

/**
 * The total bound on the links read for one **page** of files.
 *
 * The per-file bound above cannot be expressed in a single `in (…)` query — a
 * limit applied there bounds the total, so one heavily-linked file would starve
 * every other card. So the page reads a generous total, groups in memory, and
 * bounds each card from the group.
 *
 * When this total bound is hit, **every** card on the page reports itself
 * bounded. That is conservative and deliberately so: `boundedList`'s own
 * contract says reporting the bound when *either* hop hit it is the honest
 * direction, and the alternative — guessing which cards were truncated — would
 * be a surface inventing an answer it does not have.
 */
export const PAGE_LINK_LIMIT = 200;

/**
 * A bounded read that knows whether it happened.
 *
 * `ok` / `failed` is `DomainOutcome`'s vocabulary from
 * `features/search/contracts.ts`, taken rather than re-minted for the reason
 * `bounds/contracts.ts` gives about `bounded`: two words for one fact is how a
 * product ends up describing the same failure two ways on two screens.
 *
 * ## Why a failed read is a named outcome and not an empty array
 *
 * `loadAliasesForEntity` degrades to `[]` on error, and says why: an absent
 * alias reveals nothing and withholds nothing. **That reasoning does not
 * transfer.** "No files are linked to this person" and "the link table could not
 * be read" are different claims about the world, and collapsing them would make
 * the product state the first one confidently while the second is true — the
 * failure-rendered-as-emptiness shape this phase has now corrected twice.
 */
export type LinkOutcome<T> =
  | { readonly status: "ok"; readonly list: Bounded<T> }
  | { readonly status: "failed" };

export type LinkRow = {
  attachment_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
};

/**
 * Narrows raw rows to the links this product can resolve.
 *
 * A row missing either id, or carrying an `entity_type` outside
 * `LINKED_ENTITY_TYPES`, is **dropped**. Dropping rather than rendering a
 * fallback is the point: a link the product cannot send the user anywhere for is
 * not a navigation aid, and rendering it would state that *something* is
 * attached without saying what — an existence claim with no content, which is
 * the oracle shape `2N-PRIVACY-005` refuses.
 */
export function narrowAttachmentLinks(
  rows: readonly LinkRow[] | null | undefined,
): AttachmentLink[] {
  const links: AttachmentLink[] = [];
  for (const row of rows ?? []) {
    if (!row?.attachment_id || !row.entity_id) continue;
    if (!isLinkedEntityType(row.entity_type)) continue;
    links.push({
      attachmentId: row.attachment_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
    });
  }
  return links;
}

/**
 * Groups links by the file they belong to.
 *
 * Returns a plain map so a card can ask for its own links without scanning, and
 * so a file with none is simply absent — which is the same shape as a file whose
 * links all failed to narrow, by construction.
 */
export function linksByAttachment(
  links: readonly AttachmentLink[],
): ReadonlyMap<string, readonly AttachmentLink[]> {
  const grouped = new Map<string, AttachmentLink[]>();
  for (const link of links) {
    const existing = grouped.get(link.attachmentId);
    if (existing) existing.push(link);
    else grouped.set(link.attachmentId, [link]);
  }
  return grouped;
}

/**
 * Turns a raw response into a bounded, narrowed outcome.
 *
 * ## Why the narrowing runs before the bound is decided
 *
 * A row dropped for carrying an unrenderable `entity_type` was still **read**,
 * so counting it towards the limit would make a page of `task` links report
 * itself truncated while showing nothing — a notice about rows the user was
 * never going to see. So `boundedList` is handed what will actually be rendered,
 * and the probe is applied to the raw length separately.
 */
export function toLinkOutcome(
  rows: readonly LinkRow[] | null,
  error: unknown,
  limit: number,
): LinkOutcome<AttachmentLink> {
  if (error || !rows) return { status: "failed" };
  return {
    status: "ok",
    list: boundedList(narrowAttachmentLinks(rows), limit, rows.length > limit),
  };
}
