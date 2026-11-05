/**
 * Life Brain B.4 (ADR-155; PRD `LB-B-010`) — when a `highly_sensitive` record
 * or memory may enter the chat's prompt.
 *
 * Phase 2K masked sensitive content on the chat SURFACE but sent everything the
 * retrieval returned to the model. `LB-B-010` closes the prompt half, **in the
 * application, not in the RPC** (`IMPLEMENTATION_PLAN.md` §B.4): a
 * `highly_sensitive` source enters only when
 *
 *  1. the owner asked for it explicitly ("incluir sensíveis", "include
 *     sensitive"), or
 *  2. the question names the **same area of life** the source is filed under
 *     (asking about a consultation reads the health records).
 *
 * `normal` and `private` are unchanged. The exclusion is silent: `2K-EXPL-005`
 * forbids disclosing anything excluded for sensitivity, in count, rate or
 * existence, so nothing about a withheld source reaches the answer or its
 * explanation. What IS said is the opposite fact — that the answer read
 * sensitive content — because that is about the answer the owner is reading.
 *
 * Pure: no I/O, no clock. The lexicon is declared here, both locales, and it is
 * deliberately small — a word that is not in it simply does not open an area.
 */

import { AREA_KINDS, type AreaKind } from "@/features/library/life-area-kinds";
import { admitsToChatPrompt, type SensitivityLevel } from "@/features/sensitivity/contracts";

export type SensitiveAsk = {
  /** The owner asked, in words, to include sensitive content. */
  readonly explicit: boolean;
  /** The areas of life the question names. */
  readonly areas: ReadonlySet<AreaKind>;
};

const EXPLICIT = [
  /\binclu(?:a|ir|indo|i|am)\b[^.?!]{0,30}\bsens[ií]ve(?:l|is)\b/iu,
  /\bsens[ií]ve(?:l|is)\s+tamb[eé]m\b/iu,
  /\bmesmo\s+(?:os\s+|as\s+)?(?:registros\s+|conte[uú]dos?\s+)?sens[ií]ve(?:l|is)\b/iu,
  /\binclud(?:e|ing)\b[^.?!]{0,30}\bsensitive\b/iu,
  /\bsensitive\s+(?:ones|records|content)\s+too\b/iu,
];

/** Word stems per area; matched at a word start, case- and accent-insensitive. */
const AREA_STEMS: Readonly<Record<AreaKind, readonly string[]>> = {
  health: [
    "saude", "medic", "consulta", "exame", "cardiolog", "dentista", "remedio", "hospital", "terapia",
    "psicolog", "psiquiatr", "doenca", "sintoma", "vacina", "cirurgia", "clinica",
    "health", "doctor", "medical", "therapy", "medicine", "symptom", "surgery", "clinic",
  ],
  family: [
    "familia", "mae", "pai", "filho", "filha", "irmao", "irma", "esposa", "marido", "avo", "neto", "neta",
    "family", "mom", "mother", "dad", "father", "son", "daughter", "brother", "sister", "wife", "husband",
  ],
  home: ["casa", "apartamento", "aluguel", "condominio", "reforma", "mudanca", "home", "house", "apartment", "rent"],
  finance: [
    "financ", "dinheiro", "banco", "pagamento", "cartao", "salario", "investiment", "imposto", "divida", "fatura", "boleto",
    "money", "bank", "payment", "salary", "invest", "tax", "debt", "invoice",
  ],
  travel: ["viage", "viaja", "voo", "hotel", "passage", "ferias", "trip", "travel", "flight", "vacation"],
  work: ["trabalho", "emprego", "reuniao", "chefe", "cliente", "work", "job", "meeting", "boss", "client"],
  study: ["estud", "curso", "faculdade", "aula", "prova", "escola", "study", "course", "class", "school", "college"],
  leisure: ["lazer", "hobby", "filme", "serie", "jogo", "leisure", "movie", "game"],
  ideas: ["ideia", "idea"],
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function readSensitiveAsk(question: string): SensitiveAsk {
  const explicit = EXPLICIT.some((pattern) => pattern.test(question));
  const words = fold(question).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const areas = new Set<AreaKind>();
  for (const area of AREA_KINDS) {
    if (AREA_STEMS[area].some((stem) => words.some((word) => word.startsWith(stem)))) areas.add(area);
  }
  return { explicit, areas };
}

export type SourceClassification = {
  readonly level: SensitivityLevel;
  /** The area the source is filed under, or `null` when it has none or it could not be read. */
  readonly area: AreaKind | null;
};

/** Whether a source with this classification may enter the prompt for this ask. */
export function admitsSource(classification: SourceClassification, ask: SensitiveAsk): boolean {
  return admitsToChatPrompt(classification.level, {
    explicit: ask.explicit,
    sameArea: classification.area !== null && ask.areas.has(classification.area),
  });
}
