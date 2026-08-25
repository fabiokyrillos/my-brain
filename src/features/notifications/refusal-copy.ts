/**
 * What the owner is told when an action is refused — **a closed set of
 * sentences, and nothing from the database.**
 *
 * ## The rule this file enforces
 *
 * Nothing the database produces reaches a screen. Not the SQLSTATE, not the
 * constraint name, not `error.message`, not `error.details`, not the RPC's own
 * English string. Those are diagnostics: they name internals, they are not
 * translated, and a constraint name on screen tells the owner nothing they can
 * act on while telling a stranger something about the schema.
 *
 * The refusal **codes** are used only as a lookup key, on the server, and what
 * crosses to the UI is one of the sentences below. `refusalMessage` is total
 * over its input type, so there is no branch that can fall through to raw text.
 *
 * ## Why the sentences are specific
 *
 * Slice 2S.1 built six separate named refusals precisely so the owner could be
 * told *which* thing was wrong. Collapsing them into "algo deu errado" would
 * throw that away at the last step. Each sentence therefore says what happened
 * **and what to do**, in the owner's language, without naming a column.
 *
 * The two subjects that cannot be explained usefully — an unsupported subject
 * kind and an unsupported notice type — are product bugs rather than owner
 * mistakes, so they get an honest "this could not be done" instead of advice
 * the owner cannot follow.
 */

import type { Locale } from "@/lib/preferences";

/**
 * Every outcome the surface can be handed. The union is closed, and
 * `refusalMessage` is exhaustive over it — a new code added to the Server
 * Action without a sentence here is a **type error**, not a blank space or a
 * leaked internal string.
 */
export type ActionRefusal =
  | "unauthenticated"
  | "invalid"
  | "failed"
  | "stale"
  | "SUPPRESSION_SUBJECT_UNSUPPORTED"
  | "SUPPRESSION_SUBJECT_MISSING"
  | "SUPPRESSION_SCOPE_UNSUPPORTED"
  | "SUPPRESSION_NOTICE_TYPE_UNSUPPORTED"
  | "SUPPRESSION_UNBOUNDED"
  | "SUPPRESSION_PAST_DATED"
  | "SUPPRESSION_MALFORMED"
  | "SUPPRESSION_REASON_MISSING"
  | "SUPPRESSION_SUBJECT_NOT_OWNED";

type RefusalTable = Readonly<Record<ActionRefusal, string>>;

const PT: RefusalTable = {
  unauthenticated: "Sua sessão expirou. Entre novamente para continuar.",
  invalid: "Não foi possível entender este pedido. Recarregue a página e tente de novo.",
  failed: "Não foi possível concluir agora. O aviso continua aqui — tente de novo.",
  // `2S-ACT-008`: a refusal caused by stale state says so, and offers the
  // reload it needs rather than leaving the owner to guess.
  stale: "Esta tarefa mudou desde que a página foi carregada. Recarregue para ver o estado atual.",
  SUPPRESSION_SUBJECT_UNSUPPORTED: "Não é possível silenciar este tipo de assunto.",
  SUPPRESSION_SUBJECT_MISSING: "Este aviso não aponta para um assunto que possa ser silenciado.",
  SUPPRESSION_SCOPE_UNSUPPORTED: "Escolha se quer silenciar por um tempo ou para sempre.",
  SUPPRESSION_NOTICE_TYPE_UNSUPPORTED: "Não é possível silenciar este tipo de aviso.",
  SUPPRESSION_UNBOUNDED: "Para silenciar por um tempo, escolha até quando.",
  SUPPRESSION_PAST_DATED: "Escolha uma data futura para o silêncio terminar.",
  SUPPRESSION_MALFORMED: "Para silenciar para sempre, não defina uma data de término.",
  SUPPRESSION_REASON_MISSING: "Escreva um motivo curto para este silêncio.",
  SUPPRESSION_SUBJECT_NOT_OWNED: "Este assunto não está disponível na sua conta.",
};

const EN: RefusalTable = {
  unauthenticated: "Your session expired. Sign in again to continue.",
  invalid: "This request could not be understood. Reload the page and try again.",
  failed: "This could not be completed right now. The notice is still here — try again.",
  stale: "This task changed since the page loaded. Reload to see its current state.",
  SUPPRESSION_SUBJECT_UNSUPPORTED: "This kind of subject cannot be silenced.",
  SUPPRESSION_SUBJECT_MISSING: "This notice does not point at a subject that can be silenced.",
  SUPPRESSION_SCOPE_UNSUPPORTED: "Choose whether to silence for a while or for good.",
  SUPPRESSION_NOTICE_TYPE_UNSUPPORTED: "This kind of notice cannot be silenced.",
  SUPPRESSION_UNBOUNDED: "To silence for a while, choose until when.",
  SUPPRESSION_PAST_DATED: "Choose a future date for the silence to end.",
  SUPPRESSION_MALFORMED: "To silence for good, do not set an end date.",
  SUPPRESSION_REASON_MISSING: "Write a short reason for this silence.",
  SUPPRESSION_SUBJECT_NOT_OWNED: "This subject is not available on your account.",
};

export function refusalMessage(locale: Locale, refusal: ActionRefusal): string {
  return (locale === "pt-BR" ? PT : EN)[refusal];
}

/** Every code this module can render, for the guard that proves the set is closed. */
export const ACTION_REFUSALS: readonly ActionRefusal[] = Object.keys(PT) as ActionRefusal[];
