/**
 * The verbs the owner can say back to the Brain — **one definition, two
 * surfaces.**
 *
 * `2S-ACT-011` is the reason this module exists rather than two lists that
 * happen to agree: *"The verb set and its copy are read from ONE source and
 * asserted equal across `/app/notifications` and the attention surface; a verb
 * present in one and absent from the other fails."* Two lists that agree today
 * are two lists, and this repository has already paid for one concept with
 * three copies that drifted.
 *
 * ## The four scopes, which is the whole of what this slice must not blur
 *
 * `2S-SILENCE-011` requires each verb to leave the other three subjects of
 * change untouched. The `changes` field is that contract stated in the type, so
 * a verb cannot be added without saying what it touches:
 *
 * | verb | changes | leaves alone |
 * |---|---|---|
 * | `mark_read` | this message's status | the subject, and every other message about it |
 * | `dismiss` | this message's presence | the subject, and the cadence |
 * | `silence_until` | equivalent notices about this subject, until an instant | the subject, and this message |
 * | `silence_subject` | equivalent notices about this subject | the subject, and this message |
 * | `complete_task` | **the task** | every message |
 * | `reschedule_task` | **the task** | every message |
 *
 * ## `2S-ACT-006`, in the copy rather than in a comment
 *
 * *"An action that changes the task says so; an action that changes only the
 * message says that."* The two groups are therefore worded around different
 * nouns — the task verbs name **a tarefa / the task**, the message verbs name
 * **o aviso / this notice** — and `verbs.test.ts` asserts that separation in
 * both locales rather than trusting it to review.
 */

import type { Locale } from "@/lib/preferences";

/** What a verb actually changes. `2S-SILENCE-011`'s four scopes, named. */
export type VerbScope = "message" | "cadence" | "task";

export type VerbId =
  | "mark_read"
  | "dismiss"
  | "silence_until"
  | "silence_subject"
  | "complete_task"
  | "reschedule_task";

export type VerbDefinition = {
  readonly id: VerbId;
  readonly scope: VerbScope;
  /**
   * Whether the verb can be undone by the product's existing undo affordance
   * (`2S-ACT-009`), or must ask first because it cannot (`2S-ACT-010`).
   */
  readonly reversible: boolean;
  /** Only meaningful for `scope: "task"` — the subject kinds that admit it. */
  readonly appliesTo: readonly ("task" | "reminder")[];
};

/**
 * The single ordered set. Order is the order a row offers them in, so that the
 * two surfaces cannot disagree about that either.
 */
export const VERBS: readonly VerbDefinition[] = [
  { id: "complete_task", scope: "task", reversible: true, appliesTo: ["task"] },
  { id: "reschedule_task", scope: "task", reversible: true, appliesTo: ["task"] },
  { id: "mark_read", scope: "message", reversible: false, appliesTo: ["task", "reminder"] },
  { id: "dismiss", scope: "message", reversible: false, appliesTo: ["task", "reminder"] },
  { id: "silence_until", scope: "cadence", reversible: true, appliesTo: ["task", "reminder"] },
  { id: "silence_subject", scope: "cadence", reversible: true, appliesTo: ["task", "reminder"] },
];

export type VerbCopy = {
  /** The visible label. Short, because it sits in a row. */
  readonly label: string;
  /**
   * The accessible name, which carries the notice's own subject.
   *
   * Twenty buttons reading "Descartar" are twenty buttons a screen-reader user
   * cannot tell apart — the defect `2P-SETTINGS-008` already fixed for *Lida*
   * on this page, kept here rather than re-introduced beside it.
   */
  readonly accessibleName: (subject: string) => string;
  /** What it will do, in the owner's words. Shown in the menu, not only on hover. */
  readonly meaning: string;
};

type VerbCopyTable = Readonly<Record<VerbId, VerbCopy>>;

const PT: VerbCopyTable = {
  complete_task: {
    label: "Concluir tarefa",
    accessibleName: (subject) => `Concluir tarefa: ${subject}`,
    meaning: "Marca a tarefa como concluída. Muda a tarefa, não só este aviso.",
  },
  reschedule_task: {
    label: "Reagendar tarefa",
    accessibleName: (subject) => `Reagendar tarefa: ${subject}`,
    meaning: "Muda o prazo da tarefa. Muda a tarefa, não só este aviso.",
  },
  mark_read: {
    label: "Marcar aviso como lido",
    accessibleName: (subject) => `Marcar aviso como lido: ${subject}`,
    meaning: "Marca este aviso como lido. Não muda a tarefa nem os próximos avisos.",
  },
  dismiss: {
    label: "Descartar aviso",
    accessibleName: (subject) => `Descartar aviso: ${subject}`,
    meaning: "Tira este aviso da lista. Não muda a tarefa, e um próximo aviso ainda pode chegar.",
  },
  silence_until: {
    label: "Silenciar por um tempo",
    accessibleName: (subject) => `Silenciar por um tempo: ${subject}`,
    meaning: "Para de avisar sobre este assunto até a data escolhida. Não muda a tarefa nem este aviso.",
  },
  silence_subject: {
    label: "Silenciar este assunto",
    accessibleName: (subject) => `Silenciar este assunto: ${subject}`,
    meaning: "Para de avisar sobre este assunto. Não muda a tarefa nem este aviso.",
  },
};

const EN: VerbCopyTable = {
  complete_task: {
    label: "Complete task",
    accessibleName: (subject) => `Complete task: ${subject}`,
    meaning: "Marks the task complete. Changes the task, not just this notice.",
  },
  reschedule_task: {
    label: "Reschedule task",
    accessibleName: (subject) => `Reschedule task: ${subject}`,
    meaning: "Changes the task's due date. Changes the task, not just this notice.",
  },
  mark_read: {
    label: "Mark notice read",
    accessibleName: (subject) => `Mark notice read: ${subject}`,
    meaning: "Marks this notice read. Changes neither the task nor future notices.",
  },
  dismiss: {
    label: "Dismiss notice",
    accessibleName: (subject) => `Dismiss notice: ${subject}`,
    meaning: "Removes this notice from the list. The task is unchanged, and a future notice can still arrive.",
  },
  silence_until: {
    label: "Silence for a while",
    accessibleName: (subject) => `Silence for a while: ${subject}`,
    meaning: "Stops notices about this subject until the date you choose. Changes neither the task nor this notice.",
  },
  silence_subject: {
    label: "Silence this subject",
    accessibleName: (subject) => `Silence this subject: ${subject}`,
    meaning: "Stops notices about this subject. Changes neither the task nor this notice.",
  },
};

export function getVerbCopy(locale: Locale): VerbCopyTable {
  return locale === "pt-BR" ? PT : EN;
}

/**
 * The verbs a given row may offer, in order.
 *
 * `2S-ACT-005`: eligibility is read from the subject's own available actions,
 * never fixed in a component — so a completed subject offers no *Concluir*, and
 * no control is rendered whose only possible outcome is a refusal.
 *
 * `availableActions` is the same list `WorkItemActions` reads, derived by
 * `statusActions` from the task's status. A row with **no** derived subject
 * (see `subject.ts`) passes an empty list and gets its message verbs only.
 */
export function verbsForRow(options: {
  readonly subjectType: "task" | "reminder" | null;
  readonly availableActions: readonly string[];
}): readonly VerbDefinition[] {
  const { subjectType, availableActions } = options;
  return VERBS.filter((verb) => {
    if (subjectType === null) return verb.scope === "message";
    if (!verb.appliesTo.includes(subjectType)) return false;
    if (verb.id === "complete_task") return availableActions.includes("complete_task");
    // Rescheduling is offered where the subject is still live enough to have a
    // due date worth moving; the same available-action list decides it, so this
    // surface never disagrees with Work about what a task admits.
    if (verb.id === "reschedule_task") {
      return availableActions.includes("complete_task") || availableActions.includes("resume_task");
    }
    return true;
  });
}

/**
 * The one primary action, derived (`2S-ACT-001`).
 *
 * *"The primary action is derived from the subject's own state, not fixed in the
 * component; two subjects in different states render different primaries in the
 * same list."* The first eligible verb in `VERBS` order is the primary — so a
 * live task leads with *Concluir*, and a row whose task admits nothing leads
 * with the message verb. Everything else goes in the one compact menu
 * (`2S-ACT-002`).
 */
export function primaryVerbFor(verbs: readonly VerbDefinition[]): VerbDefinition | null {
  return verbs[0] ?? null;
}

export function menuVerbsFor(verbs: readonly VerbDefinition[]): readonly VerbDefinition[] {
  return verbs.slice(1);
}
