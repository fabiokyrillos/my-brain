/**
 * Phase 2L's Work-surface copy, typed (ADR-036, `docs/ENGINEERING_STANDARDS.md`).
 *
 * ## Why a second copy module on one surface
 *
 * `work-actions-copy.ts` owns what the **four status buttons** say — labels, the
 * two click refusals, the refresh affordance. It was written for that and its
 * types are keyed by `WorkSurfaceAction` and `WorkCommandRefusal`, which are the
 * status path's vocabularies and not this slice's.
 *
 * What Phase 2L adds — withheld content, a local reveal, quick edit's frame and
 * the undo affordance — is keyed by nothing that file knows about. Folding it in
 * would mean one record whose halves are indexed by unrelated vocabularies; the
 * repository's answer to that is a feature `copy.ts` in the
 * `daily-cycle/copy.ts` shape, which is what this is.
 *
 * Nothing here is added as an inline locale ternary: the ceiling
 * (`locale-ternary-guard.test.ts`) is one-directional and this slice does not
 * raise it.
 *
 * ## No engineering vocabulary
 *
 * PRD §5.3: no status literal, no action name, no error code, no RPC name. The
 * strings below name what the user sees and what they can do about it — a
 * "protected" item rather than a `highly_sensitive` one, and "undo" rather than
 * a reversal strategy.
 */

import type { Locale } from "@/lib/preferences";

export type WorkCopy = {
  /**
   * `2L-PRIVACY-003` — what a masked item says instead of its content.
   *
   * `revealFor`/`hideFor` are functions rather than constants because
   * `2L-ACCESS-003` requires controls that differ only by row to be
   * distinguishable: an accessible name of "Reveal" repeated fifty times names
   * nothing. They take the row's own label, which for a masked row is the only
   * thing about it a user can still read.
   */
  readonly protected: {
    readonly label: string;
    readonly reveal: string;
    readonly hide: string;
    readonly revealFor: (item: string) => string;
    readonly hideFor: (item: string) => string;
    /**
     * Stated where a user could otherwise be misled (`2L-PRIVACY-004`): this
     * protection follows the entry a task came from, so a task typed straight
     * into the list has nothing to follow.
     */
    readonly partialCoverage: string;
  };
  /** `2L-EDIT-001` — the quick-edit frame on a list row. */
  readonly quickEdit: {
    readonly summary: string;
    readonly summaryFor: (item: string) => string;
    readonly hint: string;
  };
  /**
   * `2L-EDIT-008`/`-009` — the undo affordance.
   *
   * Two sentences that must never be merged: `window` promises a reversal, and
   * `recovery` promises a place to go. Copy that says the first when only the
   * second is true is a false promise, so there is no shared string they could
   * be assembled from.
   */
  /**
   * `2L-BULK-005`/`-009` — selection, preview and result.
   *
   * The counts are function parameters rather than interpolated at the call
   * site, so the sentence is one string per locale rather than three fragments
   * a component assembles. `partial` takes **both** numbers because
   * `2L-BULK-009` requires a partial to name counts on both sides: a sentence
   * that said only "2 applied" would be a partial reported as a success.
   */
  readonly bulk: {
    /** The landmark name for the whole bar — distinct from the field labels inside it. */
    readonly barLabel: string;
    readonly selected: (count: number) => string;
    readonly ceilingHint: (ceiling: number) => string;
    readonly ceilingReached: (ceiling: number) => string;
    readonly clear: string;
    readonly selectAllShown: string;
    readonly selectRow: (item: string) => string;
    readonly apply: string;
    readonly chooseOperation: string;
    readonly chooseValue: string;
    readonly previewHeading: string;
    readonly previewCounts: (eligible: number, refused: number) => string;
    readonly previewNothing: string;
    readonly reasons: Record<"ineligible_status", string>;
    readonly resultRegionLabel: string;
    readonly allApplied: (count: number) => string;
    readonly partial: (applied: number, refused: number) => string;
    readonly noneApplied: (count: number) => string;
    readonly nothingSelected: string;
    readonly itemReasons: Record<"unresolvable" | "ineligible" | "invalid_value" | "failed", string>;
    readonly valueRefused: string;
    readonly notBulkEligible: string;
    readonly malformed: string;
  };
  readonly undo: {
    readonly label: string;
    readonly window: string;
    readonly pending: string;
    readonly done: string;
    readonly unavailable: string;
    readonly expired: string;
    readonly failed: string;
    readonly regionLabel: string;
  };
};

const ptBR: WorkCopy = {
  protected: {
    label: "Conteúdo protegido",
    reveal: "Mostrar",
    hide: "Ocultar",
    revealFor: (item) => `Mostrar conteúdo protegido de ${item}`,
    hideFor: (item) => `Ocultar conteúdo protegido de ${item}`,
    partialCoverage:
      "A proteção acompanha a anotação de origem da tarefa. Tarefas que você criou direto aqui não têm origem para acompanhar.",
  },
  quickEdit: {
    summary: "Editar aqui",
    summaryFor: (item) => `Editar ${item} aqui`,
    hint: "As mudanças valem na hora, sem sair da lista.",
  },
  bulk: {
    barLabel: "Ações em lote",
    selected: (count) => `${count} selecionada${count === 1 ? "" : "s"}`,
    ceilingHint: (ceiling) => `Você pode selecionar até ${ceiling} tarefas de uma vez.`,
    ceilingReached: (ceiling) =>
      `Você já selecionou ${ceiling} tarefas, o máximo de uma vez. Tire uma da seleção para escolher outra.`,
    clear: "Limpar seleção",
    selectAllShown: "Selecionar as que estão nesta página",
    selectRow: (item) => `Selecionar ${item}`,
    apply: "Aplicar às selecionadas",
    chooseOperation: "O que fazer com as selecionadas",
    chooseValue: "Novo valor",
    previewHeading: "Antes de aplicar",
    previewCounts: (eligible, refused) =>
      `${eligible} vão mudar; ${refused} não podem receber esta mudança agora.`,
    previewNothing: "Nenhuma das selecionadas pode receber esta mudança agora.",
    reasons: { ineligible_status: "O estado atual da tarefa não permite esta mudança." },
    resultRegionLabel: "Resultado da ação em lote",
    allApplied: (count) => `Pronto: ${count} tarefa${count === 1 ? "" : "s"} atualizada${count === 1 ? "" : "s"}.`,
    partial: (applied, refused) =>
      `${applied} atualizada${applied === 1 ? "" : "s"}; ${refused} não mudou${refused === 1 ? "" : "ram"}.`,
    noneApplied: (count) => `Nada mudou: ${count} tarefa${count === 1 ? "" : "s"} não pôde receber esta mudança.`,
    nothingSelected: "Nenhuma tarefa selecionada.",
    itemReasons: {
      unresolvable: "Esta tarefa não está mais aqui.",
      ineligible: "O estado desta tarefa mudou desde que você a selecionou.",
      invalid_value: "Este valor não vale para esta tarefa.",
      failed: "Não foi possível aplicar. Nada mudou nesta tarefa.",
    },
    valueRefused: "Revise o valor antes de aplicar às selecionadas.",
    notBulkEligible: "Esta ação não pode ser aplicada a várias tarefas de uma vez.",
    malformed: "Não foi possível ler a seleção. Nada mudou.",
  },
  undo: {
    label: "Desfazer",
    window: "Você pode desfazer isto por 24 horas.",
    pending: "Desfazendo…",
    done: "Desfeito.",
    unavailable: "Isto já foi desfeito.",
    expired: "O prazo para desfazer terminou.",
    failed: "Não foi possível desfazer. Nada mudou.",
    regionLabel: "Resultado do desfazer",
  },
};

const en: WorkCopy = {
  protected: {
    label: "Protected content",
    reveal: "Show",
    hide: "Hide",
    revealFor: (item) => `Show protected content for ${item}`,
    hideFor: (item) => `Hide protected content for ${item}`,
    partialCoverage:
      "Protection follows the note a task came from. Tasks you typed straight in here have no note to follow.",
  },
  quickEdit: {
    summary: "Edit here",
    summaryFor: (item) => `Edit ${item} here`,
    hint: "Changes apply immediately, without leaving the list.",
  },
  bulk: {
    barLabel: "Bulk actions",
    selected: (count) => `${count} selected`,
    ceilingHint: (ceiling) => `You can select up to ${ceiling} tasks at a time.`,
    ceilingReached: (ceiling) =>
      `You already have ${ceiling} tasks selected, which is the most at one time. Remove one to choose another.`,
    clear: "Clear selection",
    selectAllShown: "Select the ones on this page",
    selectRow: (item) => `Select ${item}`,
    apply: "Apply to selected",
    chooseOperation: "What to do with the selected tasks",
    chooseValue: "New value",
    previewHeading: "Before applying",
    previewCounts: (eligible, refused) =>
      `${eligible} will change; ${refused} cannot take this change right now.`,
    previewNothing: "None of the selected tasks can take this change right now.",
    reasons: { ineligible_status: "The task's current state does not allow this change." },
    resultRegionLabel: "Bulk action result",
    allApplied: (count) => `Done: ${count} task${count === 1 ? "" : "s"} updated.`,
    partial: (applied, refused) =>
      `${applied} updated; ${refused} did not change.`,
    noneApplied: (count) => `Nothing changed: ${count} task${count === 1 ? "" : "s"} could not take this change.`,
    nothingSelected: "No tasks selected.",
    itemReasons: {
      unresolvable: "This task is no longer here.",
      ineligible: "This task's state changed since you selected it.",
      invalid_value: "That value does not apply to this task.",
      failed: "We could not apply this. Nothing changed on this task.",
    },
    valueRefused: "Review the value before applying it to the selected tasks.",
    notBulkEligible: "This action cannot be applied to several tasks at once.",
    malformed: "We could not read the selection. Nothing changed.",
  },
  undo: {
    label: "Undo",
    window: "You can undo this for 24 hours.",
    pending: "Undoing…",
    done: "Undone.",
    unavailable: "This has already been undone.",
    expired: "The time to undo this has passed.",
    failed: "We could not undo this. Nothing changed.",
    regionLabel: "Undo result",
  },
};

const BY_LOCALE: Record<Locale, WorkCopy> = { "pt-BR": ptBR, en };

export function getWorkCopy(locale: Locale): WorkCopy {
  return BY_LOCALE[locale];
}
