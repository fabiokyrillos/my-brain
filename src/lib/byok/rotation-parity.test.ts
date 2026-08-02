import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CURRENT_KEY_VERSION_DEFAULT, MAX_PREVIOUS_KEY_WINDOW_DAYS } from "./rotation";

/**
 * The rotation-window parity lock.
 *
 * A worker that disagreed with the application about **which key seals a row**
 * would strand exactly the credentials a rotation exists to preserve — and it
 * would do so silently, because `BYOK-CRYPTO-005` forbids a decryption failure
 * from naming its cause. So the two copies are compared body for body, the way
 * `parity.test.ts` compares the envelope.
 *
 * This is the cheap instrument: it fails the moment somebody edits one file and
 * not the other, before CI reaches the interop script.
 */

const REPO = resolve(__dirname, "../../..");
const NODE_SOURCE = join(REPO, "src/lib/byok/rotation.ts");
const DENO_SOURCE = join(REPO, "supabase/functions/_shared/byok-rotation.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * One function's executable body, with comments and whitespace removed.
 *
 * Prose is deliberately excluded: the Node copy carries the reasoning and the
 * Deno copy points at it, which is a difference the lock must tolerate. What it
 * must not tolerate is a difference in what the code does.
 */
function body(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);

  let depth = 0;
  let index = source.indexOf("{", start);
  const open = index;
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  return source
    .slice(open, index + 1)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("BYOK-ROTATION: the two runtimes implement one window", () => {
  const node = read(NODE_SOURCE);
  const deno = read(DENO_SOURCE);

  it.each([
    "previousKeyWindowState",
    "resolveMasterKeyRing",
    "keyForVersion",
  ])("keeps %s identical, body for body", (name) => {
    expect(body(deno, name)).toBe(body(node, name));
  });

  it("declares the same bound and the same default version in both sources", () => {
    for (const source of [node, deno]) {
      expect(source).toContain(
        `export const MAX_PREVIOUS_KEY_WINDOW_DAYS = ${MAX_PREVIOUS_KEY_WINDOW_DAYS};`,
      );
      expect(source).toContain(
        `export const CURRENT_KEY_VERSION_DEFAULT = ${CURRENT_KEY_VERSION_DEFAULT};`,
      );
      expect(source).toContain("const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;");
    }
  });

  it("keeps the private version parser identical too", () => {
    const parser = (source: string) =>
      source
        .slice(source.indexOf("function parseCurrentVersion"))
        .slice(0, source.slice(source.indexOf("function parseCurrentVersion")).indexOf("\n}") + 2)
        .replace(/\s+/g, " ")
        .trim();

    expect(parser(deno)).toBe(parser(node));
  });

  /**
   * The declared asymmetry, asserted so it stays a decision rather than
   * becoming a divergence nobody noticed: the Node copy is env-agnostic and
   * `crypto.ts` reads `process.env`; the Deno copy reads `Deno.env` itself,
   * because the worker has no equivalent seam.
   */
  it("differs only in how each runtime reaches its environment", () => {
    // Comment-stripped: both files *discuss* the other runtime's accessor in
    // prose, and a guard that could not tell a sentence from a lookup would be
    // asserting nothing useful.
    const codeOnly = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(codeOnly(deno)).toContain("Deno.env.get(\"BYOK_MASTER_KEY\")");
    expect(codeOnly(node)).not.toContain("Deno.env");
    // Neither copy finds its own environment: the Node one takes it as an
    // argument so `crypto.ts` owns the single sanctioned read.
    expect(codeOnly(node)).not.toContain("process.env");
    expect(codeOnly(deno)).not.toContain("process.env");

    const nodeRing = readFileSync(join(REPO, "src/lib/byok/crypto.ts"), "utf8");
    expect(nodeRing).toContain("resolveMasterKeyRing(env, new Date())");
  });

  it("reads exactly the four declared names in both runtimes, and no fifth", () => {
    const declared = new Set([
      "BYOK_MASTER_KEY",
      "BYOK_MASTER_KEY_VERSION",
      "BYOK_PREVIOUS_MASTER_KEY",
      "BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT",
    ]);

    for (const source of [node, deno]) {
      const names = new Set(source.match(/BYOK_[A-Z_]*MASTER_KEY[A-Z_]*/g) ?? []);
      expect(names).toEqual(declared);
    }
  });

  /**
   * The anti-oracle property, asserted textually in both copies: selection is a
   * pair of equality checks returning a single candidate. A loop, an array of
   * keys, or a `catch` that retries would each turn this into a trial-decrypt
   * path, and each would be visible here.
   */
  it("selects one key by equality in both runtimes, never by trying a list", () => {
    for (const source of [node, deno]) {
      const selection = body(source, "keyForVersion");
      expect(selection).not.toMatch(/\bfor\b|\bwhile\b|\.map\(|\.find\(|catch/);
      expect(selection.match(/return/g) ?? []).toHaveLength(3);
    }
  });
});
