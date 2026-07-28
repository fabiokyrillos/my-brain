/**
 * The product-event vocabulary, read from `contracts.ts` rather than restated.
 *
 * PRD 2E-ANALYTICS-006: "`scripts/remote-product-events-smoke.mjs` imports the
 * event and surface vocabulary from the contracts module instead of restating
 * it, so a TypeScript addition cannot drift from the smoke."
 *
 * The smoke is plain Node (`node scripts/…mjs`) and this repository carries no
 * `tsx`, `ts-node` or esbuild register hook, so a literal `import` of the `.ts`
 * module is not available. Reading the declaration out of the single source of
 * truth is the same guarantee by the only mechanism there is: there remains
 * exactly one place either list is written down, and adding a name in
 * TypeScript changes what this returns.
 *
 * It fails loudly rather than falling back. A silent empty list would turn the
 * smoke green while asserting nothing, which is the precise failure mode
 * 2E-ANALYTICS-006 exists to prevent — and is what the previous hard-coded
 * nineteen names did in slow motion: `docs/PHASE_2E_PRD.md §3.4` records them
 * having drifted three names behind the contracts module without anything going
 * red.
 *
 * `parseProductEventVocabulary` is exported separately from the file read so a
 * Vitest test can hold this extractor to the real imported constants by exact
 * equality. That test is what makes this a mirror rather than a fourth copy.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACTS_PATH = "src/features/product-analytics/contracts.ts";

/**
 * Reads one `export const <name> = [ … ] as const;` array of string literals.
 *
 * Deliberately narrow: it accepts only a flat list of single- or double-quoted
 * strings, with `//` line comments tolerated between entries because the
 * contracts module documents several of its literals in place. Anything else —
 * a computed member, a spread, a nested array — throws, because a vocabulary
 * this extractor cannot read completely is one the smoke must not guess at.
 */
export function parseProductEventVocabulary(source, name) {
  const declaration = new RegExp(
    `export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const;`,
    "u",
  );
  const match = declaration.exec(source);
  if (!match) {
    throw new Error(`${CONTRACTS_PATH} no longer declares "${name}" as a const array`);
  }

  const body = match[1];
  const values = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) {
      continue;
    }
    const entry = /^(?:"([^"]+)"|'([^']+)')\s*,?$/u.exec(line);
    if (!entry) {
      throw new Error(
        `${CONTRACTS_PATH}: "${name}" contains an entry this reader cannot parse: ${line}`,
      );
    }
    values.push(entry[1] ?? entry[2]);
  }

  if (values.length === 0) {
    throw new Error(`${CONTRACTS_PATH}: "${name}" parsed as empty, which cannot be right`);
  }
  return values;
}

export function readProductEventVocabulary(repositoryRoot) {
  const root = repositoryRoot
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = readFileSync(path.join(root, CONTRACTS_PATH), "utf8");
  return {
    eventNames: parseProductEventVocabulary(source, "productEventNames"),
    surfaces: parseProductEventVocabulary(source, "productSurfaces"),
  };
}
