import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import type { InterpretationTechnicalDetailsView } from "@/features/daily-cycle/contracts";
import { EntryReview } from "@/features/daily-cycle/entry-review";
import { loadEntryReviewProjection } from "@/features/daily-cycle/review-projection";
import { TechnicalDetails } from "@/features/daily-cycle/technical-details";
import { loadEntryTechnicalDetailsProjection } from "@/features/daily-cycle/technical-details-projection";
import { correctInterpretation, reprocessEntry, undoInterpretationCorrection } from "@/features/interpretations/actions";
import { getInterpretationCopy } from "@/features/interpretations/copy";
import { EntryReprocessButton, InterpretationRevisionEditor } from "@/features/interpretations/revision-editor";
import { confirmEntryTasks, undoAgentAction } from "@/features/tasks/actions";
import { TaskCandidateForm } from "@/features/tasks/task-candidate-form";

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; entryId: string }>;
}) {
  const { locale: rawLocale, entryId } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const pt = locale === "pt-BR";
  const { supabase } = await requireUser(locale);

  const review = await loadEntryReviewProjection(supabase, { entryId, locale });
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
    errorMessage,
    editableCurrent,
    entityOptions,
    taskCandidates,
    extractedMentions,
    history,
    taskUndoId,
    correctionUndoId,
    unavailableCandidateIndexes,
  } = review;

  const canRetry = view.availableActions.some((action) => action.id === "retry_processing");
  const canCorrect = view.availableActions.some((action) => action.id === "correct_interpretation");
  const canUndoCorrection = view.availableActions.some((action) => action.id === "undo_correction");
  const canConfirmCandidates = view.availableActions.some((action) => action.id === "confirm_existing_candidates");

  const attentionReason = view.attentionItems[0]?.reason;
  const attentionDetail = attentionReason === "answer_existing_question"
    ? editableCurrent?.pendingQuestions.map((question) => question.question).join(" · ") || null
    : errorMessage;

  const materializedCount = view.materializedTasks.length;
  const taskInitialState = materializedCount > 0 ? {
    status: "success" as const,
    message: pt ? `${materializedCount} ${materializedCount === 1 ? "tarefa criada" : "tarefas criadas"}.` : `${materializedCount} ${materializedCount === 1 ? "task created" : "tasks created"}.`,
    undoId: taskUndoId,
  } : undefined;

  const occurredAtLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(view.original.occurredAt));

  const nextActions = editableCurrent ? (
    <>
      {editableCurrent.isRecordOnly ? (
        <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Somente registro" : "Record only"}</strong><p>{getInterpretationCopy(locale).recordOnly}</p></div>
      ) : canConfirmCandidates ? (
        <TaskCandidateForm
          action={confirmEntryTasks}
          candidates={taskCandidates}
          entryId={entryId}
          initialState={taskInitialState}
          interpretationId={editableCurrent.interpretationId}
          locale={locale}
          operationKey={randomUUID()}
          undoAction={undoAgentAction}
          unavailableIndexes={unavailableCandidateIndexes}
        />
      ) : (
        <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Nenhuma tarefa necessária" : "No task needed"}</strong><p>{pt ? "Esta versão ficou salva como referência e contexto." : "This version was saved as reference and context."}</p></div>
      )}
      {canCorrect && (
        <InterpretationRevisionEditor
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
    <div className="empty-interpretation-state">
      <AlertTriangle size={24} />
      <h2>{pt ? "Ainda não há interpretação" : "There is no interpretation yet"}</h2>
      <p>{pt ? "O registro original permanece disponível. Você pode tentar novamente." : "The original record remains available. You can try again."}</p>
      <EntryReprocessButton action={reprocessEntry} entryId={entryId} locale={locale} operationKey={randomUUID()} />
    </div>
  );

  return (
    <div className="content-page entry-detail-page">
      <Link href={`/${locale}/app/inbox`} className="back-link"><ArrowLeft size={16} />{pt ? "Caixa de entrada" : "Inbox"}</Link>

      <EntryReview
        view={view}
        locale={locale}
        occurredAtLabel={occurredAtLabel}
        originalDefaultOpen={!editableCurrent}
        slots={{
          attentionAction: canRetry
            ? <EntryReprocessButton action={reprocessEntry} entryId={entryId} locale={locale} operationKey={randomUUID()} />
            : undefined,
          attentionDetail,
          nextActions,
          technicalDetails: (
            <TechnicalDetails
              technical={technical}
              history={history}
              hasTechnicalDetails={view.hasTechnicalDetails}
              locale={locale}
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
