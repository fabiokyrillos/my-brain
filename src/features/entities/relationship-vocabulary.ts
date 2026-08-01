import type { Locale } from "@/lib/preferences";

/**
 * The relationship taxonomy, as a closed typed set with localized terms
 * (EGC-REL-002, EGC-REL-004, EGC-REL-006).
 *
 * ## What a relationship row means
 *
 * `public.person_relationships` has carried `related_person_id uuid` — **nullable**
 * — since `202607160009:7`. A null there is not missing data: it means *related to
 * the owner*. That is the reading EGC-REL-001 fixes, and it is recorded here as
 * well as in the PRD because this module is where a future reader will look when
 * they wonder whether a null needs backfilling. It does not. Nothing in this
 * slice writes a non-null `related_person_id`; person-to-person relationships are
 * a separate contract nobody has asked for yet.
 *
 * ## Why the column has no CHECK, and must not gain one
 *
 * `relationship_type` is bare `text`. The extraction pipeline can write it, and a
 * model that produces `godparent` should leave a row that *renders oddly*, not a
 * row that fails to insert and takes an interpretation with it. So the closed set
 * lives here, in TypeScript, and `describeRelationshipType` returns `null` for
 * anything outside it — the caller renders the raw value in a neutral style.
 * `history/vocabulary.ts` already works this way for `audit_logs.entity_type`,
 * for the same reason.
 *
 * ## Gendered terms, stated rather than fudged
 *
 * Portuguese inflects most kinship terms and **the product does not know
 * anyone's gender** — it has no such field and is not about to add one to render
 * a label. So the pt-BR terms name both forms: `Esposa/Esposo`, `Pai/Mãe`,
 * `Filho/Filha`, `Irmão/Irmã`. This is the PRD's own notation for `spouse`
 * (EGC-REL-004 writes it as *Esposa/Esposo*), applied consistently to the other
 * three rather than to one. The alternative — picking `Esposa` — would assign a
 * gender to every spouse in every account on the strength of nothing.
 *
 * The un-inflected members (`friend`, `colleague`, `client`…) take their single
 * Portuguese form, because there is only one.
 *
 * ## Free text is user content
 *
 * `description` (EGC-REL-005) is never localized, never matched against this
 * table, and never treated as an instruction. It exists because "sister-in-law,
 * but really more of a friend" is a true thing that no taxonomy will hold.
 */

/**
 * Bumped whenever a member is added, removed, or **re-pointed to a different
 * term** — and pinned by a digest in `relationship-vocabulary.test.ts`.
 *
 * The digest covers the term mappings, not the database literals. That
 * distinction is the whole lesson of Slice 2E.8: a lock over the literals alone
 * stayed green while the terms beneath them were rewritten, because the literals
 * had not moved. Renaming `spouse`'s Portuguese term without touching this
 * constant must fail, and it does.
 */
export const RELATIONSHIP_VOCABULARY_VERSION = "2026-07-31.1";

/**
 * The fourteen members EGC-REL-004 requires.
 *
 * `other_family` and `other` are both present and are not redundant: the first
 * says "a relative, and the description says which", the second says "none of
 * these". Collapsing them would lose the fact that somebody is family.
 */
export const RELATIONSHIP_TYPES = [
  "spouse",
  "partner",
  "parent",
  "child",
  "sibling",
  "other_family",
  "friend",
  "colleague",
  "manager",
  "report",
  "client",
  "vendor",
  "mentor",
  "other",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * The term each member renders as, per locale.
 *
 * `satisfies` rather than an annotation, so a missing member is a compile error
 * *and* the literal types survive for the digest to cover.
 */
const RELATIONSHIP_TERMS = {
  "pt-BR": {
    spouse: "Esposa/Esposo",
    partner: "Parceira/Parceiro",
    parent: "Pai/Mãe",
    child: "Filho/Filha",
    sibling: "Irmão/Irmã",
    other_family: "Outro familiar",
    friend: "Amiga/Amigo",
    colleague: "Colega de trabalho",
    manager: "Chefe",
    report: "Reporta a você",
    client: "Cliente",
    vendor: "Fornecedor",
    mentor: "Mentora/Mentor",
    other: "Outra relação",
  },
  en: {
    spouse: "Spouse",
    partner: "Partner",
    parent: "Parent",
    child: "Child",
    sibling: "Sibling",
    other_family: "Other family",
    friend: "Friend",
    colleague: "Colleague",
    manager: "Manager",
    report: "Reports to you",
    client: "Client",
    vendor: "Vendor",
    mentor: "Mentor",
    other: "Other relationship",
  },
} satisfies Record<Locale, Record<RelationshipType, string>>;

/** The stored value narrowed, or null when no member matches. */
export function asRelationshipType(value: unknown): RelationshipType | null {
  return RELATIONSHIP_TYPES.includes(value as RelationshipType)
    ? (value as RelationshipType)
    : null;
}

/**
 * The localized term for a stored value, or `null` when it is outside the set
 * (EGC-REL-006).
 *
 * `null` rather than a guessed label or a thrown error: the caller decides how
 * to present an unrecognised value, and the Person surface renders it raw in a
 * neutral style. A row written by a future extraction pass must remain readable
 * without this module having heard of it.
 */
export function describeRelationshipType(locale: Locale, value: unknown): string | null {
  const member = asRelationshipType(value);
  return member === null ? null : RELATIONSHIP_TERMS[locale][member];
}

/** Every member with its term, in declared order — the selector's options. */
export function relationshipOptions(
  locale: Locale,
): readonly { readonly value: RelationshipType; readonly label: string }[] {
  return RELATIONSHIP_TYPES.map((value) => ({ value, label: RELATIONSHIP_TERMS[locale][value] }));
}

/** The mappings the policy lock digests — terms, not literals. */
export function canonicalRelationshipTerms(): readonly (readonly [string, string, string])[] {
  return RELATIONSHIP_TYPES.map(
    (member) => [member, RELATIONSHIP_TERMS["pt-BR"][member], RELATIONSHIP_TERMS.en[member]] as const,
  );
}
