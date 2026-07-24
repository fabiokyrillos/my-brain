// Phase 2D Slice 2D.3 — deterministic suggested answers.
//
// Suggestions are derived, never generated: this module is pure, has no
// network/AI/provider/worker/database dependency, performs no mutation, and
// returns a bounded, closed, deduplicated option set — or nothing at all.
// Per ADR-033 decision 4 and PRD `2D-SUGGEST-002`, the extraction schema is
// NOT extended; an option only exists when the question's own shape plus the
// entry's own owned domain context make it truthful.
//
// Discovered taxonomy (the extraction contract stores only `question`,
// `reason`, and `confidence` — there is no persisted question type, so the
// kind is classified from the question's interrogative shape):
//
//   yes_no        polar question            -> the closed {yes, no} answer set
//   person        "quem" / "who"            -> people named by this entry
//   project       "qual projeto" / "which project"
//   organization  "qual empresa" / "which company"
//   context       "qual contexto" / "onde" / "which context" / "where"
//
// Anything else — notably "quando"/"when", "por que"/"why", "quanto"/"how
// much" — has no truthful deterministic answer derivable from owned data and
// therefore yields no chips at all, keeping the ordinary free-text flow.

export const QUESTION_SUGGESTION_MAX_OPTIONS = 6;
export const QUESTION_SUGGESTION_MAX_VALUE_LENGTH = 160;

export const questionSuggestionKinds = [
  "yes_no",
  "person",
  "project",
  "organization",
  "context",
] as const;

export type QuestionSuggestionKind = (typeof questionSuggestionKinds)[number];

export type QuestionSuggestionLocale = "pt-BR" | "en";

// The closed suggestion shape. No metadata, no confidence, no free-form
// payload: a chip carries exactly what the UI renders and what the server
// re-derives to authenticate provenance.
export type QuestionSuggestion = {
  id: string;
  value: string;
  label: string;
  kind: QuestionSuggestionKind;
};

export type QuestionSuggestionContext = {
  question: string;
  locale: QuestionSuggestionLocale;
  people: readonly string[];
  projects: readonly string[];
  organizations: readonly string[];
  contexts: readonly string[];
};

// Lowercased, accent-folded, punctuation-collapsed form used for shape
// matching. The question is classified as data; it is never interpreted as an
// instruction and never reaches a model.
function fold(question: string): string {
  return question
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function lowercase(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

// Accent-bearing Portuguese polar openers. Matched on the accented form so a
// leading "é" is never confused with the conjunction "e".
const ACCENTED_POLAR_OPENERS = ["é", "há", "será", "está", "estão", "você", "vocês", "não"];

const FOLDED_POLAR_OPENERS = [
  // pt-BR
  "foi", "era", "eram", "sera", "serao", "esta", "estao", "estava",
  "deve", "devo", "devemos", "deveria", "devia",
  "precisa", "preciso", "precisamos", "posso", "pode", "podemos", "poderia",
  "tem", "temos", "teria", "houve", "ha", "existe", "existem",
  "vai", "vou", "vamos", "quer", "quero", "queremos",
  "confirma", "confirmo", "inclui", "incluo", "seria", "fica", "ficou",
  // en
  "is", "are", "was", "were", "am", "do", "does", "did",
  "should", "shall", "can", "could", "will", "would", "must",
  "has", "have", "had", "may", "might",
];

type Rule = { kind: QuestionSuggestionKind; patterns: readonly RegExp[] };

// Ordered, mutually exclusive rules. Every interrogative pattern is anchored
// at the start of the question (allowing one leading preposition), so only the
// question's *leading* interrogative classifies it. A relative pronoun deeper
// in the sentence ("Foi você quem enviou?") therefore stays polar, and a
// question that opens with unrelated prose classifies as nothing at all —
// the safe empty fallback — rather than being mined for a keyword.
const RULES: readonly Rule[] = [
  {
    kind: "project",
    patterns: [
      /^(?:de |do |em |no |para )?qual (?:e )?(?:o )?projeto\b/,
      /^(?:de |em |para )?que projeto\b/,
      /^(?:for |in |on |to )?which project\b/,
      /^(?:for |in |on |to )?what project\b/,
    ],
  },
  {
    kind: "organization",
    patterns: [
      /^(?:de |da |em |na |para |por )?qual (?:e )?(?:a )?(?:empresa|organizacao|cliente)\b/,
      /^(?:de |em |para )?que (?:empresa|organizacao|cliente)\b/,
      /^(?:for |in |to )?which (?:company|organization|organisation|client)\b/,
      /^(?:for |in |to )?what (?:company|organization|organisation|client)\b/,
    ],
  },
  {
    kind: "context",
    patterns: [
      /^(?:de |em |no |para )?qual (?:e )?(?:o )?contexto\b/,
      /^(?:em |no )?que contexto\b/,
      /^(?:for |in )?which context\b/,
      /^(?:for |in )?what context\b/,
      /^onde\b/,
      /^where\b/,
    ],
  },
  {
    kind: "person",
    patterns: [
      /^(?:a |ao |com |de |para |por )?quem\b/,
      /^(?:from |to |with )?who\b/,
      /^(?:from |to |with )?whom\b/,
    ],
  },
];

export function classifyPendingQuestion(question: string): QuestionSuggestionKind | null {
  if (typeof question !== "string") return null;
  const folded = fold(question);
  if (!folded) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(folded))) return rule.kind;
  }

  const accented = lowercase(question);
  const accentedOpener = accented.split(" ")[0] ?? "";
  if (ACCENTED_POLAR_OPENERS.includes(accentedOpener)) return "yes_no";

  const foldedOpener = folded.split(" ")[0] ?? "";
  if (FOLDED_POLAR_OPENERS.includes(foldedOpener)) return "yes_no";

  return null;
}

const YES_NO_COPY = {
  "pt-BR": { yes: "Sim", no: "Não" },
  en: { yes: "Yes", no: "No" },
} as const;

// Stable, position-independent id segment derived from the value's semantics.
function slug(value: string): string {
  return fold(value).replace(/ /g, "-").slice(0, 48) || "item";
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

// Bounded, safe canonical value: whitespace-collapsed, length-bounded, and
// free of markup or control characters. Untrusted owned content that cannot
// satisfy the bound is dropped rather than truncated — a clipped entity name
// would be an untruthful suggestion.
function canonicalValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (collapsed.length > QUESTION_SUGGESTION_MAX_VALUE_LENGTH) return null;
  if (/[<>]/.test(collapsed)) return null;
  for (const character of collapsed) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  return collapsed;
}

function fromOwnedContext(
  kind: Exclude<QuestionSuggestionKind, "yes_no">,
  values: readonly string[],
): QuestionSuggestion[] {
  const suggestions: QuestionSuggestion[] = [];
  const seenValues = new Set<string>();
  const seenIds = new Set<string>();

  for (const raw of values) {
    if (suggestions.length >= QUESTION_SUGGESTION_MAX_OPTIONS) break;
    const value = canonicalValue(raw);
    if (!value) continue;
    const comparison = normalizeForComparison(value);
    if (seenValues.has(comparison)) continue;
    const id = `${kind}:${slug(value)}`;
    if (seenIds.has(id)) continue;
    seenValues.add(comparison);
    seenIds.add(id);
    suggestions.push({ id, value, label: value, kind });
  }

  return suggestions;
}

export function buildQuestionSuggestions(context: QuestionSuggestionContext): QuestionSuggestion[] {
  const kind = classifyPendingQuestion(context.question);
  if (!kind) return [];

  if (kind === "yes_no") {
    const copy = YES_NO_COPY[context.locale] ?? YES_NO_COPY["pt-BR"];
    return [
      { id: "yes_no:yes", value: copy.yes, label: copy.yes, kind },
      { id: "yes_no:no", value: copy.no, label: copy.no, kind },
    ];
  }

  const owned = kind === "person"
    ? context.people
    : kind === "project"
      ? context.projects
      : kind === "organization"
        ? context.organizations
        : context.contexts;

  return fromOwnedContext(kind, owned ?? []);
}

// Provenance authentication: a client-submitted suggestion id counts only when
// it was actually presented for this question AND its canonical value equals
// the submitted answer. A forged id, a stale id, or an answer edited away from
// the chip all resolve to null, which the caller records as a typed answer.
export function findPresentedSuggestion(
  presented: readonly QuestionSuggestion[],
  suggestionId: string | null | undefined,
  submittedAnswer: string,
): QuestionSuggestion | null {
  if (typeof suggestionId !== "string" || !suggestionId) return null;
  if (typeof submittedAnswer !== "string") return null;
  const answer = submittedAnswer.trim();
  const match = presented.find((option) => option.id === suggestionId);
  if (!match) return null;
  return match.value === answer ? match : null;
}
