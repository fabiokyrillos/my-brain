import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";

/**
 * SH-EXPOSURE-003 — the `authenticated` INSERT on `audit_logs`, dispositioned.
 *
 * ## The decision, and it is a decision
 *
 * The requirement offers two exits and forbids the third: revoke the grant and
 * move every in-app direct writer behind an RPC, **or** retain it with the
 * writer inventory recorded. What it forbids is silence. ADR-081 records the
 * choice — retain — and this file is the inventory that makes the choice
 * checkable instead of a sentence in a document.
 *
 * ## Why retain
 *
 * `authenticated` already cannot UPDATE or DELETE `audit_logs` (202607170016),
 * so append-only holds regardless, and RLS confines every insert to the
 * writer's own rows. The residual capability is therefore: a user can write a
 * true-looking audit row about **their own** account. That pollutes their own
 * history and reaches nobody else's — and it cannot forge an undo, because
 * `undo_operations` has no INSERT grant at all (202607170028).
 *
 * Set against that, revoking would mean an RPC accepting an open-vocabulary
 * `action_type` from eighteen call sites across five modules — a large,
 * regression-prone change to write paths in a slice whose subject is quotas and
 * retention. The trade is recorded rather than assumed.
 *
 * ## What this test actually guards
 *
 * Not the count — a count that must be edited on every legitimate change is a
 * test people learn to update without reading. It guards the **surface**: which
 * modules may write directly. A nineteenth insert inside an already-listed
 * module is ordinary work; the same insert in a new module is the surface
 * growing, and that is the thing a decision to retain has to keep bounded.
 */

const REPO = process.cwd();

/** Every `.ts`/`.tsx` under `src/`, excluding tests. */
function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

/**
 * The modules ADR-081 records as holding a direct `audit_logs` insert.
 *
 * Paths, deliberately, and not counts. Adding a writer to one of these is
 * ordinary; adding a sixth module is the exposure surface growing, and that is
 * what a decision to retain has to keep bounded.
 */
const DECLARED_WRITERS = [
  "src/features/chat/actions.ts",
  "src/features/entities/actions.ts",
  "src/features/entities/associations.ts",
  "src/features/entities/relationships.ts",
  "src/features/memories/actions.ts",
].sort();

function directWriters(): string[] {
  return sourceFiles(join(REPO, "src"))
    .filter((file) => readFileSync(file, "utf8").includes('from("audit_logs").insert'))
    .map((file) => file.slice(REPO.length + 1).replace(/\\/g, "/"))
    .sort();
}

describe("SH-EXPOSURE-003: the retained grant's writer inventory", () => {
  it("finds writers at all, so the scan is not silently matching nothing", () => {
    // The failure mode of every inventory test: the matcher stops matching, the
    // list comes back empty, and the assertion passes by describing nothing.
    expect(directWriters().length).toBeGreaterThan(0);
  });

  it("the direct writers are exactly the modules ADR-081 declares", () => {
    expect(directWriters()).toEqual(DECLARED_WRITERS);
  });

  it("no worker or script writes audit rows as service_role directly", () => {
    // The Edge Functions and the operator scripts are a different trust level:
    // there, a direct insert would be an unaudited actor writing audit history,
    // which is the one thing an audit trail cannot survive.
    for (const root of ["supabase/functions", "scripts"]) {
      const offenders = sourceFilesUnder(join(REPO, root))
        .filter((file) => readFileSync(file, "utf8").includes('from("audit_logs").insert'));
      expect(offenders, `${root} must reach audit_logs through an RPC`).toEqual([]);
    }
  });

  it("append-only still holds: nothing updates or deletes an audit row", () => {
    // The grant that was retained is INSERT. If the guarantee that makes
    // retaining it acceptable ever weakened, it would show up here first.
    const offenders = sourceFiles(join(REPO, "src"))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return text.includes('from("audit_logs").update')
          || text.includes('from("audit_logs").delete');
      })
      .map((file) => file.slice(REPO.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});

/** Same walk, over a non-`src` root, tolerating a directory that is absent. */
function sourceFilesUnder(directory: string): string[] {
  try {
    return sourceFiles(directory).filter((file) => !/\.test\.[tj]sx?$/.test(file));
  } catch {
    return [];
  }
}
