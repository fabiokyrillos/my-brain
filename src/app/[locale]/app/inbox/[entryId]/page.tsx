import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ReturnToConversation } from "@/features/conversation-cards/return-to-conversation";
import { universalStateForProductState } from "@/features/daily-cycle/universal-state-projection";
import { UniversalStateView } from "@/features/experience/universal-state";
import { ReturnToSource } from "@/features/provenance/return-to-source";
import { requireUser } from "@/lib/auth/require-user";
import { formatInstant } from "@/lib/time/instant-format";
import { isLocale } from "@/lib/preferences";
import type { InterpretationTechnicalDetailsView } from "@/features/daily-cycle/contracts";
import { EntryReview } from "@/features/daily-cycle/entry-review";
import { loadEntryOutcomeProjection } from "@/features/daily-cycle/entry-outcome-projection";
import { loadEntryReviewProjection } from "@/features/daily-cycle/review-projection";
import { TechnicalDetails } from "@/features/daily-cycle/technical-details";
import { loadEntryTechnicalDetailsProjection } from "@/features/daily-cycle/technical-details-projection";
import { correctInterpretation, reprocessEntry, undoInterpretationCorrection, confirmInterpretation, undoInterpretationConfirmation } from "@/features/interpretations/actions";
import { getInterpretationCopy } from "@/features/interpretations/copy";
import { resolvePersonCandidates } from "@/features/interpretations/person-candidate-actions";
import { PersonCandidateForm } from "@/features/interpretations/person-candidate-form";
import { ConfirmationPanel } from "@/features/interpretations/confirmation-panel";
import { EntryReprocessButton, InterpretationRevisionEditor } from "@/features/interpretations/revision-editor";
import { resolveEntryTaskCandidates, undoAgentAction } from "@/features/tasks/actions";
import { TaskCandidateForm } from "@/features/tasks/task-candidate-form";
import { getAgentName } from "@/features/profile/agent-identity";

export default async function EntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; entryId: string }>;
  searchParams: Promise<{ from?: string | string[]; back?: string | string[] }>;
}) {
  const { locale: rawLocale, entryId } = await params;
  // `2K-CONT-002`: present only when the user arrived from a conversation.
  // `2N-PERSON-006`: present only when the user arrived from a contextual page
  // that recorded where on itself they were. Both are untrusted URL input and
  // both are parsed by the component that spends them.
  const { from, back } = await searchParams;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const pt = locale === "pt-BR";
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();

  const review = await loadEntryReviewProjection(supabase, {
    entryId,
    locale,
    userId: user.id,
  });
  if (!review) notFound();

  let technical: InterpretationTechnicalDetailsView | null = null;
  try {
    technical = await loadEntryTechnicalDetailsProjection(supabase, entryId);
  } catch {
    // Technical detail is a secondary, best-effort concern (Slice 2X.8): a
    // failure here must never block the primary review flow or misreport
    // the entry as ready. Rendering continues without the trust panel.
    technical = null;
  }

  const {
    view,
    timezone,
    errorMessage,
    editableCurrent,
    entityOptions,
    extractedMentions,
    history,
    taskUndoId,
    correctionUndoId,
    pendingPersonCandidates,
    personCandidateUndoId,
    relationOptions,
  } = review;

  /**
   * What the entry produced (UX-04). Read after the review projection because it
   * needs the owner's timezone from it, and read unconditionally: "nothing was
   * created" is an answer the page owes the owner, so the section says it rather
   * than disappearing.
   */
  const outcomes = await loadEntryOutcomeProjection(supabase, { entryId, locale, timezone });

  const canRetry = view.availableActions.some((action) => action.id === "retry_processing");
  const canCorrect = view.availableActions.some((action) => action.id === "correct_interpretation");
  const canUndoCorrection = view.availableActions.some((action) => action.id === "undo_correction");
  const canConfirmCandidates = view.availableActions.some((action) => action.id === "confirm_existing_candidates");
  /*
   * `2P-ATTENTION-004`. The panel below must never say "nothing left to
   * decide" while something is.
   *
   * Since slice 2P.1 `list_needs_attention` decides the finer reasons FIRST,
   * so `review_interpretation` already means "every other decision is
   * resolved" and this count is no longer what makes the panel correct. It is
   * kept as a second, independent check: the projection is one read of one
   * moment, the interpretation JSON keeps a question after it is answered, and
   * this reads the table that actually holds the answer. RLS scopes it to the
   * owner, and the database contract refuses regardless — so the panel can be
   * wrong only by appearing, never by writing.
   */
  const { count: openQuestionCount } = await supabase
    .from("pending_questions")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", entryId)
    .eq("status", "open");

  const attentionReason = view.attentionItems[0]?.reason;
  const attentionDetail = attentionReason === "answer_existing_question"
    ? editableCurrent?.pendingQuestions.map((question) => question.question).join(" · ") || null
    : errorMessage;

  const materializedCount = view.materializedTasks.length;
  const taskInitialState = taskUndoId ? {
    status: "success" as const,
    code: "resolved" as const,
    message: materializedCount > 0
      ? (pt ? `${materializedCount} ${materializedCount === 1 ? "tarefa criada" : "tarefas criadas"}.` : `${materializedCount} ${materializedCount === 1 ? "task created" : "tasks created"}.`)
      : (pt ? "Decisões salvas." : "Decisions saved."),
    undoId: taskUndoId,
  } : undefined;
  const personInitialState = personCandidateUndoId ? {
    status: "success" as const,
    code: "resolved" as const,
    message: pt ? "Decisões sobre pessoas salvas." : "Person decisions saved.",
    undoId: personCandidateUndoId,
    retryable: false,
  } : undefined;

  // `LDC-CONTEXT-001`. `review.timezone` rather than the accessor: this page
  // already loaded the owner's zone on the projection, and the two components
  // below stamp from the same value, so the page cannot disagree with itself.
  const occurredAtLabel = formatInstant(view.original.occurredAt, "dayAndTime", locale, review.timezone) ?? "";

  /*
   * `2O-RECOVER-004`. `universalStateForProductState` returns null only for
   * `needs_attention` and `ready` — both of which mean an interpretation
   * exists, so they are unreachable on this branch. The fallback is
   * `interpretation_failed` rather than `interpreting` because claiming work is
   * still in progress when it is not is the worse of the two errors: it leaves
   * the reader waiting for something that will never arrive.
   */
  const missingInterpretationState = universalStateForProductState(view.productState) ?? "interpretation_failed";
  const stillInterpreting = missingInterpretationState === "interpreting";

  const nextActions = editableCurrent ? (
    <>
      {editableCurrent.isRecordOnly ? (
        <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Somente registro" : "Record only"}</strong><p>{getInterpretationCopy(locale, agentName).recordOnly}</p></div>
      ) : canConfirmCandidates || taskInitialState ? (
        <TaskCandidateForm
          action={resolveEntryTaskCandidates}
          candidates={view.actionableCandidates}
          entryId={entryId}
          initialState={taskInitialState}
          interpretationId={editableCurrent.interpretationId}
          locale={locale}
          operationKey={randomUUID()}
          relationOptions={relationOptions}
          timezone={timezone}
          undoAction={undoAgentAction}
        />
      ) : (
        <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Nenhuma tarefa necessária" : "No task needed"}</strong><p>{pt ? "Esta versão ficou salva como referência e contexto." : "This version was saved as reference and context."}</p></div>
      )}
      {!editableCurrent.isRecordOnly && (pendingPersonCandidates.length > 0 || personInitialState) && (
        <PersonCandidateForm
          action={resolvePersonCandidates}
          candidates={pendingPersonCandidates}
          entryId={entryId}
          initialState={personInitialState}
          interpretationId={editableCurrent.interpretationId}
          locale={locale}
          operationKey={randomUUID()}
          undoAction={undoAgentAction}
        />
      )}
      {!editableCurrent.isRecordOnly
        && attentionReason === "review_interpretation"
        && !canConfirmCandidates
        && pendingPersonCandidates.length === 0
        && (openQuestionCount ?? 0) === 0 && (
        <ConfirmationPanel
          confirmAction={confirmInterpretation}
          entryId={entryId}
          interpretationId={editableCurrent.interpretationId}
          locale={locale}
          undoAction={undoInterpretationConfirmation}
        />
      )}
      {canCorrect && (
        <InterpretationRevisionEditor agentName={agentName}
          canUndo={canUndoCorrection}
          correctionAction={correctInterpretation}
          current={{
            version: editableCurrent.version,
            summary: editableCurrent.summary,
            concepts: editableCurrent.concepts,
            occurredAt: editableCurrent.occurredAt,
            extractedDates: editableCurrent.extractedDates,
            entityLinks: editableCurrent.entityLinks.map(({ entityType, entityId, mention, confidence }) => ({ entityType, entityId, mention, confidence })),
            classifications: editableCurrent.classifications,
            pendingQuestions: editableCurrent.pendingQuestions,
          }}
          entityOptions={entityOptions}
          entryId={entryId}
          locale={locale}
          operationKey={randomUUID()}
          reprocessAction={reprocessEntry}
          reprocessOperationKey={randomUUID()}
          showSummary={false}
          undoAction={undoInterpretationCorrection}
          undoId={correctionUndoId ?? undefined}
        />
      )}
    </>
  ) : (
    /*
     * `2O-RECOVER-004`, and this is the surface the requirement was written
     * for. "There is no interpretation yet" was one sentence covering two
     * genuinely different situations: the AI is still reading the entry, and
     * the AI tried and failed. The first is not a failure and must not offer a
     * retry — there is nothing to retry — while the second is, and both were
     * being told *"you can try again"*.
     *
     * The state now comes from the record's own lifecycle, so the two cannot be
     * confused, and neither is ever rendered as `loading`: the entry is durable
     * in both, and `interpreting` is the only state whose copy says so.
     */
    <UniversalStateView
      className="empty-interpretation-state"
      description={stillInterpreting
        ? undefined
        : (pt ? "O registro original permanece disponível. Você pode tentar novamente." : "The original record remains available. You can try again.")}
      locale={locale}
      state={missingInterpretationState}
      title={stillInterpreting
        ? undefined
        : (pt ? "Ainda não há interpretação" : "There is no interpretation yet")}
    >
      {stillInterpreting || canRetry
        ? null
        : <EntryReprocessButton action={reprocessEntry} agentName={agentName} entryId={entryId} locale={locale} operationKey={randomUUID()} />}
    </UniversalStateView>
  );

  return (
    <div className="content-page entry-detail-page">
      <Link href={`/${locale}/app/inbox`} className="back-link"><ArrowLeft size={16} />{pt ? "Registros" : "Records"}</Link>
      <ReturnToConversation from={from} locale={locale} />
      <ReturnToSource back={back} locale={locale} />

      <EntryReview agentName={agentName}
        view={view}
        timeZone={review.timezone}
        outcomes={outcomes}
        locale={locale}
        occurredAtLabel={occurredAtLabel}
        slots={{
          attentionAction: canRetry
            ? <EntryReprocessButton action={reprocessEntry} agentName={agentName} entryId={entryId} locale={locale} operationKey={randomUUID()} />
            : undefined,
          attentionDetail,
          nextActions,
          technicalDetails: (
            <TechnicalDetails
              entryId={view.entryId}
              technical={technical}
              history={history}
              hasTechnicalDetails={view.hasTechnicalDetails}
              locale={locale}
              timeZone={review.timezone}
              structured={editableCurrent ? {
                concepts: editableCurrent.concepts,
                extractedDates: editableCurrent.extractedDates,
                entityLinks: editableCurrent.entityLinks,
                extractedMentions,
              } : null}
            />
          ),
        }}
      />
    </div>
  );
}
