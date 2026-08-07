/**
 * What a person reads when a rate ceiling refuses them — `2H-RATE-003`.
 *
 * ## The number in the sentence is the number in the database
 *
 * `quotas/copy.ts`'s rule, applied to a second control: every number below is
 * interpolated from `RATE_LIMITS`, the same constants
 * `rate-limits-parity.test.ts` compares against PRD §14.2 *and* against
 * migration `202608070081`'s seed. A copy edit cannot invent a limit, and a
 * ceiling change cannot leave a stale promise behind.
 *
 * ## Why these are separate from the quota and throttle texts
 *
 * There are now four refusal vocabularies a person could meet, and they are four
 * different facts: "your account is suspended", "too many sign-in attempts",
 * "you have reached today's limit" and "you are going faster than the hourly
 * pace". A shared "something went wrong" would erase all four, and a rate
 * refusal in particular carries the one piece of good news the others do not —
 * it clears by itself, shortly.
 *
 * `RATE_LIMIT_STATE_UNAVAILABLE` deliberately does **not** state a ceiling. The
 * limiter could not be read, so no ceiling was reached, and saying one was would
 * be the product inventing a fact to explain itself.
 *
 * Nothing here names a table, a function, an error code, or the content that was
 * refused.
 */

import type { Locale } from "@/lib/preferences";
import { RATE_LIMITS } from "@/lib/rate-limits";
import type { RateLimitRefusal } from "./refusal";

export type RateLimitRefusalCopy = {
  readonly title: string;
  readonly body: string;
};

const ptBR: Record<RateLimitRefusal, RateLimitRefusalCopy> = {
  RATE_LIMIT_AI: {
    title: "Ritmo de uso da IA atingido",
    body: `Sua conta pode iniciar ${RATE_LIMITS.aiOperationsPerHour} operações de IA por hora. A janela é contínua: as vagas mais antigas liberam sozinhas ao longo da próxima hora. Nada foi perdido.`,
  },
  RATE_LIMIT_UPLOAD: {
    title: "Ritmo de envios atingido",
    body: `Sua conta pode enviar ${RATE_LIMITS.uploadsPerHour} arquivos por hora. A janela é contínua e libera sozinha. Este arquivo não foi armazenado.`,
  },
  RATE_LIMIT_STATE_UNAVAILABLE: {
    title: "Não foi possível concluir agora",
    body: "Não conseguimos confirmar o limite de uso da sua conta, então preferimos não seguir adiante. Tente de novo em instantes — nada foi alterado.",
  },
};

const en: Record<RateLimitRefusal, RateLimitRefusalCopy> = {
  RATE_LIMIT_AI: {
    title: "Hourly AI pace reached",
    body: `Your account can start ${RATE_LIMITS.aiOperationsPerHour} AI operations per hour. The window is rolling, so the oldest slots free themselves over the next hour. Nothing was lost.`,
  },
  RATE_LIMIT_UPLOAD: {
    title: "Hourly upload pace reached",
    body: `Your account can upload ${RATE_LIMITS.uploadsPerHour} files per hour. The window is rolling and frees itself. This file was not stored.`,
  },
  RATE_LIMIT_STATE_UNAVAILABLE: {
    title: "Could not complete this right now",
    body: "We could not confirm your account's usage limit, so we did not go ahead. Try again shortly — nothing was changed.",
  },
};

const byLocale = { "pt-BR": ptBR, en } satisfies Record<Locale, Record<RateLimitRefusal, RateLimitRefusalCopy>>;

export function rateLimitRefusalCopy(locale: Locale, refusal: RateLimitRefusal): RateLimitRefusalCopy {
  return byLocale[locale][refusal];
}

/** The single sentence a form state carries. */
export function rateLimitRefusalMessage(locale: Locale, refusal: RateLimitRefusal): string {
  const copy = rateLimitRefusalCopy(locale, refusal);
  return `${copy.title}. ${copy.body}`;
}
