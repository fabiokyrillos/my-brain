import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * EGC-INVARIANT-004 — **no surface renders a relationship or association
 * collection the owner has no way to write.**
 *
 * ## Why this is an enumeration and not a general rule
 *
 * The PRD's own adversarial review (attack 8) established that the invariant is
 * not assertable in general: "renders a collection" is not decidable from source
 * without understanding what each JSX block means, and "has a reachable writer"
 * requires knowing which control on which page ends up calling which action.
 * What *is* assertable is an **enumerated inventory** that must stay complete —
 * which is what gate G-0.2 produced before any code was written, and what this
 * file turns into a mechanical check.
 *
 * ## The three things it asserts
 *
 * 1. **Every enumerated section names a writer, or names why it has none.** A
 *    section with neither is the defect the invariant exists to catch — the
 *    state `EG-09` described, where the page advertises a capability and
 *    provides no path to it.
 * 2. **Every named writer exists and is reachable from the page.** A module
 *    that was renamed, or a page that stopped importing it, breaks the promise
 *    while the inventory still claims it is kept.
 * 3. **The inventory covers the whole route tree.** This is gate C1's "over the
 *    *whole* route inventory, not the new pages only": a new route that renders
 *    a collection cannot slip in unenumerated, because every `page.tsx` under
 *    the authenticated tree must appear here with a verdict.
 */

const REPO = resolve(__dirname, "../../..");
const APP_ROOT = join(REPO, "src/app/[locale]/app");

/**
 * Where the control that writes a rendered collection actually lives.
 *
 * **Three verdicts, not two**, and the middle one is the honest addition. A
 * first draft had only "a writer module" and "no writer", and it failed
 * immediately on the Context detail page — which renders the people in a
 * context and offers no control, because EGC.2 put the single writer for
 * `person_contexts` on the Person side. That is not the state `EG-09`
 * described. `EG-09` was *no path anywhere*; this is a path from a named other
 * page, which is a different fact and has to be recorded as one.
 *
 * The `exportName` is what makes any of this worth asserting. Checking that a
 * page imports a *module* is far too weak: the Organizations detail page
 * imports `entities/actions.ts` for `updateOrganization`, which would have
 * satisfied a module-level check for two collections it cannot write at all.
 */
type Writer =
  /** The control is on this page. */
  | { readonly kind: "here"; readonly module: string; readonly exportName: string }
  /** The control is on another enumerated route, named here. */
  | { readonly kind: "elsewhere"; readonly route: string; readonly module: string; readonly exportName: string }
  /** Nothing writes it directly, and that is correct. */
  | { readonly kind: "derived"; readonly reason: string };

type Section = {
  /** The collection rendered, as the owner would name it. */
  readonly section: string;
  /** The table it reads. */
  readonly table: string;
  readonly writer: Writer;
};

type RouteEntry = {
  /** The route, relative to `src/app/[locale]/app`, with `""` for the home page. */
  readonly route: string;
  /** Collections this route renders. Empty is a legitimate answer. */
  readonly sections: readonly Section[];
};

/**
 * The inventory. Derived from `docs/reports/entity-graph/EGC_G02_REACHABILITY_INVENTORY.md`
 * and refreshed against the tree as EGC.1 and EGC.2 landed.
 *
 * A route with `sections: []` is asserting something real: *this page renders no
 * relationship or association collection*. Getting that wrong is a defect, and
 * the third assertion below is what forces a new route to make the claim at all.
 */
const INVENTORY: readonly RouteEntry[] = [
  { route: "", sections: [] },
  /*
   * `2M-CAL-001`. It renders no relationship or association collection, and
   * that is the claim rather than an omission: the calendar reads five existing
   * sources and links to the surfaces that own them — a task's Work detail, the
   * reminders list, the reviews page, the entry in the inbox — so every writer
   * it could need is already reachable from the page it sends the user to.
   */
  { route: "calendar", sections: [] },
  /*
   * `2M-PLAN-004`, and the same claim for the same reason. The planner renders
   * two lists of tasks and no relationship or association collection at all; it
   * links each row to that task's Work detail, which is where every writer it
   * could need already lives. It creates nothing itself, which is the
   * requirement rather than an omission.
   */
  { route: "calendar/plan", sections: [] },
  { route: "capture", sections: [] },
  { route: "chat", sections: [] },
  { route: "chat/[conversationId]", sections: [] },
  { route: "contexts", sections: [] },
  {
    route: "contexts/[contextId]",
    sections: [
      // EGC-ASSOC-003 puts the single writer for `person_contexts` on the Person
      // side, and EGC.1 shipped this page read-only for exactly that reason: a
      // second control here would be the duplication the invariant forbids.
      {
        section: "People in this context",
        table: "person_contexts",
        writer: {
          kind: "elsewhere",
          route: "people/[personId]",
          module: "src/features/entities/associations.ts",
          exportName: "associatePersonContext",
        },
      },
      {
        section: "Tasks in this context",
        table: "task_contexts",
        writer: {
          kind: "elsewhere",
          route: "work/[taskId]",
          module: "src/features/task-commands/detail-actions.ts",
          exportName: "applyTaskDetailCommand",
        },
      },
    ],
  },
  { route: "costs", sections: [] },
  { route: "files", sections: [] },
  { route: "history", sections: [] },
  { route: "inbox", sections: [] },
  {
    route: "inbox/[entryId]",
    sections: [
      {
        section: "What now exists because of this entry",
        table: "entry_entities",
        writer: {
          kind: "derived",
          reason: "`entry_entities` is written by the interpretation pipeline from the entry's own text. There is no separate control, and inventing one would be a second way to say what the capture already said.",
        },
      },
    ],
  },
  { route: "jobs", sections: [] },
  { route: "memories", sections: [] },
  { route: "memories/[memoryId]", sections: [] },
  { route: "notifications", sections: [] },
  { route: "organizations", sections: [] },
  {
    route: "organizations/[organizationId]",
    sections: [
      // Both are `organization_id` on the other row, so both are written from
      // that row's own page. A control here would be a second way to set one
      // field, and the Company selector is already where an owner expects it.
      {
        section: "People at this company",
        table: "people.organization_id",
        writer: {
          kind: "elsewhere",
          route: "people/[personId]",
          module: "src/features/entities/actions.ts",
          exportName: "updatePerson",
        },
      },
      {
        section: "Projects at this company",
        table: "projects.organization_id",
        writer: {
          kind: "elsewhere",
          route: "projects/[projectId]",
          module: "src/features/entities/actions.ts",
          exportName: "updateProject",
        },
      },
    ],
  },
  { route: "people", sections: [] },
  {
    route: "people/[personId]",
    sections: [
      // The four that had no writer anywhere before this initiative.
      {
        section: "Relationship to you",
        table: "person_relationships",
        writer: { kind: "here", module: "src/features/entities/relationships.ts", exportName: "createOwnerRelationship" },
      },
      {
        section: "Contexts",
        table: "person_contexts",
        writer: { kind: "here", module: "src/features/entities/associations.ts", exportName: "associatePersonContext" },
      },
      {
        section: "Projects",
        table: "person_projects",
        writer: { kind: "here", module: "src/features/entities/associations.ts", exportName: "associatePersonProject" },
      },
      {
        section: "Company",
        table: "people.organization_id",
        writer: { kind: "here", module: "src/features/entities/actions.ts", exportName: "createOrganizationForSubject" },
      },
      {
        section: "Open work and tasks",
        table: "task_people",
        writer: {
          kind: "elsewhere",
          route: "work/[taskId]",
          module: "src/features/task-commands/detail-actions.ts",
          exportName: "applyTaskDetailCommand",
        },
      },
      {
        section: "Memories",
        table: "memories",
        // `createRecord`, not `createMemory`: the Memories list page authors a
        // memory through the shared inline-create action, and the dedicated
        // module handles the lifecycle afterwards. Naming the wrong export was
        // caught by this very assertion on its first run, which is the point of
        // checking the symbol rather than the module.
        writer: {
          kind: "elsewhere",
          route: "memories",
          module: "src/features/operations/actions.ts",
          exportName: "createRecord",
        },
      },
      {
        section: "Timeline",
        table: "entry_entities",
        writer: { kind: "derived", reason: "Derived from capture and interpretation, as on the entry page." },
      },
    ],
  },
  { route: "projects", sections: [] },
  {
    route: "projects/[projectId]",
    sections: [
      // The same `person_projects` row as the Person page's "Projects", written
      // through the same module — EGC-ASSOC-003's symmetry, here as an assertion.
      {
        section: "People on this project",
        table: "person_projects",
        writer: { kind: "here", module: "src/features/entities/associations.ts", exportName: "associatePersonProject" },
      },
      {
        section: "Company",
        table: "projects.organization_id",
        writer: { kind: "here", module: "src/features/entities/actions.ts", exportName: "createOrganizationForSubject" },
      },
      {
        section: "Tasks",
        table: "task_projects",
        writer: {
          kind: "elsewhere",
          route: "work/[taskId]",
          module: "src/features/task-commands/detail-actions.ts",
          exportName: "applyTaskDetailCommand",
        },
      },
      {
        section: "Timeline",
        table: "entry_entities",
        writer: {
          kind: "derived",
          reason: "Derived from capture and interpretation, as on the entry page: the project appears here because an entry mentioned it, and there is no separate control to say so twice.",
        },
      },
    ],
  },
  /*
   * Phase 2I's Library. `sections: []` because it renders no collection of its
   * own: each card is a link into the domain route that owns those records, and
   * Library writes nothing.
   */
  { route: "library", sections: [] },
  { route: "questions", sections: [] },
  /*
   * 2N.6. It renders three collections and **owns no writer for any of them**,
   * which is the point rather than a gap: `2N-RELATION-004` requires a relation
   * to be corrected and ended through an **existing** authority path, and those
   * paths are the person and project pages. A second set of controls here would
   * be a second place for the soft-end contract to disagree with itself — the
   * risk `EGC-ASSOC-003` names by number.
   *
   * Every node in the list and in the drawing is a link to the page that owns
   * the write, so the writer is reachable in one click from every row.
   */
  {
    route: "relations",
    sections: [
      {
        section: "Relationships to you",
        table: "person_relationships",
        writer: {
          kind: "elsewhere",
          route: "people/[personId]",
          module: "src/features/entities/relationships.ts",
          exportName: "createOwnerRelationship",
        },
      },
      {
        section: "Links to projects",
        table: "person_projects",
        writer: {
          kind: "elsewhere",
          route: "people/[personId]",
          module: "src/features/entities/associations.ts",
          exportName: "associatePersonProject",
        },
      },
      {
        section: "Links to contexts",
        table: "person_contexts",
        writer: {
          kind: "elsewhere",
          route: "people/[personId]",
          module: "src/features/entities/associations.ts",
          exportName: "associatePersonContext",
        },
      },
    ],
  },
  { route: "reminders", sections: [] },
  { route: "reviews", sections: [] },
  /*
   * Phase 2I's global search. `sections: []` because it renders **no
   * collection of its own** — every result is a link into the surface that
   * owns that record, and search writes nothing. Enumerated here because
   * EGC-INVARIANT-004 is assertable only over a complete set, and this guard
   * caught the route the moment it appeared, which is what it is for.
   */
  { route: "search", sections: [] },
  { route: "settings", sections: [] },
  /*
   * Slice 2P.5 — the seven non-default settings sections, behind one dynamic
   * segment. `sections: []` for the same reason `settings` carries it: the
   * route renders preferences and navigation, not an owned collection, so
   * EGC-INVARIANT-004 has nothing here to demand a writer for.
   */
  { route: "settings/[section]", sections: [] },
  { route: "tasks", sections: [] },
  { route: "today", sections: [] },
  { route: "waiting", sections: [] },
  { route: "work", sections: [] },
  { route: "work/[taskId]", sections: [] },
  { route: "work/cancelled", sections: [] },
  /*
   * Phase 2L's parallel-route slot (`2L-EDIT-007`). These are not URLs — a slot
   * does not appear in the address bar — but they are `page.tsx` files under the
   * authenticated tree, and the inventory's whole point is that nothing there
   * goes unenumerated. Two of them render `null`; the third mounts the *same*
   * `TaskDetailSurface` as `work/[taskId]`, so it renders no collection that
   * route does not already account for.
   */
  { route: "work/@panel", sections: [] },
  { route: "work/@panel/(.)[taskId]", sections: [] },
  { route: "work/@panel/[...catchAll]", sections: [] },
];

/** Every `page.tsx` under the authenticated tree, as a route key. */
function routeInventory(directory = APP_ROOT, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      routes.push(...routeInventory(path, prefix ? `${prefix}/${entry}` : entry));
      continue;
    }
    if (entry === "page.tsx") routes.push(prefix);
  }
  return routes.sort();
}

/**
 * What a route's page can reach, one level deep.
 *
 * ## Why this is not just the page file any more
 *
 * The check has always meant "the control is reachable from this route", and it
 * approximated that by reading the page's own imports — which was exact while
 * every page mounted its controls itself.
 *
 * Phase 2L broke the approximation without breaking the property.
 * `2L-EDIT-007` requires the task detail to exist **once**, mounted by two
 * routes (its own, and the intercepting one that renders it beside the list), so
 * the body moved into `TaskDetailSurface` and the page became four lines. The
 * control is exactly as reachable as it was; the page file simply stopped being
 * where it is named.
 *
 * So the source a route is judged on is the page **plus the first-party feature
 * modules it imports**. One level, and no further: two levels would drift back
 * toward "somewhere in the repository imports this", which is the module-level
 * check this file already rejected as far too weak. A page that delegates twice
 * has to be enumerated honestly rather than chased.
 */
function pageSource(route: string): string {
  const page = readFileSync(join(APP_ROOT, route, "page.tsx"), "utf8");
  const composed = [...page.matchAll(/from\s+["']@\/(features\/[^"']+)["']/g)]
    .map((match) => join(REPO, "src", `${match[1]}.tsx`))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    })
    .map((path) => readFileSync(path, "utf8"));
  return [page, ...composed].join("\n");
}

describe("EGC-INVARIANT-004: every rendered collection has a reachable writer", () => {
  it("covers the whole authenticated route tree, so a new page cannot slip in unenumerated", () => {
    // Gate C1. Without this, the invariant would hold over the pages somebody
    // remembered to list, which is the same as not holding.
    const onDisk = routeInventory();
    const enumerated = INVENTORY.map((entry) => entry.route).sort();

    expect(
      enumerated,
      "A route was added or removed without updating the reachability inventory. "
        + "EGC-INVARIANT-004 is assertable only over an enumerated set, so the set "
        + "has to stay complete: add the route with its collections, or with an "
        + "empty list if it renders none.",
    ).toEqual(onDisk);
  });

  it("resolves every named writer module on disk", () => {
    for (const entry of INVENTORY) {
      for (const section of entry.sections) {
        if (section.writer.kind === "derived") continue;
        expect(
          statSync(join(REPO, section.writer.module)).isFile(),
          `${entry.route} — ${section.section} names ${section.writer.module}, which is not a file`,
        ).toBe(true);
      }
    }
  });

  it("proves the page holding a control actually imports that exact export", () => {
    // The assertion that would have failed before EGC.1 and EGC.2: the Person
    // page rendered four collections and imported no writer for any of them.
    //
    // **The export name, not just the module.** A module-level check is far too
    // weak — the Organizations detail page imports `entities/actions.ts` for
    // `updateOrganization`, which would have satisfied it for two collections
    // that page cannot write at all.
    for (const entry of INVENTORY) {
      const here = entry.sections.filter((section) => section.writer.kind === "here");
      if (here.length === 0) continue;

      const source = pageSource(entry.route);
      for (const section of here) {
        const writer = section.writer as Extract<Writer, { kind: "here" }>;
        const specifier = `@/${writer.module.replace(/^src\//, "").replace(/\.ts$/, "")}`;
        expect(
          source.includes(specifier) && source.includes(writer.exportName),
          `${entry.route} renders "${section.section}" and claims the control is on this `
            + `page via ${writer.exportName} from ${specifier} — but the page does not `
            + "import it. Either the section became unreachable again, or the inventory "
            + "is out of date.",
        ).toBe(true);
      }
    }
  });

  it("proves a section written from elsewhere names a route that really holds the control", () => {
    // The verdict a first draft did not have, and which the Context detail page
    // forced into existence: EGC-ASSOC-003 puts the single writer for
    // `person_contexts` on the Person side, so the Context page renders those
    // rows with no control **by design**. That is not `EG-09` — `EG-09` was no
    // path anywhere — so it is recorded as its own fact and then checked: the
    // named route must exist, and it must genuinely import the named export.
    const routes = new Set(INVENTORY.map((entry) => entry.route));

    for (const entry of INVENTORY) {
      for (const section of entry.sections) {
        if (section.writer.kind !== "elsewhere") continue;
        const { route, module, exportName } = section.writer;

        expect(
          routes.has(route),
          `${entry.route} — ${section.section} points at route "${route}", which is not in the inventory`,
        ).toBe(true);

        const specifier = `@/${module.replace(/^src\//, "").replace(/\.ts$/, "")}`;
        const source = pageSource(route);
        expect(
          source.includes(specifier) && source.includes(exportName),
          `${entry.route} — ${section.section} says its control lives on "${route}" via `
            + `${exportName}, but that page does not import it. The section is unreachable `
            + "from anywhere, which is exactly what EGC-INVARIANT-004 forbids.",
        ).toBe(true);
      }
    }
  });

  it("leaves no section unreachable — the state EG-09 described", () => {
    // Before this initiative, four of nine enumerated sections had no
    // user-reachable writer: `person_relationships` (nothing wrote it at all),
    // `person_contexts` and `person_projects` (trigger only), plus two entity
    // types with no route. This says that is over, and it fails with the
    // offending list rather than with a count.
    //
    // The derived sections are the legitimate exceptions, and they are **named**
    // rather than counted: an inventory that allowed "some" exceptions would let
    // a new one appear without argument.
    const derived = INVENTORY.flatMap((entry) =>
      entry.sections
        .filter((section) => section.writer.kind === "derived")
        .map((section) => `${entry.route} — ${section.section}`),
    );

    expect(derived).toEqual([
      "inbox/[entryId] — What now exists because of this entry",
      "people/[personId] — Timeline",
      "projects/[projectId] — Timeline",
    ]);

    for (const entry of INVENTORY) {
      for (const section of entry.sections) {
        if (section.writer.kind !== "derived") continue;
        expect(
          section.writer.reason.length,
          `${entry.route} — ${section.section} is derived but gives no reason`,
        ).toBeGreaterThan(40);
      }
    }
  });
});
