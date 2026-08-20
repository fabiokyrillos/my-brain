import type { Locale } from "@/lib/preferences";

import type { ReminderAction, ReminderStatus, SnoozePresetMinutes } from "./lifecycle";
import type { ReminderView } from "./projection";
import type {
  ReminderCommandErrorDetail,
  ReminderCommandFailureCode,
  ReminderCommandUntaggedFailure,
} from "./outcomes";

/**
 * Every user-facing string on the reminders surface (UX-12, UX-21, UX-22).
 *
 * ## What this replaces
 *
 * `reminders/page.tsx` rendered `<span className={...}>{item.status}</span>` —
 * the raw database enum, in English, to both locales. A pt-BR reader saw
 * `scheduled`. Alongside it, twelve inline `pt ? "…" : "…"` ternaries carried the
 * rest of the page. Both are UX-21/UX-22 defects, and both are gone: nothing on
 * this surface prints a column value as a label, and there is no locale ternary
 * left in the route.
 *
 * The mechanism is ADR-036's: an explicit key type plus `satisfies Record<Locale,
 * …>`, so a missing key or a missing locale is a **compile error** even for a
 * key nothing reads yet. This is the canonical shape (`daily-cycle/copy.ts`),
 * not `src/i18n/messages.ts`, which is the shell's own hand-rolled record.
 *
 * ## Why `snoozed` has a label at all
 *
 * Nothing in production can produce a `snoozed` reminder — the literal is
 * dormant by 2F-REMINDER-004 and DEC-7 keeps it that way. But the CHECK
 * constraint admits it, so a legacy or hand-written row would reach this map.
 * Giving it an honest label ("Inativo" — it will never fire) beats a lookup
 * returning `undefined` and rendering nothing. The label deliberately does not
 * say "adiado"/"snoozed": the owner-visible snooze action moves the schedule and
 * leaves the row `scheduled`, so calling this state "snoozed" in the UI would
 * make two unrelated things share a word.
 */

type ReminderCopy = {
  readonly eyebrow: string;
  readonly heading: string;
  readonly intro: string;
  readonly emptyTitle: string;
  /** Takes the assistant's configured name — never a hardcoded "Brain". */
  readonly emptyBody: (agentName: string) => string;

  readonly statusLabel: Readonly<Record<ReminderStatus, string>>;
  readonly statusHint: Readonly<Record<ReminderStatus, string>>;
  readonly viewLabel: Readonly<Record<ReminderView, string>>;

  readonly actionLabel: Readonly<Record<ReminderAction, string>>;
  readonly snoozePreset: Readonly<Record<SnoozePresetMinutes, string>>;

  /** The timestamp's meaning changes with the state; the label must follow. */
  readonly nextDelivery: string;
  readonly deliveredAt: string;
  readonly scheduleWas: string;
  readonly currentSchedule: string;
  readonly proposedSchedule: string;
  readonly overdueNote: string;

  readonly importantBadge: string;
  readonly linkedTask: string;
  readonly linkedEntry: string;
  readonly independent: string;
  readonly historyLink: string;

  /**
   * `2P-REMINDER-001`/`-002` — the creation dialog's words.
   *
   * The five groups appear in the order the requirement names them: content,
   * date and time, importance, the optional link, then save and cancel. The keys
   * below are grouped the same way so a reader can check the order without
   * opening the component.
   *
   * There is no recurrence key, and its absence is load-bearing rather than an
   * omission: `2P-REMINDER-RECURRENCE` forbids a control that does not work and
   * a rule encoded in free text, and a placeholder reading *"every week"* would
   * be the second of those.
   */
  readonly creation: {
    readonly open: string;
    readonly title: string;
    readonly description: string;
    readonly contentLabel: string;
    readonly contentHint: string;
    readonly whenLabel: string;
    readonly whenHint: string;
    readonly importantLabel: string;
    readonly linkLabel: string;
    readonly linkHint: string;
    readonly linkNone: string;
    /**
     * A task whose title this reader may not see.
     *
     * Still choosable: masking withholds the words, not the ability to link. The
     * short id is what distinguishes two withheld tasks from each other without
     * making either of them readable.
     */
    readonly linkWithheld: (shortId: string) => string;
    readonly save: string;
    readonly saving: string;
    readonly cancel: string;
    readonly created: string;
    readonly invalid: string;
    readonly invalidDate: string;
    readonly unknownTask: string;
    readonly failed: string;
  };

  readonly cancelConfirmTitle: string;
  readonly cancelConfirmBody: string;
  readonly cancelConfirmAccept: string;
  readonly cancelConfirmDismiss: string;

  readonly editTitleLabel: string;
  readonly editImportantLabel: string;
  readonly rescheduleLabel: string;
  readonly submit: string;
  readonly close: string;
  readonly working: string;

  readonly success: Readonly<Record<ReminderAction, string>>;
  readonly failure: Readonly<
    Record<ReminderCommandErrorDetail | ReminderCommandUntaggedFailure, string>
  >;
};

const COPY = {
  "pt-BR": {
    eyebrow: "NÃO ESQUECER",
    heading: "Lembretes",
    intro: "Alertas internos respeitando seu fuso e período silencioso.",
    emptyTitle: "Nenhum lembrete",
    emptyBody: (agentName: string) =>
      `Crie um lembrete acima ou peça ao ${agentName} durante uma captura.`,

    statusLabel: {
      scheduled: "Agendado",
      sent: "Entregue",
      cancelled: "Cancelado",
      snoozed: "Inativo",
    },
    statusHint: {
      scheduled: "Vai disparar no horário abaixo.",
      sent: "Já foi entregue e não dispara de novo.",
      cancelled: "Não vai disparar até ser reativado.",
      snoozed: "Este lembrete não dispara e não pode ser reativado.",
    },
    viewLabel: {
      pending: "Pendentes",
      delivered: "Entregues",
      cancelled: "Cancelados",
      all: "Todos",
    },

    actionLabel: {
      snooze: "Adiar",
      reschedule: "Reagendar",
      cancel: "Cancelar lembrete",
      restore: "Reativar",
      edit: "Editar",
    },
    snoozePreset: {
      15: "15 minutos",
      60: "1 hora",
      180: "3 horas",
      1440: "1 dia",
      10080: "1 semana",
    },

    nextDelivery: "Próximo aviso",
    deliveredAt: "Entregue em",
    scheduleWas: "Estava marcado para",
    currentSchedule: "Horário atual",
    proposedSchedule: "Novo horário",
    overdueNote: "O horário já passou — vai disparar na próxima verificação.",

    importantBadge: "importante",
    linkedTask: "Tarefa vinculada",
    linkedEntry: "Registro vinculado",
    independent: "Lembrete avulso",
    historyLink: "Ver no histórico",

    creation: {
      open: "Novo lembrete",
      title: "Novo lembrete",
      description:
        "Um lembrete avisa você em um momento específico. Ele não vira tarefa e não muda nada sozinho.",
      contentLabel: "O que lembrar",
      contentHint: "Escreva como você quer ler isso na hora.",
      whenLabel: "Quando avisar",
      whenHint: "No seu fuso horário.",
      importantLabel: "Marcar como importante",
      linkLabel: "Vincular a uma tarefa (opcional)",
      linkHint: "Só tarefas suas aparecem aqui.",
      linkNone: "Sem vínculo",
      linkWithheld: (shortId) => `Tarefa protegida · ${shortId}`,
      save: "Criar lembrete",
      saving: "Criando…",
      cancel: "Cancelar",
      created: "Lembrete criado.",
      invalid: "Revise o texto e o horário do lembrete.",
      invalidDate: "Escolha uma data e um horário válidos.",
      unknownTask: "Essa tarefa não está disponível. Escolha outra ou deixe sem vínculo.",
      failed: "Não foi possível criar agora. Tente novamente.",
    },

    cancelConfirmTitle: "Cancelar este lembrete?",
    cancelConfirmBody:
      "Ele deixa de disparar. O lembrete continua na lista e pode ser reativado depois.",
    cancelConfirmAccept: "Sim, cancelar",
    cancelConfirmDismiss: "Manter agendado",

    editTitleLabel: "Título do lembrete",
    editImportantLabel: "Marcar como importante",
    rescheduleLabel: "Novo horário",
    submit: "Salvar",
    close: "Fechar",
    working: "Aplicando…",

    success: {
      snooze: "Lembrete adiado.",
      reschedule: "Lembrete reagendado.",
      cancel: "Lembrete cancelado.",
      restore: "Lembrete reativado.",
      edit: "Lembrete atualizado.",
    },
    failure: {
      G5_REMINDER_TRANSITION_NOT_ALLOWED:
        "Esta ação não é possível no estado atual do lembrete.",
      G5_REMINDER_EDIT_TASK_LINKED:
        "O título vem da tarefa vinculada. Renomeie a tarefa para alterá-lo.",
      G5_REMINDER_STALE_STATE:
        "O lembrete mudou enquanto esta página estava aberta. Recarregue e tente de novo.",
      G5_REMINDER_IDEMPOTENCY_MISMATCH:
        "Esta ação já foi registrada com outro conteúdo. Recarregue e tente de novo.",
      G5_REMINDER_TRANSITION_INTEGRITY: "Não foi possível aplicar a alteração.",
      unauthenticated: "Sua sessão expirou.",
      invalid_payload: "Revise os dados informados.",
      not_found: "Lembrete não encontrado.",
      unknown: "Não foi possível aplicar a alteração.",
    },
  },
  en: {
    eyebrow: "DON'T FORGET",
    heading: "Reminders",
    intro: "Internal alerts that respect your timezone and quiet hours.",
    emptyTitle: "No reminders",
    emptyBody: (agentName: string) => `Create one above or ask ${agentName} during capture.`,

    statusLabel: {
      scheduled: "Scheduled",
      sent: "Delivered",
      cancelled: "Cancelled",
      snoozed: "Inactive",
    },
    statusHint: {
      scheduled: "It will fire at the time below.",
      sent: "Already delivered; it will not fire again.",
      cancelled: "It will not fire until you reactivate it.",
      snoozed: "This reminder does not fire and cannot be reactivated.",
    },
    viewLabel: {
      pending: "Pending",
      delivered: "Delivered",
      cancelled: "Cancelled",
      all: "All",
    },

    actionLabel: {
      snooze: "Snooze",
      reschedule: "Reschedule",
      cancel: "Cancel reminder",
      restore: "Reactivate",
      edit: "Edit",
    },
    snoozePreset: {
      15: "15 minutes",
      60: "1 hour",
      180: "3 hours",
      1440: "1 day",
      10080: "1 week",
    },

    nextDelivery: "Next reminder",
    deliveredAt: "Delivered at",
    scheduleWas: "Was scheduled for",
    currentSchedule: "Current time",
    proposedSchedule: "New time",
    overdueNote: "That time has passed — it will fire on the next check.",

    importantBadge: "important",
    linkedTask: "Linked task",
    linkedEntry: "Linked record",
    independent: "Standalone reminder",

    creation: {
      open: "New reminder",
      title: "New reminder",
      description:
        "A reminder tells you something at a specific moment. It does not become a task and it changes nothing on its own.",
      contentLabel: "What to remember",
      contentHint: "Write it the way you want to read it at the time.",
      whenLabel: "When to tell you",
      whenHint: "In your time zone.",
      importantLabel: "Mark as important",
      linkLabel: "Link to a task (optional)",
      linkHint: "Only your own tasks appear here.",
      linkNone: "No link",
      linkWithheld: (shortId) => `Protected task · ${shortId}`,
      save: "Create reminder",
      saving: "Creating…",
      cancel: "Cancel",
      created: "Reminder created.",
      invalid: "Check the reminder's text and time.",
      invalidDate: "Choose a valid date and time.",
      unknownTask: "That task is not available. Pick another one or leave it unlinked.",
      failed: "Could not create it right now. Try again.",
    },
    historyLink: "See in history",

    cancelConfirmTitle: "Cancel this reminder?",
    cancelConfirmBody:
      "It stops firing. The reminder stays in the list and can be reactivated later.",
    cancelConfirmAccept: "Yes, cancel it",
    cancelConfirmDismiss: "Keep it scheduled",

    editTitleLabel: "Reminder title",
    editImportantLabel: "Mark as important",
    rescheduleLabel: "New time",
    submit: "Save",
    close: "Close",
    working: "Applying…",

    success: {
      snooze: "Reminder snoozed.",
      reschedule: "Reminder rescheduled.",
      cancel: "Reminder cancelled.",
      restore: "Reminder reactivated.",
      edit: "Reminder updated.",
    },
    failure: {
      G5_REMINDER_TRANSITION_NOT_ALLOWED: "That action is not possible in the reminder's current state.",
      G5_REMINDER_EDIT_TASK_LINKED:
        "The title comes from the linked task. Rename the task to change it.",
      G5_REMINDER_STALE_STATE:
        "The reminder changed while this page was open. Reload and try again.",
      G5_REMINDER_IDEMPOTENCY_MISMATCH:
        "That action was already recorded with different content. Reload and try again.",
      G5_REMINDER_TRANSITION_INTEGRITY: "We could not apply the change.",
      unauthenticated: "Your session expired.",
      invalid_payload: "Check the values you entered.",
      not_found: "Reminder not found.",
      unknown: "We could not apply the change.",
    },
  },
} satisfies Record<Locale, ReminderCopy>;

export function getReminderCopy(locale: Locale): ReminderCopy {
  return COPY[locale];
}

export function reminderFailureMessage(
  locale: Locale,
  code: ReminderCommandFailureCode,
): string {
  return COPY[locale].failure[code];
}
