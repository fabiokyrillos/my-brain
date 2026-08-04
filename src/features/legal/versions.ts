/**
 * The policy versions — SH-LEGAL-004's single repository constant.
 *
 * Rendering, acceptance and enforcement all read this file, so two surfaces
 * cannot disagree about what the current version is. The database holds the
 * same literals in `private.current_policy_version` (migration `202608040074`)
 * because `policy_acceptances` is directly insertable by `authenticated` and a
 * constant only TypeScript knows is a constant PostgREST does not enforce —
 * `version-parity.test.ts` pins the two to each other in both directions, the
 * `extraction-parity.test.ts` pattern.
 *
 * **Bumping a version is a migration plus this constant in the same commit**
 * (ADR-079). That is the intended weight: a bump re-interposes consent for every
 * existing account on their next session, which is a deliberate legal event and
 * not a config tweak.
 */

export const POLICY_DOCUMENTS = ["terms", "privacy"] as const;
export type PolicyDocument = (typeof POLICY_DOCUMENTS)[number];

export const ACCEPTANCE_SURFACES = ["signup", "interposition"] as const;
export type AcceptanceSurface = (typeof ACCEPTANCE_SURFACES)[number];

/** Dated versions: readable by a human and orderable by a machine, one scheme. */
export const POLICY_VERSIONS: Readonly<Record<PolicyDocument, string>> = {
  terms: "2026-08-04",
  privacy: "2026-08-04",
};

export function isPolicyDocument(value: unknown): value is PolicyDocument {
  return typeof value === "string" && (POLICY_DOCUMENTS as readonly string[]).includes(value);
}

/**
 * The route each document renders at. Public — reachable without
 * authentication (SH-LEGAL-001), which is why they live outside `app/`.
 */
export function legalDocumentPath(locale: string, document: PolicyDocument): string {
  return `/${locale}/legal/${document}`;
}
