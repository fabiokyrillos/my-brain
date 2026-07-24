import "server-only";
import { CircleHelp, MoonStar } from "lucide-react";
import Link from "next/link";
import { resolveProfileTimezone } from "@/features/daily-cycle/review-projection";
import { ConversationalQuestionsViewed } from "@/features/product-analytics/interaction-events";
import type { createClient } from "@/lib/supabase/server";
import { QuestionAnswerForm } from "./forms";
import { resolvePendingQuestion, undoQuestionResolution } from "./actions";
import { loadQuestionPreviews, type QuestionPreview } from "./question-preview-projection";
import { QuestionPreviewPanels } from "./question-preview-panels";
import { loadQuestionSurfacingDecision } from "./question-surfacing-data";
import { actionablePendingQuestionFilter } from "./question-visibility";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// How the panel is being presented:
// - "proactive": a conversational surface the user did not open to answer
//   questions (Chat). The deterministic cooldown/quiet-hours module decides
//   whether to draw attention; when it suppresses, the questions stay reachable
//   through a single quiet link — never a nag, never permanently hidden.
// - "pull": a surface the user opened precisely to see what needs them
//   (the "Precisa de você" queue). Open questions are always shown; the
//   decision only sets the header's emphasis.
export type ConversationalQuestionsMode = "proactive" | "pull";

const copy = {
  "pt-BR": {
    eyebrow: "PRECISA DE VOCÊ",
    proactiveTitle: "Perguntas para responder agora",
    pullTitle: "Perguntas pendentes",
    intro: "Ambiguidades que o Brain preservou. Responda, adie ou descarte sem sair daqui.",
    quietNote: "No silêncio: sem nudges agora, mas suas perguntas continuam acessíveis.",
    reachableLink: (count: number) =>
      count === 1 ? "Você tem 1 pergunta pendente" : `Você tem ${count} perguntas pendentes`,
    reachableAction: "Ver perguntas",
  },
  en: {
    eyebrow: "NEEDS YOU",
    proactiveTitle: "Questions to answer now",
    pullTitle: "Pending questions",
    intro: "Ambiguities Brain preserved. Answer, defer, or dismiss without leaving this page.",
    quietNote: "Quiet hours: no nudges right now, but your questions stay reachable.",
    reachableLink: (count: number) =>
      count === 1 ? "You have 1 pending question" : `You have ${count} pending questions`,
    reachableAction: "View questions",
  },
} as const;

type QuestionRow = {
  id: string;
  question: string;
  reason: string;
  confidence: number | null;
  created_at: string;
};

// Renders open pending questions as interactive, untrusted-data elements that
// resolve through the identical Slice 2D.1–2D.4 contract (`resolvePendingQuestion`
// / `undoQuestionResolution`). Every projected string — question, reason,
// suggestion, preview — is owner content rendered through normal React text
// escaping; it is never treated as an instruction here or in any prompt.
export async function ConversationalQuestions({
  supabase,
  userId,
  locale,
  mode,
  limit = 3,
}: {
  supabase: SupabaseClient;
  userId: string;
  locale: "pt-BR" | "en";
  mode: ConversationalQuestionsMode;
  limit?: number;
}) {
  const text = copy[locale];

  // The surfacing decision and the actual rows are read in parallel; both use
  // the same `actionablePendingQuestionFilter`, so they agree on what is open.
  const [decision, questionsResult, profileResult] = await Promise.all([
    loadQuestionSurfacingDecision(supabase, userId).catch(() => null),
    supabase
      .from("pending_questions")
      .select("id,question,reason,confidence,created_at")
      .or(actionablePendingQuestionFilter())
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);

  // Full failure isolation: this panel is an additive affordance on a host
  // surface (Chat, the queue). A pending-question read error must degrade to
  // "no panel", never crash the page that mounts it — so, unlike the dedicated
  // questions page, it must not let a Supabase error throw.
  if (questionsResult.error) return null;
  const items = (questionsResult.data ?? []) as QuestionRow[];
  if (items.length === 0) return null;

  // Proactive surface + the cooldown/quiet-hours module chose not to nudge:
  // collapse to one quiet, reachable link so nothing is ever hidden.
  const proactiveSuppressed = mode === "proactive" && (!decision || !decision.surface);
  if (proactiveSuppressed) {
    const count = decision?.openQuestionCount ?? items.length;
    return (
      <section className="conversational-questions conversational-questions-quiet" aria-label={text.proactiveTitle}>
        <ConversationalQuestionsViewed itemCount={count} locale={locale} />
        <MoonStar size={16} aria-hidden="true" />
        <span className="conversational-questions-quiet-note">{text.quietNote}</span>
        <Link href={`/${locale}/app/questions`} className="conversational-questions-quiet-link">
          {text.reachableLink(count)} · {text.reachableAction}
        </Link>
      </section>
    );
  }

  // A timezone read error is non-fatal: fall back to the default zone so the
  // defer picker and preview dates still render.
  const timezone = resolveProfileTimezone(
    (profileResult.data as { timezone?: unknown } | null)?.timezone,
  );

  // Additive affordances degrade instead of failing: a preview read error
  // renders the cards without chips/panels; answering keeps working, since the
  // Server Action authenticates provenance independently.
  const previews = await loadQuestionPreviews(supabase, userId, items.map((item) => item.id), locale)
    .catch(() => new Map<string, QuestionPreview>());

  return (
    <section className="conversational-questions" aria-label={mode === "proactive" ? text.proactiveTitle : text.pullTitle}>
      <ConversationalQuestionsViewed itemCount={items.length} locale={locale} />
      <header className="conversational-questions-header">
        <p className="eyebrow">{text.eyebrow}</p>
        <h2>{mode === "proactive" ? text.proactiveTitle : text.pullTitle}</h2>
        <p>{text.intro}</p>
      </header>
      <div className="list-stack">
        {items.map((item) => {
          const preview = previews.get(item.id);
          return (
            <article className="question-card" key={item.id}>
              <span>
                <CircleHelp size={14} aria-hidden="true" /> {Math.round(Number(item.confidence ?? 0) * 100)}%
              </span>
              <h3>{item.question}</h3>
              <p>{item.reason}</p>
              <QuestionAnswerForm
                action={resolvePendingQuestion}
                undoAction={undoQuestionResolution}
                locale={locale}
                questionId={item.id}
                timezone={timezone}
                suggestions={preview?.suggestions ?? []}
                canReinterpret={preview?.effect.kind === "reinterpret"}
              />
              {preview ? (
                <QuestionPreviewPanels locale={locale} timezone={timezone} source={preview.source} effect={preview.effect} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
