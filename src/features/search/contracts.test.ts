/**
 * `2I-SEARCH` contract behaviour — the parts that are pure and therefore
 * cheaply provable.
 *
 * OD-1's exclusion and the PostgREST escaping are here rather than in an
 * integration test because they are *decisions expressed as data*, and a unit
 * test is the only place that can assert a decision rather than an outcome.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SENSITIVITY,
  DOMAIN_SPECS,
  PER_DOMAIN_LIMIT,
  SEARCH_DOMAINS,
  SENSITIVE_SCOPE_SENSITIVITY,
  SNIPPET_LENGTH,
  TOTAL_LIMIT,
  buildOrFilter,
  buildSnippet,
  periodSince,
} from "./contracts";
import { getSearchCopy } from "./copy";

describe("OD-1: highly_sensitive is excluded by default", () => {
  it("omits highly_sensitive from the default scope", () => {
    expect(DEFAULT_SENSITIVITY).toEqual(["normal", "private"]);
    expect(DEFAULT_SENSITIVITY).not.toContain("highly_sensitive");
  });

  it("includes it only under the explicit sensitive scope", () => {
    // The control: without this, "the default excludes it" would be satisfied
    // by a product that can never search it at all.
    expect(SENSITIVE_SCOPE_SENSITIVITY).toContain("highly_sensitive");
    expect(SENSITIVE_SCOPE_SENSITIVITY).toContain("normal");
    expect(SENSITIVE_SCOPE_SENSITIVITY).toContain("private");
  });

  it("applies to every domain that carries the classification", () => {
    // entries, memories and attachments carry `sensitivity`. If one were
    // mis-declared as false, its highly_sensitive rows would appear by default.
    expect(DOMAIN_SPECS.entries.hasSensitivity).toBe(true);
    expect(DOMAIN_SPECS.memories.hasSensitivity).toBe(true);
    expect(DOMAIN_SPECS.files.hasSensitivity).toBe(true);
    // And the four that do not carry it are marked so, rather than being
    // filtered against a column they lack.
    expect(DOMAIN_SPECS.tasks.hasSensitivity).toBe(false);
    expect(DOMAIN_SPECS.people.hasSensitivity).toBe(false);
    expect(DOMAIN_SPECS.projects.hasSensitivity).toBe(false);
    expect(DOMAIN_SPECS.organizations.hasSensitivity).toBe(false);
  });
});

describe("OD-2: extracted_text is searchable, and bounded", () => {
  it("searches inside file content", () => {
    expect(DOMAIN_SPECS.files.columns).toContain("extracted_text");
    expect(DOMAIN_SPECS.files.columns).toContain("original_name");
  });

  it("bounds the snippet and flattens whitespace", () => {
    const long = `${"a ".repeat(400)}needle ${"b ".repeat(400)}`;
    const snippet = buildSnippet(long, "needle");
    expect(snippet).not.toBeNull();
    expect(snippet!.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 2);
    expect(snippet).toContain("needle");
    // No newlines: a result row must not be inflatable to push others away.
    expect(snippet).not.toMatch(/\n/);
  });

  it("returns plain text, never markup", () => {
    const hostile = "<script>alert(1)</script> needle <img src=x onerror=y>";
    const snippet = buildSnippet(hostile, "needle");
    // The snippet is a STRING. It is rendered as text by the component; this
    // asserts the contract does not attempt to interpret or strip-and-trust.
    expect(typeof snippet).toBe("string");
    expect(snippet).toContain("needle");
  });

  it("centres the snippet on the match rather than always taking the head", () => {
    const text = `${"x ".repeat(300)}findme`;
    const snippet = buildSnippet(text, "findme");
    expect(snippet).toContain("findme");
    expect(snippet!.startsWith("…")).toBe(true);
  });
});

describe("2I-SEARCH-004: the filter cannot change the query's structure", () => {
  it("escapes PostgREST separators in the needle", () => {
    // Commas and parentheses are PostgREST's own separators. Unescaped, a query
    // containing them changes the filter's SHAPE rather than its value.
    const filter = buildOrFilter(DOMAIN_SPECS.people, "a,b(c)");
    expect(filter).toContain("\\,");
    expect(filter).toContain("\\(");
    expect(filter).toContain("\\)");
  });

  it("covers every declared column for the domain", () => {
    const filter = buildOrFilter(DOMAIN_SPECS.files, "term");
    for (const column of DOMAIN_SPECS.files.columns) {
      expect(filter).toContain(`${column}.ilike.`);
    }
  });

  it("escapes wildcards so a user cannot widen their own query accidentally", () => {
    const filter = buildOrFilter(DOMAIN_SPECS.tasks, "100%");
    expect(filter).toContain("\\%");
  });
});

describe("2I-SEARCH-001: the domain map matches the product vocabulary", () => {
  it("covers seven domains", () => {
    expect(SEARCH_DOMAINS).toHaveLength(7);
    expect(Object.keys(DOMAIN_SPECS).sort()).toEqual([...SEARCH_DOMAINS].sort());
  });

  it("maps Companies to the organizations table and Files to attachments", () => {
    // The two facts a planning pass would otherwise re-derive incorrectly.
    expect(DOMAIN_SPECS.organizations.table).toBe("organizations");
    expect(DOMAIN_SPECS.files.table).toBe("attachments");
    expect(DOMAIN_SPECS.files.route).toBe("files");
  });

  it("labels them in product words, in both locales", () => {
    expect(getSearchCopy("pt-BR").domains.organizations).toBe("Empresa");
    expect(getSearchCopy("en").domains.organizations).toBe("Company");
    expect(getSearchCopy("pt-BR").domains.files).toBe("Arquivo");
  });

  it("never leaks a schema name into the copy", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const labels = Object.values(getSearchCopy(locale).domains);
      expect(labels).not.toContain("organizations");
      expect(labels).not.toContain("attachments");
    }
  });
});

describe("2I-SEARCH-006: results are bounded", () => {
  it("declares a per-domain and a total bound", () => {
    expect(PER_DOMAIN_LIMIT).toBeGreaterThan(0);
    expect(TOTAL_LIMIT).toBeGreaterThan(PER_DOMAIN_LIMIT);
    // Seven domains at the per-domain bound must be able to exceed the total,
    // or the total bound could never fire and would be decorative.
    expect(PER_DOMAIN_LIMIT * SEARCH_DOMAINS.length).toBeGreaterThan(TOTAL_LIMIT);
  });
});

describe("2I-SEARCH-003: the period filter", () => {
  it("returns null for no period", () => {
    expect(periodSince(null, new Date())).toBeNull();
  });

  it("computes a bound in the past for each option", () => {
    const now = new Date("2026-08-07T12:00:00Z");
    for (const period of ["7d", "30d", "12m"] as const) {
      const since = periodSince(period, now);
      expect(since).not.toBeNull();
      expect(new Date(since!).getTime()).toBeLessThan(now.getTime());
    }
    expect(new Date(periodSince("7d", now)!).getTime()).toBeGreaterThan(
      new Date(periodSince("30d", now)!).getTime(),
    );
  });
});

describe("2I-SEARCH-010: no vector retrieval anywhere in the contract", () => {
  it("names no embedding column", () => {
    const serialised = JSON.stringify(DOMAIN_SPECS);
    expect(serialised).not.toContain("embedding");
    expect(serialised).not.toContain("entry_embeddings");
  });
});
