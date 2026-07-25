import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The Deno worker cannot import from `src/` (`src/lib/ai/openai-provider.ts`
// starts with `import "server-only"`, which throws unconditionally outside a
// react-server bundler), so three deterministic modules were copied verbatim
// into `supabase/functions/_shared/` and declared "byte-for-byte identical" by
// comment only — ADR-021. A comment cannot fail a build.
//
// This suite is the enforcement. Each pair is compared body-for-body, with the
// two documented, intentional differences excluded: the Deno copy's provenance
// header, and its import block (Deno needs explicit `.ts` extensions and one
// type is re-exported through a different module there). Anything else — a
// changed weight, threshold, tie-break, or branch — fails the build.
//
// If a divergence is ever deliberate, this test must be updated in the same
// commit that creates it: exactly the review these copies never had.

const sharedDirectory = path.resolve(process.cwd(), "supabase/functions/_shared");
const nodeDirectory = path.resolve(process.cwd(), "src/features/interpretations");

/**
 * Everything after the imports, comment-stripped and whitespace-normalized:
 * the algorithm, without the module plumbing that legitimately differs.
 */
function algorithm(code: string) {
  return code
    .replace(/\r\n/g, "\n")
    // Every top-level import statement, single- or multi-line.
    .replace(/^import\s[\s\S]*?;\s*$/gm, "")
    // Comments carry provenance notes that differ by design.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

const pairs = [
  { name: "entity-resolution", file: "entity-resolution.ts", aliases: {} },
  { name: "trust-policy", file: "trust-policy.ts", aliases: {} },
  {
    name: "trust-builders",
    file: "trust-builders.ts",
    // Same type, different exported name in the two modules: Node imports
    // `ElementTrustDecision` from ./schema, the Deno copy re-exports it from
    // ./trust-policy as `TrustDecision`. Renaming the Deno identifier back is
    // the whole allowance — the annotated positions must still match exactly.
    aliases: { TrustDecision: "ElementTrustDecision" },
  },
] as const;

describe("Deno worker copies stay identical to their Node source", () => {
  for (const pair of pairs) {
    it(`${pair.name} has not drifted`, () => {
      const node = algorithm(readFileSync(path.join(nodeDirectory, pair.file), "utf8"));
      let deno = algorithm(readFileSync(path.join(sharedDirectory, pair.file), "utf8"));
      for (const [denoName, nodeName] of Object.entries(pair.aliases)) {
        deno = deno.replace(new RegExp(`\\b${denoName}\\b`, "g"), nodeName);
      }

      expect(node.length).toBeGreaterThan(200);
      expect(deno).toBe(node);
    });
  }

  it("covers every hand-copied shared module", () => {
    // A new file under _shared/ must either be paired above or be a genuine
    // Deno-only module. `result.ts` is an analogue of the Node Supabase result
    // helper rather than a copy of it, and `extraction-validation.ts` is
    // Deno-owned — its Node counterpart is the Zod schema, held in parity by
    // src/lib/ai/extraction-parity.test.ts instead.
    const denoOnly = ["result.ts", "extraction-validation.ts", "extraction-validation.test.ts"];
    const expected = [...denoOnly, ...pairs.map((pair) => pair.file)].sort();

    expect(readdirSync(sharedDirectory).sort()).toEqual(expected);
  });
});
