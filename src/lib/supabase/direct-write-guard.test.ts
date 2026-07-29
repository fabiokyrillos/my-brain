import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2F-GUARD-002 / 2F-GUARD-003 — the architecture regression gate.
 *
 * Phase 2F's invariant (PRD §2): `public.tasks` has exactly one validated
 * write path — no application module may directly insert, update, or delete
 * it. Independent reminder creation remains a documented, bounded exception
 * on `public.reminders`.
 *
 * This gate inspects real source: it walks every non-test module under `src/`
 * and extracts each PostgREST builder chain that starts `.from("tasks")` or
 * `.from("reminders")` and continues into a DML method. The writers it finds
 * must equal the allowlists below **exactly** — a new direct writer fails the
 * build, and so does an allowlist entry whose writer no longer exists, so the
 * allowlist can only shrink through a reviewed edit (2F-GUARD-003).
 *
 * Allowlist lifecycle (PRD §2, §6.1):
 * - `tasks` — **empty as of Slice 2F.3**. The two legacy writers left in 2F.2
 *   (`persistTaskStatus` update) and 2F.3 (`createRecord` insert). 2F.4 revokes
 *   the grants that would still permit one (2F-REVOKE-008).
 * - `reminders` — exactly the Option C exception (`createReminder` insert,
 *   owner decision 3), permanent until a PRD revision, so this gate never
 *   claims an emptiness that is false.
 */

const SRC_DIR = path.resolve(process.cwd(), "src");
const DML_METHODS = ["insert", "update", "upsert", "delete"] as const;

type GuardedTable = "tasks" | "reminders";
type DmlMethod = (typeof DML_METHODS)[number];
type Writer = { file: string; table: GuardedTable; op: DmlMethod };

/**
 * **Empty, as of Phase 2F Slice 2F.3.**
 *
 * `persistTaskStatus`'s UPDATE left in 2F.2 (2F-SURFACE-013) and `createRecord`'s
 * INSERT left in 2F.3 (2F-CREATE-001). `public.tasks` now has exactly one
 * validated write path from the application, which is the invariant PRD §2
 * states — and this list reaching empty is the mechanical proof of it, not a
 * claim about it.
 *
 * The list is compared by exact equality in both directions, so this cannot rot:
 * a new direct writer fails, and so would a leftover entry naming a writer that
 * no longer exists. 2F.4 revokes the grants that would still permit one.
 */
const TASKS_ALLOWLIST: readonly Writer[] = [];

const REMINDERS_ALLOWLIST: readonly Writer[] = [
  // `createReminder` — the documented Option C exception (PRD §2 item 6).
  { file: "src/features/agent/actions.ts", table: "reminders", op: "insert" },
];

/**
 * Extracts guarded-table DML call sites from one module's source text. A
 * builder chain is the text from `.from("<table>")` to the next `.from(` or
 * 400 characters, whichever comes first — long enough for every real chain in
 * this codebase, short enough not to bleed into an unrelated query.
 */
export function findDirectWrites(source: string, file: string): Writer[] {
  const writers: Writer[] = [];
  const fromPattern = /\.from\(\s*["'](tasks|reminders)["']\s*\)/g;
  const matches = [...source.matchAll(fromPattern)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const nextFrom = source.indexOf(".from(", start);
    const end = Math.min(nextFrom === -1 ? source.length : nextFrom, start + 400);
    const chain = source.slice(start, end);
    for (const op of DML_METHODS) {
      if (new RegExp(`\\.${op}\\s*\\(`).test(chain)) {
        writers.push({ file, table: match[1] as GuardedTable, op });
      }
    }
  }
  return writers;
}

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    files.push(full);
  }
  return files;
}

function scanApplicationWriters(): Writer[] {
  const writers: Writer[] = [];
  for (const full of walkSourceFiles(SRC_DIR)) {
    const relative = path.relative(process.cwd(), full).split(path.sep).join("/");
    const source = readFileSync(full, "utf8");
    writers.push(...findDirectWrites(source, relative));
  }
  return writers.sort(
    (a, b) => a.file.localeCompare(b.file) || a.table.localeCompare(b.table) || a.op.localeCompare(b.op),
  );
}

describe("2F-GUARD-002: no application module writes tasks or reminders outside the allowlists", () => {
  it("finds exactly the allowlisted tasks writers — empty since 2F.3; 2F.4 revokes the grants that would still permit one", () => {
    const found = scanApplicationWriters().filter((writer) => writer.table === "tasks");
    expect(found).toEqual(TASKS_ALLOWLIST);
  });

  it("finds exactly the documented reminders exception, and nothing else", () => {
    const found = scanApplicationWriters().filter((writer) => writer.table === "reminders");
    expect(found).toEqual(REMINDERS_ALLOWLIST);
  });
});

describe("2F-GUARD-003: the gate reads call sites, not a file list", () => {
  it("detects every DML method on a guarded table", () => {
    for (const op of DML_METHODS) {
      const source = `await supabase.from("tasks").${op}({ title: "x" }).eq("id", id);`;
      expect(findDirectWrites(source, "synthetic.ts")).toEqual([
        { file: "synthetic.ts", table: "tasks", op },
      ]);
    }
  });

  it("detects a multiline chain and single-quoted table names", () => {
    const source = "await supabase\n  .from('reminders')\n  .insert({ title })\n  .select();";
    expect(findDirectWrites(source, "synthetic.ts")).toEqual([
      { file: "synthetic.ts", table: "reminders", op: "insert" },
    ]);
  });

  it("ignores reads, other tables, and DML belonging to a later chain", () => {
    const reads = 'supabase.from("tasks").select("id,title").eq("user_id", userId);';
    expect(findDirectWrites(reads, "synthetic.ts")).toEqual([]);
    const otherTable = 'supabase.from("projects").insert({ name });';
    expect(findDirectWrites(otherTable, "synthetic.ts")).toEqual([]);
    const laterChain = 'supabase.from("tasks").select("id");\nawait supabase.from("projects").update({ a: 1 });';
    expect(findDirectWrites(laterChain, "synthetic.ts")).toEqual([]);
  });
});
