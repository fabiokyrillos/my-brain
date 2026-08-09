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
