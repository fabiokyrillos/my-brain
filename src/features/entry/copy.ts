/** The public entry page's copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";

/**
 * The four claims `2O-ENTRY-002` permits, and **no fifth**.
 *
 * The shape is a closed record rather than a list on purpose: a list would let a
 * fifth claim be appended without anything noticing, and this is the one surface
 * in the product a stranger reads before they can check anything. Each key names
 * the repository fact the claim is about, and
 * `src/lib/closeout/entry-page-guard.test.ts` verifies each against the tree —
 * so a claim that stops being true fails the build rather than misleading
 * someone.
 */
export type EntryClaimKey = "capture" | "stored_first" | "own_credential" | "documents";

export type EntryCopy = Readonly<{
  /** The product's name. Not a claim — an identification. */
  productName: string;
  /** One line saying what this is. */
  tagline: string;
  claimsLabel: string;
  claims: Readonly<Record<EntryClaimKey, string>>;
  /**
   * The accessible name of the documents section.
   *
   * The **titles** of the two documents deliberately are not here: they come
   * from `legal/documents.ts`, which the register page and the consent flow
   * already read. A second spelling of a policy's name is a second thing to keep
   * true.
   */
  documentsLabel: string;
  /** Offered to someone who already has an account. Never a registration call. */
  signIn: string;
  /**
   * `2O-ENTRY-003`. Said **only** while signup is closed, and it states a fact
   * without promising a future one. There is no waiting list, so it does not
   * imply one, and there is no date, so it does not imply a schedule.
   */
  closedNotice: string;
}>;

const copy: Record<Locale, EntryCopy> = {
  "pt-BR": {
    productName: "My Brain",
    tagline: "Um lugar para escrever o que você precisa lembrar, e recuperar depois com contexto.",
    claimsLabel: "O que este produto faz",
    claims: {
      capture:
        "Você escreve em texto livre. O produto lê, separa tarefas, pessoas, projetos e datas, e pergunta quando não tem certeza.",
      stored_first:
        "Suas palavras são gravadas antes de qualquer modelo rodar. Se a interpretação falhar, o que você escreveu continua lá, inteiro.",
      own_credential:
        "A IA usa uma credencial sua, que você fornece e pode remover. Sem ela, nada é enviado a um modelo.",
      documents:
        "A política de privacidade e os termos de uso ficam abaixo, e podem ser lidos antes de qualquer cadastro.",
    },
    documentsLabel: "Documentos",
    signIn: "Já tenho conta",
    closedNotice:
      "O cadastro está fechado no momento. Esta página não recolhe e-mails e não existe lista de espera.",
  },
  en: {
    productName: "My Brain",
    tagline: "A place to write down what you need to remember, and find it later with its context.",
    claimsLabel: "What this product does",
    claims: {
      capture:
        "You write in free text. The product reads it, separates tasks, people, projects and dates, and asks when it is unsure.",
      stored_first:
        "Your words are stored before any model runs. If the interpretation fails, what you wrote is still there, whole.",
      own_credential:
        "The AI uses your own credential, which you supply and can remove. Without it, nothing is sent to a model.",
      documents:
        "The privacy policy and the terms of use are below, and can be read before any account exists.",
    },
    documentsLabel: "Documents",
    signIn: "I already have an account",
    closedNotice:
      "Registration is closed at the moment. This page collects no e-mail addresses, and there is no waiting list.",
  },
};

/** The claims in the order they are rendered. Declared order is rendered order. */
export const ENTRY_CLAIM_ORDER = [
  "capture",
  "stored_first",
  "own_credential",
  "documents",
] as const satisfies readonly EntryClaimKey[];

export function getEntryCopy(locale: Locale): EntryCopy {
  return copy[locale] ?? copy["pt-BR"];
}
