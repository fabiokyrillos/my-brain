"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

export type CreateRecordState = { status: "idle" | "success" | "error"; message: string };
export type CreateRecordAction = (
  state: CreateRecordState,
  formData: FormData,
) => Promise<CreateRecordState>;

const idleState: CreateRecordState = { status: "idle", message: "" };

/*
 * Three, not four. `memory` left this form in slice 2P.6: a memory is written
 * through `MemoryComposer`, which explains what makes one durable, shows the
 * exact sentence before storing it and offers undo after — none of which a
 * single-line field can do. Leaving the label here would have kept a control
 * `createRecord` no longer accepts, whose only outcome would be a validation
 * refusal the owner could not act on.
 */
const labels = {
  task: { pt: "Nova tarefa", en: "New task" },
  project: { pt: "Nome do projeto", en: "Project name" },
  person: { pt: "Nome da pessoa", en: "Person name" },
} as const;

export function InlineCreateForm({
  action,
  kind,
  locale,
}: {
  action: CreateRecordAction;
  kind: keyof typeof labels;
  locale: "pt-BR" | "en";
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const pt = locale === "pt-BR";
  const label = labels[kind][pt ? "pt" : "en"];

  return (
    <div>
      <form action={formAction} className="inline-create">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={`new-${kind}`} className="sr-only">{label}</label>
        <input id={`new-${kind}`} name="name" required maxLength={kind === "task" ? 240 : 160} placeholder={label} />
        <button type="submit" disabled={pending} aria-label={pt ? `Adicionar ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}>
          {pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
          {pt ? "Adicionar" : "Add"}
        </button>
      </form>
      {state.status !== "idle" && <span className="inline-create-feedback" role={state.status === "success" ? "status" : "alert"}>{state.message}</span>}
    </div>
  );
}
