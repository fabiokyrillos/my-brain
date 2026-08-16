/**
 * `2I-LANG` / `2I-CLOSE-003` — Phase 2I copy, typed, in both locales.
 *
 * The canonical mechanism (`docs/ENGINEERING_STANDARDS.md`), in the shape
 * `src/features/daily-cycle/copy.ts` established. **No inline `pt ?` ternary is
 * added by this phase**; the ratchet pinned 263 at 2I.0 and the closing report
 * states the after.
 */

export const experienceLocales = ["pt-BR", "en"] as const;
export type ExperienceLocale = (typeof experienceLocales)[number];

export type UniversalStateCopy = {
  /** Short label, used as the heading. */
  readonly title: string;
  /** One sentence saying what is true right now. */
  readonly description: string;
  /** The reassurance, when the state carries one. Null when it cannot. */
  readonly safety: string | null;
  /**
   * The label of the action out, when there is one.
   *
   * On a `recoverable` state this labels a retry **button**; on a state whose
   * definition says `offersExit` it labels a **link away**. The vocabulary
   * decides which, so the two can never be confused by a call site
   * (`2O-RECOVER-003`).
   */
  readonly action: string | null;
};

export type ExperienceCopy = {
  readonly states: Record<
    | "empty"
    | "loading"
    | "interpreting"
    | "interpretation_failed"
    | "error_recoverable"
    | "error_terminal"
    | "offline",
    UniversalStateCopy
  >;
  readonly tones: Record<
    "information" | "success" | "attention" | "risk" | "suggestion" | "archived",
    string
  >;
};

const copy: Record<ExperienceLocale, ExperienceCopy> = {
  "pt-BR": {
    states: {
      empty: {
        title: "Nada aqui ainda",
        description: "Quando houver algo, aparece nesta lista.",
        safety: null,
        action: "Capturar algo",
      },
      loading: {
        title: "Carregando",
        description: "Buscando o que existe aqui.",
        safety: null,
        action: null,
      },
      interpreting: {
        title: "Guardado — ainda organizando",
        description: "O Brain está lendo o que você escreveu.",
        // The requirement, not decoration: capture is asynchronous, and a
        // spinner over durable content reads as "this might be lost".
        safety: "Suas palavras já estão salvas.",
        action: null,
      },
      interpretation_failed: {
        title: "Guardado, mas não consegui organizar",
        description: "A interpretação falhou. O registro continua aqui, inteiro.",
        safety: "Nada do que você escreveu foi perdido.",
        action: "Tentar de novo",
      },
      error_recoverable: {
        title: "Algo não funcionou",
        description: "Não consegui completar esta ação agora.",
        safety: "Nada foi alterado.",
        action: "Tentar de novo",
      },
      error_terminal: {
        title: "Não é possível continuar",
        description: "Esta ação não pode ser refeita automaticamente.",
        safety: null,
        // `2O-RECOVER-003`: a way to LEAVE, never a way to retry. Offering
        // "tentar de novo" on a state whose definition says it cannot be
        // retried is a control that can only fail.
        action: "Voltar para o início",
      },
      offline: {
        title: "Sem conexão",
        description: "Você está offline. O que estiver na tela pode estar desatualizado.",
        safety: "Nada foi enviado.",
        action: "Tentar de novo",
      },
    },
    tones: {
      information: "Informação",
      success: "Concluído",
      attention: "Precisa de atenção",
      risk: "Risco",
      suggestion: "Sugestão do Brain",
      archived: "Arquivado",
    },
  },
  en: {
    states: {
      empty: {
        title: "Nothing here yet",
        description: "When there is something, it shows up in this list.",
        safety: null,
        action: "Capture something",
      },
      loading: {
        title: "Loading",
        description: "Fetching what is here.",
        safety: null,
        action: null,
      },
      interpreting: {
        title: "Saved — still organising",
        description: "The Brain is reading what you wrote.",
        safety: "Your words are already saved.",
        action: null,
      },
      interpretation_failed: {
        title: "Saved, but I could not organise it",
        description: "The interpretation failed. The record is still here, intact.",
        safety: "Nothing you wrote was lost.",
        action: "Try again",
      },
      error_recoverable: {
        title: "Something did not work",
        description: "I could not complete this action right now.",
        safety: "Nothing was changed.",
        action: "Try again",
      },
      error_terminal: {
        title: "Cannot continue",
        description: "This action cannot be retried automatically.",
        safety: null,
        // `2O-RECOVER-003`: a way to LEAVE, never a way to retry.
        action: "Go back to the start",
      },
      offline: {
        title: "No connection",
        description: "You are offline. What is on screen may be out of date.",
        safety: "Nothing was sent.",
        action: "Try again",
      },
    },
    tones: {
      information: "Information",
      success: "Done",
      attention: "Needs attention",
      risk: "Risk",
      suggestion: "Brain suggestion",
      archived: "Archived",
    },
  },
};

export function getExperienceCopy(locale: string): ExperienceCopy {
  return copy[locale === "en" ? "en" : "pt-BR"];
}
