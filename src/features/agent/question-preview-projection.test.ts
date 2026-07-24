import { describe, expect, it, vi } from "vitest";
import {
  QUESTION_SOURCE_EXCERPT_MAX_LENGTH,
  loadQuestionPreviews,
  loadQuestionSuggestions,
  toQuestionEffectPreview,
} from "./question-preview-projection";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub;
}

const userId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const interpretationId = "44444444-4444-4444-8444-444444444444";
const otherInterpretationId = "55555555-5555-4555-8555-555555555555";

function questionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: questionId,
    entry_id: entryId,
    interpretation_id: interpretationId,
    candidate_index: 0,
    question: "Quem ficou responsável?",
    reason: "O registro não diz quem assume a entrega.",
    ...overrides,
  };
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    original_content: "Fechamos o escopo do Aurora com a Ana Prado e o Bruno Lima na reunião de ontem.",
    created_at: "2026-07-20T12:00:00.000Z",
    occurred_at: "2026-07-19T18:30:00.000Z",
    current_interpretation_id: interpretationId,
    ...overrides,
  };
}

function interpretationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: interpretationId,
    entry_id: entryId,
    version: 2,
    summary: "Escopo do Aurora fechado com Ana Prado e Bruno Lima.",
    created_at: "2026-07-20T12:00:05.000Z",
    extracted_people: [
      { name: "Ana Prado", confidence: 0.9, evidence: "com a Ana Prado", inferred: false },
      { name: "Bruno Lima", confidence: 0.8, evidence: "e o Bruno Lima", inferred: false },
    ],
    extracted_projects: [{ name: "Aurora", confidence: 0.9, evidence: "Aurora", inferred: false }],
    extracted_organizations: [],
    extracted_contexts: [],
    ...overrides,
  };
}

function clientMock(options: {
  questions?: unknown[];
  entries?: unknown[];
  interpretations?: unknown[];
} = {}) {
  const {
    questions = [questionRow()],
    entries = [entryRow()],
    interpretations = [interpretationRow()],
  } = options;
  const stubs = {
    pending_questions: queryStub({ data: questions, error: null }),
    entries: queryStub({ data: entries, error: null }),
    entry_interpretations: queryStub({ data: interpretations, error: null }),
  } as const;
  const from = vi.fn((table: string) => stubs[table as keyof typeof stubs]);
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  return { client: { from, rpc } as never, stubs, from, rpc };
}

describe("toQuestionEffectPreview", () => {
  it("is a closed, non-mutating shape in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const isCurrent of [true, false]) {
        const preview = toQuestionEffectPreview(isCurrent, locale);
        expect(Object.keys(preview).sort()).toEqual([
          "description",
          "kind",
          "notice",
          "title",
          "willMutate",
        ]);
        expect(preview.willMutate).toBe(false);
        expect(["none", "reinterpret"]).toContain(preview.kind);
        expect(preview.title.length).toBeGreaterThan(0);
        expect(preview.description.length).toBeGreaterThan(0);
        expect(preview.notice.length).toBeGreaterThan(0);
      }
    }
  });

  it("names reinterpretation as the consequence a later commit could apply for a current question", () => {
    expect(toQuestionEffectPreview(true, "pt-BR").kind).toBe("reinterpret");
    expect(toQuestionEffectPreview(true, "en").kind).toBe("reinterpret");
  });

  it("falls back to the neutral no-consequence preview for a superseded question", () => {
    expect(toQuestionEffectPreview(false, "pt-BR").kind).toBe("none");
    expect(toQuestionEffectPreview(false, "en").kind).toBe("none");
  });

  it("always states that nothing has been applied yet and never claims a change occurred", () => {
    expect(toQuestionEffectPreview(true, "pt-BR").notice).toContain("Nada foi aplicado");
    expect(toQuestionEffectPreview(true, "en").notice).toContain("Nothing has been applied");
    expect(toQuestionEffectPreview(false, "pt-BR").notice).toContain("Nada foi aplicado");
    expect(toQuestionEffectPreview(false, "en").notice).toContain("Nothing has been applied");
  });

  it("is deterministic", () => {
    expect(toQuestionEffectPreview(true, "pt-BR")).toEqual(toQuestionEffectPreview(true, "pt-BR"));
  });
});

describe("loadQuestionPreviews", () => {
  it("returns a bounded owner-scoped source projection for the owner", async () => {
    const { client } = clientMock();
    const previews = await loadQuestionPreviews(client, userId, [questionId], "pt-BR");
    const preview = previews.get(questionId);
    expect(preview).toBeDefined();
    expect(preview?.source).toEqual({
      questionId,
      entryId,
      question: "Quem ficou responsável?",
      reason: "O registro não diz quem assume a entrega.",
      candidateIndex: 0,
      entryExcerpt: "Fechamos o escopo do Aurora com a Ana Prado e o Bruno Lima na reunião de ontem.",
      entryExcerptTruncated: false,
      entryCreatedAt: "2026-07-20T12:00:00.000Z",
      entryOccurredAt: "2026-07-19T18:30:00.000Z",
      interpretationVersion: 2,
      interpretationCreatedAt: "2026-07-20T12:00:05.000Z",
      interpretationSummary: "Escopo do Aurora fechado com Ana Prado e Bruno Lima.",
      isCurrent: true,
    });
  });

  it("exposes only the approved bounded fields — never a raw row or raw interpretation JSON", async () => {
    const { client } = clientMock();
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(Object.keys(preview?.source ?? {}).sort()).toEqual([
      "candidateIndex",
      "entryCreatedAt",
      "entryExcerpt",
      "entryExcerptTruncated",
      "entryId",
      "entryOccurredAt",
      "interpretationCreatedAt",
      "interpretationSummary",
      "interpretationVersion",
      "isCurrent",
      "question",
      "reason",
      "questionId",
    ].sort());
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("extracted_people");
    expect(serialized).not.toContain("raw_output");
    expect(serialized).not.toContain("interpretation_id");
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("evidence");
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain(interpretationId);
  });

  it("scopes every read to the authenticated owner", async () => {
    const { client, stubs } = clientMock();
    await loadQuestionPreviews(client, userId, [questionId], "pt-BR");
    for (const table of ["pending_questions", "entries", "entry_interpretations"] as const) {
      expect(stubs[table].eq).toHaveBeenCalledWith("user_id", userId);
    }
  });

  it("performs no write, no RPC, and no enqueue", async () => {
    const { client, from, rpc, stubs } = clientMock();
    await loadQuestionPreviews(client, userId, [questionId], "pt-BR");
    expect(rpc).not.toHaveBeenCalled();
    for (const table of Object.keys(stubs)) {
      const stub = stubs[table as keyof typeof stubs] as Record<string, unknown>;
      for (const forbidden of ["insert", "update", "upsert", "delete"]) {
        expect(stub[forbidden]).toBeUndefined();
      }
    }
    expect(from.mock.calls.map(([table]) => table).sort()).toEqual([
      "entries",
      "entry_interpretations",
      "pending_questions",
    ]);
  });

  it("denies a cross-owner question without disclosing that it exists", async () => {
    const { client } = clientMock({ questions: [] });
    const previews = await loadQuestionPreviews(client, userId, [questionId], "pt-BR");
    expect(previews.size).toBe(0);
    expect(previews.get(questionId)).toBeUndefined();
  });

  it("drops a question whose entry or interpretation is not owner-visible", async () => {
    expect((await loadQuestionPreviews(clientMock({ entries: [] }).client, userId, [questionId], "pt-BR")).size).toBe(0);
    expect((await loadQuestionPreviews(clientMock({ interpretations: [] }).client, userId, [questionId], "pt-BR")).size).toBe(0);
  });

  it("drops a question whose interpretation provenance is inconsistent with its entry", async () => {
    const { client } = clientMock({
      interpretations: [interpretationRow({ entry_id: "99999999-9999-4999-8999-999999999999" })],
    });
    expect((await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).size).toBe(0);
  });

  it("reports stale/current state truthfully", async () => {
    const { client } = clientMock({
      entries: [entryRow({ current_interpretation_id: otherInterpretationId })],
    });
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(preview?.source.isCurrent).toBe(false);
    expect(preview?.effect.kind).toBe("none");
  });

  it("bounds the entry excerpt and marks truncation", async () => {
    const { client } = clientMock({
      entries: [entryRow({ original_content: "a".repeat(QUESTION_SOURCE_EXCERPT_MAX_LENGTH + 50) })],
    });
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(preview?.source.entryExcerpt).toHaveLength(QUESTION_SOURCE_EXCERPT_MAX_LENGTH);
    expect(preview?.source.entryExcerptTruncated).toBe(true);
  });

  it("derives deterministic suggestions from the entry's own owned domain context", async () => {
    const { client } = clientMock();
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(preview?.suggestions).toEqual([
      { id: "person:ana-prado", value: "Ana Prado", label: "Ana Prado", kind: "person" },
      { id: "person:bruno-lima", value: "Bruno Lima", label: "Bruno Lima", kind: "person" },
    ]);
  });

  it("returns no suggestions when the question has no truthful deterministic answer", async () => {
    const { client } = clientMock({
      questions: [questionRow({ question: "Quando isso deve acontecer?" })],
    });
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(preview?.suggestions).toEqual([]);
    expect(preview?.source.question).toBe("Quando isso deve acontecer?");
  });

  it("tolerates malformed interpretation entity JSON without inventing options", async () => {
    const { client } = clientMock({
      interpretations: [interpretationRow({ extracted_people: "not-an-array" })],
    });
    const preview = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    expect(preview?.suggestions).toEqual([]);
  });

  it("returns an empty map for an empty request without touching the database", async () => {
    const { client, from } = clientMock();
    expect((await loadQuestionPreviews(client, userId, [], "pt-BR")).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("loadQuestionSuggestions", () => {
  it("re-derives the same deterministic options the projection presented", async () => {
    const { client } = clientMock();
    const presented = (await loadQuestionPreviews(client, userId, [questionId], "pt-BR")).get(questionId);
    const reDerived = await loadQuestionSuggestions(clientMock().client, userId, questionId, "pt-BR");
    expect(reDerived).toEqual(presented?.suggestions);
  });

  it("returns no options for a question the caller does not own", async () => {
    const { client } = clientMock({ questions: [] });
    expect(await loadQuestionSuggestions(client, userId, questionId, "pt-BR")).toEqual([]);
  });
});
