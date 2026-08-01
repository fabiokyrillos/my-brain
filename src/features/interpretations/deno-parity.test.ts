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
    // Only the leading comment/import prologue is stripped, and an import must
    // be terminated by its own `from "…"` clause. A greedy `^import[\s\S]*?;`
    // over the whole file would swallow the statement after a semicolon-less
    // import, and would cut through a template literal containing a line that
    // starts with `import` — both silently comparing less while still passing.
    .replace(
      /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/|import\s[\s\S]*?from\s+["'][^"']+["'];?|import\s+["'][^"']+["'];?)\s*)+/,
      "",
    )
    // Remaining comments carry provenance notes that differ by design.
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
    // `extraction-normalization.ts` has no Node *counterpart* to drift from
    // either — but since Phase 2E it is no longer Deno-only: the command
    // temporal resolver (`src/features/task-commands/temporal.ts`) imports
    // `resolveLocal` from it directly, which is the outcome this guard wants
    // (one proven implementation, reused) rather than the copy it forbids. It
    // is therefore a genuinely shared module, and the test below keeps it
    // importable from Node.
    //
    // `byok-envelope.ts` is a hand copy, but it cannot be a `pair` above: it is
    // the Deno merge of *two* Node modules — `src/lib/byok/envelope.ts` and
    // `src/lib/byok/crypto.ts`, whose `import "server-only"` throws under Deno —
    // and the body-for-body comparison this file performs is 1:1. Its parity is
    // held the way `extraction-validation.ts`'s is: by a dedicated test,
    // `src/lib/byok/parity.test.ts`, which digests the format constants and the
    // AAD composition out of both sources, plus the executed cross-runtime
    // interop proof in `scripts/byok-crypto-interop.mjs`.
    //
    // It is listed here rather than left out because this inventory is closed in
    // both directions on purpose, and it caught exactly what it exists to catch:
    // the file landed in `c5eedea` unregistered, and the first CI run reddened.
    const denoOnly = [
      "result.ts",
      "extraction-validation.ts",
      "extraction-validation.test.ts",
      "extraction-normalization.ts",
      "extraction-normalization.test.ts",
      "byok-envelope.ts",
      "byok-envelope.test.ts",
    ];
    const expected = [...denoOnly, ...pairs.map((pair) => pair.file)].sort();

    expect(readdirSync(sharedDirectory).sort()).toEqual(expected);
  });

  it("keeps the shared normalization module importable from Node", () => {
    // Phase 2E's temporal resolver imports `resolveLocal` from here, so a
    // worker-side change reaching for a Deno global, an https: import or a
    // .ts-suffixed specifier would break `next build`. Neither existing gate
    // would catch it: `vitest.config.ts` includes only `src/**`, and the CI
    // worker job runs `deno check`, which is happy with all three.
    const source = readFileSync(path.join(sharedDirectory, "extraction-normalization.ts"), "utf8");
    expect(source).not.toMatch(/\bDeno\./);
    expect(source).not.toMatch(/from\s+["']https:/);
    expect(source).not.toMatch(/from\s+["'][^"']+\.ts["']/);
  });
});
