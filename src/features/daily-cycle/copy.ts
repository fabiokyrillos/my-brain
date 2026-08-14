import type {
  AttentionReason,
  DailyCycleAction,
  DailyCycleMessageKey,
  ProductState,
} from "./contracts";
import { withAgentName } from "@/lib/agent-name";

export const dailyCycleLocales = ["pt-BR", "en"] as const;
export type DailyCycleLocale = (typeof dailyCycleLocales)[number];

type ProductStateCopy = { label: string; description: string };
type AttentionReasonCopy = { title: string; description: string };

export type DailyCycleCopy = {
  productStates: Record<ProductState, ProductStateCopy>;
  attentionReasons: Record<AttentionReason, AttentionReasonCopy>;
  actions: Record<DailyCycleAction, string>;
  messages: Record<DailyCycleMessageKey, string>;
};

/**
 * The two sections UX-04 added, as copy rather than as ternaries.
 *
 * UX-22's rule is that a slice does not leave more inline locale ternaries than
 * it found, and that new copy goes through a typed module. `entry-review.tsx`
 * still carries the ones it was written with; the ones this slice would have
 * added live here instead.
 */
export type EntryReviewSectionCopy = {
  readonly originalTitle: string;
  readonly originalNote: string;
  readonly outcomesTitle: string;
  readonly outcomesNote: string;
  readonly outcomesEmpty: string;
};

const entryReviewSectionCopy: Record<DailyCycleLocale, EntryReviewSectionCopy> = {
  "pt-BR": {
    originalTitle: "O que você escreveu",
    originalNote: "Preservado exatamente como foi registrado.",
    outcomesTitle: "O que passou a existir",
    outcomesNote: "Tudo que este registro criou ou reconheceu, com onde inspecionar.",
    outcomesEmpty: "Nada foi criado a partir deste registro. Ele permanece salvo como referência.",
  },
  en: {
    originalTitle: "What you wrote",
    originalNote: "Preserved exactly as it was recorded.",
    outcomesTitle: "What now exists",
    outcomesNote: "Everything this record created or recognized, and where to inspect it.",
    outcomesEmpty: "Nothing was created from this record. It stays saved as reference.",
  },
};

export function getEntryReviewSectionCopy(locale: DailyCycleLocale): EntryReviewSectionCopy {
  return entryReviewSectionCopy[locale];
}

/**
 * The sentences a conflict row needs beyond the shared reason copy
 * (`2N-CONFLICT-002`/`006`).
 *
 * Four obligations, in plain language and in both locales: what is inconsistent,
 * which two values disagree, why the assistant did not decide, and what the owner
 * can do about it. Nothing here names a table, an id, a fingerprint or a
 * confidence, and nothing here says "archived" — which is exactly what the
 * product wrongly called this row before the detector existed.
 */
export type ConflictSectionCopy = {
  readonly validFromLabel: string;
  readonly validUntilLabel: string;
  readonly whyNotDecided: string;
  readonly whatYouCanDo: string;
  readonly masked: string;
  readonly groupLabel: string;
};

const conflictSectionCopy: Record<DailyCycleLocale, ConflictSectionCopy> = {
  "pt-BR": {
    validFromLabel: "Começa em",
    validUntilLabel: "Deveria terminar em",
    whyNotDecided: "As duas datas foram preservadas exatamente como estavam. Escolher uma delas por conta própria seria inventar o que você quis dizer.",
    whatYouCanDo: "Abra a memória e remova a data de término para desfazer a contradição.",
    masked: "Conteúdo muito sensível, oculto",
    groupLabel: "Informações que não podem estar certas ao mesmo tempo",
  },
  en: {
    validFromLabel: "Starts on",
    validUntilLabel: "Was supposed to end on",
    whyNotDecided: "Both dates were preserved exactly as they were. Picking one of them unprompted would be inventing what you meant.",
    whatYouCanDo: "Open the memory and remove the end date to undo the contradiction.",
    masked: "Highly sensitive content, hidden",
    groupLabel: "Facts that cannot both be right",
  },
};

export function getConflictSectionCopy(locale: DailyCycleLocale): ConflictSectionCopy {
  return conflictSectionCopy[locale];
}

export const dailyCycleCopy = {
  "pt-BR": {
    productStates: {
      saved: { label: "Salvo", description: "Seu registro foi preservado." },
      organizing: { label: "Organizando", description: "O {agent} está organizando este registro." },
      needs_attention: { label: "Precisa de você", description: "Há uma decisão que precisa da sua confirmação." },
      ready: { label: "Pronto", description: "Este registro foi organizado sem pendências atuais." },
      could_not_organize: { label: "Não consegui organizar", description: "O registro foi preservado e pode ser tentado novamente." },
    },
    attentionReasons: {
      review_interpretation: { title: "Revise a interpretação", description: "Confirme ou ajuste o que o {agent} entendeu." },
      confirm_existing_candidates: { title: "Decida sobre as sugestões", description: "Escolha o destino de cada sugestão pendente." },
      answer_existing_question: { title: "Responda uma pergunta", description: "Uma informação precisa ser esclarecida para concluir a organização." },
      retry_processing: { title: "Tente organizar novamente", description: "O processamento não foi concluído e pode ser tentado de novo." },
      resolve_consistency: { title: "Revise este registro", description: "Encontramos uma inconsistência e preservamos o registro para sua revisão." },
      configure_ai_credential: {
        title: "Configure sua chave de IA",
        description: "Seu registro foi salvo por completo. Para o {agent} interpretá-lo, configure sua própria chave de IA em Configurações.",
      },
      resolve_validity_conflict: {
        title: "Duas datas que não podem estar certas",
        description: "Esta memória começa depois da data em que deveria terminar. O {agent} não escolheu uma das duas por você.",
      },
    },
    actions: {
      open_entry: "Abrir registro",
      review_interpretation: "Revisar",
      confirm_existing_candidates: "Resolver sugestões",
      answer_existing_question: "Responder",
      retry_processing: "Tentar novamente",
      resolve_consistency: "Revisar registro",
      correct_interpretation: "Ajustar o que o {agent} entendeu",
      undo_correction: "Desfazer correção",
      undo_task_creation: "Desfazer criação de tarefas",
      open_task: "Abrir tarefa",
      complete_task: "Concluir",
      wait_task: "Aguardar",
      resume_task: "Retomar",
      reopen_task: "Reabrir",
      configure_ai_credential: "Configurar chave de IA",
      interpret_pending_entries: "Interpretar registros pendentes",
      resolve_validity_conflict: "Abrir memória e corrigir",
    },
    messages: {
      capture_saved: "Salvo. A organização foi solicitada.",
      capture_replayed: "Este registro já tinha sido salvo.",
      correction_saved: "Correção salva.",
      undo_applied: "Alteração desfeita.",
      reprocessing_queued: "Nova organização solicitada.",
      candidates_confirmed: "Sugestões resolvidas.",
      task_creation_undone: "Decisões desfeitas.",
      retry_scheduled: "Uma nova tentativa foi agendada.",
      question_answered: "Resposta salva.",
      validation_failed: "Revise os campos informados.",
      session_expired: "Sua sessão expirou. Entre novamente.",
      item_not_found: "Não encontramos este item.",
      version_conflict: "Este registro mudou. Atualize antes de tentar novamente.",
      action_unavailable: "Esta ação não está mais disponível.",
      retry_not_available: "Ainda não é possível tentar novamente.",
      action_failed: "Não foi possível concluir esta ação agora.",
      pending_entries_queued: "{count} registro(s) enviados para interpretação.",
      pending_entries_none: "Nenhum registro pendente para interpretar.",
      credential_required: "Configure sua chave de IA em Configurações antes de usar este recurso.",
    },
  },
  en: {
    productStates: {
      saved: { label: "Saved", description: "Your record was preserved." },
      organizing: { label: "Organizing", description: "{agent} is organizing this record." },
      needs_attention: { label: "Needs your attention", description: "There is a decision that needs your confirmation." },
      ready: { label: "Ready", description: "This record was organized with no current pending decision." },
      could_not_organize: { label: "Could not organize", description: "The record was preserved and can be tried again." },
    },
    attentionReasons: {
      review_interpretation: { title: "Review the interpretation", description: "Confirm or adjust what {agent} understood." },
      confirm_existing_candidates: { title: "Resolve the suggestions", description: "Choose what should happen to each pending suggestion." },
      answer_existing_question: { title: "Answer a question", description: "One detail needs clarification before organization can finish." },
      retry_processing: { title: "Try organizing again", description: "Processing did not finish and can be tried again." },
      resolve_consistency: { title: "Review this record", description: "We found an inconsistency and preserved the record for your review." },
      configure_ai_credential: {
        title: "Set up your AI key",
        description: "Your record was saved in full. For {agent} to interpret it, set up your own AI key in Settings.",
      },
      resolve_validity_conflict: {
        title: "Two dates that cannot both be right",
        description: "This memory starts after the date it was supposed to end. {agent} did not pick one of them for you.",
      },
    },
    actions: {
      open_entry: "Open record",
      review_interpretation: "Review",
      confirm_existing_candidates: "Resolve suggestions",
      answer_existing_question: "Answer",
      retry_processing: "Try again",
      resolve_consistency: "Review record",
      correct_interpretation: "Adjust what {agent} understood",
      undo_correction: "Undo correction",
      undo_task_creation: "Undo task creation",
      open_task: "Open task",
      complete_task: "Complete",
      wait_task: "Wait",
      resume_task: "Resume",
      reopen_task: "Reopen",
      configure_ai_credential: "Set up AI key",
      interpret_pending_entries: "Interpret pending records",
      resolve_validity_conflict: "Open memory and fix",
    },
    messages: {
      capture_saved: "Saved. Organization was queued.",
      capture_replayed: "This record was already saved.",
      correction_saved: "Correction saved.",
      undo_applied: "Change undone.",
      reprocessing_queued: "A new organization run was queued.",
      candidates_confirmed: "Suggestions resolved.",
      task_creation_undone: "Decisions undone.",
      retry_scheduled: "Another attempt was scheduled.",
      question_answered: "Answer saved.",
      validation_failed: "Review the supplied fields.",
      session_expired: "Your session expired. Sign in again.",
      item_not_found: "We could not find this item.",
      version_conflict: "This record changed. Refresh before trying again.",
      action_unavailable: "This action is no longer available.",
      retry_not_available: "This item cannot be tried again yet.",
      action_failed: "This action could not be completed right now.",
      pending_entries_queued: "{count} record(s) queued for interpretation.",
      pending_entries_none: "No pending records to interpret.",
      credential_required: "Set up your AI key in Settings before using this feature.",
    },
  },
} satisfies Record<DailyCycleLocale, DailyCycleCopy>;

/**
 * @param agentName the assistant’s configured name (UX-06). Required, so the
 * compiler finds every surface that would otherwise render a hardcoded one.
 */
export function getDailyCycleCopy(locale: DailyCycleLocale, agentName: string): DailyCycleCopy {
  return withAgentName(dailyCycleCopy[locale], agentName);
}
