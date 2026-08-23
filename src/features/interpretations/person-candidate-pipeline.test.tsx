import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toEntryReviewProjection, type EntryReviewProjectionInput } from "@/features/daily-cycle/review-projection";
import type { InterpretationRevision } from "./data";
import type { PendingPersonCandidate } from "./person-candidate-contract";
import { PersonCandidateForm } from "./person-candidate-form";

/**
 * The whole person-suggestion path, in one test, because the reported defect
 * lived at the *first* link of it and every later link was already covered.
 *
 * On the owner's reported record — *"Preciso desenvolver um relatório de
 * Sweepstakes pra Garo. Ele faz parte da Royal Caribbean."* — the model returned
 * `people: []`. `derivePendingPersonCandidates` reads nothing else, so no
 * candidate existed to filter, no form rendered, and every unit test in the
 * repository was green. The prompt fix is what makes `people` non-empty
 * (`src/lib/ai/extraction-contract.test.ts`, and measured against the live model
 * in `src/lib/ai/extraction-classification.remote.test.ts`); this file proves
 * that a non-empty `people` actually reaches a control the owner can act on,
 * rather than assuming the two halves meet.
 *
 * It deliberately calls the **real** projection and renders the **real** form.
 * A test that hand-built `PendingPersonCandidate[]` would prove the form works
 * on input the product might never produce.
 */

/*
 * Synthetic on purpose. The real record's id is a pointer into a live
 * database and belongs in the incident, not in the test corpus; nothing here
 * reads it, so a fixed placeholder documents that it is not the subject.
 */
const ENTRY_ID = "00000000-0000-4000-8000-000000000000";
const INTERPRETATION_ID = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";

function revision(overrides: Partial<InterpretationRevision> = {}): InterpretationRevision {
  return {
    id: INTERPRETATION_ID,
    version: 1,
    summary: "Desenvolver o relatório de Sweepstakes para Garo, da Royal Caribbean.",
    concepts: ["task"],
    occurredAt: "2026-08-22T12:00:00.000Z",
    extractedDates: [],
    entityLinks: [],
    classifications: { summary: "fact", concepts: "interpretation", occurredAt: "fact", entities: "inference" },
    pendingQuestions: [],
    trust: {},
    origin: "ai_generated",
    model: "gpt-test",
    confidence: 0.9,
    correctionReason: null,
    createdAt: "2026-08-22T12:00:00.000Z",
    parentInterpretationId: null,
    isRecordOnly: false,
    ...overrides,
  };
}

type Extraction = NonNullable<EntryReviewProjectionInput["extraction"]>;

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    language: "pt-BR",
    occurredAt: "2026-08-22T12:00:00.000Z",
    isRetroactive: false,
    summary: "Desenvolver o relatório de Sweepstakes para Garo, da Royal Caribbean.",
    concepts: ["task"],
    contexts: [],
    organizations: [{ name: "Royal Caribbean", evidence: "faz parte da Royal Caribbean", confidence: 0.99, inferred: false }],
    projects: [],
    people: [{ name: "Garo", evidence: "relatório de Sweepstakes pra Garo", confidence: 0.9, inferred: false }],
    taskCandidates: [],
    pendingQuestions: [],
    confidence: 0.9,
    ...overrides,
  };
}

function projectionFor(current: InterpretationRevision, extracted: Extraction) {
  return toEntryReviewProjection({
    entryId: ENTRY_ID,
    agentName: "Brain",
    originalContent: "Preciso desenvolver um relatório de Sweepstakes pra Garo. Ele faz parte da Royal Caribbean.",
    errorMessage: null,
    entryOccurredAt: "2026-08-22T12:00:00.000Z",
    isRetroactive: false,
    current,
    revisions: [current],
    extraction: extracted,
    entityOptions: [],
    tasks: [],
    taskUndoId: null,
    correctionUndoId: null,
    personCandidateResolutions: [],
    personCandidateUndoId: null,
    candidateResolutionHistory: [],
    unavailableCandidateIndexes: [],
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    lifecycle: {
      entryLifecycle: "completed",
      hasValidTaskCandidates: false,
      hasOpenQuestion: false,
      recordOnly: false,
      hasMaterializedTaskForCandidates: false,
      hasConsistencyIssue: false,
    },
  });
}

function renderCandidates(candidates: readonly PendingPersonCandidate[]) {
  return render(
    <PersonCandidateForm
      action={vi.fn(async () => ({ status: "success" as const, code: "resolved" as const, message: "Decisões salvas.", undoId: "undo-1", retryable: false }))}
      candidates={candidates}
      entryId={ENTRY_ID}
      interpretationId={INTERPRETATION_ID}
      locale="pt-BR"
      operationKey="6118fb25-2f80-432a-aa96-0e76d924862e"
    />,
  );
}

describe("an extracted person that is not linked yet reaches the confirmation control", () => {
  it("renders Garo as a decidable candidate with the entry's own evidence", () => {
    const projection = projectionFor(revision(), extraction());
    renderCandidates(projection.pendingPersonCandidates);

    const group = screen.getByRole("group", { name: "Pessoa mencionada: Garo" });
    expect(group).toBeInTheDocument();
    // The evidence travelled with the candidate, so the owner is deciding on a
    // quotation from their own entry rather than on a bare name.
    expect(group).toHaveTextContent("relatório de Sweepstakes pra Garo");
    // Both decisions are offered, and neither is preselected: creating a person
    // is an explicit confirmation, never a default.
    expect(screen.getByRole("radio", { name: "Criar pessoa" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Ignorar menção" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar decisões sobre pessoas" })).toBeDisabled();
    // The name is editable before it is committed, seeded with what was said.
    expect(screen.getByLabelText("Nome para criar: Garo")).toHaveValue("Garo");
  });

  it("renders no control at all when the same person is already linked", () => {
    // The suppression that must keep working: the organization in this entry is
    // not a person, and the person is already an entity, so there is nothing
    // left to decide and the form must not appear.
    const linked = revision({
      entityLinks: [{ entityType: "person", entityId: "person-garo", mention: "Garo", name: "Garo", confidence: 1 }],
    });
    const projection = projectionFor(linked, extraction());
    expect(projection.pendingPersonCandidates).toEqual([]);

    renderCandidates(projection.pendingPersonCandidates);
    expect(screen.queryByRole("group", { name: "Pessoas mencionadas" })).not.toBeInTheDocument();
  });

  it("renders no control when the entry named an organization and no person", () => {
    const projection = projectionFor(revision(), extraction({ people: [] }));
    expect(projection.pendingPersonCandidates).toEqual([]);

    renderCandidates(projection.pendingPersonCandidates);
    expect(screen.queryByRole("group", { name: "Pessoas mencionadas" })).not.toBeInTheDocument();
  });
});
