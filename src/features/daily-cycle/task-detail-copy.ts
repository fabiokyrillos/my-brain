import type { Locale } from "@/lib/preferences";
import { withAgentName } from "@/lib/agent-name";

/**
 * The task detail surface's copy, including the vocabularies that used to reach
 * the user as raw database values (UX-21).
 *
 * `actions` is deliberately a **closed map with a neutral fallback** rather than
 * a prettified `action_type.replaceAll("_", " ")`. The audit log is written by
 * several call sites and by triggers, so an unmapped value is possible; printing
 * it would put a database token in front of someone who has no way to read it.
 */
export type TaskDetailCopy = {
  readonly back: string;
  readonly eyebrow: string;
  readonly sections: {
    readonly details: string;
    readonly relations: string;
    readonly provenance: string;
    readonly history: string;
  };
  readonly fields: {
    readonly due: string;
    readonly noDue: string;
    readonly planned: string;
    readonly priority: string;
    readonly state: string;
    readonly origin: string;
    readonly created: string;
    readonly updated: string;
    readonly completed: string;
    readonly cancelled: string;
  };
  readonly origins: { readonly you: string; readonly brain: string };
  readonly relations: {
    readonly projects: string;
    readonly contexts: string;
    readonly people: string;
    readonly waitingOn: string;
    readonly parent: string;
    readonly dependsOn: string;
    readonly empty: string;
  };
  readonly provenance: {
    readonly fromEntry: string;
    readonly manual: string;
    readonly openEntry: string;
  };
  readonly history: {
    readonly empty: string;
    readonly actors: { readonly you: string; readonly brain: string; readonly system: string };
    readonly actions: Readonly<Record<string, string>>;
    readonly unknownAction: string;
  };
  readonly noDescription: string;
  readonly none: string;
};

const ptBR: TaskDetailCopy = {
  back: "Trabalho",
  eyebrow: "TAREFA",
  sections: {
    details: "Detalhes",
    relations: "Relações",
    provenance: "De onde veio",
    history: "Histórico desta tarefa",
  },
  fields: {
    due: "Prazo",
    noDue: "Sem prazo definido",
    planned: "Planejado para",
    priority: "Prioridade",
    state: "Situação",
    origin: "Origem",
    created: "Criada em",
    updated: "Última alteração",
    completed: "Concluída em",
    cancelled: "Cancelada em",
  },
  origins: { you: "Criada por você", brain: "Sugerida pelo {agent} e confirmada por você" },
  relations: {
    projects: "Projetos",
    contexts: "Contextos",
    people: "Pessoas",
    waitingOn: "Aguardando",
    parent: "Tarefa-mãe",
    dependsOn: "Depende de",
    empty: "Nenhuma relação registrada.",
  },
  provenance: {
    fromEntry: "Esta tarefa nasceu de um registro seu.",
    manual: "Você criou esta tarefa diretamente, sem partir de um registro.",
    openEntry: "Abrir o registro original",
  },
  history: {
    empty: "Nenhuma alteração registrada ainda.",
    actors: { you: "Você", brain: "O {agent}", system: "O sistema" },
    actions: {
      task_created: "criou a tarefa",
      task_updated: "mudou a tarefa",
      task_command_created: "criou a tarefa",
      task_command_applied: "alterou a tarefa",
      tasks_confirmed: "confirmou a tarefa a partir de um registro",
      confirm_entry_tasks: "confirmou a tarefa a partir de um registro",
      confirm_entry_task_candidates: "confirmou a tarefa a partir de um registro",
      operation_undone: "desfez uma alteração",
    },
    unknownAction: "registrou uma alteração",
  },
  noDescription: "Sem descrição.",
  none: "—",
};

const en: TaskDetailCopy = {
  back: "Work",
  eyebrow: "TASK",
  sections: {
    details: "Details",
    relations: "Relationships",
    provenance: "Where this came from",
    history: "History of this task",
  },
  fields: {
    due: "Due",
    noDue: "No due date set",
    planned: "Planned for",
    priority: "Priority",
    state: "State",
    origin: "Origin",
    created: "Created",
    updated: "Last changed",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  origins: { you: "Created by you", brain: "Suggested by {agent} and confirmed by you" },
  relations: {
    projects: "Projects",
    contexts: "Contexts",
    people: "People",
    waitingOn: "Waiting on",
    parent: "Parent task",
    dependsOn: "Depends on",
    empty: "No relationships recorded.",
  },
  provenance: {
    fromEntry: "This task came from something you captured.",
    manual: "You created this task directly, not from a capture.",
    openEntry: "Open the original record",
  },
  history: {
    empty: "No changes recorded yet.",
    actors: { you: "You", brain: "{agent}", system: "The system" },
    actions: {
      task_created: "created the task",
      task_updated: "changed the task",
      task_command_created: "created the task",
      task_command_applied: "changed the task",
      tasks_confirmed: "confirmed the task from a record",
      confirm_entry_tasks: "confirmed the task from a record",
      confirm_entry_task_candidates: "confirmed the task from a record",
      operation_undone: "undid a change",
    },
    unknownAction: "recorded a change",
  },
  noDescription: "No description.",
  none: "—",
};

export const taskDetailCopy = { "pt-BR": ptBR, en } as const satisfies Record<Locale, TaskDetailCopy>;

/**
 * @param agentName the assistant’s configured name (UX-06). Required, so the
 * compiler finds every surface that would otherwise render a hardcoded one.
 */
export function getTaskDetailCopy(locale: Locale, agentName: string): TaskDetailCopy {
  return withAgentName(taskDetailCopy[locale], agentName);
}

/** The sentence for one audit row, never the raw `action_type`. */
export function describeHistoryEntry(
  copy: TaskDetailCopy,
  entry: { readonly actor: "you" | "brain" | "system"; readonly actionType: string },
): string {
  const verb = copy.history.actions[entry.actionType] ?? copy.history.unknownAction;
  return `${copy.history.actors[entry.actor]} ${verb}`;
}
