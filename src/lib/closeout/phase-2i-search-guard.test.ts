/**
 * `2I-SEARCH-004`, `2I-SEARCH-010`, `2I-SEARCH-011` — the structural boundary
 * around global search.
 *
 * ## T-2I-01, and the way it actually goes wrong
 *
 * Search is the first surface in this product that takes an arbitrary string
 * and queries seven tables. The obvious failure — a missing `WHERE user_id` —
 * is already covered by forced RLS. **The realistic failure is a service-role
 * client introduced "for performance"**, which bypasses RLS entirely and turns
 * a correct predicate into the only thing standing between accounts.
 *
 * So the first assertion below is not "the query is owner-scoped" but "**no
 * file in this feature can construct a client that ignores RLS**".
 *
 * ## ADR-055
 *
 * Expires 2026-10-27 and is the owner's to resolve. Lexical search must not
 * quietly satisfy it, so this guard asserts the feature references no embedding
 * column, no vector operator and no similarity function.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_SENSITIVITY, DOMAIN_SPECS, SEARCH_DOMAINS } from "../../features/search/contracts";

const REPO = process.cwd();
const SEARCH_DIR = join(REPO, "src/features/search");

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** Comments and literals stripped — headers name the forbidden constructs. */
function executable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');
}

const SEARCH_FILES = filesUnder(SEARCH_DIR);
const ACTIONS = readFileSync(join(SEARCH_DIR, "actions.ts"), "utf8");

describe("2I-SEARCH: the guard has something to read", () => {
  it("finds the feature", () => {
    expect(SEARCH_FILES.length).toBeGreaterThanOrEqual(3);
    const names = SEARCH_FILES.map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(names).toContain("src/features/search/actions.ts");
    expect(names).toContain("src/features/search/contracts.ts");
  });
});

describe("T-2I-01 / 2I-SEARCH-004: ownership is RLS, and nothing may bypass it", () => {
  it("constructs no service-role client anywhere in the feature", () => {
    // The realistic failure mode, and the one RLS cannot save you from.
    const offenders = SEARCH_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /SERVICE_ROLE|serviceRole|createServiceRoleClient|SUPABASE_SECRET/i.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(
      offenders,
      `search files reaching for a service-role client: ${offenders.join(", ")}. `
        + "A service-role search bypasses forced RLS and makes the predicate the only boundary.",
    ).toEqual([]);
  });

  it("uses the request-scoped authenticated server client", () => {
    expect(ACTIONS).toContain('from "@/lib/supabase/server"');
    expect(ACTIONS).toContain("await createClient()");
  });

  it("resolves the user and fails closed when there is none", () => {
    expect(ACTIONS).toContain("supabase.auth.getUser()");
    // The unauthenticated shape must equal the no-match shape, or an
    // unauthenticated probe learns something.
    expect(ACTIONS).toMatch(/if \(!user\)/);
  });

  it("calls no RPC — search is a read over tables under RLS", () => {
    const offenders = SEARCH_FILES.filter((path) => /\.rpc\(/.test(executable(readFileSync(path, "utf8"))))
      .map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("performs no write of any kind", () => {
    const offenders = SEARCH_FILES.filter((path) => {
      const code = executable(readFileSync(path, "utf8"));
      return /\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(code);
    }).map((path) => relative(REPO, path).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});

describe("OD-1: the exclusion is a predicate, and the default cannot drift", () => {
  it("keeps highly_sensitive out of the default scope constant", () => {
    expect(DEFAULT_SENSITIVITY).not.toContain("highly_sensitive");
  });

  it("applies the sensitivity filter inside the query", () => {
    // `.in("sensitivity", levels)` — so an excluded row is never retrieved.
    // Retrieving then hiding would put the excluded content in a response the
    // client could inspect.
    expect(ACTIONS).toContain('builder.in("sensitivity"');
  });

  it("never counts or reports what it excluded", () => {
    const code = executable(ACTIONS);
    for (const leak of ["hiddenCount", "excludedCount", "sensitiveCount", "hasHidden", "omitted"]) {
      expect(code, `the response exposes ${leak}, which is an existence oracle`).not.toContain(leak);
    }
  });

  it("declares sensitivity for exactly the domains whose tables carry it", () => {
    const withSensitivity = SEARCH_DOMAINS.filter((domain) => DOMAIN_SPECS[domain].hasSensitivity);
    expect([...withSensitivity].sort()).toEqual(["entries", "files", "memories"]);
  });
});

describe("2I-SEARCH-007: a failed domain is named, never swallowed", () => {
  it("settles every domain independently", () => {
    expect(ACTIONS).toContain("Promise.allSettled");
    expect(ACTIONS).toMatch(/status: "failed"/);
  });

  it("reports partial rather than pretending completeness", () => {
    expect(ACTIONS).toContain("partial:");
  });
});

describe("2I-SEARCH-010: ADR-055 is not touched", () => {
  it("references no embedding column, vector operator or similarity function", () => {
    const forbidden = [
      "embedding",
      "entry_embeddings",
      "match_documents",
      "cosine",
      "<=>",
      "pgvector",
      "similarity(",
    ];
    for (const path of SEARCH_FILES) {
      const code = executable(readFileSync(path, "utf8"));
      for (const token of forbidden) {
        expect(
          code.includes(token),
          `${relative(REPO, path)} references ${token} — ADR-055 is the owner's decision and expires 2026-10-27`,
        ).toBe(false);
      }
    }
  });

  it("generates no answer from results", () => {
    // Search returns records. It never composes prose about them.
    for (const path of SEARCH_FILES) {
      const code = executable(readFileSync(path, "utf8"));
      expect(/openai|answerFromKnowledge|completions|chat\.complete/i.test(code)).toBe(false);
    }
  });
});

describe("2I-SEARCH-011 / 2I-METRIC-004: no content can reach telemetry", () => {
  it("buckets the result count rather than reporting it", () => {
    const surface = readFileSync(join(SEARCH_DIR, "search-surface.tsx"), "utf8");
    expect(surface).toContain("function bucket(");
    expect(surface).toContain("resultBucket");
  });

  it("never passes the query into the telemetry payload", () => {
    const surface = executable(readFileSync(join(SEARCH_DIR, "search-surface.tsx"), "utf8"));
    // The onSearched payload is constructed in one place; assert the fields it
    // carries are the closed, content-free set.
    const payload = /onSearched\?\.\(\{([\s\S]*?)\}\)/.exec(surface)?.[1] ?? "";
    expect(payload.length, "could not locate the telemetry payload").toBeGreaterThan(10);
    for (const token of ["query", "title", "snippet", "name", "content"]) {
      expect(payload.includes(token), `telemetry payload carries ${token}`).toBe(false);
    }
  });
});

describe("2I-SEARCH: copy exists in both locales and adds no ternary", () => {
  it("adds no inline locale ternary", () => {
    for (const path of SEARCH_FILES) {
      const code = executable(readFileSync(path, "utf8"));
      expect(/\bpt \?/.test(code), `${relative(REPO, path)} uses an inline locale ternary`).toBe(false);
    }
  });
});
