/**
 * The Work surface's own copy, typed (ADR-036, `docs/ENGINEERING_STANDARDS.md`).
 *
 * Everything an *outcome* needs — applied, no-change, and every declared `2E_*`
 * failure — already exists in `task-commands/copy.ts` and is reused from there,
 * because two vocabularies for one contract is how "the task changed since the
 * preview" ends up worded two ways in two places. What lives here is only what is
 * genuinely this surface's: the four button labels (moved out of
 * `task-list.tsx`, where they were locale ternaries), the two refusals this
 * surface can produce, and the refresh affordance.
 */

import type { Locale } from "@/lib/preferences";
import type { WorkSurfaceAction } from "@/features/task-commands/taxonomy";
import type { WorkCommandRefusal } from "@/features/task-commands/work-command";

type OutcomeCopy = { readonly title: string; readonly description: string };

export type WorkActionsCopy = {
  readonly actions: Record<WorkSurfaceAction, string>;
  readonly refusals: Record<WorkCommandRefusal, OutcomeCopy>;
  /** The control that reloads the list after a refusal. */
  readonly refresh: string;
  /** Announced while a round is in flight, so the region is not silently empty. */
  readonly pendingAnnouncement: string;
  /** The accessible name of the per-row result region. */
  readonly resultRegionLabel: string;
  /** A caught precondition fault. Honest, and never the thrown message. */
  readonly unexpected: string;
};

const ptBR: WorkActionsCopy = {
  actions: {
    complete_task: "Concluir",
    wait_task: "Aguardar",
    resume_task: "Retomar",
    reopen_task: "Reabrir",
  },
  refusals: {
    unresolvable: {
      title: "Esta tarefa não está mais aqui",
      description:
        "Ela pode ter sido alterada ou concluída em outro lugar. Atualize a lista para ver o estado atual.",
    },
    ineligible: {
      title: "Esta ação não vale mais para esta tarefa",
      description:
        "O estado da tarefa mudou desde que esta lista foi carregada. Atualize para ver as ações disponíveis agora.",
    },
  },
  refresh: "Atualizar lista",
  pendingAnnouncement: "Aplicando…",
  resultRegionLabel: "Resultado da ação",
  unexpected: "Algo saiu do esperado. Nada foi alterado — tente de novo.",
};

const en: WorkActionsCopy = {
  actions: {
    complete_task: "Complete",
    wait_task: "Wait",
    resume_task: "Resume",
    reopen_task: "Reopen",
  },
  refusals: {
    unresolvable: {
      title: "This task is no longer here",
      description:
        "It may have changed or been completed elsewhere. Refresh the list to see the current state.",
    },
    ineligible: {
      title: "This action no longer applies to this task",
      description:
        "The task's state changed since this list was loaded. Refresh to see the actions available now.",
    },
  },
  refresh: "Refresh list",
  pendingAnnouncement: "Applying…",
  resultRegionLabel: "Action result",
  unexpected: "Something went wrong. Nothing was changed — try again.",
};

export const workActionsCopy = { "pt-BR": ptBR, en } satisfies Record<Locale, WorkActionsCopy>;

export function getWorkActionsCopy(locale: Locale): WorkActionsCopy {
  return workActionsCopy[locale];
}
