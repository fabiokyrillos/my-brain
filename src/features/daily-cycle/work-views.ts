/**
 * `2L-VIEW-001`/`-002` — the canonical Work taxonomy, declared once.
 *
 * OD-2L-2 option A signed **three** views and nothing else. They lived in
 * `work-projection.ts`, which is `server-only`, so a client surface could not
 * read them; and their *meaning* — the default ordering and the purpose a user
 * reads — lived in a third place, `work-view.tsx`'s copy record. Three
 * fragments of one taxonomy is how a fourth destination arrives without anybody
 * deciding to add one.
 *
 * So the taxonomy is one module, client-safe, carrying the id, the declared
 * default ordering and nothing that is locale-specific. The **names and
 * descriptions stay in copy**, because those are translated and a taxonomy that
 * held Portuguese would be a taxonomy one language could disagree with.
 *
 * **The predicates stay in SQL.** They are `.eq`/`.lt`/`.not` clauses on a
 * PostgREST builder and cannot be values here without being reimplemented; what
 * is declared here is what a view *means* in terms this module can hold, and
 * `work-projection.ts` is the single consumer that turns each id into its
 * clauses.
 */

export const workViews = ["today", "all", "waiting"] as const;
export type WorkViewId = (typeof workViews)[number];

/** The ordering a view falls back to when the user has chosen none. */
export type WorkViewDefinition = {
  readonly id: WorkViewId;
  /**
   * Declared per view rather than globally, because they answer different
   * questions: Hoje is a deadline queue and sorts by when things are due; the
   * other two are working sets and sort by what moved most recently.
   */
  readonly defaultOrder: "due_asc" | "updated_desc";
};

export const WORK_VIEWS: Readonly<Record<WorkViewId, WorkViewDefinition>> = {
  today: { id: "today", defaultOrder: "due_asc" },
  all: { id: "all", defaultOrder: "updated_desc" },
  waiting: { id: "waiting", defaultOrder: "updated_desc" },
};

export function isWorkViewId(value: string): value is WorkViewId {
  return (workViews as readonly string[]).includes(value);
}
