/**
 * Entity Graph Completion traceability generator (EGC-OPERATIONS-001, Slice EGC.3).
 *
 * Writes `docs/reports/EGC_TRACEABILITY_MATRIX.md` from
 * `docs/ENTITY_GRAPH_COMPLETION_PRD.md`, from the implementation plan's own
 * slice-ownership declarations, and from the repository artifacts the matrix
 * claims as evidence.
 *
 * ## The doctrine it inherits
 *
 * `generate-phase-2f-traceability.mjs` established the rule this follows: a
 * generator **derives** what it can and **resolves** what it declares. A matrix
 * that prints a hand-written evidence map catches inventory drift and nothing
 * else — every artifact name in it is a string nobody checks, which is the
 * failure `PHASE_2E_SLICE_08_REPORT.md` §4.2 named and Slice 2F.5 hit three
 * times ("a guard which reads its own input proves nothing").
 *
 * So here:
 *
 *   * the requirement inventory is **parsed** from PRD §5 and §6 by a
 *     declaration-anchored rule — a table row whose first cell is a bolded ID —
 *     and every `EGC-` id *referenced* anywhere in the PRD must resolve to a
 *     declared one, because a typo'd cross-reference is a real class of defect;
 *   * slice ownership is **parsed** from the plan's own `**Delivers:**` lines,
 *     expanded from their `EGC-ORG-001…007` range notation;
 *   * every artifact path in the evidence map is **resolved on disk**, and a
 *     missing one fails the run rather than printing a dead link;
 *   * every requirement must be covered by at least one artifact, or appear in
 *     the deferred list with a reason — silence is not a disposition.
 *
 * **Fail-closed.** Any drift exits non-zero and writes nothing, so a matrix on
 * disk is always one that passed. `egc-traceability.test.ts` runs it against
 * fixture repositories carrying one deliberate defect each, plus a correct
 * fixture as a positive control — a guard proven only in the failing direction
 * may be refusing everything.
 *
 * Deterministic by construction: no clock, no randomness, every collection
 * sorted. Gate C3 requires it to regenerate content-identically twice.
 *
 * ## Line endings are normalised, and that is not cosmetic
 *
 * Every split here is `/\r?\n/`. The first draft used `"\n"` and silently found
 * **zero** of the three owner decisions on a Windows checkout: their declaration
 * is a heading ending `(.+)$`, and `.` does not match `\r`, so the trailing
 * carriage return killed the match — while the table rows kept working, because
 * their pattern ends `\s*$` and `\s` *does* match `\r`. A generator that reports
 * a different inventory depending on the developer's `core.autocrlf` is not a
 * generator, and this is the same fragility that already costs this repository
 * two red assertions in `sql-reachability.test.ts`.
 *
 * Usage: `npm run docs:egc:traceability`
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/**
 * Requirements the initiative declares, parsed rather than restated.
 *
 * Anchored on the declaration shape the PRD actually uses: a table row whose
 * first cell is a bolded requirement id. Grepping for the id pattern anywhere
 * would also collect every cross-reference in the prose, which is how an
 * inventory silently grows to include ids nobody declared.
 */
export function declaredRequirements(root) {
  const prd = readFileSync(join(root, "docs/ENTITY_GRAPH_COMPLETION_PRD.md"), "utf8");
  const declared = new Map();

  for (const line of prd.split(/\r?\n/)) {
    const row = /^\|\s*\*\*(EGC-[A-Z]+-\d+)\*\*\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (row) {
      declared.set(row[1], row[2]);
      continue;
    }
    // The three owner decisions are declared as headings, not table rows.
    const heading = /^###\s+(EGC-DEC-\d+)\s+—\s+(.+)$/.exec(line);
    if (heading) declared.set(heading[1], heading[2]);
  }

  return declared;
}

/** Every `EGC-` id the PRD mentions anywhere, for the dangling-reference check. */
export function referencedRequirements(root) {
  const prd = readFileSync(join(root, "docs/ENTITY_GRAPH_COMPLETION_PRD.md"), "utf8");
  return new Set(prd.match(/EGC-[A-Z]+-\d+/g) ?? []);
}

/**
 * Slice ownership, parsed from the plan's `**Delivers:**` declarations.
 *
 * Three notations, all of them the plan's own and all of them load-bearing:
 *
 *   * `EGC-ORG-001…007` — a range;
 *   * `EGC-INVARIANT-001/002/005` — a list;
 *   * a declaration that **wraps onto the next line**, which the first draft
 *     read only the first line of and therefore attributed `EGC-SURFACE-001…005`
 *     to no slice at all. The paragraph is collected to the next blank line.
 *
 * A prose fragment like "EGC-AUDIT for the three relationship tables" carries no
 * numbers and is deliberately **not** guessed at: it contributes nothing here,
 * and the requirement it gestures at is covered by the evidence map instead. An
 * unowned requirement prints `—` rather than a guess.
 */
export function sliceOwnership(root) {
  const plan = readFileSync(join(root, "docs/ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md"), "utf8");
  const owners = new Map();
  const lines = plan.split(/\r?\n/);
  let slice = null;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^##\s+Slice\s+(EGC\.\d)/.exec(lines[index]);
    if (heading) { slice = heading[1]; continue; }
    if (!slice || !lines[index].startsWith("**Delivers:**")) continue;

    let paragraph = lines[index];
    for (let next = index + 1; next < lines.length && lines[next].trim() !== ""; next += 1) {
      paragraph += ` ${lines[next]}`;
    }

    for (const match of paragraph.matchAll(/(EGC-[A-Z]+)-(\d+(?:(?:…|\/)\d+)*)/g)) {
      const [, family, spec] = match;
      for (const part of spec.split("/")) {
        const [from, to] = part.split("…");
        const last = to ? Number(to) : Number(from);
        // The zero-padding is taken from the source token, not assumed to be
        // three: requirements are declared `EGC-ORG-001` and the owner decisions
        // are declared `EGC-DEC-1`. Padding everything to three silently
        // produced `EGC-DEC-001`, an id nothing declares, so the decision looked
        // unowned while the parser believed it had attributed it.
        for (let n = Number(from); n <= last; n += 1) {
          owners.set(`${family}-${String(n).padStart(from.length, "0")}`, slice);
        }
      }
    }
  }

  return owners;
}

/**
 * What each requirement family is evidenced by.
 *
 * Declared here and **resolved on disk** below. A path that stops existing is a
 * failed run, not a dead link in a document nobody re-reads.
 */
export const EVIDENCE = {
  "EGC-INVARIANT": [
    "src/lib/closeout/egc-invariants.test.ts",
    "src/lib/closeout/egc-reachability.test.ts",
    "supabase/tests/egc_entity_graph_surfaces.sql",
  ],
  "EGC-ORG": [
    "src/features/entities/actions.ts",
    "src/features/entities/organizations.ts",
    "src/app/[locale]/app/organizations/page.tsx",
    "src/app/[locale]/app/organizations/[organizationId]/page.tsx",
    "e2e/online-entity-graph.spec.ts",
  ],
  "EGC-CTX": [
    "src/features/entities/actions.ts",
    "src/features/entities/contexts.ts",
    "src/app/[locale]/app/contexts/page.tsx",
    "src/app/[locale]/app/contexts/[contextId]/page.tsx",
    "e2e/online-entity-graph.spec.ts",
  ],
  "EGC-REL": [
    "src/features/entities/relationship-vocabulary.ts",
    "src/features/entities/relationship-vocabulary.test.ts",
    "src/features/entities/relationships.ts",
    "src/features/entities/relationship-panel.tsx",
    "supabase/tests/egc_relationship_lifecycle.sql",
    "e2e/online-relationships.spec.ts",
  ],
  "EGC-ASSOC": [
    "src/features/entities/associations.ts",
    "src/features/entities/association-panel.tsx",
    "src/lib/closeout/egc-invariants.test.ts",
    "supabase/tests/egc_relationship_lifecycle.sql",
    "e2e/online-relationships.spec.ts",
  ],
  "EGC-AUDIT": [
    "src/features/history/vocabulary.ts",
    "src/features/history/copy.ts",
    "supabase/tests/egc_entity_graph_surfaces.sql",
    "supabase/tests/egc_relationship_lifecycle.sql",
  ],
  "EGC-SURFACE": [
    "src/features/entities/copy.ts",
    "src/features/shell/capabilities.ts",
    "src/lib/closeout/locale-ternary-guard.test.ts",
    "e2e/online-route-audit.spec.ts",
  ],
  "EGC-OPERATIONS": [
    "scripts/generate-egc-traceability.mjs",
    "scripts/verify-egc-cleanup.mjs",
    "src/lib/closeout/egc-reachability.test.ts",
    "docs/SECURITY.md",
    "docs/reports/EGC_REPORT.md",
  ],
  "EGC-DEC": [
    "docs/ENTITY_GRAPH_COMPLETION_PRD.md",
    "supabase/tests/egc_entity_graph_surfaces.sql",
    "supabase/tests/egc_relationship_lifecycle.sql",
  ],
};

/**
 * Requirements deliberately not delivered, each with a destination.
 *
 * Empty is the expected state at closeout. It exists because "no deferrals"
 * must be a *measured* answer rather than the absence of a list.
 */
export const DEFERRED = {};

function family(id) {
  return id.replace(/-\d+$/, "");
}

export function buildMatrix(root) {
  const problems = [];
  const declared = declaredRequirements(root);
  const referenced = referencedRequirements(root);
  const owners = sliceOwnership(root);

  if (declared.size === 0) problems.push("No requirements parsed from the PRD — the declaration rule stopped matching.");

  for (const id of [...referenced].sort()) {
    if (!declared.has(id)) problems.push(`Dangling reference: ${id} is cited in the PRD but never declared.`);
  }

  const families = [...new Set([...declared.keys()].map(family))].sort();
  for (const name of families) {
    if (!EVIDENCE[name]) problems.push(`Requirement family ${name} has no evidence entry.`);
  }
  for (const name of Object.keys(EVIDENCE).sort()) {
    if (!families.includes(name)) problems.push(`Evidence declared for ${name}, which the PRD does not declare.`);
  }

  for (const [name, paths] of Object.entries(EVIDENCE)) {
    for (const path of paths) {
      if (!existsSync(join(root, path))) problems.push(`${name} claims ${path}, which does not exist.`);
    }
  }

  for (const id of [...declared.keys()].sort()) {
    if (!EVIDENCE[family(id)] && !DEFERRED[id]) problems.push(`${id} has neither evidence nor a recorded deferral.`);
  }

  const rows = [...declared.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, statement]) => ({
      id,
      statement,
      slice: owners.get(id) ?? "—",
      evidence: (EVIDENCE[family(id)] ?? []).slice().sort(),
      deferred: DEFERRED[id] ?? null,
    }));

  return { rows, problems, families };
}

export function renderMatrix({ rows, families }) {
  const lines = [
    "# Entity Graph Completion — traceability matrix",
    "",
    "**Generated by `scripts/generate-egc-traceability.mjs` (EGC-OPERATIONS-001). Do not edit by hand.**",
    "",
    "Every row is parsed from `docs/ENTITY_GRAPH_COMPLETION_PRD.md`; every slice is parsed from the",
    "implementation plan's own `**Delivers:**` lines; every artifact path is resolved on disk before",
    "this file is written. The generator is fail-closed — if anything drifts it exits non-zero and",
    "writes nothing, so a matrix on disk is always one that passed.",
    "",
    `**${rows.length} requirements across ${families.length} families.**`,
    "",
    "| Requirement | Slice | Statement | Evidence |",
    "| --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    const evidence = row.deferred
      ? `**DEFERRED** — ${row.deferred}`
      : row.evidence.map((path) => `\`${path}\``).join("<br>");
    const statement = row.statement.replace(/\|/g, "\\|");
    lines.push(`| **${row.id}** | ${row.slice} | ${statement} | ${evidence} |`);
  }

  lines.push("", "## Disposition", "");
  const deferred = rows.filter((row) => row.deferred);
  lines.push(`- **Delivered:** ${rows.length - deferred.length}`);
  lines.push(`- **Deferred:** ${deferred.length}`);
  lines.push("");
  lines.push(
    deferred.length === 0
      ? "No requirement is deferred. That is a measured answer rather than an empty section: the"
        + " generator fails closed on any requirement carrying neither evidence nor a recorded"
        + " destination."
      : "Each deferral names its destination above.",
  );
  lines.push("");

  return lines.join("\n");
}

export function generate(root = DEFAULT_ROOT, { write = true } = {}) {
  const built = buildMatrix(root);
  if (built.problems.length > 0) return { ok: false, problems: built.problems, content: null };

  const content = renderMatrix(built);
  if (write) writeFileSync(join(root, "docs/reports/EGC_TRACEABILITY_MATRIX.md"), content, "utf8");
  return { ok: true, problems: [], content };
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]).endsWith("generate-egc-traceability.mjs");

if (invokedDirectly) {
  const result = generate();
  if (!result.ok) {
    console.error("EGC traceability generation failed:\n" + result.problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("docs/reports/EGC_TRACEABILITY_MATRIX.md regenerated.");
}
