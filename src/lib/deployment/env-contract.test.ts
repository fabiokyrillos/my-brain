/**
 * `2H-DEPLOY-002` — the environment and secret contract, checked rather than
 * asserted.
 *
 * The defect this exists to make impossible has no error message: renaming a
 * server secret to `NEXT_PUBLIC_*` inlines it into the browser bundle at build
 * time and the build stays green. Nothing else in the pipeline notices, and the
 * key is public from the first page load.
 *
 * So every check below reads the repository, not the document.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEPLOYED_EDGE_FUNCTIONS,
  ENV_CONTRACT,
  forbidsPublicTwin,
  mustNeverBePublic,
} from "./env-contract";

const REPO = process.cwd();

/** Everything the guard reads. Deliberately excludes docs: prose may quote a
 * variable name in a sentence about the rule, and a guard that failed on its
 * own documentation would teach people to stop documenting. */
const SCANNED_ROOTS = ["src", "scripts", "supabase/functions", "e2e"];
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

function walk(directory: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = SCANNED_ROOTS.flatMap((root) => walk(join(REPO, root))).map((path) => ({
  path: relative(REPO, path).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

/**
 * Every `NEXT_PUBLIC_*` name the code actually reads FROM THE ENVIRONMENT.
 *
 * Both accessor forms, and only those forms.
 */
function publicEnvReads(): Set<string> {
  const found = new Set<string>();
  for (const source of OTHER_SOURCES) {
    for (const match of source.text.matchAll(
      /process\.env(?:\.(NEXT_PUBLIC_[A-Z0-9_]+)|\["(NEXT_PUBLIC_[A-Z0-9_]+)"\])/g,
    )) {
      const name = match[1] ?? match[2];
      if (name) found.add(name);
    }
  }
  return found;
}

/** This file names every declared variable by definition; it is not evidence. */
const OTHER_SOURCES = SOURCES.filter(
  (source) =>
    !source.path.endsWith("src/lib/deployment/env-contract.ts") &&
    !source.path.endsWith("src/lib/deployment/env-contract.test.ts"),
);

describe("2H-DEPLOY-002: the contract is well formed", () => {
  it("declares each variable exactly once", () => {
    const names = ENV_CONTRACT.map((variable) => variable.name);
    expect(new Set(names).size, `duplicate declaration in the contract: ${names.join(", ")}`).toBe(
      names.length,
    );
  });

  it("gives every variable a surface, a consumer and a note", () => {
    for (const variable of ENV_CONTRACT) {
      expect(variable.consumers.length, `${variable.name} names no consumer`).toBeGreaterThan(0);
      expect(variable.note.length, `${variable.name} has no note`).toBeGreaterThan(20);
    }
  });

  it("is non-empty -- an empty contract would pass every check below", () => {
    // The control that stops this file from becoming a suite that proves
    // nothing. Every cross-check iterates the contract; a broken import or an
    // emptied array would make all of them vacuously green.
    expect(ENV_CONTRACT.length).toBeGreaterThan(15);
    expect(SOURCES.length, "the source scan found no files").toBeGreaterThan(100);
  });
});

describe("2H-DEPLOY-002: a secret-class variable is never NEXT_PUBLIC", () => {
  it("no SECRET variable has a NEXT_PUBLIC_ twin anywhere, declared or not", () => {
    // The whole point. `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` compiles, builds,
    // deploys and ships the key to every visitor, with no error at any stage.
    const offenders: string[] = [];
    for (const variable of ENV_CONTRACT.filter(forbidsPublicTwin)) {
      const forbidden = `NEXT_PUBLIC_${variable.name}`;
      for (const source of OTHER_SOURCES) {
        if (source.text.includes(forbidden)) offenders.push(`${forbidden} in ${source.path}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("a non-public non-secret variable's public twin must itself be declared", () => {
    // `SUPABASE_URL` (edge-config) legitimately has `NEXT_PUBLIC_SUPABASE_URL`
    // as a separately declared public twin: the same project URL under the name
    // the browser build needs. What is forbidden is an UNDECLARED twin — a
    // public name nobody reviewed, appearing because somebody needed the value
    // client-side and reached for the prefix.
    const declared = new Set(
      ENV_CONTRACT.filter((variable) => variable.surface === "public").map((v) => v.name),
    );
    const offenders: string[] = [];
    for (const variable of ENV_CONTRACT.filter(
      (candidate) => mustNeverBePublic(candidate) && !forbidsPublicTwin(candidate),
    )) {
      const twin = `NEXT_PUBLIC_${variable.name}`;
      if (declared.has(twin)) continue;
      for (const source of OTHER_SOURCES) {
        if (source.text.includes(twin)) offenders.push(`${twin} in ${source.path}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every NEXT_PUBLIC_ name the code reads is declared public in the contract", () => {
    // The other direction: a public variable nobody classified is a variable
    // nobody decided was safe to publish.
    //
    // Matched on the ENVIRONMENT READ, not on the bare identifier. The looser
    // form flagged `NEXT_PUBLIC_SUPABASE_KEY`, which is not an environment
    // variable at all — it is the name `parsePublicEnv` gives the value it
    // returns after accepting either of the two real names. Declaring it to
    // silence the check would have put a variable in the contract that nothing
    // ever sets.
    const found = publicEnvReads();
    // Non-vacuity: a regex that matched nothing would make this pass forever.
    expect(found.size, "the NEXT_PUBLIC scan matched no environment read").toBeGreaterThan(2);

    const declaredPublic = new Set(
      ENV_CONTRACT.filter((variable) => variable.surface === "public").map((v) => v.name),
    );
    const undeclared = [...found].filter((name) => !declaredPublic.has(name)).sort();
    expect(undeclared, `undeclared NEXT_PUBLIC variables: ${undeclared.join(", ")}`).toEqual([]);
  });
});

describe("2H-DEPLOY-002: the Edge Functions' requirements are declared", () => {
  /**
   * Comments are stripped before the scan, and that is not tidiness.
   *
   * `process-jobs/index.ts` carries the line "What used to be here was
   * `Deno.env.get(\"OPENAI_API_KEY\")` and a 503 when it…" — a comment recording
   * a variable BYOK deliberately removed. A scan that read it would report the
   * function requires a key that must never exist again, and the fix would have
   * been to re-declare the name the BYOK guard exists to forbid. Suspect the
   * probe before the product.
   */
  function code(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it("every Deno.env.get in a deployed entrypoint is in the contract", () => {
    const declared = new Set(ENV_CONTRACT.map((variable) => variable.name));
    const missing: string[] = [];
    for (const fn of DEPLOYED_EDGE_FUNCTIONS) {
      const sources = SOURCES.filter((source) => source.path.startsWith(`supabase/functions/${fn}/`));
      expect(sources.length, `no source found for the ${fn} function`).toBeGreaterThan(0);
      for (const source of sources) {
        for (const [, name] of code(source.text).matchAll(/Deno\.env\.get\("([A-Z0-9_]+)"\)/g)) {
          if (!declared.has(name)) missing.push(`${name} (read by ${source.path})`);
        }
      }
    }
    expect(missing, `Edge variables absent from the contract: ${missing.join(", ")}`).toEqual([]);
  });

  it("the Edge scan finds real reads -- it is not silently matching nothing", () => {
    // Without this the check above passes on an empty set: a broken regex, a
    // renamed API, or a comment-stripper that ate the whole file all read as
    // "no undeclared variables".
    const found = new Set<string>();
    for (const fn of DEPLOYED_EDGE_FUNCTIONS) {
      for (const source of SOURCES.filter((s) => s.path.startsWith(`supabase/functions/${fn}/`))) {
        for (const [, name] of code(source.text).matchAll(/Deno\.env\.get\("([A-Z0-9_]+)"\)/g)) {
          found.add(name);
        }
      }
    }
    expect(found.size, "the Edge env scan matched nothing at all").toBeGreaterThan(3);
    expect([...found]).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("no deployed Edge Function reads a project-wide provider key", () => {
    // The BYOK invariant, repeated at this boundary rather than assumed from
    // the other guard: this contract must never become the place the name comes
    // back through.
    for (const fn of DEPLOYED_EDGE_FUNCTIONS) {
      for (const source of SOURCES.filter((s) => s.path.startsWith(`supabase/functions/${fn}/`))) {
        expect(
          code(source.text),
          `${source.path} reads a process-wide provider key`,
        ).not.toMatch(/Deno\.env\.get\("[A-Z_]*OPENAI[A-Z_]*(?:KEY|SECRET)"\)/);
      }
    }
  });

  it("names an Edge consumer for every variable classified as an Edge surface", () => {
    for (const variable of ENV_CONTRACT.filter(
      (candidate) => candidate.surface === "edge-secret" || candidate.surface === "edge-config",
    )) {
      const namesAFunction = variable.consumers.some((consumer) =>
        /process-jobs|delete-account|heartbeat/.test(consumer),
      );
      expect(namesAFunction, `${variable.name} is an Edge surface with no Edge consumer`).toBe(true);
    }
  });
});

describe("2H-DEPLOY-002: .env.example and the contract agree", () => {
  const EXAMPLE = readFileSync(join(REPO, ".env.example"), "utf8");
  const exampleNames = new Set(
    [...EXAMPLE.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{3,})\s*=/gm)].map((match) => match[1]),
  );

  it("the example file is readable and non-trivial", () => {
    expect(exampleNames.size).toBeGreaterThan(8);
  });

  it("every variable .env.example names is declared in the contract", () => {
    const declared = new Set(ENV_CONTRACT.map((variable) => variable.name));
    const undeclared = [...exampleNames].filter((name) => !declared.has(name)).sort();
    expect(undeclared, `in .env.example but not in the contract: ${undeclared.join(", ")}`).toEqual(
      [],
    );
  });

  it("every REQUIRED server or public variable appears in .env.example", () => {
    // A required variable missing from the file a new contributor copies is a
    // deploy that fails at runtime for a reason nothing wrote down.
    const shouldBeThere = ENV_CONTRACT.filter(
      (variable) =>
        variable.required && (variable.surface === "server" || variable.surface === "public"),
    );
    const missing = shouldBeThere
      .filter((variable) => !exampleNames.has(variable.name))
      .map((variable) => variable.name)
      .sort();
    expect(missing, `required but absent from .env.example: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("2H-DEPLOY-002: the example file itself holds no secret", () => {
  it("no line in .env.example carries a value that looks like a real key", () => {
    // A template with a real value in it is the same leak by a slower route.
    const EXAMPLE = readFileSync(join(REPO, ".env.example"), "utf8");
    const suspicious = EXAMPLE.split("\n").filter((line) => {
      const value = line.split("=").slice(1).join("=").trim();
      if (!value || line.trim().startsWith("#")) return false;
      return /^(sk-|eyJ|sbp_)/.test(value) || (value.length > 40 && !value.includes(" "));
    });
    expect(suspicious, `.env.example appears to contain real values:\n${suspicious.join("\n")}`)
      .toEqual([]);
  });
});

describe("2H-DEPLOY-002: the check itself can fail", () => {
  // Mutation controls. A guard nobody has seen fail is a guard nobody has
  // tested — the lesson an always-passing CAPTCHA test key already taught this
  // repository once.
  it("detects a secret renamed to NEXT_PUBLIC", () => {
    const fixture = [{ path: "src/fake.ts", text: "const k = process.env.NEXT_PUBLIC_BYOK_MASTER_KEY;" }];
    const offenders = ENV_CONTRACT.filter(forbidsPublicTwin).flatMap((variable) =>
      fixture
        .filter((source) => source.text.includes(`NEXT_PUBLIC_${variable.name}`))
        .map((source) => `${variable.name} in ${source.path}`),
    );
    expect(offenders).toEqual(["BYOK_MASTER_KEY in src/fake.ts"]);
  });

  it("the secret classification is not vacuous", () => {
    // If every variable were marked secret:false the check above would pass on
    // an empty set forever. A control must be subject to the mechanism it
    // controls — the lesson an always-passing CAPTCHA test key already taught.
    const secrets = ENV_CONTRACT.filter(forbidsPublicTwin).map((variable) => variable.name);
    expect(secrets.length, "no variable is classified secret").toBeGreaterThan(8);
    for (const name of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "BYOK_MASTER_KEY",
      "BYOK_FINGERPRINT_PEPPER",
      "WORKER_DISPATCH_SECRET",
      "SUPABASE_ACCESS_TOKEN",
    ]) {
      expect(secrets, `${name} must be classified secret`).toContain(name);
    }
  });

  it("detects an Edge variable that no declaration covers", () => {
    const declared = new Set(ENV_CONTRACT.map((variable) => variable.name));
    const fixture = 'const x = Deno.env.get("UNDECLARED_EDGE_SECRET");';
    const missing = [...fixture.matchAll(/Deno\.env\.get\("([A-Z0-9_]+)"\)/g)]
      .map((match) => match[1])
      .filter((name) => !declared.has(name));
    expect(missing).toEqual(["UNDECLARED_EDGE_SECRET"]);
  });
});

describe("2H-DEPLOY-002: BYOK's constraints survive in the record", () => {
  it("the master key and both peppers are server-only and required", () => {
    for (const name of ["BYOK_MASTER_KEY", "BYOK_FINGERPRINT_PEPPER", "BYOK_RATE_LIMIT_PEPPER"]) {
      const variable = ENV_CONTRACT.find((candidate) => candidate.name === name);
      expect(variable, `${name} must be declared`).toBeDefined();
      expect(variable!.surface, `${name} must be server-only`).toBe("server");
      expect(variable!.required, `${name} must be required`).toBe(true);
    }
  });

  it("the master key's note names the runtime-parity check", () => {
    // The BYOK cutover failed once because the application held a different
    // key than the envelopes were sealed with, and nothing said so at boot.
    const master = ENV_CONTRACT.find((variable) => variable.name === "BYOK_MASTER_KEY")!;
    expect(master.note).toMatch(/byok:verify-runtime/);
  });

  it("the service-role key names every runtime that legitimately holds it", () => {
    const key = ENV_CONTRACT.find((variable) => variable.name === "SUPABASE_SERVICE_ROLE_KEY")!;
    expect(key.surface).toBe("server");
    for (const consumer of ["process-jobs", "delete-account"]) {
      expect(key.consumers.join(" ")).toContain(consumer);
    }
  });
});
