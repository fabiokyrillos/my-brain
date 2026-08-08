/**
 * `2I-SEARCH` copy — typed, both locales, no inline ternary.
 *
 * The domain labels are **product vocabulary**, not schema names:
 * `organizations` displays as *Empresas / Companies* (EGC.1 — the product said
 * "Empresa" everywhere before the destination existed) and `attachments`
 * displays as *Arquivos / Files*. The mapping lives in `contracts.ts`; this
 * file only ever holds what a person reads.
 */

import type { Locale } from "@/lib/preferences";

import type { PeriodFilter, SearchDomain } from "./contracts";

export type SearchCopy = {
  readonly title: string;
  readonly inputLabel: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly clear: string;
  readonly domains: Readonly<Record<SearchDomain, string>>;
  readonly filterType: string;
  readonly filterPeriod: string;
  readonly periodAny: string;
  readonly periods: Readonly<Record<PeriodFilter, string>>;
  readonly allTypes: string;
  readonly sensitiveToggle: string;
  readonly sensitiveActive: string;
  readonly sensitiveHint: string;
  readonly idle: string;
  readonly idleHint: string;
  readonly tooShort: string;
  readonly noResults: string;
  readonly noResultsHint: string;
  readonly bounded: string;
  readonly domainBounded: string;
  readonly partial: (domains: string) => string;
  readonly resultCount: (count: number) => string;
  readonly searching: string;
};

const copy: Record<Locale, SearchCopy> = {
  "pt-BR": {
    title: "Buscar",
    inputLabel: "Buscar em tudo que é seu",
    placeholder: "Digite uma palavra…",
    submit: "Buscar",
    clear: "Limpar",
    domains: {
      tasks: "Tarefa",
      entries: "Registro",
      memories: "Memória",
      people: "Pessoa",
      projects: "Projeto",
      organizations: "Empresa",
      files: "Arquivo",
    },
    filterType: "Tipo",
    filterPeriod: "Período",
    periodAny: "Qualquer data",
    periods: { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "12m": "Últimos 12 meses" },
    allTypes: "Todos os tipos",
    sensitiveToggle: "Incluir conteúdo muito sensível",
    sensitiveActive: "Busca sensível ativa",
    sensitiveHint:
      "Itens marcados como muito sensíveis ficam fora da busca até você pedir. Isso vale só para esta busca.",
    idle: "Busque em tudo que é seu",
    idleHint: "Tarefas, registros, memórias, pessoas, projetos, empresas e arquivos.",
    tooShort: "Digite pelo menos duas letras.",
    noResults: "Nada encontrado",
    // Deliberately does NOT say "try enabling sensitive search" -- that would
    // hint at what was excluded. OD-1.
    noResultsHint: "Tente outra palavra ou remova os filtros.",
    bounded: "Mostrando os primeiros resultados. Refine a busca para ver menos e melhores.",
    domainBounded: "mais resultados neste tipo",
    partial: (domains) => `Não consegui buscar em: ${domains}. Os outros resultados estão completos.`,
    resultCount: (count) => (count === 1 ? "1 resultado" : `${count} resultados`),
    searching: "Buscando…",
  },
  en: {
    title: "Search",
    inputLabel: "Search everything of yours",
    placeholder: "Type a word…",
    submit: "Search",
    clear: "Clear",
    domains: {
      tasks: "Task",
      entries: "Record",
      memories: "Memory",
      people: "Person",
      projects: "Project",
      organizations: "Company",
      files: "File",
    },
    filterType: "Type",
    filterPeriod: "Period",
    periodAny: "Any date",
    periods: { "7d": "Last 7 days", "30d": "Last 30 days", "12m": "Last 12 months" },
    allTypes: "All types",
    sensitiveToggle: "Include highly sensitive content",
    sensitiveActive: "Sensitive search active",
    sensitiveHint:
      "Items marked highly sensitive stay out of search until you ask. This applies to this search only.",
    idle: "Search everything of yours",
    idleHint: "Tasks, records, memories, people, projects, companies and files.",
    tooShort: "Type at least two letters.",
    noResults: "Nothing found",
    noResultsHint: "Try another word, or clear the filters.",
    bounded: "Showing the first results. Narrow the search to see fewer and better ones.",
    domainBounded: "more results in this type",
    partial: (domains) => `I could not search: ${domains}. The other results are complete.`,
    resultCount: (count) => (count === 1 ? "1 result" : `${count} results`),
    searching: "Searching…",
  },
};

export function getSearchCopy(locale: Locale): SearchCopy {
  return copy[locale] ?? copy["pt-BR"];
}
