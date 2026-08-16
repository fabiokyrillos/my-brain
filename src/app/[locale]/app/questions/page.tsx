import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePendingQuestion, undoQuestionResolution } from "@/features/agent/actions";
import { UniversalStateView } from "@/features/experience/universal-state";
import { QuestionAnswerForm } from "@/features/agent/forms";
import { getQuestionOutcomeCopy } from "@/features/agent/question-outcome-copy";
import { QuestionOutcomeCard } from "@/features/agent/question-outcome-panel";
import { loadResolvedQuestions } from "@/features/agent/question-outcome-projection";
import { QuestionPreviewPanels } from "@/features/agent/question-preview-panels";
import { loadQuestionPreviews, type QuestionPreview } from "@/features/agent/question-preview-projection";
import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { resolveOwnerTimeZone } from "@/lib/time/owner-timezone";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { withAgentName } from "@/lib/agent-name";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { getAgentName } from "@/features/profile/agent-identity";

/** The two halves of a question's life. `open` is the default and the old behaviour. */
function parseView(value: string | string[] | undefined): "open" | "resolved" {
  return (Array.isArray(value) ? value[0] : value) === "resolved" ? "resolved" : "open";
}

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[]; view?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const query = await searchParams;
  const page = parsePage(query.page);
  const view = parseView(query.view);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();
  const outcomeCopy = withAgentName(getQuestionOutcomeCopy(locale), agentName);

  /*
    The two tabs are the two sides of one filter. `actionablePendingQuestionFilter`
    decides what is still open and `resolvedPendingQuestionFilter` is its exact
    complement, so a question is in one tab or the other — never both, never
    neither. That is the property UX-11 found broken: answering removed a
    question from the only list that existed and put it nowhere.
  */
  const tabs = (
    <nav aria-label={pt ? "Estado das perguntas" : "Question state"} className="question-tabs">
      <Link aria-current={view === "open" ? "page" : undefined} href={`/${locale}/app/questions`}>
        {outcomeCopy.openTab}
      </Link>
      <Link aria-current={view === "resolved" ? "page" : undefined} href={`/${locale}/app/questions?view=resolved`}>
        {outcomeCopy.resolvedTab}
      </Link>
    </nav>
  );

  if (view === "resolved") {
    const outcomes = await loadResolvedQuestions(supabase, { from, to });
    const { items: resolved, hasNext: resolvedHasNext } = paginateRows([...outcomes]);

    return (
      <div className="content-page">
        <header className="list-header">
          <div>
            <p className="eyebrow">{pt ? "CLAREZA" : "CLARITY"}</p>
            <h1>{outcomeCopy.resolvedTitle}</h1>
            <p>{outcomeCopy.resolvedIntro}</p>
          </div>
        </header>
        {tabs}
        {resolved.length ? (
          <div className="list-stack">
            {resolved.map((outcome) => (
              <QuestionOutcomeCard agentName={agentName} key={outcome.questionId} locale={locale} outcome={outcome} timeZone={timezone} />
            ))}
          </div>
        ) : (
          <UniversalStateView
            description={outcomeCopy.emptyBody}
            locale={locale}
            state="empty"
            title={outcomeCopy.emptyTitle}
          />
        )}
        <PaginationLinks locale={locale} path="questions?view=resolved" page={page} hasNext={resolvedHasNext} />
      </div>
    );
  }

  // A snoozed question past its deadline is deterministically open again
  // (Slice 2D.2 read-time reactivation); a still-snoozed one stays hidden here
  // and now appears under Resolved as `deferred` rather than nowhere at all.
  const [result, profileResult] = await Promise.all([
    supabase.from("pending_questions").select("id,question,reason,confidence,created_at").or(actionablePendingQuestionFilter()).order("created_at", { ascending: false }).range(from, to),
    supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load pending questions") ?? []);
  const timezone = resolveOwnerTimeZone(
    (requireSupabaseData(profileResult, "load questions profile timezone") as { timezone?: unknown } | null)?.timezone,
  );
  // Slice 2D.3 — one owner-scoped, strictly read-only batch that yields the
  // bounded source DTO, the non-mutating predicted-effect preview, and the
  // deterministic suggested answers for the questions on this page.
  //
  // These are purely additive affordances, so the page degrades instead of
  // failing: if the projection read fails, the cards render without chips or
  // panels and answering / deferring / dismissing keeps working exactly as it
  // did before this slice. Provenance is authenticated independently in the
  // Server Action, so a missing preview can never weaken that check.
  const previews = await loadQuestionPreviews(supabase, user.id, items.map((item) => item.id), locale)
    .catch(() => new Map<string, QuestionPreview>());

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{pt ? "CLAREZA" : "CLARITY"}</p>
          <h1>{pt ? "Perguntas pendentes" : "Pending questions"}</h1>
          <p>{pt ? `Ambiguidades que o ${agentName} preservou em vez de adivinhar.` : `Ambiguities ${agentName} preserved instead of guessing.`}</p>
        </div>
      </header>
      {tabs}
      {items.length ? (
        <div className="list-stack">
          {items.map((item) => {
            const preview = previews.get(item.id);
            return (
              <article className="question-card" key={item.id}>
                <span>{Math.round(Number(item.confidence) * 100)}%</span>
                <h2>{item.question}</h2>
                <p>{item.reason}</p>
                <QuestionAnswerForm action={resolvePendingQuestion} undoAction={undoQuestionResolution} locale={locale} questionId={item.id} timezone={timezone} suggestions={preview?.suggestions ?? []} canReinterpret={preview?.effect.kind === "reinterpret"} />
                {preview ? <QuestionPreviewPanels locale={locale} timezone={timezone} source={preview.source} effect={preview.effect} /> : null}
              </article>
            );
          })}
        </div>
      ) : (
        /*
          The empty state points at where the answers went. "No open questions"
          on its own was part of UX-11: the queue emptied and said nothing about
          what emptying it had achieved.

          `2O-RECOVER-002`: that link is the state's action, so it is passed as
          the action rather than nested beside one. `empty` is `recoverable`, so
          the vocabulary renders it.
        */
        <UniversalStateView
          actionHref={`/${locale}/app/questions?view=resolved`}
          actionLabel={outcomeCopy.resolvedTab}
          description={pt ? "Quando houver ambiguidade relevante, ela aparecerá aqui sem bloquear o restante." : "Relevant ambiguity appears here without blocking everything else."}
          locale={locale}
          state="empty"
          title={pt ? "Nenhuma dúvida aberta" : "No open questions"}
        />
      )}
      <PaginationLinks locale={locale} path="questions" page={page} hasNext={hasNext} />
    </div>
  );
}
