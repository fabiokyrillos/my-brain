import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_LINK_LIMIT,
  LINKED_ENTITY_TYPES,
  REVERSE_LINKED_ENTITY_TYPES,
} from "@/features/library/link-contracts";
import { CLASSIFIED_MIME_TYPES, FILE_STATE_FILTERS } from "@/features/library/filters";
import { DOMAIN_SPECS } from "@/features/search/contracts";
import { ATTACHMENT_LIMITS } from "@/lib/quotas";

/**
 * Slice 2N.5's structural guards.
 *
 * Every one of these is a claim the slice made in prose and would otherwise be
 * unenforced. Each has a **mutation control** in `describe("mutation controls")`
 * at the bottom: the scan is run against a deliberately broken input and asserted
 * to fail, so a guard that could no longer detect its own subject is itself a
 * failure. A control that cannot fail is not a control.
 *
 * Comments are stripped before every content scan. Twice in this phase a guard
 * read the prose *explaining* the thing it forbids and raised on correct code —
 * and this slice's own source files explain, at length, the writer they do not
 * have.
 */

const REPO = process.cwd();

const LIBRARY_SOURCES = [
  "src/features/library/link-contracts.ts",
  "src/features/library/attachment-links.ts",
  "src/features/library/linked-subjects.ts",
  "src/features/library/linked-subjects-section.tsx",
  "src/features/library/filters.ts",
  "src/features/library/file-filters.tsx",
];

const FILES_PAGE = "src/app/[locale]/app/files/page.tsx";
const PERSON_PAGE = "src/app/[locale]/app/people/[personId]/page.tsx";
const PROJECT_PAGE = "src/app/[locale]/app/projects/[projectId]/page.tsx";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--") && !line.trim().startsWith("*"))
    .join("\n");
}

function read(file: string): string {
  return readFileSync(join(REPO, file), "utf8");
}

function code(file: string): string {
  return stripComments(read(file));
}

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, directory))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const relative = `${directory}/${entry}`;
    if (statSync(join(REPO, relative)).isDirectory()) walk(relative, found);
    else if (/\.(ts|tsx)$/.test(entry)) found.push(relative);
  }
  return found;
}

const PRODUCT_SOURCES = walk("src").filter((file) => !file.includes(".test."));
const WORKER_SOURCES = walk("supabase/functions").filter((file) => !file.includes(".test."));

/** The write verbs a PostgREST chain can carry. */
const WRITE_CALLS = /\.(insert|upsert|update|delete)\s*\(/;

/* ------------------------------------------------------------------ */
/* The table gains a reader                                            */
/* ------------------------------------------------------------------ */

describe("2N-FILES-003: `entity_attachments` has a real reader", () => {
  it("is read by the loader module, from the table itself", () => {
    expect(code("src/features/library/attachment-links.ts")).toContain('from("entity_attachments")');
  });

  it("is mounted by all three surfaces the requirements name", () => {
    expect(code(FILES_PAGE)).toContain("loadLinksForAttachments");
    expect(code(PERSON_PAGE)).toContain("loadLinksForEntity");
    expect(code(PROJECT_PAGE)).toContain("loadLinksForEntity");
  });

  it("reads only the entity types the requirement names", () => {
    // Narrower than the column's own CHECK, which admits eight.
    expect([...LINKED_ENTITY_TYPES]).toEqual(["entry", "person", "project"]);
    expect([...REVERSE_LINKED_ENTITY_TYPES]).toEqual(["person", "project"]);
  });
});

/* ------------------------------------------------------------------ */
/* And gains no writer                                                 */
/* ------------------------------------------------------------------ */

describe("no writer is created for `entity_attachments`", () => {
  /**
   * Scans **every** product source, not only the library's own — a writer added
   * on the upload path or in a Server Action would satisfy a guard that only
   * looked where the slice worked.
   */
  it("no product source writes to the table", () => {
    const offenders = PRODUCT_SOURCES.filter((file) => {
      const source = code(file);
      if (!source.includes("entity_attachments")) return false;
      const chains = source.split('from("entity_attachments")').slice(1);
      return chains.some((chain) => WRITE_CALLS.test(chain.slice(0, 200)));
    });
    expect(offenders).toEqual([]);
  });

  it("no Edge Function mentions the table at all", () => {
    // `2N-FILES-003` forbids a relation being inferred into existence, and the
    // worker is the one place that reads a model's output — so the strongest
    // statement is that it cannot reach the table.
    const offenders = WORKER_SOURCES.filter((file) => code(file).includes("entity_attachments"));
    expect(offenders).toEqual([]);
  });

  it("the revocation of `authenticated`'s DML is never undone", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).sort();
    const regrants = migrations.filter((file) => {
      const sql = stripComments(read(`supabase/migrations/${file}`));
      return /grant[^;]*\b(insert|update|delete)\b[^;]*public\.entity_attachments[^;]*to[^;]*authenticated/i.test(
        sql,
      );
    });
    // `202607160007` grants in a bulk loop and `202607170016` revokes; nothing
    // after may re-open it. A slice that needed the grant back is a stop
    // condition, not an edit.
    expect(regrants).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* No inference is persisted, and none is rendered as a link           */
/* ------------------------------------------------------------------ */

describe("2N-FILES-003: no link is inferred into existence", () => {
  it("the link modules cannot be handed anything to guess from", () => {
    for (const file of LIBRARY_SOURCES) {
      const source = code(file);
      for (const inference of ["extracted_people", "extracted_projects", "extracted_text", "embedding", "similarity"]) {
        expect([file, source.includes(inference)]).toEqual([file, false]);
      }
    }
  });

  it("the files page derives its links from the link table, not from the analysis", () => {
    const source = code(FILES_PAGE);
    // The section is handed `file.links`, which comes from `resolveLinkedSubjects`
    // over rows read from `entity_attachments` — never from the interpretation.
    expect(source).toMatch(/subjects=\{file\.links\}/);
    expect(source).toContain("resolveLinkedSubjects");
  });
});

/* ------------------------------------------------------------------ */
/* No schema, no authority                                             */
/* ------------------------------------------------------------------ */

describe("2N-FILES-012: the slice ships no migration and no RPC", () => {
  const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((file) =>
    file.endsWith(".sql"),
  );

  it("spends no migration", () => {
    // M1 (`…0093`) and M3 (`…0094`) are spent and deployed; M2 is reserved for
    // 2N.7 and a fourth is a stop condition. So the newest migration in the tree
    // is still M3's.
    expect(migrations.length).toBe(96);
    expect(migrations.sort().at(-1)).toBe(
      "202608160096_fix_person_candidate_fingerprint.sql",
    );
  });

  it("invents no second notion of an orphan", () => {
    // `2N-FILES-005` requires orphan detection to reuse the existing scanner
    // (`scripts/verify-storage-orphans.mjs`, SH-STORAGE-001/003). The slice's
    // stop conditions name "a second orphan concept" first, so the strongest
    // statement is that the feature never uses the word at all.
    for (const file of LIBRARY_SOURCES) {
      expect([file, /orphan/i.test(code(file))]).toEqual([file, false]);
    }
  });

  it("creates no function the library could call", () => {
    const offenders = PRODUCT_SOURCES.filter(
      (file) => file.startsWith("src/features/library/") && /\.rpc\s*\(/.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Nothing promises a link the product cannot make                     */
/* ------------------------------------------------------------------ */

describe("2N-FILES-009: no control promises an action that does not exist", () => {
  it("the link sections mount no button, form or input", () => {
    const source = code("src/features/library/linked-subjects-section.tsx");
    expect(source).not.toMatch(/<button/i);
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toMatch(/<input/i);
    expect(source).not.toMatch(/<select/i);
    expect(source).not.toMatch(/\baction=\{/);
  });

  it("the empty state explains the absence instead of offering a control", () => {
    const copy = read("src/features/library/copy.ts");
    expect(copy).toContain("linkedNoWriter");
    // Both locales, so one is not silently the fallback for the other.
    expect(copy).toContain("There is no way to create a new one here yet.");
    expect(copy).toContain("Ainda não há como criar um vínculo novo por aqui.");
  });
});

/* ------------------------------------------------------------------ */
/* Extracted content stays inside the classification                   */
/* ------------------------------------------------------------------ */

describe("2N-FILES-006: extracted text reaches no surface the classification masks", () => {
  it("only the library page and the search contract name the column", () => {
    const readers = PRODUCT_SOURCES.filter(
      (file) => code(file).includes("extracted_text") && !file.includes("database.types"),
    );
    expect(readers.sort()).toEqual([FILES_PAGE, "src/features/search/contracts.ts"].sort());
  });

  it("search excludes the classification by default, so a snippet cannot leak it", () => {
    // ADR-093/OD-1 predate this slice and are not reopened by it. What matters
    // here is that the file domain still participates: a `hasSensitivity: false`
    // would put every `highly_sensitive` document's text into a default search.
    expect(DOMAIN_SPECS.files.hasSensitivity).toBe(true);
    expect(DOMAIN_SPECS.files.snippetColumn).toBe("extracted_text");
  });

  it("every field derived from the document is inside a classification on the page", () => {
    const source = code(FILES_PAGE);
    for (const derived of ["extracted_people", "extracted_projects", "extracted_dates", "task_candidates"]) {
      const at = source.indexOf(`analysis.${derived}`);
      expect([derived, at >= 0]).toEqual([derived, true]);
    }
    /*
     * The defect this slice found: the tag cloud and the candidate titles
     * rendered OUTSIDE any `ProtectedContent`, one block below the extracted
     * text that was masked. They now share a reveal key of their own, and this
     * asserts that key exists — the block cannot render without it.
     */
    expect(source).toContain("file-derived-");
    const derivedBlock = source.slice(source.indexOf("file-derived-"));
    expect(derivedBlock).toContain('surface="file"');
  });

  it("no derived document field is rendered anywhere else", () => {
    const offenders = PRODUCT_SOURCES.filter(
      (file) =>
        file !== FILES_PAGE &&
        !file.includes("database.types") &&
        /analysis\.(extracted_people|extracted_projects|task_candidates)/.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Filters are honest                                                  */
/* ------------------------------------------------------------------ */

describe("2N-FILES-010: the filter reaches the query, not a page in memory", () => {
  it("every predicate is applied before the range", () => {
    const source = code(FILES_PAGE);
    const filterAt = source.indexOf('fileQuery.eq("status"');
    const rangeAt = source.indexOf(".range(from, to)");
    expect(filterAt).toBeGreaterThan(-1);
    expect(rangeAt).toBeGreaterThan(-1);
    expect(filterAt).toBeLessThan(rangeAt);
  });

  it("the page filters no list with an array method after reading it", () => {
    const source = code(FILES_PAGE);
    // A `paginated.items.filter(...)` would be the misleading shape: a page
    // filtered after the bound was applied.
    expect(source).not.toMatch(/paginated\.items\.filter\(/);
    expect(source).not.toMatch(/rows\.filter\(/);
  });

  it("the state vocabulary matches the column's CHECK", () => {
    expect([...FILE_STATE_FILTERS]).toEqual(["uploaded", "processing", "ready", "failed"]);
  });

  it("the kinds cover the upload allowlist exhaustively", () => {
    for (const mimeType of ATTACHMENT_LIMITS.mimeAllowlist) {
      expect([mimeType, CLASSIFIED_MIME_TYPES.includes(mimeType)]).toEqual([mimeType, true]);
    }
  });

  it("the filters travel with the page number", () => {
    expect(code(FILES_PAGE)).toContain("query={fileFiltersRecord(filters)}");
  });
});

/* ------------------------------------------------------------------ */
/* Discovery links to search rather than growing one                   */
/* ------------------------------------------------------------------ */

describe("2N-FILES-011: the library does not duplicate search", () => {
  it("links to the search route", () => {
    expect(code(FILES_PAGE)).toContain("/app/search");
  });

  it("builds no search of its own", () => {
    for (const file of LIBRARY_SOURCES) {
      const source = code(file);
      expect([file, source.includes("searchEverything")]).toEqual([file, false]);
      expect([file, source.includes("DOMAIN_SPECS")]).toEqual([file, false]);
      expect([file, source.includes("buildSnippet")]).toEqual([file, false]);
    }
  });

  it("reuses search's period vocabulary rather than minting one", () => {
    expect(code("src/features/library/filters.ts")).toContain(
      'from "@/features/search/contracts"',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Person and project converge                                         */
/* ------------------------------------------------------------------ */

describe("2N-PERSON-008: the two contextual pages share one implementation", () => {
  it("both mount the same component from the same module", () => {
    for (const page of [PERSON_PAGE, PROJECT_PAGE]) {
      const source = code(page);
      expect([page, source.includes("LinkedFilesSection")]).toEqual([page, true]);
      expect([page, source.includes('from "@/features/library/linked-subjects-section"')]).toEqual([
        page,
        true,
      ]);
    }
  });

  it("neither page assembles its own link rendering", () => {
    for (const page of [PERSON_PAGE, PROJECT_PAGE]) {
      const source = code(page);
      // A second implementation would have to build rows itself; the shared
      // resolver is the only path either page has.
      expect([page, source.includes("resolveLinkedFiles")]).toEqual([page, true]);
      expect([page, /entity_attachments/.test(source)]).toEqual([page, false]);
    }
  });

  it("both bound the list under the same limit", () => {
    expect(ATTACHMENT_LINK_LIMIT).toBe(20);
    for (const page of [PERSON_PAGE, PROJECT_PAGE]) {
      expect([page, code(page).includes("ATTACHMENT_LINK_LIMIT")]).toEqual([page, true]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Bounds and failures                                                 */
/* ------------------------------------------------------------------ */

describe("2N-KNOWS-008: a probe is always paired with a trim", () => {
  it("every library read that probes also bounds", () => {
    for (const file of [...LIBRARY_SOURCES, FILES_PAGE]) {
      const source = code(file);
      if (!source.includes("withProbe(")) continue;
      expect([file, source.includes("boundedList(")]).toEqual([file, true]);
    }
  });

  it("a failed read on the files page reaches the error boundary rather than an empty list", () => {
    const source = code(FILES_PAGE);
    // Every domain read is wrapped; a bare `.data ?? []` on the file list would
    // turn a failure into an empty library.
    expect(source).toContain('requireSupabaseData(fileResult, "load files")');
    expect(source).toContain('"load linked file ids"');
  });

  it("a per-file signing failure is rendered rather than dropped", () => {
    const source = code(FILES_PAGE);
    // Storage returns per-item errors inside a successful response, so this is
    // the one read whose failure cannot reach the error boundary.
    expect(source).toContain("failedSignedPaths");
    expect(source).toContain("originalUnavailable");
  });
});

/* ------------------------------------------------------------------ */
/* Mutation controls                                                   */
/* ------------------------------------------------------------------ */

describe("mutation controls", () => {
  it("the writer scan detects a writer", () => {
    const mutated = 'const x = supabase.from("entity_attachments").insert({ id });';
    const chains = mutated.split('from("entity_attachments")').slice(1);
    expect(chains.some((chain) => WRITE_CALLS.test(chain.slice(0, 200)))).toBe(true);
  });

  it("the writer scan does not fire on a read", () => {
    const clean = 'supabase.from("entity_attachments").select("attachment_id").eq("x", y);';
    const chains = clean.split('from("entity_attachments")').slice(1);
    expect(chains.some((chain) => WRITE_CALLS.test(chain.slice(0, 200)))).toBe(false);
  });

  it("the re-grant scan detects a restored grant", () => {
    const mutated = "grant insert, update on public.entity_attachments to authenticated;";
    expect(
      /grant[^;]*\b(insert|update|delete)\b[^;]*public\.entity_attachments[^;]*to[^;]*authenticated/i.test(
        mutated,
      ),
    ).toBe(true);
  });

  it("the re-grant scan does not fire on the revocation itself", () => {
    const revocation = "revoke insert, update, delete on public.entity_attachments from authenticated;";
    expect(
      /grant[^;]*\b(insert|update|delete)\b[^;]*public\.entity_attachments[^;]*to[^;]*authenticated/i.test(
        revocation,
      ),
    ).toBe(false);
  });

  it("the re-grant scan does not fire on a select-only grant", () => {
    const selectOnly = "grant select on public.entity_attachments to authenticated;";
    expect(
      /grant[^;]*\b(insert|update|delete)\b[^;]*public\.entity_attachments[^;]*to[^;]*authenticated/i.test(
        selectOnly,
      ),
    ).toBe(false);
  });

  it("the control scan detects a button that promises a link", () => {
    const mutated = '<button type="button">Vincular arquivo</button>';
    expect(/<button/i.test(mutated)).toBe(true);
  });

  it("the control scan is not satisfied by a comment mentioning a button", () => {
    // The trap this phase paid for twice: a guard reading the prose that
    // explains the thing it forbids.
    const commented = "/* There is deliberately no <button> here. */\nexport const x = 1;";
    expect(/<button/i.test(stripComments(commented))).toBe(false);
  });

  it("the derived-field scan detects an unprotected render", () => {
    const mutated = "const cloud = file.analysis.extracted_people.map((item) => item);";
    expect(/analysis\.(extracted_people|extracted_projects|task_candidates)/.test(mutated)).toBe(
      true,
    );
  });

  it("the derived-field scan does not fire on an unrelated field", () => {
    expect(/analysis\.(extracted_people|extracted_projects|task_candidates)/.test("analysis.model")).toBe(
      false,
    );
  });

  it("the filter-order scan detects a predicate applied after the range", () => {
    const mutated = 'query.range(from, to);\nfileQuery.eq("status", state);';
    expect(mutated.indexOf('fileQuery.eq("status"')).toBeGreaterThan(mutated.indexOf(".range(from, to)"));
  });

  it("the orphan scan detects a second concept, and ignores unrelated words", () => {
    expect(/orphan/i.test("function findOrphanedLinks() {}")).toBe(true);
    expect(/orphan/i.test("const linked = resolveLinkedFiles(links, rows);")).toBe(false);
  });

  it("the page reads the link table only through the loaders", () => {
    // The mutation control for the convergence claim: a page assembling its own
    // query would be a second place the bound, the narrowing and the failure
    // outcome could disagree.
    const direct = 'supabase.from("entity_attachments").select("attachment_id")';
    expect(direct.includes('from("entity_attachments")')).toBe(true);
    for (const page of [FILES_PAGE, PERSON_PAGE, PROJECT_PAGE]) {
      expect([page, code(page).includes('from("entity_attachments")')]).toEqual([page, false]);
    }
  });

  it("the comment stripper removes the prose these guards would otherwise read", () => {
    const source = "/* entity_attachments insert */\n// entity_attachments update\nconst ok = 1;";
    expect(stripComments(source)).not.toContain("entity_attachments");
  });

  it("the corpus scans are non-vacuous", () => {
    // An assertion over an empty set passes trivially — how a corpus scan dies
    // unnoticed. Both walks must actually be finding files.
    expect(PRODUCT_SOURCES.length).toBeGreaterThan(200);
    expect(WORKER_SOURCES.length).toBeGreaterThan(5);
    expect(PRODUCT_SOURCES).toContain(FILES_PAGE);
    expect(WORKER_SOURCES.some((file) => file.includes("process-jobs"))).toBe(true);
  });
});
