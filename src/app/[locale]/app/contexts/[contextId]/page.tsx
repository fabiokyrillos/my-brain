import { AskAboutLink } from "@/features/conversation-cards/ask-about-link";
import { ArrowLeft, Layers } from "lucide-react";
import { UniversalStateLine } from "@/features/experience/universal-state";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateContext } from "@/features/entities/actions";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { asContextKind } from "@/features/entities/schema";
import { contextKindLabel, getVocabularyCopy, taskStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * One context, with the people and tasks scoped to it (EGC-CTX-002).
 *
 * `person_contexts` and `task_contexts` have both existed since `202607160009`
 * and have only ever been readable from the person's or the task's side. Both
 * are validity-scoped here — `valid_until is null` — because a context somebody
 * has left is history, not the current answer to "who is in this".
 *
 * The associations themselves stay **read-only in this slice**: EGC.2 owns the
 * single writer for `person_contexts`, and adding a second one here would be
 * exactly the duplication `EGC-ASSOC-003` exists to prevent.
 */
export default async function ContextDetailPage({
  params,
}: {
  params: Promise<{ locale: string; contextId: string }>;
}) {
  const { locale: candidate, contextId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getEntityCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const { supabase } = await requireUser(locale);

  const [contextResult, personLinkResult, taskLinkResult] = await Promise.all([
    supabase
      .from("contexts")
      .select("id,name,description,kind,created_at,updated_at")
      .eq("id", contextId)
      .maybeSingle(),
    supabase
      .from("person_contexts")
      .select("person_id")
      .eq("context_id", contextId)
      .is("valid_until", null)
      .limit(100),
    supabase.from("task_contexts").select("task_id").eq("context_id", contextId).limit(100),
  ]);

  const context = requireSupabaseData(contextResult, "load context");
  const personLinks = requireSupabaseData(personLinkResult, "load context people") ?? [];
  const taskLinks = requireSupabaseData(taskLinkResult, "load context tasks") ?? [];
  if (!context) notFound();

  const personIds = personLinks.map((link) => link.person_id);
  const taskIds = taskLinks.map((link) => link.task_id);
  const [peopleResult, tasksResult] = await Promise.all([
    personIds.length
      ? supabase.from("people").select("id,name").in("id", personIds).order("name").limit(100)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? supabase
          .from("tasks")
          .select("id,title,status")
          .in("id", taskIds)
          .order("updated_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const people = requireSupabaseData(peopleResult, "load context person names") ?? [];
  const tasks = requireSupabaseData(tasksResult, "load context task titles") ?? [];

  return (
    <div className="content-page entity-detail">
      <div className="entity-workspace-actions">
        <Link className="back-link" href={`/${locale}/app/contexts`}>
          <ArrowLeft size={16} />
          {copy.contextsTitle}
        </Link>
        {/* `2P-CHAT-005`. See the person workspace for why only `context:<id>` travels. */}
        <AskAboutLink locale={locale} name={context.name} about={{ type: "context", id: context.id }} />
      </div>

      <header className="entity-hero">
        <Layers size={28} />
        <div>
          <p className="eyebrow">
            {contextKindLabel(locale, context.kind)?.toUpperCase() ?? copy.contextsEyebrow}
          </p>
          <h1>{context.name}</h1>
          <p>{context.description ?? copy.noDescription}</p>
        </div>
      </header>

      <EntityEditForm
        action={updateContext}
        fields={{
          kind: "context",
          id: context.id,
          name: context.name,
          description: context.description,
          contextKind: asContextKind(context.kind),
        }}
        locale={locale}
        organizations={[]}
      />

      <div className="entity-columns">
        <section>
          <h2>{copy.linkedPeople}</h2>
          {people.length ? (
            <div className="mini-list">
              {people.map((person) => (
                <Link href={`/${locale}/app/people/${person.id}`} key={person.id}>
                  <strong>{person.name}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <UniversalStateLine description={copy.linkedPeopleEmpty} locale={locale} state="empty" />
          )}
        </section>
        <section>
          <h2>{copy.linkedTasks}</h2>
          {tasks.length ? (
            <div className="mini-list">
              {tasks.map((task) => (
                <article key={task.id}>
                  <strong>{task.title}</strong>
                  <span>{taskStatusLabel(locale, task.status) ?? vocabulary.unknownState}</span>
                </article>
              ))}
            </div>
          ) : (
            <UniversalStateLine description={copy.linkedTasksEmpty} locale={locale} state="empty" />
          )}
        </section>
      </div>
    </div>
  );
}
