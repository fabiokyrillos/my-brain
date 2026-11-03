"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/ui";

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
const copy = {
  "pt-BR": {
    labels: { task: "Nova tarefa", project: "Nome do projeto", person: "Nome da pessoa" },
    add: { task: "Adicionar nova tarefa", project: "Adicionar projeto", person: "Adicionar pessoa" },
  },
  en: {
    labels: { task: "New task", project: "Project name", person: "Person name" },
    add: { task: "Add new task", project: "Add project", person: "Add person" },
  },
} as const satisfies Record<"pt-BR" | "en", {
  labels: Record<"task" | "project" | "person", string>;
  add: Record<"task" | "project" | "person", string>;
}>;

/*
 * Life Brain A.3 (`LB-A-006`). The submit is an `IconButton` — a square "+"
 * whose name is the whole sentence ("Adicionar nova tarefa") — rather than a
 * text button. The text button wrapped onto its own line on a phone, which is
 * the single most visible defect the baseline recorded on Trabalho, and an
 * icon-only control cannot wrap. The copy moved out of three inline locale
 * ternaries into the record above.
 */
export function InlineCreateForm({
  action,
  kind,
  locale,
}: {
  action: CreateRecordAction;
  kind: keyof (typeof copy)["en"]["labels"];
  locale: "pt-BR" | "en";
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const text = copy[locale];
  const label = text.labels[kind];

  return (
    <div>
      <form action={formAction} className="inline-create">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={`new-${kind}`} className="sr-only">{label}</label>
        <input id={`new-${kind}`} name="name" required maxLength={kind === "task" ? 240 : 160} placeholder={label} />
        <IconButton aria-label={text.add[kind]} icon={<Plus />} loading={pending} type="submit" variant="primary" />
      </form>
      {state.status !== "idle" && <span className="inline-create-feedback" role={state.status === "success" ? "status" : "alert"}>{state.message}</span>}
    </div>
  );
}
