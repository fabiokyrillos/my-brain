import { describe, expect, it, vi } from "vitest";

type EntityType = "context" | "organization" | "project" | "person";
type Candidate = {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  aliases?: Array<{ value: string; validFrom?: string | null; validTo?: string | null }>;
  historicalMatches?: number;
  organizationId?: string | null;
  semanticSimilarity?: number;
  validFrom?: string | null;
  validTo?: string | null;
};
type Ranked = Candidate & { score: number; evidence: string[] };
type ResolutionModule = {
  MAX_ENTITY_CANDIDATES?: number;
  normalizeEntityName?: (value: string) => string;
  rankEntityCandidates?: (input: {
    query: string;
    type: EntityType;
    userId: string;
    candidates: Candidate[];
    occurredAt?: string;
    organizationId?: string | null;
    limit?: number;
  }) => { candidates: Ranked[]; margin: number; ambiguous: boolean };
};

const modulePath = `./entity-${"resolution"}.ts`;
const resolution = await vi.importActual<ResolutionModule>(modulePath).catch(() => ({}));
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const person = (id: string, name: string, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  userId,
  type: "person",
  name,
  ...extra,
});

describe("deterministic entity resolution", () => {
  it("normalizes case, whitespace, punctuation, and accents", () => {
    expect(resolution.normalizeEntityName?.("  João-D'Ávila  ")).toBe("joao d avila");
  });

  it("ranks an exact normalized name as an unambiguous candidate", () => {
    const result = resolution.rankEntityCandidates?.({
      query: "João Ávila",
      type: "person",
      userId,
      candidates: [person("a", "Joao Avila"), person("b", "Joana Avila")],
    });
    expect(result?.candidates[0]).toMatchObject({ id: "a" });
    expect(result?.candidates[0]?.evidence).toContain("normalized_exact_name");
    expect(result?.ambiguous).toBe(false);
  });

  it("uses a temporally valid alias and ignores an expired alias", () => {
    const result = resolution.rankEntityCandidates?.({
      query: "Bia",
      type: "person",
      userId,
      occurredAt: "2026-07-17T12:00:00Z",
      candidates: [
        person("valid", "Beatriz", { aliases: [{ value: "Bia", validFrom: "2026-01-01", validTo: "2026-12-31" }] }),
        person("expired", "Bianca", { aliases: [{ value: "Bia", validTo: "2025-12-31" }] }),
      ],
    });
    expect(result?.candidates[0]).toMatchObject({ id: "valid" });
    expect(result?.candidates[0]?.evidence).toContain("exact_alias");
    expect(result?.candidates.find((candidate) => candidate.id === "expired")?.evidence).not.toContain("exact_alias");
  });

  it("combines history, organization context, semantic similarity, and temporal validity", () => {
    const result = resolution.rankEntityCandidates?.({
      query: "Alex",
      type: "person",
      userId,
      organizationId: "org-a",
      occurredAt: "2026-07-17T12:00:00Z",
      candidates: [
        person("contextual", "Alex Silva", { historicalMatches: 5, organizationId: "org-a", semanticSimilarity: 0.9, validFrom: "2026-01-01" }),
        person("other", "Alex Souza", { semanticSimilarity: 0.1 }),
      ],
    });
    expect(result?.candidates[0]).toMatchObject({ id: "contextual" });
    expect(result?.candidates[0]?.evidence).toEqual(expect.arrayContaining([
      "historical_recurrence",
      "organization_context",
      "semantic_similarity",
      "temporal_validity",
    ]));
  });

  it("filters cross-owner records before ranking", () => {
    const result = resolution.rankEntityCandidates?.({
      query: "Marina",
      type: "person",
      userId,
      candidates: [
        person("own", "Marina Costa"),
        { ...person("foreign", "Marina"), userId: otherUserId },
      ],
    });
    expect(result?.candidates.map((candidate) => candidate.id)).toEqual(["own"]);
  });

  it("marks duplicate top candidates as ambiguous when their margin is low", () => {
    const result = resolution.rankEntityCandidates?.({
      query: "Marina",
      type: "person",
      userId,
      candidates: [person("a", "Marina"), person("b", "Marina")],
    });
    expect(result?.margin).toBe(0);
    expect(result?.ambiguous).toBe(true);
  });

  it("bounds both retrieval input and exposed ranked candidates", () => {
    const candidates = Array.from({ length: 80 }, (_, index) => person(String(index), `Pessoa ${index}`));
    const result = resolution.rankEntityCandidates?.({ query: "Pessoa", type: "person", userId, candidates, limit: 99 });
    expect(resolution.MAX_ENTITY_CANDIDATES).toBe(50);
    expect(result?.candidates).toHaveLength(5);
  });
});
