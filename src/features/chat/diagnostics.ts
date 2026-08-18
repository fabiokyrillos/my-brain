/**
 * `2P-CHAT-002`, `2P-CHAT-003` — what a failed conversation turn is allowed to say.
 *
 * ## The defect this closes
 *
 * `sendChatMessage` wrapped the whole grounded-answer path in one `try` and
 * answered every fault inside it with one sentence — *"could not answer right
 * now"*. Slice 2P.0 measured the consequence: a credential problem, the owner's
 * own quota ceiling, a retrieval fault, a provider outage and a timeout were
 * five different facts with five different next steps, and the product said the
 * same thing to all of them. Nothing was recorded either, so the owner could not
 * even report which one they had hit.
 *
 * ## Why the class is derived from the sink's reason rather than decided beside it
 *
 * There are two consumers of "why did this fail": the append-only
 * `error_events` row, and the sentence the owner reads. If those were two
 * decisions they would drift — the classic shape being a recovery state that
 * says "try again" while the row says `quota_exceeded`. So there is exactly one
 * classifier, `classifyError` from the error sink, and this module is a **total
 * function over its fourteen reasons**. The sink row and the recovery state are
 * therefore the same decision by construction, which
 * `diagnostics.test.ts` asserts by exhausting `ERROR_REASONS`.
 *
 * ## What may not travel
 *
 * `T-11`. Nothing here interpolates a thrown message, a provider name, a model
 * id, a SQLSTATE or any user content into what the owner sees. The only variable
 * value on the surface is the correlation id — a random UUID minted by the sink,
 * deliberately not derived from a session or a token (`T-2H-09`) — so the owner
 * can quote a failure without the product quoting their data back at them. The
 * database agrees: `error_events` has no free-text column at all.
 */

import { classifyError, type ErrorReason } from "@/lib/observability/error-sink";
import { locales, type Locale } from "@/lib/preferences";

/**
 * The five classes `2P-CHAT-002` names, plus the honest sixth.
 *
 * `unexpected` exists because a closed vocabulary that has no room for "I do
 * not know" is a vocabulary that lies: the fourteenth reason is literally
 * `unclassified`, and folding it into one of the five would attach a confident
 * next step to a fault nobody has diagnosed.
 */
export const CHAT_FAILURE_CLASSES = [
  "credential",
  "quota",
  "retrieval",
  "provider",
  "temporary",
  "unexpected",
] as const;
export type ChatFailureClass = (typeof CHAT_FAILURE_CLASSES)[number];

/**
 * One reason, one class. Total over `ERROR_REASONS`.
 *
 * Written as a record rather than a `switch` so that adding a reason to the
 * sink's vocabulary is a **type error here** instead of a silent fallthrough to
 * `unexpected`. That is the whole reason this is not a function with a default
 * branch.
 */
const CLASS_BY_REASON: Readonly<Record<ErrorReason, ChatFailureClass>> = {
  /* The owner has no usable credential, or the one they have was refused. */
  permission_denied: "credential",
  /* The owner's own signed ceiling, and the owner's own to wait out. */
  quota_exceeded: "quota",
  throttled: "quota",
  /* The provider's ceiling, not the owner's — so the next step is *later*, not
     "check your usage". Collapsing this into `quota` would tell the owner they
     had spent something they had not. */
  provider_rate_limited: "provider",
  provider_error: "provider",
  /* A round trip that did not come back. Retrying now is reasonable. */
  provider_timeout: "temporary",
  timeout: "temporary",
  /* The knowledge lookup itself. The question is already saved by this point,
     which is what makes "try again" safe to say. */
  database_error: "retrieval",
  not_found: "retrieval",
  /* A write that raced. Retrying now is the correct advice, and it is not a
     retrieval fault — the retrieval succeeded. */
  conflict: "temporary",
  /* Neither of these can reach the conversation path today, and both are kept
     honest rather than assigned a plausible recovery. `validation_failed` is
     refused by the input schema before the try block; `storage_error` belongs to
     attachments, which conversation never touches; `lifecycle_blocked` is
     redirected to `/account-state` by the lifecycle gate before any provider
     work begins. Giving them a chat-shaped next step would be inventing advice
     for states that already have their own surface. */
  validation_failed: "unexpected",
  storage_error: "unexpected",
  lifecycle_blocked: "unexpected",
  unclassified: "unexpected",
};

/** The class for a reason the sink has already decided. */
export function chatFailureClassForReason(reason: ErrorReason): ChatFailureClass {
  return CLASS_BY_REASON[reason];
}

/**
 * The class for a thrown value, via the sink's own classifier.
 *
 * Returns the reason as well, because the caller needs it: the same value goes
 * into `recordErrorEvent` so the row and the sentence cannot disagree, and
 * passing it twice through two calls to `classifyError` would reintroduce
 * exactly the drift this module exists to remove.
 */
export function classifyChatFailure(error: unknown): {
  readonly reason: ErrorReason;
  readonly failure: ChatFailureClass;
} {
  const reason = classifyError(error);
  return { reason, failure: CLASS_BY_REASON[reason] };
}

type ChatFailureCopy = {
  /** What happened, in the owner's terms. Never the provider's. */
  readonly message: string;
  /** Where to go, when there is somewhere. Route is appended by the caller. */
  readonly nextStep: { readonly path: string; readonly label: string } | null;
};

/**
 * The sentences, one per class per locale (ADR-036).
 *
 * `satisfies` is load-bearing: a missing class or a missing locale is a compile
 * error, which is the mechanism that stopped Portuguese-only chat messages from
 * reaching English readers in the first place.
 *
 * Every one of these says what is safe to say and stops. None of them says
 * "unknown error", none exposes a provider, and each one whose recovery is a
 * place carries that place rather than describing it.
 */
const CHAT_FAILURE_COPY = {
  "pt-BR": {
    credential: {
      message:
        "Sua chave de IA não está configurada ou não pôde ser usada. Sua pergunta ficou salva.",
      nextStep: { path: "app/settings", label: "Configurar a chave de IA" },
    },
    quota: {
      message:
        "Você atingiu seu limite de uso por agora. Sua pergunta ficou salva — tente de novo mais tarde.",
      nextStep: { path: "app/costs", label: "Ver seu uso" },
    },
    retrieval: {
      message:
        "Não consegui consultar seu histórico agora. Sua pergunta ficou salva — tente de novo.",
      nextStep: null,
    },
    provider: {
      message:
        "O provedor de IA não respondeu agora. Sua pergunta ficou salva — tente de novo em alguns minutos.",
      nextStep: null,
    },
    temporary: {
      message: "A resposta demorou demais e foi interrompida. Sua pergunta ficou salva — tente de novo.",
      nextStep: null,
    },
    unexpected: {
      message: "Não consegui responder agora. Sua pergunta ficou salva.",
      nextStep: null,
    },
  },
  en: {
    credential: {
      message: "Your AI key is not configured, or it could not be used. Your question was saved.",
      nextStep: { path: "app/settings", label: "Set up your AI key" },
    },
    quota: {
      message: "You have reached your usage limit for now. Your question was saved — try again later.",
      nextStep: { path: "app/costs", label: "See your usage" },
    },
    retrieval: {
      message: "I could not search your history just now. Your question was saved — try again.",
      nextStep: null,
    },
    provider: {
      message:
        "The AI provider did not answer just now. Your question was saved — try again in a few minutes.",
      nextStep: null,
    },
    temporary: {
      message: "The answer took too long and was stopped. Your question was saved — try again.",
      nextStep: null,
    },
    unexpected: {
      message: "I could not answer just now. Your question was saved.",
      nextStep: null,
    },
  },
} satisfies Record<Locale, Record<ChatFailureClass, ChatFailureCopy>>;

/** How the owner is told to quote a failure, without being told anything else. */
const REFERENCE_LABEL = {
  "pt-BR": "Código para relatar:",
  en: "Code to report:",
} satisfies Record<Locale, string>;

export function chatFailureCopy(locale: Locale, failure: ChatFailureClass): ChatFailureCopy {
  return CHAT_FAILURE_COPY[locale][failure];
}

/**
 * Attaches the reference to a sentence this module did not write.
 *
 * Exported because one conversation failure keeps its **own** copy: the BYOK
 * gate distinguishes "no credential" from "credential unreadable", which is
 * finer than the `credential` class, and replacing that with the generic
 * sentence would lose something the owner can act on. It still has to be
 * quotable, so it goes through here rather than through a second string
 * concatenation somewhere else — `2P-CHAT-003` fails the moment two paths
 * disagree about whether a failure is nameable.
 */
export function withChatFailureReference(
  locale: Locale,
  message: string,
  correlationId: string,
): string {
  return `${message} ${REFERENCE_LABEL[locale]} ${correlationId}`;
}

/**
 * The whole owner-facing sentence, reference included.
 *
 * One function so the reference can never be attached on some paths and
 * forgotten on others — `2P-CHAT-003`'s point is that a failure the owner
 * cannot name is a failure nobody can act on.
 */
export function chatFailureMessage(
  locale: Locale,
  failure: ChatFailureClass,
  correlationId: string,
): string {
  return withChatFailureReference(locale, CHAT_FAILURE_COPY[locale][failure].message, correlationId);
}

/** Every locale this module answers in, for tests that must exhaust them. */
export const CHAT_FAILURE_LOCALES = locales;
