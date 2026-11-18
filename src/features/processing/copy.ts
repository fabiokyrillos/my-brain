/**
 * Processamento copy — typed, both locales, no inline ternary.
 *
 * The status and type words stay in `@/features/vocabulary/copy`, where every
 * other surface reads them. This module holds what only this page says: its
 * opening sentence, its three headings and the caption of a row.
 */

import type { Locale } from "@/lib/preferences";

export type ProcessingCopy = {
  /** Nothing failed and nothing is in flight. */
  readonly settled: string;
  /** What is in flight and what failed; at least one of the two is above zero. */
  readonly lead: (active: number, failed: number) => string;
  /** The sentence is about one page of rows, and says so when there are more. */
  readonly recentOnly: (count: number) => string;
  /** A later page is older rows, not the state of things now. */
  readonly olderPage: (page: number) => string;
  readonly groups: { readonly failed: string; readonly active: string; readonly finished: string };
  readonly attempt: (attempt: number, max: number) => string;
  readonly detail: string;
  readonly jobId: string;
  /** The one retry the product offers lives beside the file it would retry. */
  readonly openFiles: string;
};

const items = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const copy: Record<Locale, ProcessingCopy> = {
  "pt-BR": {
    settled: "Tudo processado.",
    lead: (active, failed) => {
      if (active > 0 && failed > 0) return `${items(active, "item", "itens")} em processamento, ${failed} com falha.`;
      if (active > 0) return `${items(active, "item", "itens")} em processamento.`;
      return `${items(failed, "item", "itens")} com falha.`;
    },
    recentOnly: (count) => `Entre os ${count} mais recentes.`,
    olderPage: (page) => `Página ${page}: itens mais antigos.`,
    groups: { failed: "Com falha", active: "Em andamento", finished: "Finalizados" },
    attempt: (attempt, max) => `tentativa ${attempt} de ${max}`,
    detail: "Detalhe técnico",
    jobId: "Identificador",
    openFiles: "Ver em Arquivos",
  },
  en: {
    settled: "Everything processed.",
    lead: (active, failed) => {
      if (active > 0 && failed > 0) return `${items(active, "item", "items")} processing, ${failed} failed.`;
      if (active > 0) return `${items(active, "item", "items")} processing.`;
      return `${items(failed, "item", "items")} failed.`;
    },
    recentOnly: (count) => `Among the ${count} most recent.`,
    olderPage: (page) => `Page ${page}: older items.`,
    groups: { failed: "Failed", active: "In progress", finished: "Finished" },
    attempt: (attempt, max) => `attempt ${attempt} of ${max}`,
    detail: "Technical detail",
    jobId: "Identifier",
    openFiles: "See in Files",
  },
};

export function getProcessingCopy(locale: Locale): ProcessingCopy {
  return copy[locale] ?? copy["pt-BR"];
}
