import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Brain, CheckCircle2, Clock3, History, Quote, ShieldCheck, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { correctInterpretation, reprocessEntry, undoInterpretationCorrection } from "@/features/interpretations/actions";
import { conceptLabels, lifecycleLabels } from "@/features/interpretations/copy";
import { loadInterpretationReview, type InterpretationRevision } from "@/features/interpretations/data";
import { EntryReprocessButton, InterpretationRevisionEditor } from "@/features/interpretations/revision-editor";
import { compareInterpretationVersions, type InterpretationChange } from "@/features/interpretations/version-comparison";
import { confirmEntryTasks, undoAgentAction } from "@/features/tasks/actions";
import { TaskCandidateForm } from "@/features/tasks/task-candidate-form";

const policyLabels = {
  auto_apply: { "pt-BR": "Aplicação automática", en: "Auto-apply" },
  apply_and_flag: { "pt-BR": "Aplicado e sinalizado", en: "Applied and flagged" },
  request_review: { "pt-BR": "Revisão solicitada", en: "Review requested" },
  block_until_confirmation: { "pt-BR": "Bloqueado até confirmação", en: "Blocked until confirmation" },
} as const;

const originLabels: Record<string, { "pt-BR": string; en: string }> = {
  ai_generated: { "pt-BR": "Interpretação inicial", en: "Initial interpretation" },
  user_corrected: { "pt-BR": "Correção do usuário", en: "User correction" },
  ai_reprocessed: { "pt-BR": "Reinterpretação por IA", en: "AI reinterpretation" },
  question_resolved: { "pt-BR": "Pergunta resolvida", en: "Question resolved" },
};

const evidenceLabels: Record<string, { "pt-BR": string; en: string }> = {
  explicit_user_confirmation: { "pt-BR": "Confirmação explícita do usuário", en: "Explicit user confirmation" },
  semantic_similarity_not_available: { "pt-BR": "Similaridade semântica não participou desta decisão", en: "Semantic similarity was not used in this decision" },
  model_structured_output: { "pt-BR": "Saída estruturada do modelo", en: "Structured model output" },
  normalized_exact_name: { "pt-BR": "Nome exato após normalização", en: "Exact normalized name" },
  normalized_name_overlap: { "pt-BR": "Correspondência parcial de nome", en: "Partial name match" },
  exact_alias: { "pt-BR": "Alias exato e válido", en: "Exact valid alias" },
  historical_recurrence: { "pt-BR": "Vínculo recorrente no histórico", en: "Recurring historical link" },
  organization_context: { "pt-BR": "Organização compatível", en: "Matching organization" },
  temporal_validity: { "pt-BR": "Vínculo válido na data", en: "Link valid at that time" },
  candidate_set_bounded_50: { "pt-BR": "Busca limitada a 50 candidatos do usuário", en: "Search bounded to 50 user-owned candidates" },
};

const overrideLabels: Record<string, { "pt-BR": string; en: string }> = {
  material_ambiguity: { "pt-BR": "Ambiguidade relevante entre candidatos", en: "Material ambiguity between candidates" },
  low_candidate_margin: { "pt-BR": "Diferença pequena entre os melhores candidatos", en: "Small margin between top candidates" },
  insufficient_evidence: { "pt-BR": "Evidência insuficiente", en: "Insufficient evidence" },
  date_conflict: { "pt-BR": "Conflito de datas", en: "Date conflict" },
  ownership_conflict: { "pt-BR": "Conflito de propriedade", en: "Ownership conflict" },
  cross_user_entity: { "pt-BR": "Vínculo pertence a outro usuário", en: "Link belongs to another user" },
};

const fieldLabels: Record<InterpretationChange["field"], { "pt-BR": string; en: string }> = {
  summary: { "pt-BR": "Resumo", en: "Summary" },
  concepts: { "pt-BR": "Conceitos", en: "Concepts" },
  occurredAt: { "pt-BR": "Data do acontecimento", en: "Event date" },
  extractedDates: { "pt-BR": "Datas identificadas", en: "Identified dates" },
  entityLinks: { "pt-BR": "Vínculos", en: "Links" },
  classifications: { "pt-BR": "Classificações", en: "Classifications" },
};

function humanEvidence(value: string, locale: "pt-BR" | "en") {
  return evidenceLabels[value]?.[locale] ?? value.replaceAll("_", " ");
}

function changeValue(field: InterpretationChange["field"], value: unknown, locale: "pt-BR" | "en") {
  if (field === "concepts" && Array.isArray(value)) {
    return value.map((concept) => typeof concept === "string" ? conceptLabels[concept as keyof typeof conceptLabels]?.[locale] ?? concept : "").filter(Boolean).join(", ");
  }
  if (field === "entityLinks" && Array.isArray(value)) {
    return value.map((link) => link && typeof link === "object" && "name" in link ? String(link.name) : "").filter(Boolean).join(", ");
  }
  if (field === "extractedDates" && Array.isArray(value)) {
    return value.map((date) => date && typeof date === "object" && "value" in date ? String(date.value) : "").filter(Boolean).join(", ");
  }
  if (field === "classifications" && value && typeof value === "object") {
    return Object.entries(value).map(([key, classification]) => `${key}: ${String(classification)}`).join(" · ");
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "—");
}

function revisionSnapshot(revision: InterpretationRevision) {
  return {
    version: revision.version,
    summary: revision.summary,
    concepts: revision.concepts,
    occurredAt: revision.occurredAt,
    extractedDates: revision.extractedDates,
    entityLinks: revision.entityLinks.map((link) => ({ entityType: link.entityType, entityId: link.entityId, name: link.name })),
    classifications: revision.classifications,
  };
}

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
  const review = await loadInterpretationReview(supabase, entryId);
  if (!review) notFound();

  const { entry, current, revisions, extraction } = review;
  const createdCount = review.tasks.length;
  const taskInitialState = createdCount > 0 ? {
    status: "success" as const,
    message: pt ? `${createdCount} ${createdCount === 1 ? "tarefa criada" : "tarefas criadas"}.` : `${createdCount} ${createdCount === 1 ? "task created" : "tasks created"}.`,
    undoId: review.taskUndoId,
  } : undefined;
  const lifecycle = entry.status in lifecycleLabels
    ? lifecycleLabels[entry.status as keyof typeof lifecycleLabels][locale]
    : entry.status;
  const occurredAt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(entry.occurred_at));
  const historyAscending = [...revisions].sort((left, right) => left.version - right.version);
  const comparisons = historyAscending.slice(1).map((revision, index) => ({
    from: historyAscending[index],
    to: revision,
    changes: compareInterpretationVersions(revisionSnapshot(historyAscending[index]), revisionSnapshot(revision)),
  }));
  const extractedMentions = extraction
    ? [...extraction.contexts, ...extraction.organizations, ...extraction.projects, ...extraction.people]
    : [];

  return (
    <div className="content-page entry-detail-page">
      <Link href={`/${locale}/app/inbox`} className="back-link"><ArrowLeft size={16} />{pt ? "Caixa de entrada" : "Inbox"}</Link>

      <header className="entry-heading">
        <div>
          <p className="eyebrow">{pt ? "INTERPRETAÇÃO DO BRAIN" : "BRAIN INTERPRETATION"}</p>
          <h1>{current?.summary ?? (pt ? "Entrada preservada" : "Entry preserved")}</h1>
          <p>{occurredAt}</p>
        </div>
        <span className={`entry-status entry-status-${entry.status}`}><Clock3 size={16} />{lifecycle}</span>
      </header>

      {(entry.status === "recoverable_error" || entry.status === "terminal_error") && (
        <section className="notice-card error-notice">
          <AlertTriangle size={20} />
          <div>
            <strong>{pt ? "O original está seguro" : "The original is safe"}</strong>
            <p>{entry.processing_error ?? (pt ? "A interpretação não foi concluída." : "Interpretation did not complete.")}</p>
            {entry.status === "recoverable_error" && (
              <EntryReprocessButton action={reprocessEntry} entryId={entryId} locale={locale} operationKey={randomUUID()} />
            )}
          </div>
        </section>
      )}

      {entry.status === "reprocessing" && (
        <section className="notice-card"><Sparkles size={20} /><div><strong>{pt ? "Reinterpretação em andamento" : "Reinterpretation in progress"}</strong><p>{pt ? "Esta operação tem tempo limitado e preserva a versão atual até terminar." : "This bounded operation keeps the current version until it finishes."}</p></div></section>
      )}

      <details className="original-entry" open={!current}>
        <summary><Quote size={17} />{pt ? "Ver registro original" : "View original entry"}</summary>
        <p>{entry.original_content}</p>
      </details>

      {current ? (
        <>
          <InterpretationRevisionEditor
            canUndo={Boolean(review.correctionUndoId)}
            correctionAction={correctInterpretation}
            current={{
              version: current.version,
              summary: current.summary,
              concepts: current.concepts,
              occurredAt: current.occurredAt,
              extractedDates: current.extractedDates,
              entityLinks: current.entityLinks.map(({ entityType, entityId, mention, confidence }) => ({ entityType, entityId, mention, confidence })),
              classifications: current.classifications,
              pendingQuestions: current.pendingQuestions,
            }}
            entityOptions={review.entityOptions}
            entryId={entryId}
            locale={locale}
            operationKey={randomUUID()}
            reprocessAction={reprocessEntry}
            reprocessOperationKey={randomUUID()}
            undoAction={undoInterpretationCorrection}
            undoId={review.correctionUndoId ?? undefined}
          />

          <div className="interpretation-grid phase-2b-review-grid">
            <section className="interpretation-main">
              <div className="section-heading"><span>01</span><div><h2>{pt ? "Versão atual" : "Current version"}</h2><p>{pt ? "Dados estruturados sem alterar o registro original." : "Structured data without changing the original record."}</p></div></div>
              <div className="tag-cloud">
                {current.concepts.map((concept) => <span key={concept}>{conceptLabels[concept][locale]}</span>)}
              </div>
              {current.extractedDates.length > 0 && (
                <div className="identified-dates"><h3>{pt ? "Datas identificadas" : "Identified dates"}</h3>{current.extractedDates.map((date, index) => <p key={`${date.value}-${index}`}><time>{date.value}</time>{date.label ? ` · ${date.label}` : ""}</p>)}</div>
              )}
              {current.entityLinks.length > 0 && (
                <div className="entity-list">
                  {current.entityLinks.map((entity) => <article key={`${entity.entityType}:${entity.entityId}`}><strong>{entity.name}</strong><span>{entity.mention}</span><small>{Math.round(entity.confidence * 100)}%</small></article>)}
                </div>
              )}
              {extractedMentions.length > 0 && (
                <div className="extracted-mention-list">
                  <h3>{pt ? "Menções extraídas" : "Extracted mentions"}</h3>
                  <div className="entity-list">
                    {extractedMentions.map((entity, index) => <article key={`${entity.name}:${index}`}><strong>{entity.name}</strong><span>{entity.evidence}</span><small>{Math.round(entity.confidence * 100)}%</small></article>)}
                  </div>
                </div>
              )}
              <div className="classification-grid">
                {Object.entries(current.classifications).map(([field, classification]) => <p key={field}><span>{field}</span><strong>{classification}</strong></p>)}
              </div>
              {current.pendingQuestions.length > 0 && (
                <div className="question-block"><h3>{pt ? "Perguntas pendentes" : "Pending questions"}</h3>{current.pendingQuestions.map((question) => <p key={question.question}>{question.question}<small>{question.reason}</small></p>)}</div>
              )}
            </section>

            <section className="interpretation-trust-panel">
              <div className="section-heading"><span>02</span><div><h2>{pt ? "Confiança por elemento" : "Trust by element"}</h2><p>{pt ? "Sinais, política e evidências persistidos nesta versão." : "Signals, policy, and evidence persisted for this version."}</p></div></div>
              <div className="trust-list">
                {Object.entries(current.trust).map(([element, trust]) => (
                  <details key={element} className={`trust-card trust-policy-${trust.policy}`}>
                    <summary><span><ShieldCheck size={17} />{element}</span><strong>{Math.round(trust.score * 100)}%</strong><small>{policyLabels[trust.policy][locale]}</small></summary>
                    {trust.evidence.length > 0 && <ul>{trust.evidence.map((evidence) => <li key={evidence}>{humanEvidence(evidence, locale)}</li>)}</ul>}
                    {trust.overrides.length > 0 && <div className="trust-overrides"><strong>{pt ? "Bloqueios" : "Overrides"}</strong>{trust.overrides.map((override) => <p key={override}>{overrideLabels[override]?.[locale] ?? override.replaceAll("_", " ")}</p>)}</div>}
                    <div className="trust-signals">{Object.entries(trust.signals).map(([signal, value]) => <span key={signal}>{signal.replaceAll(/([A-Z])/g, " $1")}: {Math.round(value * 100)}%</span>)}</div>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {extraction && (
            <section className="interpretation-actions phase-2b-task-actions">
              <div className="section-heading"><span>03</span><div><h2>{pt ? "Próximas ações" : "Next actions"}</h2><p>{pt ? "Nada vira tarefa sem sua confirmação." : "Nothing becomes a task without your confirmation."}</p></div></div>
              {extraction.taskCandidates.length > 0 ? (
                <TaskCandidateForm action={confirmEntryTasks} candidates={extraction.taskCandidates} entryId={entryId} initialState={taskInitialState} locale={locale} undoAction={undoAgentAction} />
              ) : (
                <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Nenhuma tarefa necessária" : "No task needed"}</strong><p>{pt ? "Esta versão ficou salva como referência e contexto." : "This version was saved as reference and context."}</p></div>
              )}
            </section>
          )}

          <section className="interpretation-history">
            <div className="section-heading"><span>04</span><div><h2>{pt ? "Histórico imutável" : "Immutable history"}</h2><p>{pt ? "Cada correção, undo e reinterpretação acrescenta uma versão." : "Every correction, undo, and reinterpretation appends a version."}</p></div></div>
            <ol className="revision-timeline">
              {revisions.map((revision) => (
                <li key={revision.id} className={revision.id === current.id ? "revision-current" : undefined}>
                  <History size={17} />
                  <div><strong>v{revision.version} · {originLabels[revision.origin]?.[locale] ?? revision.origin}</strong><p>{revision.summary}</p>{revision.correctionReason && <small>{revision.correctionReason}</small>}</div>
                  <time>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</time>
                </li>
              ))}
            </ol>
            {comparisons.length > 0 && (
              <div className="revision-comparisons">
                <h3>{pt ? "O que mudou" : "What changed"}</h3>
                {comparisons.map((comparison) => (
                  <details key={`${comparison.from.id}:${comparison.to.id}`}>
                    <summary>v{comparison.from.version} → v{comparison.to.version} · {comparison.changes.length} {pt ? "alterações" : "changes"}</summary>
                    {comparison.changes.length === 0 ? <p>{pt ? "Sem mudança de conteúdo." : "No content change."}</p> : comparison.changes.map((change) => (
                      <article key={change.field}><strong>{fieldLabels[change.field][locale]}</strong><p><del>{changeValue(change.field, change.before, locale)}</del></p><p><ins>{changeValue(change.field, change.after, locale)}</ins></p></article>
                    ))}
                  </details>
                ))}
              </div>
            )}
          </section>

          <footer className="model-note"><Brain size={14} />v{current.version} · {originLabels[current.origin]?.[locale] ?? current.origin} · {current.model}</footer>
        </>
      ) : (
        <section className="empty-interpretation-state">
          <AlertTriangle size={24} />
          <h2>{pt ? "Ainda não há interpretação" : "There is no interpretation yet"}</h2>
          <p>{pt ? "O registro original permanece disponível. Você pode tentar novamente." : "The original record remains available. You can try again."}</p>
          <EntryReprocessButton action={reprocessEntry} entryId={entryId} locale={locale} operationKey={randomUUID()} />
        </section>
      )}
    </div>
  );
}
