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

/**
 * `BYOK-GUARD-006` — the allowlist is **closed**, and every entry is classified.
 *
 * `BYOK-GUARD-001` above asks "is anything reaching for the key that should not
 * be?". This asks the narrower and harder question: **is every entry that
 * remains still one of the classified exceptions, and can any of them reach a
 * deployed user bundle?** A list that is right today and unexamined tomorrow is
 * the shape the deleted worker entry had.
 *
 * ## A correction to the implementation plan, recorded rather than absorbed
 *
 * Plan task 5.3 names three classified exceptions: local development
 * configuration, mocked or opt-in tests, and `scripts/remote-*.mjs`. Measured
 * against the repository, **the third is empty**: no script under `scripts/`
 * references `OPENAI_API_KEY` at all. `remote-supabase-smoke.mjs` contains the
 * literal `"openai"` only as a provider *name* in a preferences payload, and
 * `byok-crypto-interop.mjs` touches no provider key.
 *
 * So the allowlist has three entries and the plan describes three exceptions,
 * and the *count* agreeing hides that the *composition* does not. The scripts
 * are not an exception that was removed — they were never one. Asserted below in
 * both directions, so a future edit that "restores" a scripts entry to match the
 * plan's prose fails here instead of widening the surface to match a sentence.
 */
describe("BYOK-GUARD-006: the allowlist is closed and every entry is classified", () => {
  /**
   * Each entry, with the classification that justifies it. A new entry must
   * arrive here **with** a classification, which is what makes "adding one
   * requires an ADR" a mechanical fact rather than a convention.
   */
  const CLASSIFIED = {
    ".env.example": "local-development-configuration",
    "src/lib/byok/project-key-guard.test.ts": "opt-in-or-mocked-test",
    "src/lib/byok/guards.test.ts": "opt-in-or-mocked-test",
  } as const;

  it("has exactly three entries, and the classification covers all of them", () => {
    // Both directions, on the exact set — not a subset check. An entry without a
    // classification and a classification without an entry are the same defect:
    // somebody edited one of the two lists and not the other.
    expect([...PROJECT_KEY_ALLOWLIST].sort()).toEqual(Object.keys(CLASSIFIED).sort());
    expect(PROJECT_KEY_ALLOWLIST).toHaveLength(3);
  });

  it("no script is an exception, because none needs to be", () => {
    // The plan's third classified exception, measured. If a script ever does
    // need the project key, this fails and an ADR is the way through — which is
    // exactly the intended friction.
    const scripts = ALL_FILES.filter((file) => file.startsWith("scripts/"));
    expect(scripts.length).toBeGreaterThan(10);

    const reaching = scripts.filter((file) => /\bOPENAI_API_KEY\b/.test(code(read(file))));
    expect(reaching, "a script reached for the project key without an ADR").toEqual([]);
  });

  it("every exception is unreachable from a deployed user bundle", () => {
    // The requirement is not "these files are harmless", it is that they
    // **cannot enter a bundle a user's browser or a deployed server runs**. Each
    // entry is proven unreachable by its own mechanism, and the mechanism is
    // asserted rather than assumed:
    for (const [entry, classification] of Object.entries(CLASSIFIED)) {
      if (classification === "local-development-configuration") {
        // Not a module. `.env.example` is documentation — it is never imported,
        // never resolved by a bundler, and carries no value to leak.
        expect(entry.endsWith(".ts") || entry.endsWith(".tsx")).toBe(false);
        expect(read(entry)).toMatch(/^OPENAI_API_KEY=\s*$/m);
        continue;
      }

      // A test file. `next build` compiles what the app graph imports, and the
      // app graph cannot reach a `*.test.ts` — so the proof is that **nothing
      // outside a test imports it**, asserted across the whole source tree
      // rather than trusted to the extension.
      expect(entry).toMatch(/\.test\.tsx?$/);

      const moduleSpecifier = entry.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
      const bareName = entry.split("/").pop()!.replace(/\.tsx?$/, "");
      const importers = ALL_FILES.filter((file) => {
        if (!/\.(ts|tsx)$/.test(file)) return false;
        if (file === entry) return false;
        const source = code(read(file));
        return (
          source.includes(`"${moduleSpecifier}"`) ||
          source.includes(`'${moduleSpecifier}'`) ||
          new RegExp(`from\\s+["'][^"']*${bareName}["']`).test(source)
        );
      });
      expect(importers, `${entry} is imported by a non-test module`).toEqual([]);
    }
  });

  it("the credential contract has no identity branch, so no account is privileged", () => {
    // Gate E-class, stated as an **absence** rather than as a journey.
    //
    // "The owner is not privileged" is normally proven by configuring the owner
    // and watching them fail without a key — which needs a deployment and a
    // credential no agent may enter. But the stronger property is structural and
    // checkable here: **there is no code that could privilege anybody.** The
    // resolution chain takes an id and uses it to compose an AAD; nothing in it
    // compares that id against a constant, an allowlist or an environment value.
    //
    // A future "just let the owner through while we debug" is exactly the change
    // this fails on.
    const chain = [
      "src/lib/byok/gate.ts",
      "src/lib/byok/adapter.ts",
      "src/lib/ai/index.ts",
      "supabase/functions/_shared/byok-adapter.ts",
    ];

    for (const file of chain) {
      const source = code(read(file));

      // An identity compared against anything that is not the row it came from.
      expect(source, `${file} branches on who the user is`).not.toMatch(
        /\b(isOwner|OWNER_[A-Z_]+|ADMIN_[A-Z_]+|allowlistedUsers?|privilegedUsers?)\b/,
      );
      // An identity read from configuration rather than from the session or the
      // row — the shape a hardcoded owner id would take.
      expect(source, `${file} reads an identity from the environment`).not.toMatch(
        /(process\.env|Deno\.env\.get\()[^\n]*\b(USER|OWNER|ADMIN|ACCOUNT)_?ID\b/i,
      );
      // A uuid literal. There is no legitimate reason for one in this chain, and
      // it is how a "temporary" exemption would actually be written.
      expect(source, `${file} carries a hardcoded account identifier`).not.toMatch(
        /["'`][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["'`]/i,
      );
    }

    // Positively, so a chain that stopped resolving anything would also fail:
    // the gate still resolves, and it still reports the three declared outcomes.
    const gate = code(read("src/lib/byok/gate.ts"));
    expect(gate).toMatch(/resolveOwnCredential\(supabase, userId/);
    expect(gate).toMatch(/reason: resolution\.outcome/);
  });

  it("no deployed runtime reads the project key, in either language", () => {
    // Gate E-class, from the direction that matters after the deployed secret is
    // removed: not "the allowlist is short" but "no code that ships would use
    // the value even if the variable were present". Both runtimes, both
    // spellings, every non-test module under the deployed roots.
    const deployed = ALL_FILES.filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        (file.startsWith("src/") || file.startsWith("supabase/functions/")) &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".test.tsx"),
    );
    expect(deployed.length).toBeGreaterThan(100);

    for (const file of deployed) {
      const source = code(read(file));
      expect(source, `${file} reads the project key`).not.toMatch(/\bOPENAI_API_KEY\b/);
      expect(source, `${file} reads a provider credential from the environment`).not.toMatch(
        /(process\.env|Deno\.env\.get\()\s*[.[(]?\s*["'`]?[A-Z_]*API_KEY/,
      );
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
