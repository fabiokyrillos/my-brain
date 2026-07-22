import type {
  AttentionReason,
  DailyCycleAction,
  DailyCycleMessageKey,
  ProductState,
} from "./contracts";

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

export const dailyCycleCopy = {
  "pt-BR": {
    productStates: {
      saved: { label: "Salvo", description: "Seu registro foi preservado." },
      organizing: { label: "Organizando", description: "O Brain está organizando este registro." },
      needs_attention: { label: "Precisa de você", description: "Há uma decisão que precisa da sua confirmação." },
      ready: { label: "Pronto", description: "Este registro foi organizado sem pendências atuais." },
      could_not_organize: { label: "Não consegui organizar", description: "O registro foi preservado e pode ser tentado novamente." },
    },
    attentionReasons: {
      review_interpretation: { title: "Revise a interpretação", description: "Confirme ou ajuste o que o Brain entendeu." },
      confirm_existing_candidates: { title: "Decida sobre as sugestões", description: "Escolha o destino de cada sugestão pendente." },
      answer_existing_question: { title: "Responda uma pergunta", description: "Uma informação precisa ser esclarecida para concluir a organização." },
      retry_processing: { title: "Tente organizar novamente", description: "O processamento não foi concluído e pode ser tentado de novo." },
      resolve_consistency: { title: "Revise este registro", description: "Encontramos uma inconsistência e preservamos o registro para sua revisão." },
    },
    actions: {
      open_entry: "Abrir registro",
      review_interpretation: "Revisar",
      confirm_existing_candidates: "Resolver sugestões",
      answer_existing_question: "Responder",
      retry_processing: "Tentar novamente",
      resolve_consistency: "Revisar registro",
      correct_interpretation: "Corrigir interpretação",
      undo_correction: "Desfazer correção",
      undo_task_creation: "Desfazer criação de tarefas",
      open_task: "Abrir tarefa",
      complete_task: "Concluir",
      wait_task: "Aguardar",
      resume_task: "Retomar",
      reopen_task: "Reabrir",
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
    },
  },
  en: {
    productStates: {
      saved: { label: "Saved", description: "Your record was preserved." },
      organizing: { label: "Organizing", description: "Brain is organizing this record." },
      needs_attention: { label: "Needs your attention", description: "There is a decision that needs your confirmation." },
      ready: { label: "Ready", description: "This record was organized with no current pending decision." },
      could_not_organize: { label: "Could not organize", description: "The record was preserved and can be tried again." },
    },
    attentionReasons: {
      review_interpretation: { title: "Review the interpretation", description: "Confirm or adjust what Brain understood." },
      confirm_existing_candidates: { title: "Resolve the suggestions", description: "Choose what should happen to each pending suggestion." },
      answer_existing_question: { title: "Answer a question", description: "One detail needs clarification before organization can finish." },
      retry_processing: { title: "Try organizing again", description: "Processing did not finish and can be tried again." },
      resolve_consistency: { title: "Review this record", description: "We found an inconsistency and preserved the record for your review." },
    },
    actions: {
      open_entry: "Open record",
      review_interpretation: "Review",
      confirm_existing_candidates: "Resolve suggestions",
      answer_existing_question: "Answer",
      retry_processing: "Try again",
      resolve_consistency: "Review record",
      correct_interpretation: "Correct interpretation",
      undo_correction: "Undo correction",
      undo_task_creation: "Undo task creation",
      open_task: "Open task",
      complete_task: "Complete",
      wait_task: "Wait",
      resume_task: "Resume",
      reopen_task: "Reopen",
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
    },
  },
} satisfies Record<DailyCycleLocale, DailyCycleCopy>;

export function getDailyCycleCopy(locale: DailyCycleLocale): DailyCycleCopy {
  return dailyCycleCopy[locale];
}
