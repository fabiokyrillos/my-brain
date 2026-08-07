/**
 * The backup toolchain's invariants — the ones a script cannot check about
 * itself, and the one defect that already happened.
 *
 * ## The defect this file exists because of
 *
 * `phase-2h-restore-drill.mjs` shipped in 2H.5 with a `COUNTED_TABLES` list
 * naming `public.entities`. **There is no such table in this schema.** Nothing
 * caught it, for a reason worth stating plainly: the drill had never been run,
 * so nothing had ever asked the database whether the list was true. It was
 * found by the first census ever taken against the live project, which returned
 * `42P01 relation "public.entities" does not exist`.
 *
 * Had the drill run against a real restore first, check 1 — the only check that
 * measures whether the *data* came back — would have reported a failure on a
 * perfectly good restore.
 *
 * So this file asserts the census list against the generated database types:
 * every table it names must actually exist. A list of table names is exactly
 * the kind of thing that is true when written and quietly false later, and
 * `database.types.ts` is regenerated whenever the schema moves.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COUNTED_TABLES, NOT_COVERED } from "../../../scripts/backup-shared.mjs";

const REPO = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const TYPES = read("src/lib/supabase/database.types.ts");
const DRILL = read("scripts/phase-2h-restore-drill.mjs");
const CENSUS = read("scripts/backup-census.mjs");
const BACKUP = read("scripts/backup-database.mjs");
const VERIFY = read("scripts/verify-backup-artifact.mjs");
const RESTORE = read("scripts/restore-into-disposable.mjs");

/**
 * Table names from the generated `Tables` block of `database.types.ts`.
 *
 * Read from the generated types rather than from the migrations, because the
 * types are what a schema change is obliged to regenerate — so a table renamed
 * in a migration and not reflected here would already be failing other guards.
 */
const SCHEMA_TABLES = (() => {
  // Anchored to the `public:` schema specifically. A non-greedy `Tables:` match
  // finds the `graphql_public` block first, which holds no product table — and
  // an empty set makes the phantom check pass by matching nothing, which is the
  // exact shape of the bug this file exists to catch. The non-vacuity test
  // below is what caught that while this guard was being written.
  const block = /\n {2}public: \{\n {4}Tables: \{([\s\S]*?)\n {4}\}\n {4}Views:/.exec(TYPES)?.[1] ?? "";
  return new Set([...block.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{/gm)].map((match) => match[1]));
})();

describe("BACKUP-CENSUS: every censused table exists", () => {
  it("reads a non-trivial table list out of the generated types", () => {
    // Non-vacuity. An empty set would make the assertion below pass by matching
    // nothing, which is the shape of the bug it exists to catch.
    expect(SCHEMA_TABLES.size).toBeGreaterThan(30);
    expect(SCHEMA_TABLES.has("entries")).toBe(true);
  });

  it("names only tables that are actually in the schema", () => {
    const phantom = COUNTED_TABLES.filter((table: string) => !SCHEMA_TABLES.has(table));
    expect(
      phantom,
      `the census counts tables that do not exist: ${phantom.join(", ")}. `
        + "This is the `public.entities` defect: a drill run against a good restore would "
        + "report a failure on a table that was never there.",
    ).toEqual([]);
  });

  it("still names `entities` nowhere, since that was the phantom", () => {
    expect(COUNTED_TABLES).not.toContain("entities");
    expect(SCHEMA_TABLES.has("entities")).toBe(false);
  });

  it("counts user content and operational tables both", () => {
    // A restore that recovered every entry and no audit trail is a partial
    // recovery that reads as a complete one.
    for (const table of ["entries", "tasks", "memories"]) {
      expect(COUNTED_TABLES, `user-content table ${table} is not censused`).toContain(table);
    }
    for (const table of ["audit_logs", "ai_usage_events", "product_events"]) {
      expect(COUNTED_TABLES, `operational table ${table} is not censused`).toContain(table);
    }
    // The entity graph, which is what replaced the phantom.
    for (const table of ["people", "organizations", "projects", "contexts"]) {
      expect(COUNTED_TABLES, `entity table ${table} is not censused`).toContain(table);
    }
  });
});

describe("BACKUP-CENSUS: there is exactly one list", () => {
  it("the drill imports the shared list instead of re-declaring one", () => {
    // A census measured over one list and compared against another cannot fail
    // for the reason it exists. Two copies is how the phantom survived.
    expect(DRILL).toContain('from "./backup-shared.mjs"');
    expect(DRILL).toContain("const COUNTED_TABLES = SHARED_COUNTED_TABLES");
    expect(
      /const COUNTED_TABLES = \[/.test(DRILL),
      "the drill declares its own COUNTED_TABLES array again",
    ).toBe(false);
  });

  it("the census script imports it too", () => {
    expect(CENSUS).toContain('from "./backup-shared.mjs"');
    expect(CENSUS).toContain("COUNTED_TABLES");
  });
});

describe("BACKUP: the secret boundary", () => {
  it("the connection string is read from the environment, never from argv", () => {
    // An argument lands in shell history and in a process listing. The Supabase
    // CLI's own `db dump --dry-run` prints a live PGPASSWORD to stdout, which is
    // how this hazard was found rather than imagined.
    expect(BACKUP).toContain("process.env.SUPABASE_DB_URL");
    expect(RESTORE).toContain("process.env.RESTORE_DB_URL");
    expect(/flag\("--db-url"\)|flag\("--password"\)/.test(BACKUP)).toBe(false);
    expect(/flag\("--db-url"\)|flag\("--password"\)/.test(RESTORE)).toBe(false);
  });

  it("every script that can print an error redacts it first", () => {
    for (const [name, source] of [
      ["backup-database.mjs", BACKUP],
      ["verify-backup-artifact.mjs", VERIFY],
      ["restore-into-disposable.mjs", RESTORE],
    ] as const) {
      expect(source, `${name} does not import redact()`).toContain("redact");
    }
  });

  it("no backup script contains a literal credential", () => {
    for (const source of [BACKUP, VERIFY, RESTORE, CENSUS]) {
      expect(/postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@/.test(source)).toBe(false);
    }
  });
});

describe("BACKUP: the destination and encryption rules", () => {
  it("refuses a destination inside this repository", () => {
    // A dump holds every row of every user's content. One inside the working
    // tree is one `git add -A` away from being published forever.
    expect(BACKUP).toContain("is inside this repository");
    expect(BACKUP).toContain("REPO_DIR");
  });

  it("encrypts by default and makes plaintext an explicit, recorded choice", () => {
    expect(BACKUP).toContain("aes-256-gcm");
    expect(BACKUP).toContain("--plaintext-i-accept-the-risk");
    // The manifest must say so, or a later reader cannot tell.
    expect(BACKUP).toContain("encrypted: !plaintext");
  });

  it("checksums the plaintext rather than the ciphertext", () => {
    // Checksumming the ciphertext proves the file survived, not the content.
    expect(BACKUP).toContain("sha256Plaintext");
    expect(VERIFY).toContain("sha256Plaintext");
  });

  it("removes partial artifacts when a dump fails", () => {
    // A backup that half-exists is worse than none, because it looks like one.
    expect(BACKUP).toContain("Removed");
    expect(BACKUP).toContain("No manifest was written");
  });
});

describe("RESTORE: the refusals, all three", () => {
  it("refuses the linked production ref as a target", () => {
    expect(RESTORE).toContain("supabase/.temp/project-ref");
    expect(RESTORE).toContain("LINKED PRODUCTION PROJECT");
  });

  it("refuses a connection string that names production, whatever --target says", () => {
    // The check --target cannot make: a disposable ref alongside a production
    // URL passes the ref check and destroys the project. The writes follow the
    // connection string, not the flag.
    expect(RESTORE).toContain("restoreUrl.includes(PRODUCTION_REF)");
    expect(RESTORE).toContain("restoreUrl.includes(target)");
  });

  it("refuses a target that already holds user content", () => {
    expect(RESTORE).toContain("already holds");
    expect(RESTORE).toContain("targetPopulated");
  });

  it("offers no override flag for any of them", () => {
    expect(RESTORE).toContain("There is no flag that overrides this refusal, by design.");
    expect(/--force|--i-know-what|--allow-production/.test(RESTORE)).toBe(false);
  });

  it("verifies the artifact's checksum before writing anything", () => {
    // Restoring an artifact that does not match its manifest is how a corrupt
    // backup becomes a corrupt restore that looks successful.
    expect(RESTORE).toContain("Refusing to restore an artifact that does not match its manifest");
  });

  it("does not grade its own restore", () => {
    // The thing that performs a restore should not be the thing that says it
    // worked. The drill is a separate script and is printed, not invoked.
    expect(RESTORE).toContain("phase-2h-restore-drill.mjs");
    expect(/execFileSync\([^)]*phase-2h-restore-drill/.test(RESTORE)).toBe(false);
  });

  it("tells the operator to relink production afterwards", () => {
    // Every refusal in this toolchain reads supabase/.temp/project-ref to decide
    // what production is. Leaving it pointed at the disposable project disarms
    // them all.
    expect(RESTORE).toContain("RELINK");
  });
});

describe("BACKUP: the limitations travel with the artifact", () => {
  it("names Storage, hosted Auth config, and the BYOK master key as uncovered", () => {
    const joined = NOT_COVERED.join("\n");
    expect(joined).toMatch(/Storage objects/);
    expect(joined).toMatch(/disable_signup|hosted Auth/i);
    expect(joined).toMatch(/BYOK_MASTER_KEY/);
    expect(joined).toMatch(/unreadable ciphertext/i);
  });

  it("the manifest and the census both carry them", () => {
    expect(BACKUP).toContain("notCovered: NOT_COVERED");
    expect(CENSUS).toContain("notCovered");
  });

  it("verification says out loud that it does not prove restorability", () => {
    // The single most dangerous thing this toolchain could imply.
    expect(VERIFY).toContain("This does NOT prove it restores");
  });
});
