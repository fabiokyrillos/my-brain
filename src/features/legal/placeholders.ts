/**
 * The legal facts this repository cannot invent — SH-LEGAL-002/003.
 *
 * The operator's legal identity, its contact address, the governing law and the
 * forum are owner decisions with real-world consequences. Writing a plausible
 * value would be worse than leaving a gap, because a plausible value reads as
 * settled and nobody would ever go looking for it again.
 *
 * So each one renders as a **visibly unfilled marker** carrying its own name,
 * in the reader's locale, and a test asserts every marker appears in both
 * documents and that none of them has been quietly filled in with prose. The
 * mechanism around them is complete and tested; only these four values are
 * owner gates, and they are named rather than blocking.
 */

import type { Locale } from "@/lib/preferences";

export const LEGAL_PLACEHOLDERS = [
  "OPERATOR_ENTITY",
  "OPERATOR_CONTACT",
  "GOVERNING_LAW",
  "JURISDICTION",
] as const;

export type LegalPlaceholder = (typeof LEGAL_PLACEHOLDERS)[number];

const descriptions: Record<Locale, Record<LegalPlaceholder, string>> = {
  "pt-BR": {
    OPERATOR_ENTITY: "identificação legal do operador do serviço",
    OPERATOR_CONTACT: "endereço de contato do operador",
    GOVERNING_LAW: "legislação aplicável",
    JURISDICTION: "foro competente",
  },
  en: {
    OPERATOR_ENTITY: "the service operator's legal identity",
    OPERATOR_CONTACT: "the operator's contact address",
    GOVERNING_LAW: "governing law",
    JURISDICTION: "competent jurisdiction",
  },
};

const pending: Record<Locale, string> = {
  "pt-BR": "a definir pelo titular",
  en: "pending owner value",
};

/**
 * The rendered marker. Deliberately conspicuous — guillemets, the placeholder's
 * own name, and the words that say it is unfilled — so a reader, a reviewer and
 * a test all see the same gap.
 */
export function renderPlaceholder(locale: Locale, name: LegalPlaceholder): string {
  return `«${name}: ${descriptions[locale][name]} — ${pending[locale]}»`;
}
