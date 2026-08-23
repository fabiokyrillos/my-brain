import type { Locale } from "@/lib/preferences";

import type { ReminderAction, ReminderStatus, SnoozePresetMinutes } from "./lifecycle";
import type { ReminderView } from "./projection";
import type { RecurrenceChoice } from "./recurrence-derivation";
import type { RecurrenceLanguage } from "./recurrence-language";
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
   * **Slice 2R.3 adds a sixth group, and the refusal above is lifted.**
   * `2P-REMINDER-RECURRENCE` forbade a control that does not work and a rule
   * encoded in free text; ADR-132 Decision 1 lifted it for reminders once the
   * model existed, and `202608230101` is the model. The control that arrives is
   * one select whose options are the five signed patterns — not a rule field,
   * and not a placeholder.
   *
   * It sits **immediately after date and time**, because every parameter it
   * needs comes from that date (`recurrence-derivation.ts`). The order the
   * requirement named is otherwise unchanged, and `reminder-composer.test.tsx`
   * asserts all six by position.
   */
  readonly creation: {
    readonly open: string;
    readonly title: string;
    readonly description: string;
    readonly contentLabel: string;
    readonly contentHint: string;
    readonly whenLabel: string;
    readonly whenHint: string;
    /**
     * The sixth group — `2R-SURFACE-001`, slice 2R.3.
     *
     * `recurrenceOption` is keyed by `RecurrenceChoice`, so the five signed
     * patterns plus *does not repeat* each need a label in each locale or the
     * build fails. The options are phrased as what the owner gets — *"toda
     * semana, neste dia"* — rather than as the pattern's name, because
     * `monthlyWeekday` is a schema word and `2R-SURFACE-004` keeps schema words
     * off the screen.
     */
    readonly recurrenceLabel: string;
    readonly recurrenceHint: string;
    readonly recurrenceOption: Readonly<Record<RecurrenceChoice, string>>;
    readonly previewLabel: string;
    readonly previewHeading: string;
    readonly previewPending: string;
    readonly previewRegionLabel: string;
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

  /**
   * `2R-SURFACE-006`/`-007` — the repeating half, in a typed block rather than
   * in locale ternaries.
   *
   * Slice 2R.1 declares only what its **writer** needs: the outcome sentences,
   * and the two scope words. The control's own labels, the human-language
   * rendering of a rule (`2R-SURFACE-004`) and the occurrence preview land with
   * the surface in slice 2R.3 — a key declared before anything renders it would
   * be a string nobody measured.
   *
   * `scopeOccurrence` is written first because it is the default, and
   * `OD-2R-4`'s whole point is that the narrower action is the one a control
   * falls back to.
   */
  readonly series: {
    readonly scopeOccurrence: string;
    readonly scopeFuture: string;
    readonly created: string;
    readonly invalidRule: string;
    readonly invalidAnchor: string;
    readonly noHorizon: string;
    readonly notFound: string;
    readonly notActive: string;
    readonly appliedOccurrence: string;
    readonly appliedFuture: string;
    readonly ended: string;
    readonly failed: string;

    /**
     * Slice 2R.2's surface — the scope question, the two operations that carry
     * it, and the undo that spends exactly once.
     *
     * `badge` and `detachedBadge` are the two facts a row must state before the
     * owner chooses a scope: *this repeats*, and *this one was already pulled
     * out of the repetition*. `2R-SERIES-004` is only observable if the second
     * is visible — a detached occurrence that looked like every other one would
     * make "a later series edit did not reclaim it" a fact nobody could see.
     */
    readonly badge: string;
    readonly detachedBadge: string;
    readonly detachedHint: string;
    readonly editLabel: string;
    readonly scopeLegend: string;
    readonly scopeHint: string;
    readonly titleLabel: string;
    readonly timeLabel: string;
    readonly apply: string;
    readonly close: string;
    readonly endLabel: string;
    readonly endConfirmTitle: string;
    readonly endConfirmBody: string;
    readonly endConfirmAccept: string;
    readonly endConfirmDismiss: string;
    readonly occurrenceCancelNote: string;
    readonly resultRegionLabel: string;
    readonly working: string;

    /**
     * Four outcomes for one button, and they are four because the ledger has
     * four answers — not because a designer wanted variety.
     *
     * `undoAlready` is the idempotent branch: the row was already spent, so
     * nothing changed on this press and nothing was wrong either. Merging it
     * into `undoSucceeded` would claim a second reversal; merging it into
     * `undoFailed` would send the owner hunting for a problem that does not
     * exist.
     */
    readonly undoLabel: string;
    readonly undoPending: string;
    readonly undoRegionLabel: string;
    readonly undoSucceeded: string;
    readonly undoAlready: string;
    readonly undoStale: string;
    readonly undoFailed: string;

    /**
     * Slice 2R.3 — the rule in the owner's words, and the words it is made of.
     *
     * `2R-SURFACE-004` forbids a surface rendering a raw rule, an `RRULE` or a
     * JSON fragment, so the nouns and the sentence templates both live here and
     * `describeRecurrenceRule` is the only thing that assembles them. Being a
     * typed block is what makes `2R-SURFACE-007`'s *"asserted per key"*
     * enforceable: a weekday missing from one locale does not render blank, it
     * fails the build.
     *
     * The weekday names are **full** and deliberately not the calendar's
     * `["Seg", "Ter", …]`. Those are column headings for a grid; these have to
     * survive inside a sentence.
     */
    readonly language: RecurrenceLanguage;
  };

  readonly cancelConfirmTitle: string;
  readonly cancelConfirmBody: string;
  /**
   * The same confirmation, for an occurrence that carries a rule — slice 2R.2.
   *
   * `cancelConfirmBody` promises the row "can be reactivated later", and for an
   * ordinary reminder it can. For an **attached occurrence of an active series**
   * it cannot: cancelling materialises the replacement, the replacement takes the
   * one live slot `reminders_one_live_occurrence_per_series` allows, and
   * `restore` is then refused by that index. Proved by execution, in both
   * directions — the same restore succeeds on a detached occurrence and on an
   * ended series.
   *
   * So there are two bodies rather than one hedged sentence. `2R-SERIES-008`
   * asks an operation with no real compensation to **name itself** and ask
   * first; a single body that said "may be reactivated" would be true half the
   * time, which is the shape of a false promise rather than a caveat.
   */
  readonly cancelConfirmBodySeries: string;
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
      recurrenceLabel: "Repetir",
      recurrenceHint: "A repetição segue a data e a hora escolhidas acima.",
      recurrenceOption: {
        none: "Não repete",
        daily: "Todo dia",
        weekly: "Toda semana, neste dia da semana",
        monthlyDay: "Todo mês, neste dia",
        monthlyWeekday: "Todo mês, nesta posição da semana",
        yearly: "Todo ano, nesta data",
      },
      previewLabel: "Ver as próximas datas",
      previewHeading: "Próximas ocorrências",
      previewPending: "Calculando…",
      previewRegionLabel: "Próximas ocorrências da repetição",
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

    series: {
      scopeOccurrence: "Somente esta ocorrência",
      scopeFuture: "Esta e as futuras",
      created: "Lembrete recorrente criado.",
      invalidRule: "Essa repetição não é uma das que eu sei fazer. Escolha uma das opções.",
      invalidAnchor: "Escolha uma data e um horário válidos para a repetição.",
      noHorizon: "Não encontrei nenhuma data para essa repetição no próximo ano.",
      notFound: "Essa repetição não está disponível.",
      notActive: "Essa repetição já foi encerrada.",
      appliedOccurrence: "Alterei somente esta ocorrência. A repetição continua igual.",
      appliedFuture: "Alterei esta e as futuras. As anteriores ficaram como estavam.",
      ended: "Repetição encerrada. O histórico continua aqui.",
      failed: "Não foi possível alterar agora. Tente novamente.",

      badge: "Repete",
      detachedBadge: "Alterada só nesta vez",
      detachedHint: "Esta ocorrência saiu da repetição. Alterações futuras da série não voltam a alcançá-la.",
      editLabel: "Alterar repetição",
      scopeLegend: "O que você quer alterar?",
      scopeHint: "Escolha antes de salvar. Nada muda até você confirmar.",
      titleLabel: "Novo título",
      timeLabel: "Novo horário",
      apply: "Salvar alteração",
      close: "Fechar",
      endLabel: "Encerrar repetição",
      endConfirmTitle: "Encerrar esta repetição?",
      endConfirmBody:
        "Ela para de gerar novas ocorrências. As anteriores continuam na lista e no histórico.",
      endConfirmAccept: "Sim, encerrar",
      endConfirmDismiss: "Manter repetindo",
      occurrenceCancelNote: "Cancelar esta ocorrência não encerra a repetição.",
      resultRegionLabel: "Resultado da alteração da repetição",
      working: "Aplicando…",

      undoLabel: "Desfazer",
      undoPending: "Desfazendo…",
      undoRegionLabel: "Resultado de desfazer",
      undoSucceeded: "Desfeito. A repetição voltou ao estado anterior.",
      undoAlready: "Esta alteração já tinha sido desfeita. Nada mudou agora.",
      undoStale: "A repetição mudou depois desta alteração. Recarregue para ver o estado atual.",
      undoFailed: "Não foi possível desfazer agora.",

      /*
        The five weekdays ending in `-feira` are feminine; `sábado` and `domingo`
        are masculine. Carrying the gender is what lets one template produce
        "Toda segunda-feira" and "Todo domingo" instead of one of them being
        wrong -- which is exactly what the first draft of this block shipped,
        with a test that agreed with it.
      */
      language: {
        weekdays: [
          { name: "segunda-feira", gender: "f" },
          { name: "terça-feira", gender: "f" },
          { name: "quarta-feira", gender: "f" },
          { name: "quinta-feira", gender: "f" },
          { name: "sexta-feira", gender: "f" },
          { name: "sábado", gender: "m" },
          { name: "domingo", gender: "m" },
        ],
        months: [
          "janeiro", "fevereiro", "março", "abril", "maio", "junho",
          "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
        ],
        // `-1` is spelled, never rendered. Both forms, because the weekday it
        // qualifies decides which one: "toda última sexta-feira", "todo último
        // sábado".
        ordinals: {
          1: { f: "primeira", m: "primeiro" },
          2: { f: "segunda", m: "segundo" },
          3: { f: "terceira", m: "terceiro" },
          4: { f: "quarta", m: "quarto" },
          "-1": { f: "última", m: "último" },
        },
        daily: "Todo dia",
        weeklyOne: (weekday) =>
          `${weekday.gender === "f" ? "Toda" : "Todo"} ${weekday.name}`,
        weeklyMany: (weekdays) => `Toda semana: ${weekdays}`,
        monthlyDay: (day) => `Todo dia ${day}`,
        monthlyWeekday: (ordinal, weekday) =>
          weekday.gender === "f"
            ? `Toda ${ordinal.f} ${weekday.name} do mês`
            : `Todo ${ordinal.m} ${weekday.name} do mês`,
        yearly: (day, month) => `Todo dia ${day} de ${month}`,
        listSeparator: ", ",
        listFinal: " e ",
      },
    },

    cancelConfirmTitle: "Cancelar este lembrete?",
    cancelConfirmBody:
      "Ele deixa de disparar. O lembrete continua na lista e pode ser reativado depois.",
    cancelConfirmBodySeries:
      "Esta ocorrência deixa de disparar e a próxima já entra no lugar dela. A repetição continua, mas esta ocorrência não poderá ser reativada.",
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
      series_slot_taken:
        "A repetição já agendou a próxima ocorrência, então esta não pode ser reativada.",
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
      recurrenceLabel: "Repeat",
      recurrenceHint: "The repetition follows the date and time chosen above.",
      recurrenceOption: {
        none: "Does not repeat",
        daily: "Every day",
        weekly: "Every week, on this weekday",
        monthlyDay: "Every month, on this day",
        monthlyWeekday: "Every month, in this weekday position",
        yearly: "Every year, on this date",
      },
      previewLabel: "See the next dates",
      previewHeading: "Next occurrences",
      previewPending: "Calculating…",
      previewRegionLabel: "Next occurrences of the repetition",
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

    series: {
      scopeOccurrence: "This occurrence only",
      scopeFuture: "This and future ones",
      created: "Repeating reminder created.",
      invalidRule: "That repetition is not one I can do. Pick one of the options.",
      invalidAnchor: "Pick a valid date and time for the repetition.",
      noHorizon: "I found no date for that repetition within the next year.",
      notFound: "That repetition is not available.",
      notActive: "That repetition has already ended.",
      appliedOccurrence: "I changed this occurrence only. The repetition is unchanged.",
      appliedFuture: "I changed this one and the future ones. Earlier ones stayed as they were.",
      ended: "Repetition ended. The history is still here.",
      badge: "Repeats",
      detachedBadge: "Changed just this once",
      detachedHint:
        "This occurrence left the repetition. Later changes to the series will not reach it again.",
      editLabel: "Change repetition",
      scopeLegend: "What do you want to change?",
      scopeHint: "Choose before saving. Nothing changes until you confirm.",
      titleLabel: "New title",
      timeLabel: "New time",
      apply: "Save change",
      close: "Close",
      endLabel: "End repetition",
      endConfirmTitle: "End this repetition?",
      endConfirmBody:
        "It stops producing new occurrences. Earlier ones stay in the list and in the history.",
      endConfirmAccept: "Yes, end it",
      endConfirmDismiss: "Keep repeating",
      occurrenceCancelNote: "Cancelling this occurrence does not end the repetition.",
      resultRegionLabel: "Repetition change result",
      working: "Applying…",
      undoLabel: "Undo",
      undoPending: "Undoing…",
      undoRegionLabel: "Undo result",
      undoSucceeded: "Undone. The repetition is back to its previous state.",
      undoAlready: "This change had already been undone. Nothing changed now.",
      undoStale: "The repetition changed after this operation. Reload to see the current state.",
      undoFailed: "Could not undo right now.",
      /*
        English does not inflect the article, so every weekday is `"n"` and both
        ordinal forms are the same word. Declared rather than made optional: a
        locale that opted out of the field would be a locale the formatter has to
        branch on, and the branch belongs in the language, not in the formatter.
      */
      language: {
        weekdays: [
          { name: "Monday", gender: "n" },
          { name: "Tuesday", gender: "n" },
          { name: "Wednesday", gender: "n" },
          { name: "Thursday", gender: "n" },
          { name: "Friday", gender: "n" },
          { name: "Saturday", gender: "n" },
          { name: "Sunday", gender: "n" },
        ],
        months: [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December",
        ],
        ordinals: {
          1: { f: "first", m: "first" },
          2: { f: "second", m: "second" },
          3: { f: "third", m: "third" },
          4: { f: "fourth", m: "fourth" },
          "-1": { f: "last", m: "last" },
        },
        daily: "Every day",
        weeklyOne: (weekday) => `Every ${weekday.name}`,
        weeklyMany: (weekdays) => `Every week: ${weekdays}`,
        monthlyDay: (day) => `Every month on day ${day}`,
        monthlyWeekday: (ordinal, weekday) =>
          `Every ${ordinal.f} ${weekday.name} of the month`,
        yearly: (day, month) => `Every ${month} ${day}`,
        listSeparator: ", ",
        listFinal: " and ",
      },
      failed: "Could not change it right now. Try again.",
    },
    historyLink: "See in history",

    cancelConfirmTitle: "Cancel this reminder?",
    cancelConfirmBody:
      "It stops firing. The reminder stays in the list and can be reactivated later.",
    cancelConfirmBodySeries:
      "This occurrence stops firing and the next one takes its place right away. The repetition continues, but this occurrence cannot be reactivated.",
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
      series_slot_taken:
        "The repetition has already scheduled the next occurrence, so this one cannot be reactivated.",
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
