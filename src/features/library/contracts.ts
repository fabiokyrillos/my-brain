/**
 * `2I-LIB-001` … `2I-LIB-008` — Library.
 *
 * ## Library is a rendering, not a data model
 *
 * The six members already share `group: "context"` in
 * `src/features/shell/capabilities.ts`. The grouping has existed as **data**
 * since before this phase; nothing rendered it. So `2I-LIB-001` reads the
 * membership from `capabilities.ts` rather than restating it — a seventh
 * context destination added tomorrow appears in Library tomorrow, and one
 * removed cannot linger in a second hard-coded list.
 *
 * `2I-LIB-002` forbids a new data model. Nothing here creates a table, a column
 * or an RPC.
 *
 * ## `2I-LIB-004` — pinned/favourite is NOT built, and that is the answer
 *
 * The requirement says *only if the repository already supports it*. A scan of
 * `database.types.ts` finds **no `pinned`, `favorite`, `favourite`, `starred`
 * or `bookmarked` column on any table** — zero matches across the whole schema.
 * Adding one would be a data model, which `2I-LIB-002` forbids.
 *
 * So it closes as an **evidenced negative**: *not supported, not built*. The
 * traceability contract §4 rule 10 accepts that as *delivered*, because the
 * honest answer to "does the repository support this?" is no and the evidence
 * is a scan rather than an opinion.
 */

import { navigationCapabilities, type NavigationKey } from "@/features/shell/capabilities";
import type { SubjectSensitivity } from "@/features/sensitivity/subject-derivation";

/** The six, derived — never restated. */
export const LIBRARY_MEMBERS: readonly NavigationKey[] = navigationCapabilities
  .filter((capability) => capability.group === "context")
  .map((capability) => capability.key);

/**
 * Where a "recent" count may come from.
 *
 * `2I-LIB-003` allows recents **where an existing deterministic source supports
 * it**. Every one of these is a plain `created_at` on a table the user owns —
 * no score, no ranking, no inference. `contexts` has no independent recency
 * worth showing, so it is absent rather than faked.
 */
export const LIBRARY_RECENCY: Readonly<Partial<Record<NavigationKey, LibraryRecencySpec>>> = {
  memories: { table: "memories", column: "created_at", label: "content", surface: "memory" },
  people: { table: "people", column: "created_at", label: "name", surface: null },
  projects: { table: "projects", column: "created_at", label: "name", surface: null },
  organizations: { table: "organizations", column: "created_at", label: "name", surface: null },
  files: { table: "attachments", column: "created_at", label: "original_name", surface: "file" },
};

export type LibraryRecencySpec = {
  readonly table: string;
  readonly column: string;
  readonly label: string;
  /**
   * Whether that label is **content this product governs**, and under which
   * surface it must be asked.
   *
   * A required field on the same record rather than a second record kept in
   * step, because the failure mode is forgetting: a sixth recency source added
   * without a decision here would print its label in the clear, and a separate
   * lookup returning `undefined` would collapse into the same silence as a
   * deliberate `null`. Required means the compiler asks.
   *
   * `null` is not "unclassified" — it is **structural identifier**, the arm
   * ADR-110 Decision 2 fixed: a person's, project's or organization's name is
   * how the owner recognises the thing, masking it would make the surface
   * unusable and protect nothing, and none of those three tables carries a
   * `sensitivity` column to derive from in the first place. `memories.content`
   * and `attachments.original_name` do carry one, and `2N-PRIVACY-002` names a
   * file name as content — so both are asked, through the same component and the
   * same surface literal their own pages use.
   *
   * `conversations` is deliberately absent from the record above. The table
   * carries `sensitivity` and there is no `conversation` arm in
   * `ProtectedSurface`, so an overview listing recent conversation titles would
   * be printing governed content with no contract to ask. Conversas is a door on
   * this surface, which is what the lens is for.
   */
  readonly surface: "memory" | "file" | null;
};

/**
 * Where a plain **count** may come from — a wider set than recency, on purpose.
 *
 * The previous overview derived counts from `LIBRARY_RECENCY`, so a domain with
 * no recent list also had no number: Contextos and Conversas rendered as doors
 * with nothing behind them while every neighbour carried a figure, which reads
 * as a broken counter rather than as a decision. Counting a table the owner owns
 * is not the same claim as ranking its rows, and `2I-LIB-003`'s restraint is
 * about the second.
 *
 * `relations` has no row to count — a relation is derived at read time from
 * several tables by `loadRelations` — so it stays absent rather than being given
 * a number that would mean something other than what the card says. `2I-LIB-007`
 * still holds: these are navigation aids, and there is no chart, trend or score
 * anywhere on the surface.
 */
export const LIBRARY_COUNTS: Readonly<Partial<Record<NavigationKey, string>>> = {
  people: "people",
  projects: "projects",
  organizations: "organizations",
  contexts: "contexts",
  memories: "memories",
  files: "attachments",
  chat: "conversations",
};

/**
 * Pin/favourite support, as a checkable constant rather than a claim.
 *
 * `false` for every member, and `phase-2i-library-guard.test.ts` re-derives it
 * from the generated database types — so if a future migration adds the column,
 * the guard fails and this constant has to be revisited deliberately.
 */
export const LIBRARY_SUPPORTS_PINNING = false;

export type LibraryRecentRow = {
  readonly id: string;
  readonly label: string;
  /**
   * How the label must be rendered.
   *
   * `null` means it is a structural identifier and is printed as-is; a
   * `SubjectSensitivity` means it is governed content and the surface must wrap
   * it. Modelled as one field with two arms rather than an optional one,
   * because an optional field has a third state — forgotten — and forgetting
   * here prints a memory body in full.
   */
  readonly sensitivity: SubjectSensitivity | null;
};

export type LibraryDomainSummary = {
  readonly key: NavigationKey;
  readonly href: string;
  /** A navigation aid, not a metric. `null` when it could not be read. */
  readonly count: number | null;
  /**
   * Whether this domain has a countable table at all.
   *
   * `relations` does not — a relation is derived at read time from several
   * tables — so without this flag its honest absence would render as *"could not
   * count right now"*, which is a claim about the database rather than about the
   * domain, and would send an owner looking for an outage that is not there.
   */
  readonly countSupported: boolean;
  readonly recent: readonly LibraryRecentRow[];
  /**
   * The surface the recent labels must be asked under, or `null` where they are
   * structural identifiers. Decided once by the loader from `LIBRARY_RECENCY`,
   * so it cannot disagree with the `sensitivity` on the rows beside it.
   */
  readonly recentSurface: LibraryRecencySpec["surface"];
  /**
   * Whether this domain offers a recent list at all.
   *
   * Distinguishes *"nothing recent"* from *"recency is not shown for this
   * domain"* — `contexts` is the second, deliberately, and an empty array alone
   * would have made the two indistinguishable to the surface.
   */
  readonly recencySupported: boolean;
  /**
   * Whether the recent read **failed**, as opposed to returning nothing.
   *
   * The third state, and it was missing. The loader returned `[]` on error and
   * the surface had two arms, so a denied or failed read printed *"Nada aqui
   * ainda"* — a positive claim about the owner's own data, made out of a
   * failure. The count half of this record already had all three states and
   * `overview.ts`'s header already asserted the recency half did too; it was one
   * field short of the thing it claimed, and an independent review of the branch
   * found it.
   */
  readonly recentFailed: boolean;
};
