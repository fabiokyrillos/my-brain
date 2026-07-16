import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Brain, CheckCircle2, Quote, Sparkles } from "lucide-react";
import { entryExtractionSchema } from "@/lib/ai/extraction-schema";
import { isLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { confirmEntryTasks, undoAgentAction } from "@/features/tasks/actions";
import { TaskCandidateForm } from "@/features/tasks/task-candidate-form";

const conceptLabels: Record<string, { pt: string; en: string }> = {
  raw_record: { pt: "registro", en: "record" },
  completed_activity: { pt: "atividade concluída", en: "completed activity" },
  task: { pt: "tarefa", en: "task" },
  subtask: { pt: "subtarefa", en: "subtask" },
  reminder: { pt: "lembrete", en: "reminder" },
  appointment: { pt: "compromisso", en: "appointment" },
  reference: { pt: "referência", en: "reference" },
  decision: { pt: "decisão", en: "decision" },
  idea: { pt: "ideia", en: "idea" },
  person_note: { pt: "nota sobre pessoa", en: "person note" },
  project_note: { pt: "nota de projeto", en: "project note" },
  pending_question: { pt: "pergunta pendente", en: "pending question" },
  blocker: { pt: "bloqueio", en: "blocker" },
  dependency: { pt: "dependência", en: "dependency" },
  status_update: { pt: "atualização", en: "status update" },
  lasting_preference: { pt: "preferência", en: "preference" },
  personal_memory: { pt: "memória", en: "memory" },
  request_received: { pt: "pedido recebido", en: "request received" },
  waiting_for_third_party: { pt: "aguardando terceiro", en: "waiting on someone" },
};

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; entryId: string }>;
}) {
  const { locale: rawLocale, entryId } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const pt = locale === "pt-BR";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [{ data: entry }, { data: interpretation }, { data: existingTasks }, { data: availableUndo }] = await Promise.all([
    supabase.from("entries").select("*").eq("id", entryId).maybeSingle(),
    supabase.from("entry_interpretations").select("*").eq("entry_id", entryId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tasks").select("id,title,status,due_at").eq("source_entry_id", entryId).neq("status", "cancelled").order("candidate_index"),
    supabase.from("undo_operations").select("id").eq("action_type", "confirm_entry_tasks").eq("status", "available").contains("after_state", { entry_id: entryId }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!entry) notFound();
  const parsed = interpretation ? entryExtractionSchema.safeParse(interpretation.raw_output) : null;
  const extraction = parsed?.success ? parsed.data : null;
  const createdCount = existingTasks?.length ?? 0;
  const initialState = createdCount > 0
    ? {
        status: "success" as const,
        message: createdCount === 1 ? "1 tarefa criada." : `${createdCount} tarefas criadas.`,
        undoId: availableUndo?.id ?? null,
      }
    : undefined;
  const occurredAt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(entry.occurred_at));
  const entities = extraction
    ? [...extraction.contexts, ...extraction.organizations, ...extraction.projects, ...extraction.people]
    : [];

  return (
    <div className="content-page entry-detail-page">
      <Link href={`/${locale}/app/inbox`} className="back-link"><ArrowLeft size={16} />{pt ? "Caixa de entrada" : "Inbox"}</Link>

      <header className="entry-heading">
        <div>
          <p className="eyebrow">{pt ? "INTERPRETAÇÃO DO BRAIN" : "BRAIN INTERPRETATION"}</p>
          <h1>{extraction?.summary ?? (pt ? "Entrada preservada" : "Entry preserved")}</h1>
          <p>{occurredAt}</p>
        </div>
        {extraction && <span className="entry-confidence"><Brain size={17} />{Math.round(extraction.confidence * 100)}% {pt ? "de confiança" : "confidence"}</span>}
      </header>

      {entry.status === "failed" && (
        <section className="notice-card error-notice">
          <AlertTriangle size={20} />
          <div><strong>{pt ? "O original está seguro" : "The original is safe"}</strong><p>{entry.processing_error}</p></div>
        </section>
      )}

      <details className="original-entry" open={!extraction}>
        <summary><Quote size={17} />{pt ? "Ver registro original" : "View original entry"}</summary>
        <p>{entry.original_content}</p>
      </details>

      {extraction && (
        <div className="interpretation-grid">
          <section className="interpretation-main">
            <div className="section-heading"><span>01</span><div><h2>{pt ? "O que encontrei" : "What I found"}</h2><p>{pt ? "Contexto extraído sem modificar seu registro." : "Context extracted without changing your record."}</p></div></div>
            <div className="tag-cloud">
              {extraction.concepts.map((concept) => <span key={concept}>{conceptLabels[concept]?.[pt ? "pt" : "en"] ?? concept}</span>)}
            </div>
            {entities.length > 0 && (
              <div className="entity-list">
                {entities.map((entity, index) => (
                  <article key={`${entity.name}-${index}`}>
                    <strong>{entity.name}</strong><span>{entity.evidence}</span><small>{Math.round(entity.confidence * 100)}%</small>
                  </article>
                ))}
              </div>
            )}

            {extraction.pendingQuestions.length > 0 && (
              <div className="question-block">
                <h3>{pt ? "Ficou uma dúvida" : "One question remains"}</h3>
                {extraction.pendingQuestions.map((question) => <p key={question.question}>{question.question}</p>)}
              </div>
            )}
          </section>

          <section className="interpretation-actions">
            <div className="section-heading"><span>02</span><div><h2>{pt ? "Próximas ações" : "Next actions"}</h2><p>{pt ? "Nada vira tarefa sem sua confirmação." : "Nothing becomes a task without your confirmation."}</p></div></div>
            {extraction.taskCandidates.length > 0 ? (
              <TaskCandidateForm
                action={confirmEntryTasks}
                candidates={extraction.taskCandidates}
                entryId={entryId}
                initialState={initialState}
                locale={locale}
                undoAction={undoAgentAction}
              />
            ) : (
              <div className="no-action-state"><CheckCircle2 size={22} /><strong>{pt ? "Nenhuma tarefa necessária" : "No task needed"}</strong><p>{pt ? "Este registro ficou salvo como referência e contexto." : "This entry was saved as reference and context."}</p></div>
            )}
          </section>
        </div>
      )}

      {interpretation && (
        <footer className="model-note"><Sparkles size={14} />{pt ? "Interpretação estruturada" : "Structured interpretation"} · {interpretation.model}</footer>
      )}
    </div>
  );
}
