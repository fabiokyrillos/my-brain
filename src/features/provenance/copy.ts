/**
 * `2N-ACCESS-005` — every provenance state, in both locales, through a typed
 * module rather than scattered locale ternaries.
 *
 * The wording is doing real work here, so each string is chosen against a rule
 * from `2N-PROV` rather than for tone:
 *
 * - **`unsourced` is not an error.** "Origem não registrada" states a fact about
 *   the record; "Falha ao carregar a origem" would blame the product for
 *   something that is simply not stored, and would invite the reader to retry
 *   until it appears. `2N-PROV-004` asks for *rendered as unsourced*, which is a
 *   description, not a failure.
 * - **`unsourced` says nothing about why.** It must read identically whether the
 *   column is null, the entry was deleted, the entry belongs to somebody else or
 *   the read failed — those are one arm in `contracts.ts` precisely so the copy
 *   cannot leak the difference, and a sentence like "este registro foi removido"
 *   would put the difference straight back.
 * - **`owner-authored` claims no evidence.** "Informado por você" is what the
 *   owner did; "Confirmado por você" or "Verificado" would dress an assertion up
 *   as a check that never happened (`2N-RELATION-009`).
 */

import type { Locale } from "@/lib/preferences";

export type ProvenanceCopy = {
  /** The relation tables, where owner-authorship is true by construction. */
  readonly ownerAuthored: string;
  /** A real, openable entry. */
  readonly sourced: string;
  /** The link that opens it, named so two rows never share an accessible name. */
  readonly openSource: (subject: string) => string;
  /**
   * The positional labels a caller passes as `subject`.
   *
   * They live here rather than as an inline ternary at the call site for the
   * reason `ENGINEERING_STANDARDS` gives — and for a second one specific to
   * them: these strings become **accessible names**, so they are user-facing
   * copy that only a screen-reader user ever encounters. That is exactly the
   * kind of string that rots when it is scattered, because nobody reviewing the
   * page visually will ever see it.
   */
  readonly taskSubject: (position: number) => string;
  readonly memorySubject: (position: number) => string;
  /** No source recorded, or one that will not resolve. Never an error. */
  readonly unsourced: string;
  /** Section-level: the owner maintains this here. */
  readonly persistedSection: string;
  /** Section-level: the page computed this from other records. */
  readonly derivedSection: string;
  /** Labels the provenance line for assistive technology. */
  readonly originLabel: string;
  /** `2N-PERSON-006` — the way back to where the reader was. */
  readonly returnToSource: string;
  /**
   * `2N-RELATION-005` — what a confidence number means, if one is ever shown.
   * Present so that rendering a bare number is a visible omission rather than
   * an easy default.
   */
  readonly confidenceExplainer: string;
};

const PT: ProvenanceCopy = {
  ownerAuthored: "Informado por você",
  sourced: "De um registro seu",
  openSource: (subject) => `Abrir o registro de origem: ${subject}`,
  taskSubject: (position) => `tarefa ${position}`,
  memorySubject: (position) => `memória ${position}`,
  unsourced: "Origem não registrada",
  persistedSection: "Você mantém esta seção",
  derivedSection: "Derivado dos seus registros",
  originLabel: "Origem",
  returnToSource: "Voltar para onde você estava",
  confidenceExplainer:
    "Confiança é o quanto esta leitura foi consistente, não uma medida de verdade.",
};

const EN: ProvenanceCopy = {
  ownerAuthored: "Informed by you",
  sourced: "From an entry of yours",
  openSource: (subject) => `Open the source entry: ${subject}`,
  taskSubject: (position) => `task ${position}`,
  memorySubject: (position) => `memory ${position}`,
  unsourced: "No source recorded",
  persistedSection: "You maintain this section",
  derivedSection: "Derived from your records",
  originLabel: "Origin",
  returnToSource: "Back to where you were",
  confidenceExplainer:
    "Confidence is how consistent this reading was, not a measure of truth.",
};

export function getProvenanceCopy(locale: Locale): ProvenanceCopy {
  return locale === "pt-BR" ? PT : EN;
}
