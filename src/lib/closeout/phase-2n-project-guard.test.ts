/**
 * Slice 2N.2 — the properties of the **tree** that keep the project page
 * honest.
 *
 * The same job `phase-2n-person-guard.test.ts` does one surface earlier: claims
 * about which files exist, what the schema does and does not carry, and which
 * call sites are allowed to say which things. None of them is expressible as a
 * unit test on a function.
 *
 * The sharpest one here is the **risk premise**. `2N-PROJECT-005` closes its
 * risk half `not-built-by-rule`, and a classification whose only evidence is a
 * sentence in a report is a classification nobody re-checks. So the rule is
 * asserted against the tree: if a risk concept is ever added, this fails, and
 * the requirement is reopened by the same change that made it representable.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DECISION_CONCEPT, TERMINAL_TASK_STATUSES } from "@/features/entities/project-context";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
/**
 * Source with comments stripped.
 *
 * Mandatory, not a nicety: every module below *documents* the rule it obeys, so
 * a guard reading raw text would match the sentence explaining a ban and fail on
 * a correct file. A guard that fails on correct code gets weakened by whoever
 * touches it next.
 */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PROJECT_PAGE = "src/app/[locale]/app/projects/[projectId]/page.tsx";
const PROJECT_CONTEXT = "src/features/entities/project-context.ts";
const APP_CONCEPTS = "src/lib/ai/extraction-schema.ts";
const WORKER_CONCEPTS = "supabase/functions/process-jobs/entry.ts";
const WORKER_VALIDATION = "supabase/functions/_shared/extraction-validation.ts";
const MIGRATIONS = "supabase/migrations";

function migrationSources(): string {
  return readdirSync(join(REPO, MIGRATIONS))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join(REPO, MIGRATIONS, file), "utf8"))
    .join("\n");
}

describe("2N.2 schema impact: none", () => {
  it("adds no migration of its own", () => {
    // The phase budget is asserted elsewhere; this asserts the narrower thing —
    // 2N.2 created nothing, and M1/M3/M2 stay allocated to 2N.3 and 2N.7.
    const migrations = readdirSync(join(REPO, MIGRATIONS)).filter((file) => file.endsWith(".sql"));
    expect(migrations).toHaveLength(92);
    expect(migrations.at(-1)).toBe("202608120092_phase_2m_push_delivery.sql");
  });
});

describe("2N-PROJECT-005: the risk half closes by rule, and the rule is checked", () => {
  it("finds no risk concept in either extraction vocabulary", () => {
    /*
     * The whole basis of the `not-built-by-rule` classification. Decisions ship
     * because `decision` is a stored concept; risks do not because nothing
     * anywhere records one.
     *
     * Both vocabularies are scanned, not just the app's: `src/lib/ai` declares
     * the contract but the worker is what writes the column, and a risk concept
     * that appeared in only one of them would still put risk data in the table.
     */
    for (const file of [APP_CONCEPTS, WORKER_CONCEPTS, WORKER_VALIDATION]) {
      const source = code(file);
      expect(source, `${file} gained a risk concept; 2N-PROJECT-005 is now representable`)
        .not.toMatch(/"[a-z_]*risk[a-z_]*"/i);
    }
  });

  it("finds no risk column or table in the schema", () => {
    const sql = migrationSources()
      // Prose in a migration header is not a schema object, and several
      // migrations legitimately discuss "residual risk". Only identifiers count.
      .replace(/--.*$/gm, "");
    expect(sql, "a risk-named schema object appeared").not.toMatch(/\b(create table[^;]*\brisks?\b|\brisk_level\b|\brisks\b\s+(text|jsonb|uuid))/i);
  });

  it("is not vacuous: the same scan finds the concept that DID ship", () => {
    /*
     * The control. A scan that matched nothing because it was looking in the
     * wrong place would pass the two checks above forever and quietly certify a
     * requirement it never tested.
     */
    for (const file of [APP_CONCEPTS, WORKER_CONCEPTS, WORKER_VALIDATION]) {
      expect(code(file), `${file} no longer declares the decision concept`).toContain(`"${DECISION_CONCEPT}"`);
    }
    expect(DECISION_CONCEPT).toBe("decision");
  });

  it("reads the concept from stored data and never from the entry's words", () => {
    // `2N-PROV-005`'s rule applied to this derivation: there must be no
    // signature that could accept content to match on, and no text heuristic.
    const source = code(PROJECT_CONTEXT);
    expect(source, "the decision derivation reaches for a client").not.toMatch(/createClient|supabase|fetch\(/);
    expect(source, "the decision derivation matches on text").not.toMatch(/original_content|toLowerCase\(|\.includes\("[^"]{4,}/);
  });
});

describe("2N-PROJECT-003: the state is stated in vocabularies that already exist", () => {
  it("closes over exactly the two terminal statuses the check constraint declares", () => {
    const sql = migrationSources();
    const constraint = sql.match(/check \(status in \('inbox'[^)]*\)\)/)?.[0] ?? "";
    expect(constraint, "the task status constraint was not found").not.toBe("");
    for (const status of TERMINAL_TASK_STATUSES) {
      expect(constraint, `${status} is not a stored task status`).toContain(`'${status}'`);
    }
    expect(TERMINAL_TASK_STATUSES).toHaveLength(2);
  });

  it("prints no status word of its own", () => {
    /*
     * `2N-PROJECT-003` forbids inventing a status vocabulary. The page may only
     * name a status through the two typed lookups that read the stored value —
     * so a literal status token in the surface would be a word the product does
     * not store.
     */
    const source = code(PROJECT_PAGE);
    expect(source).toMatch(/copy\.statuses\[status\]/);
    expect(source).toMatch(/taskStatusLabel\(/);
    for (const literal of ["in_progress", "'todo'", '"todo"', '"completed"', '"cancelled"']) {
      expect(source, `the page hard-codes the status token ${literal}`).not.toContain(literal);
    }
  });

  it("separates the bounded count from the exact one, as two strings", () => {
    // One string with a conditional prefix would let a caller print the
    // confident form over an uncertain number. Two strings cannot be confused.
    const copySource = code("src/features/entities/copy.ts");
    expect(copySource).toContain("openCommitmentsAtLeast");
    expect(copySource).toContain("openCommitments:");
    expect(code(PROJECT_PAGE)).toMatch(/openTasksAtLeast/);
  });
});

describe("2N-PROJECT-004: one change is narrated one way", () => {
  it("delegates to the describer the History surface already uses", () => {
    const source = code(PROJECT_CONTEXT);
    expect(source).toMatch(/describeHistoryEvent\(/);
    expect(code(PROJECT_PAGE)).toMatch(/<HistoryList/);
  });

  it("mints no second label for any action type", () => {
    /*
     * The failure this prevents is a product that says "you linked a person to a
     * project" on one screen and something else on another, for one audit row.
     * Neither the surface nor its derivation may contain an action token: every
     * sentence has to come from `history/copy.ts`.
     */
    for (const file of [PROJECT_PAGE, PROJECT_CONTEXT]) {
      const source = code(file);
      for (const action of [
        "update_project",
        "associate_person_project",
        "update_person_project_role",
        "end_person_project",
      ]) {
        expect(source, `${file} names the action type ${action} itself`).not.toContain(action);
      }
    }
  });

  it("never selects the audit reason", () => {
    // Stronger than not rendering it: `reason` is free text the History surface
    // deliberately stopped showing (UX-28), and a column absent from the
    // projection cannot reach the RSC payload or a later edit.
    const selects = code(PROJECT_PAGE).match(/"[^"]*created_at"/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const projection of selects) {
      expect(projection, "the audit reason reached the project page").not.toContain("reason");
    }
  });

  it("adds no change-log table", () => {
    // The slice's stop condition, stated as a check rather than as a promise.
    const sql = migrationSources();
    expect(sql).not.toMatch(/create table[^;]*\b(project_changes|change_log|project_decisions)\b/i);
  });
});

describe("2N-PROJECT-006: nothing renders a probe row", () => {
  it("feeds every list on the page from a bounded list", () => {
    /*
     * The 2N.0 guard asserts this for the two panel props (`rows`,
     * `relationships`). This slice adds four more lists to the surface — tasks,
     * memories, decisions and changes — and one of them is fed through a prop
     * the earlier pattern does not match (`events`). Same defect, new spelling:
     * `bound={boundedX}` beside a raw array type-checks and renders one row too
     * many.
     */
    const source = code(PROJECT_PAGE);
    const fed = [...source.matchAll(/(?:rows|events)=\{([A-Za-z0-9_.]+?)(?:\.map\(|\})/g)];
    expect(fed.length, "no list props were found to check").toBeGreaterThan(0);
    for (const [, expression] of fed) {
      expect(
        expression,
        `the page feeds a list from \`${expression}\`, which is not a bounded list`,
      ).toMatch(/\.items$/);
    }

    // The four inline lists, each mapped from its own bounded list.
    for (const list of ["boundedTasks.items.map(", "boundedMemories.items.map(", "boundedDecisions.items.map(", "boundedEntries.items.map("]) {
      expect(source, `a section is not mapped from ${list}`).toContain(list);
    }
  });

  it("reports the bound of every list it renders", () => {
    // Five lists, five notices: tasks, decisions, memories, changes, timeline.
    // The People panel renders its own, which is why it is not counted here.
    const notices = code(PROJECT_PAGE).match(/<BoundedNotice/g) ?? [];
    expect(notices).toHaveLength(5);
  });
});

describe("2N-PROJECT-007 / 2N-SEC-003: the page introduces no new authority", () => {
  it("adds no write of its own", () => {
    const source = code(PROJECT_PAGE);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(source).not.toMatch(/"use server"/);
  });

  it("reuses the existing authority paths and defines none", () => {
    /*
     * `2N-PROJECT-007` is about reuse, not merely about the absence of a client
     * write. Every mutation this page offers has to be an action that already
     * existed — the same modules the person page submits to, so neither surface
     * owns a private path.
     */
    const source = code(PROJECT_PAGE);
    expect(source).toMatch(/from "@\/features\/entities\/actions"/);
    expect(source).toMatch(/from "@\/features\/entities\/associations"/);
    for (const action of ["updateProject", "associatePersonProject", "endPersonProject", "updatePersonProjectRole"]) {
      expect(source, `${action} is no longer wired`).toContain(action);
    }
  });

  it("adds no writer to the project derivation", () => {
    // A reader and only a reader, the shape `provenance/` keeps: there is no
    // `recordProjectState` for a later caller to find and reach for.
    expect(code(PROJECT_CONTEXT)).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe("2N-RELATION-005: confidence is never rendered as certainty", () => {
  it("does not select the column into a project-page projection", () => {
    // `memories` and `entry_interpretations` both carry `confidence`, and both
    // join this page for the first time in this slice. A value absent from the
    // projection cannot be rendered by a later edit, and is not sitting in the
    // RSC payload either.
    const selects = code(PROJECT_PAGE).match(/\.select\("[^"]*"\)/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const projection of selects) {
      expect(projection, "confidence reached the project page's data").not.toContain("confidence");
    }
  });

  it("renders no confidence value", () => {
    expect(code(PROJECT_PAGE), "the project page renders a confidence value").not.toMatch(/\bconfidence\b/i);
    expect(code(PROJECT_CONTEXT), "the derivation renders a confidence value").not.toMatch(/\bconfidence\b/i);
  });
});

describe("2N-PERSON-004 applied to the project surface", () => {
  it("marks each section as persisted or derived", () => {
    /*
     * Counted rather than merely present: six sections a reader could take for
     * something they maintain — identity, tasks, decisions, memories, changes,
     * timeline — and one unmarked section is exactly the case where a derived
     * list reads as something they can change. The People panel marks itself.
     */
    const onPage = code(PROJECT_PAGE).match(/<SectionOriginNote/g) ?? [];
    expect(onPage).toHaveLength(6);
    expect(code("src/features/entities/association-panel.tsx")).toMatch(/<SectionOriginNote/);
  });

  it("asks the provenance contract whether a source is openable", () => {
    // The defect the 2N.1 diff review caught, asserted one surface later: two
    // expressions computing one answer drift the moment the contract gains a
    // condition, leaving a page that offers a link to a claim it labels
    // unsourced.
    const source = code(PROJECT_PAGE);
    expect(source, "the page re-implements the contract's resolvability test")
      .not.toMatch(/resolvableEntryIds\.has\(/);
    expect(source).toMatch(/isOpenable\(/);
  });

  it("never invents an origin for a project row", () => {
    // `projects` and `memories` both carry no owner-authorship guarantee —
    // `memories.source_entry_id` is `on delete set null` — so neither may be
    // called owner-authored. The type refuses it; this asserts the text too.
    for (const forbidden of ["projects", "memories", "entries", "tasks"]) {
      expect(code(PROJECT_PAGE)).not.toContain(`ownerAuthored("${forbidden}")`);
    }
  });
});

describe("2N-PRIVACY-002: protected content does not escape through an attribute", () => {
  it("renders no tooltip and no describedAs on this surface", () => {
    /*
     * A `title` is unreachable by keyboard, invisible to touch, and would put a
     * second copy of the text in an attribute — where a mask does not apply.
     * `describedAs` is the same hazard through the accessible name, and on this
     * page every subject that could fill it (a task title, a memory, an entry)
     * is precisely what `ProtectedContent` may be withholding.
     */
    const source = code(PROJECT_PAGE);
    expect(source, "the project page renders a native tooltip").not.toMatch(/\stitle=\{/);
    expect(source, "the project page names protected content in an attribute").not.toMatch(/describedAs=/);
  });

  it("labels every source link positionally", () => {
    // `ProvenanceNote` builds its `aria-label` from `subject`, so the page must
    // pass the neutral positional label and never the row's content.
    const source = code(PROJECT_PAGE);
    const subjects = [...source.matchAll(/subject=\{([^}]*)\}/g)].map(([, value]) => value.trim());
    expect(subjects.length).toBeGreaterThan(0);
    for (const subject of subjects) {
      expect(subject, `subject={${subject}} is not a positional label`).toMatch(
        /provenanceCopy\.(task|memory)Subject\(/,
      );
    }
  });
});

describe("2N-ACCESS-005: the copy is typed, not scattered", () => {
  it("leaves no inline locale ternary on the project page", () => {
    /*
     * The surface this slice rewrites goes all the way, rather than adding typed
     * copy beside the ternaries that were already there. `2N-ACCESS-005` asks
     * for a typed module "for every state in §4", and a page that is half one
     * and half the other is where the next state gets added the wrong way.
     */
    const source = code(PROJECT_PAGE);
    expect(source, "the project page still decides copy inline").not.toMatch(/\bpt \?/);
    expect(source, "the project page still derives the pt flag").not.toMatch(/const pt =/);
  });

  it("keeps both locales complete for every string this slice added", () => {
    /*
     * `satisfies Record<Locale, EntityCopy>` already makes an omission a type
     * error. This is the non-vacuity half: three occurrences per key — the
     * declaration plus one in each locale record — so the type check is being
     * applied to two real records rather than to one and an alias.
     */
    const source = read("src/features/entities/copy.ts");
    for (const key of ["recentChanges:", "decisions:", "projectMemories:", "noOpenCommitments:", "timelineEmpty:"]) {
      expect(
        (source.match(new RegExp(key, "g")) ?? []).length,
        `${key} is not declared once and filled in both locale blocks`,
      ).toBe(3);
    }
  });
});
