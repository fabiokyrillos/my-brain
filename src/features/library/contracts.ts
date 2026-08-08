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
export const LIBRARY_RECENCY: Readonly<Partial<Record<NavigationKey, { table: string; column: string; label: string }>>> = {
  memories: { table: "memories", column: "created_at", label: "content" },
  people: { table: "people", column: "created_at", label: "name" },
  projects: { table: "projects", column: "created_at", label: "name" },
  organizations: { table: "organizations", column: "created_at", label: "name" },
  files: { table: "attachments", column: "created_at", label: "original_name" },
};

/**
 * Pin/favourite support, as a checkable constant rather than a claim.
 *
 * `false` for every member, and `phase-2i-library-guard.test.ts` re-derives it
 * from the generated database types — so if a future migration adds the column,
 * the guard fails and this constant has to be revisited deliberately.
 */
export const LIBRARY_SUPPORTS_PINNING = false;

export type LibraryDomainSummary = {
  readonly key: NavigationKey;
  readonly href: string;
  /** A navigation aid, not a metric. `null` when it could not be read. */
  readonly count: number | null;
  readonly recent: readonly { id: string; label: string }[];
};
