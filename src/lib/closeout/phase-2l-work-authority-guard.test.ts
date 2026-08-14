import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `2L-AUDIT-001`/`2L-AUDIT-002`, `2L-EDIT-002`, `2L-BULK-004` — the Phase 2L
 * no-second-authority guard.
 *
 * ## What this protects, and how it differs from the guard beside it
 *
 * `src/lib/supabase/direct-write-guard.test.ts` already proves that **no module
 * writes `public.tasks` directly** — its `TASKS_ALLOWLIST` is empty and compared
 * by exact equality in both directions. That covers PostgREST DML.
 *
 * It does **not** cover the other way a second authority could appear: calling
 * the task-command **RPCs** from somewhere new. Phase 2L surfaces quick edit,
 * bulk and undo, and every one of them is a temptation to reach for
 * `apply_task_command` from a convenient place — a bulk Server Action that
 * "just loops", a component that "just needs one more call". Each such call site
 * is a second copy of the eligibility check, the fingerprint, the staleness gate
 * and the undo row, arrived at without anyone deciding to write one.
 *
 * The invariant is therefore narrower and sharper than "one write path": **each
 * task-authority RPC is reachable from exactly the modules named below.**
 *
 * ## Two detector properties this file pays for up front
 *
 * **It reads the multi-line call form.** `creation.ts` calls three of these RPCs
 * as `client.rpc(\n  "name",\n  payload)`. A line-oriented scan finds
 * `apply_task_command` and silently misses those three — and a census that
 * misses call sites is a census that would let a fourth one in. The extractor is
 * newline-tolerant and a fixture proves it.
 *
 * **It ignores mentions in comments.** Phase 2K lost a slice to a guard that read
 * a *quoted refusal list* as a use. Comments are stripped before scanning, and a
 * fixture proves that a comment naming `apply_task_command` does not fire while
 * a real call in the same file does.
 */

const REPO = join(__dirname, "..", "..", "..");
const SRC = join(REPO, "src");

/**
 * The RPCs that together constitute authority over a task.
 *
 * `undo_operation` is deliberately **absent**: it is a generic router shared by
 * the entry, question and candidate domains, so a census over it would be a
 * census of four unrelated features. Its task-command call site is pinned
 * separately below.
 */
export const TASK_AUTHORITY_RPCS = [
  "apply_task_command",
  "create_task_command",
  "preview_task_command_creation",
  "issue_task_command_confirmation",
  "issue_task_command_creation_confirmation",
  "list_task_command_candidates",
  "task_command_fingerprint",
] as const;

type CallSite = { readonly rpc: string; readonly file: string };

/**
 * The complete, declared census.
 *
 * Compared by **exact equality in both directions**, so it can only change
 * through a reviewed edit: a new call site fails, and so does an entry naming a
 * call site that no longer exists. The second half matters as much as the first
 * — an allowlist that outlives its call site is how a guard comes to permit
 * something nobody has looked at in a year.
 */
const AUTHORITY_ALLOWLIST: readonly CallSite[] = [
  { rpc: "apply_task_command", file: "src/features/task-commands/apply.ts" },
  { rpc: "create_task_command", file: "src/features/task-commands/creation.ts" },
  { rpc: "preview_task_command_creation", file: "src/features/task-commands/creation.ts" },
  { rpc: "issue_task_command_confirmation", file: "src/features/task-commands/confirmation.ts" },
  { rpc: "issue_task_command_creation_confirmation", file: "src/features/task-commands/creation.ts" },
  { rpc: "list_task_command_candidates", file: "src/features/task-commands/candidates.ts" },
  { rpc: "task_command_fingerprint", file: "src/features/task-commands/fingerprint.ts" },
];

/**
 * The modules permitted to route an undo through the shared router.
 *
 * `src/features/deletion/actions.ts` joins in Phase 2N M3 (`202608140094`),
 * which registers `delete_person`, `delete_project` and `delete_memory` in
 * `private.undo_operation_handlers`. It belongs here for the reason this list
 * exists at all: the router is generic, so the check on who may reach it is a
 * named list rather than a property of the call. A fifth domain arriving
 * without this line is what the guard is for — and this line is the deliberate,
 * visible answer rather than a widened pattern.
 */
const UNDO_ROUTER_ALLOWLIST: readonly string[] = [
  "src/features/agent/actions.ts",
  "src/features/deletion/actions.ts",
  "src/features/interpretations/actions.ts",
  "src/features/task-commands/actions.ts",
  "src/features/tasks/actions.ts",
];

/**
 * Strips block and line comments.
 *
 * Not a parser, and it does not need to be: it removes the two shapes in which a
 * guard has actually been fooled in this repository — a documentation comment
 * naming the thing it forbids, and a commented-out call left behind by an edit.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Every task-authority RPC call in one module's source.
 *
 * The pattern tolerates any whitespace — including newlines — between `.rpc(`
 * and the name, because three of the seven are called in the multi-line form.
 */
export function findAuthorityCalls(source: string, file: string): CallSite[] {
  const code = stripComments(source);
  const found: CallSite[] = [];
  for (const rpc of TASK_AUTHORITY_RPCS) {
    const pattern = new RegExp(`\\.rpc\\(\\s*["'']${rpc}["'']`, "g");
    if (pattern.test(code)) found.push({ rpc, file });
  }
  return found;
}

export function findUndoRouterCalls(source: string, file: string): string[] {
  const code = stripComments(source);
  return /\.rpc\(\s*["']undo_operation["']/.test(code) ? [file] : [];
}

function sourceFiles(dir: string, relative = "src"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const child = `${relative}/${entry}`;
    if (statSync(absolute).isDirectory()) {
      found.push(...sourceFiles(absolute, child));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // Test modules are excluded: a test may legitimately name an RPC to assert
    // it was called, and folding those in would make the census a census of the
    // test suite.
    if (/\.test\.tsx?$/.test(entry)) continue;
    found.push(child);
  }
  return found;
}

function census(root: string): { authority: CallSite[]; undo: string[] } {
  const authority: CallSite[] = [];
  const undo: string[] = [];
  for (const file of sourceFiles(join(root, "src"))) {
    const source = readFileSync(join(root, file), "utf8");
    authority.push(...findAuthorityCalls(source, file));
    undo.push(...findUndoRouterCalls(source, file));
  }
  const key = (site: CallSite) => `${site.rpc}::${site.file}`;
  return {
    authority: authority.sort((a, b) => key(a).localeCompare(key(b))),
    undo: undo.sort(),
  };
}

/* -------------------------------------------------------------------------- */
/* The guard, applied to this repository                                       */
/* -------------------------------------------------------------------------- */

describe("2L-EDIT-002: task authority has exactly the call sites it declares", () => {
  const actual = census(REPO);

  it("finds every declared call site and no undeclared one", () => {
    const expected = [...AUTHORITY_ALLOWLIST]
      .sort((a, b) => `${a.rpc}::${a.file}`.localeCompare(`${b.rpc}::${b.file}`));
    expect(actual.authority).toEqual(expected);
  });

  it("keeps `apply_task_command` — the mutation itself — at exactly one call site", () => {
    // The sharpest single fact in the census, asserted on its own so a failure
    // says *which* invariant broke rather than "the list changed".
    const applies = actual.authority.filter((site) => site.rpc === "apply_task_command");
    expect(applies).toEqual([
      { rpc: "apply_task_command", file: "src/features/task-commands/apply.ts" },
    ]);
  });

  it("keeps the undo router to the four domains that already own an undo", () => {
    expect(actual.undo).toEqual([...UNDO_ROUTER_ALLOWLIST].sort());
  });

  it("proves the census is non-vacuous", () => {
    // A detector that found nothing would pass an empty allowlist against an
    // empty repository. Both lists are non-empty and the sharpest one is pinned
    // above, so "it found nothing" cannot masquerade as "it found what we said".
    expect(actual.authority.length).toBe(TASK_AUTHORITY_RPCS.length);
    expect(actual.undo.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2L-AUDIT-002 — what authority *permits* is derived, never restated          */
/* -------------------------------------------------------------------------- */

describe("2L-AUDIT-002: the editable field set is derived from the policy", () => {
  /*
   * The census above stops a second *caller*. This stops a second *copy of the
   * rules*, which is the subtler half and the one Phase 2L is most exposed to:
   * quick edit and bulk both need to know which fields a task admits, and the
   * cheap way to answer is a literal list in the component.
   *
   * `detail-controls.ts`'s own header already states the property — "the list is
   * computed from `actionPolicy` and the task's own status, never hand-written"
   * — and `detailControlsFor` implements it. What did not exist is anything that
   * *fails* when a future edit adds the literal. This is that.
   */
  const controls = readFileSync(join(SRC, "features/task-commands/detail-controls.ts"), "utf8");
  const code = stripComments(controls);

  it("derives the control list by iterating the taxonomy", () => {
    expect(code).toMatch(/TASK_COMMAND_ACTIONS\.flatMap/);
    expect(code).toMatch(/actionPolicy\(action\)/);
    expect(code).toMatch(/isEligibleStatus\(action, status\)/);
  });

  it("takes each control's bounds from the policy rather than from a literal", () => {
    // `choices` is the value set a control may offer. Sourcing it from
    // `policy.allowedTargetValues` is what stops `set_status` ever offering
    // `cancelled` — the route `2F-SURFACE-012` closed structurally.
    expect(code).toMatch(/choices:\s*policy\.targetValueField === field \? policy\.allowedTargetValues/);
  });

  it("names no task status and no priority as a literal", () => {
    // The two closed vocabularies a hand-written list would most likely
    // duplicate. `taxonomy.ts` owns both; a literal here would be a second copy
    // that drifts the first time a policy changes.
    for (const literal of ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred", "completed", "cancelled"]) {
      expect(code, `detail-controls.ts names the status '${literal}'`)
        .not.toContain(`"${literal}"`);
    }
    for (const literal of ["low", "medium", "high", "urgent"]) {
      expect(code, `detail-controls.ts names the priority '${literal}'`)
        .not.toContain(`"${literal}"`);
    }
  });

  it("proves the derivation assertions are not vacuous", () => {
    // A stripped-to-nothing file would satisfy the `not.toContain` assertions
    // above. The positive matches are what stop that, and this pins that the
    // file being read is the real one.
    expect(code).toContain("export function detailControlsFor");
    expect(code.length).toBeGreaterThan(500);
  });
});

/* -------------------------------------------------------------------------- */
/* The guard, applied to planted sources                                       */
/* -------------------------------------------------------------------------- */

const roots: string[] = [];

function plantedRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2l-authority-"));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

describe("the no-second-authority guard itself", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("fires on a planted second `apply_task_command` call site", () => {
    // The case the guard exists for: a bulk Server Action that "just loops".
    const root = plantedRoot({
      "src/features/task-commands/apply.ts": `await client.rpc("apply_task_command", payload);`,
      "src/features/operations/bulk.ts": `await client.rpc("apply_task_command", payload);`,
    });
    expect(census(root).authority).toEqual([
      { rpc: "apply_task_command", file: "src/features/operations/bulk.ts" },
      { rpc: "apply_task_command", file: "src/features/task-commands/apply.ts" },
    ]);
  });

  it("reads the multi-line call form, which three real call sites use", () => {
    const root = plantedRoot({
      "src/features/task-commands/creation.ts":
        `const result = await client.rpc(\n  "create_task_command",\n  payload,\n);`,
    });
    expect(census(root).authority).toEqual([
      { rpc: "create_task_command", file: "src/features/task-commands/creation.ts" },
    ]);
  });

  it("does not fire on a comment that names the RPC, but does on a real call beside it", () => {
    /*
     * Phase 2K's lesson, mechanised. A guard that matched bare words fired on
     * the very module written to satisfy it, because that module *documented*
     * what it refused. Both halves are asserted in one fixture: a guard that
     * ignored everything would also pass the first assertion alone.
     */
    const mentionOnly = plantedRoot({
      "src/features/operations/notes.ts":
        `/** Never call apply_task_command from here: .rpc("apply_task_command") is apply.ts's. */\n`
        + `// await client.rpc("apply_task_command", payload);\n`
        + `export const NOTE = "apply_task_command";\n`,
    });
    expect(census(mentionOnly).authority).toEqual([]);

    const mentionAndCall = plantedRoot({
      "src/features/operations/notes.ts":
        `/** Never call apply_task_command from here. */\n`
        + `await client.rpc("apply_task_command", payload);\n`,
    });
    expect(census(mentionAndCall).authority).toEqual([
      { rpc: "apply_task_command", file: "src/features/operations/notes.ts" },
    ]);
  });

  it("ignores test modules, so an assertion about an RPC is not a call site", () => {
    const root = plantedRoot({
      "src/features/operations/bulk.test.ts": `expect(client.rpc).toHaveBeenCalledWith("apply_task_command");`,
    });
    expect(census(root).authority).toEqual([]);
  });

  it("fires on a planted undo router call outside the four domains", () => {
    const root = plantedRoot({
      "src/features/operations/bulk.ts": `await client.rpc("undo_operation", { p_undo_id: id });`,
    });
    expect(census(root).undo).toEqual(["src/features/operations/bulk.ts"]);
  });
});
