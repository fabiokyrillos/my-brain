import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Secret } from "./secret";

/**
 * `BYOK-GUARD-001`, `002`, `004` and `006` — the guards that stop the fallback
 * coming back.
 *
 * The deletion in `openai-provider.ts` is a fact about today. These are what
 * make it a fact about next year: the failure mode is not somebody deciding to
 * re-add a fallback, it is somebody needing a key at 3am, finding
 * `OPENAI_API_KEY` still in `.env.example`, and wiring it into one path that
 * "just needs to work".
 */

const REPO = path.resolve(__dirname, "../../..");

const SCANNED_ROOTS = ["src", "supabase/functions", "scripts", "e2e", ".github"];
const SKIPPED = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(root: string): string[] {
  const absolute = path.join(REPO, root);
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED.has(entry.name)) continue;
        visit(path.join(directory, entry.name));
        continue;
      }
      found.push(path.relative(REPO, path.join(directory, entry.name)).replace(/\\/g, "/"));
    }
  };
  if (statSync(absolute).isDirectory()) visit(absolute);
  return found;
}

const ALL_FILES = SCANNED_ROOTS.flatMap(walk).sort();

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8").replace(/\r\n/g, "\n");
}

/** Comments stripped: documenting the rule must not violate the rule. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/^\s*#[^\n]*$/gm, "");
}

/**
 * `BYOK-GUARD-006` — the allowlist, pinned to the three classified exceptions of
 * `BYOK-DEC-2` and nothing else. **Adding an entry requires an ADR.**
 *
 * Each of these is a place the project key legitimately survives *because it is
 * not a deployed user path*:
 *
 *   1. local development configuration — a name with an empty value;
 *   2. the remote smoke scripts, which run against a real project under the
 *      developer's own credentials and are not reachable from the product;
 *   3. the tests that assert this very posture.
 *
 * **BYOK.4 removed the fourth.** `supabase/functions/process-jobs/index.ts` read
 * `Deno.env.get("OPENAI_API_KEY")` and was allowlisted with an expiry rather than
 * a justification; the read and the entry were deleted in the same commit,
 * because the test below asserted the read was *present* precisely so that
 * removing it would fail here and force the allowlist to shrink alongside it. An
 * allowlist that outlives its exception is how they grow.
 */
const PROJECT_KEY_ALLOWLIST = [
  ".env.example",
  "src/lib/byok/project-key-guard.test.ts",
  "src/lib/byok/guards.test.ts",
] as const;

function filesReferencing(pattern: RegExp): string[] {
  return ALL_FILES.filter((file) => {
    if (!/\.(ts|tsx|mjs|js|sql|yml|yaml)$/.test(file)) return false;
    return pattern.test(code(read(file)));
  });
}

describe("BYOK-GUARD-001: no deployed Node path can reach the project key", () => {
  it("OPENAI_API_KEY is referenced only inside the pinned allowlist", () => {
    const referencing = filesReferencing(/\bOPENAI_API_KEY\b/);

    // Both directions. An entry that stopped being true is a permission nobody
    // is checking any more, and it fails here just as loudly as a new reader.
    const unexpected = referencing.filter(
      (file) => !(PROJECT_KEY_ALLOWLIST as readonly string[]).includes(file),
    );
    expect(unexpected, "a file reached for the project key without an ADR").toEqual([]);
  });

  it("no module under src/features or src/lib/ai references it at all", () => {
    // The scope the requirement names explicitly, asserted separately so a
    // future allowlist edit cannot quietly re-admit a product path.
    const productPaths = filesReferencing(/\bOPENAI_API_KEY\b/).filter(
      (file) =>
        (file.startsWith("src/features/") || file.startsWith("src/lib/ai/")) &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".test.tsx"),
    );
    expect(productPaths).toEqual([]);
  });

  it("no Deno path reads a process-wide provider key (BYOK-GUARD-001, Deno scope)", () => {
    // Gate D1, from the other direction: not "the allowlist is short" but "the
    // deployed worker sources contain no such read at all", including the 503
    // branch that used to guard it. Both entrypoints and everything they import
    // are covered, because `filesReferencing` walks `supabase/functions`
    // entirely.
    const denoFiles = ALL_FILES.filter((file) => file.startsWith("supabase/functions/"));
    expect(denoFiles.length).toBeGreaterThan(8);

    for (const file of denoFiles) {
      const source = code(read(file));
      expect(source, `${file} must not reach for a process-wide provider key`).not.toMatch(
        /OPENAI_API_KEY/,
      );
      // Any environment name that reads like a **provider** credential, not only
      // the one that was there. Two exclusions are deliberate rather than
      // sloppy, and both were found by this assertion's first two drafts:
      //
      //   * `OPENAI_FILE_MODEL` — a model id is public, costs nothing to know
      //     and creates no path to a provider. `BYOK-GUARD-002` records the same
      //     exception on the Node side for `OPENAI_EXTRACTION_MODEL`;
      //   * `SUPABASE_SERVICE_ROLE_KEY` and `WORKER_DISPATCH_SECRET` — the
      //     worker's own identity and its dispatch authentication. Neither is a
      //     user's provider credential, and removing them would not make the
      //     worker safer, only unable to run.
      //
      // So the pattern names the thing being guarded: an API key.
      expect(source, `${file} must not read a provider credential from the environment`).not.toMatch(
        /Deno\.env\.get\(\s*["'`][A-Z_]*(API_KEY|PROVIDER_KEY)[A-Z_]*["'`]\s*\)/,
      );
    }
  });

  it("every worker provider call is authorized by a resolved Secret", () => {
    // Positively, so a worker that stopped calling the provider entirely would
    // also fail rather than pass vacuously.
    const handlers = ["entry.ts", "attachment.ts"].map(
      (name) => `supabase/functions/process-jobs/${name}`,
    );
    for (const handler of handlers) {
      const source = code(read(handler));
      const authorizations = source.match(/authorization:\s*`Bearer \$\{([^}]+)\}`/g) ?? [];
      expect(authorizations.length, `${handler} must contact the provider`).toBeGreaterThan(0);
      for (const authorization of authorizations) {
        expect(authorization, `${handler} must authorize with an exposed Secret`).toMatch(
          /credential(\.secret)?\.expose\(\)/,
        );
      }
    }
  });

  it("the allowlist contains only files that exist", () => {
    for (const entry of PROJECT_KEY_ALLOWLIST) {
      expect(ALL_FILES.includes(entry) || entry === ".env.example", `${entry} must exist`).toBe(true);
    }
  });
});

describe("BYOK-GUARD-002: the provider cannot be constructed without a credential", () => {
  it("getAIProvider has no environment-reading branch for a key", () => {
    const source = code(read("src/lib/ai/index.ts"));
    expect(source).not.toMatch(/OPENAI_API_KEY/);
    expect(source).toMatch(/credential: Secret/);
  });

  it("OpenAIProvider's constructor reads no key from the environment", () => {
    const source = code(read("src/lib/ai/openai-provider.ts"));

    // The deleted clause, in every spelling it could come back as.
    expect(source).not.toMatch(/process\.env\.OPENAI_API_KEY/);
    expect(source).not.toMatch(/process\.env\[["']OPENAI_API_KEY["']\]/);

    // A fallback to any environment variable whose name looks like a secret.
    // Scoped to `KEY`/`SECRET`/`TOKEN` rather than to `process.env` generally,
    // because the constructor legitimately reads `OPENAI_EXTRACTION_MODEL` and
    // `OPENAI_EMBEDDING_MODEL` — a model id is public, costs nothing to know,
    // and creates no path to a provider. The first draft of this assertion
    // forbade `?? process.env` outright and failed on exactly those two.
    expect(source).not.toMatch(/\?\?\s*process\.env\.\w*(KEY|SECRET|TOKEN)\b/);

    // And positively: the parameter is required, not optional.
    expect(source).toMatch(/constructor\(options:\s*\{\s*apiKey:\s*string/);
    expect(source).not.toMatch(/constructor\(options\?:/);
  });

  it("fails at runtime on an empty credential, not silently", async () => {
    const { OpenAIProvider } = await import("@/lib/ai/openai-provider");
    expect(() => new OpenAIProvider({ apiKey: "" })).toThrow(/credential is required/);
  });

  it("every operation carries an output ceiling (BYOK-QUOTA-003)", async () => {
    const source = code(read("src/lib/ai/openai-provider.ts"));
    // Three provider calls that generate tokens; the embedding call generates
    // none and takes no ceiling, which is why the count is three and not four.
    const ceilings = source.match(/max_output_tokens:/g) ?? [];
    expect(ceilings).toHaveLength(3);
  });
});

describe("BYOK-GUARD-004: no declared result shape can carry key material", () => {
  it("a Secret cannot be serialized into any result", () => {
    // The guard's mechanism, exercised directly: every result in this feature is
    // built with object literals and returned through a Server Action, which
    // serializes. A `Secret` that reached one would throw here rather than ship.
    const secret = new Secret("sk-proj-not-a-real-key-0000000000");
    for (const shape of [
      { status: "success", credential: secret },
      { data: { nested: [secret] } },
      [secret],
    ]) {
      expect(() => JSON.stringify(shape)).toThrow();
    }
  });

  it("the credential read path selects no key material", () => {
    const source = code(read("src/features/byok/credential-view.ts"));
    const select = /\.select\(\s*"([^"]+)"/.exec(source);

    expect(select, "the read path must have exactly one select").not.toBeNull();
    const columns = select![1].split(",").map((column) => column.trim());

    expect(columns).not.toContain("ciphertext");
    expect(columns).not.toContain("iv");
    // Positively, so a select that stopped returning anything useful also fails.
    expect(columns).toContain("fingerprint");
    expect(columns).toContain("status");
  });

  it("every action's declared result type carries only a status and a message", () => {
    // Checked against the **type**, not by pattern-matching returns. The first
    // draft grepped for `return[^;]*ciphertext` and flagged `sealCredential`,
    // which returns database columns and is exactly where a ciphertext belongs.
    // A textual guard could not tell the two apart; the type can.
    const source = code(read("src/features/byok/actions.ts"));

    const declaration = /export type ByokActionState =([\s\S]*?);\n/.exec(source);
    expect(declaration, "ByokActionState must be declared here").not.toBeNull();

    const fields = new Set(
      [...declaration![1].matchAll(/readonly\s+(\w+)\s*:/g)].map((match) => match[1]),
    );
    expect([...fields].sort()).toEqual(["message", "status"]);

    // And every exported action is annotated to return it, so a new action
    // cannot invent a wider result shape without changing this line.
    const actions = [...source.matchAll(/export async function (\w+)\([\s\S]*?\): Promise<(\w+)>/g)];
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const [, name, returnType] of actions) {
      expect(returnType, `${name} must return ByokActionState`).toBe("ByokActionState");
    }
  });

  it("no reveal path exists anywhere in the feature", () => {
    // BYOK-LIFECYCLE-003, asserted as an absence across the whole feature rather
    // than trusted to a component that currently has no button.
    const feature = ALL_FILES.filter((file) => file.startsWith("src/features/byok/"));
    expect(feature.length).toBeGreaterThan(4);

    for (const file of feature) {
      const source = code(read(file));
      expect(source, `${file} must not offer to reveal a key`).not.toMatch(
        /showKey|revealKey|type=["']text["'][^>]*apiKey|unmaskKey/i,
      );
    }
  });
});
