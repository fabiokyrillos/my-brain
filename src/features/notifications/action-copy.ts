/**
 * The words the notice's own controls need, beyond the verb labels themselves.
 *
 * Separate from `verbs.ts` because that module is the **shared** vocabulary the
 * two surfaces read; this is the surrounding chrome — the menu, the panels, the
 * confirmation question and the outcome sentences.
 *
 * Every outcome sentence names what changed **and what did not**, because
 * `2S-SILENCE-011` is the requirement this slice is most able to break
 * silently: four scopes that must each leave the other three untouched. A
 * confirmation that said "pronto" would be true and useless.
 */

import type { Locale } from "@/lib/preferences";
import type { VerbId } from "./verbs";

export type NotificationActionCopy = {
  /**
   * What the attention surface calls this row, above the notice's own title.
   *
   * "Precisa de você" holds entry-derived rows and, since slice 2S.2, notices.
   * The two look alike and mean different things, so the row says which it is
   * rather than leaving the reader to infer it from the verbs.
   */
  readonly attentionEyebrow: string;
  readonly menuTrigger: string;
  readonly menuLabel: (subject: string) => string;
  readonly untilLabel: string;
  readonly dueLabel: string;
  readonly reasonLabel: string;
  readonly applyAction: string;
  readonly confirmAction: string;
  readonly cancelAction: string;
  /** Asked only for verbs whose `confirm` is true — today, dismissal alone. */
  readonly confirmQuestion: Readonly<Partial<Record<VerbId, string>>>;
  readonly applied: Readonly<Record<VerbId, string>>;
  readonly pendingAnnouncement: string;
};

const PT: NotificationActionCopy = {
  attentionEyebrow: "Aviso",
  menuTrigger: "Mais ações",
  menuLabel: (subject) => `Mais ações para: ${subject}`,
  untilLabel: "Silenciar até",
  dueLabel: "Novo prazo",
  reasonLabel: "Motivo (curto)",
  applyAction: "Confirmar",
  confirmAction: "Sim, descartar",
  cancelAction: "Cancelar",
  confirmQuestion: {
    // Names what is lost, per `2S-ACT-010`. Dismissal is the one verb here with
    // no way back: the list filters `dismissed` out permanently.
    dismiss: "Este aviso sai da lista e não volta. A tarefa não muda, e um próximo aviso ainda pode chegar quando a cadência permitir.",
  },
  applied: {
    complete_task: "Tarefa concluída.",
    reschedule_task: "Prazo da tarefa alterado.",
    mark_read: "Aviso marcado como lido. A tarefa não mudou.",
    dismiss: "Aviso descartado. A tarefa não mudou.",
    silence_until: "Silenciado por um tempo. A tarefa e este aviso não mudaram.",
    silence_subject: "Assunto silenciado. A tarefa e este aviso não mudaram.",
  },
  pendingAnnouncement: "Aplicando…",
};

const EN: NotificationActionCopy = {
  attentionEyebrow: "Notice",
  menuTrigger: "More actions",
  menuLabel: (subject) => `More actions for: ${subject}`,
  untilLabel: "Silence until",
  dueLabel: "New due date",
  reasonLabel: "Reason (short)",
  applyAction: "Confirm",
  confirmAction: "Yes, dismiss",
  cancelAction: "Cancel",
  confirmQuestion: {
    dismiss: "This notice leaves the list and does not come back. The task is unchanged, and a future notice can still arrive when the cadence permits.",
  },
  applied: {
    complete_task: "Task completed.",
    reschedule_task: "Task due date changed.",
    mark_read: "Notice marked read. The task did not change.",
    dismiss: "Notice dismissed. The task did not change.",
    silence_until: "Silenced for a while. Neither the task nor this notice changed.",
    silence_subject: "Subject silenced. Neither the task nor this notice changed.",
  },
  pendingAnnouncement: "Applying…",
};

export function getNotificationActionCopy(locale: Locale): NotificationActionCopy {
  return locale === "pt-BR" ? PT : EN;
}
