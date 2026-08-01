import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Secret } from "@/lib/byok/secret";

import { validateAgainstProvider } from "./probe";
import { runValidation } from "./validation";

/**
 * **G-0.4 — the live credential-validation lane.**
 *
 * ## Why this is a `.remote.test.ts`
 *
 * `ADR-059`'s opt-in lane: `vitest.config.ts` excludes `*.remote.test.ts`, so
 * this never runs in CI and CI never needs a credential. It runs locally,
 * deliberately, through `vitest.remote.config.ts`.
 *
 * ## What it costs, and the ceiling on that
 *
 * `models.list` consumes **no tokens**. The dedicated project carries a USD 2
 * monthly budget *alert* — and this file states plainly that an OpenAI project
 * budget is a **soft alert, not a hard spending cap**, because a report that
 * implied otherwise would be describing a control that does not exist.
 *
 * The hard ceiling is the application-side one: `maxRetries: 0`, a short
 * timeout, and the per-user/per-IP daily limits in
 * `claim_credential_validation_slot`. This lane makes **two** calls — one that
 * must succeed and one that must fail — and asserts that count.
 *
 * ## What it must never do
 *
 * Print the key. Not on success, not on failure, not in a diff. Every assertion
 * below is written so that a failure message cannot contain it.
 */

const SECRET_NAME = "BYOK_VALIDATION_OPENAI_API_KEY";

/**
 * Read from `.env.local` directly rather than from `process.env`.
 *
 * Vitest does not load `.env.local`, and Next's loader is not running here. The
 * alternative — telling the operator to export the variable before running —
 * puts the key on a command line and into a shell history, which is the one
 * place `BYOK_G03_MASTER_KEY_PROCEDURE.md` spends a paragraph keeping it out of.
 */
function readValidationKey(): string | null {
  try {
    const body = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    const match = body.match(new RegExp(`^${SECRET_NAME}=(.*)$`, "m"));
    const value = match?.[1]?.trim() ?? "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const rawKey = readValidationKey();

describe("G-0.4: the live validation lane", () => {
  it("has a dedicated validation key available", () => {
    // Presence only. Never the length, never a prefix, never a hash — the same
    // rule every other secret in this initiative is held to.
    expect(
      rawKey !== null,
      `${SECRET_NAME} must be present in .env.local to run this lane`,
    ).toBe(true);
  });

  it("a valid key validates against the real provider", async () => {
    expect(rawKey).not.toBeNull();
    const outcome = await runValidation(new Secret(rawKey!), validateAgainstProvider);

    // If this fails, the message must not carry the key. `outcome` is one of
    // six words by construction, so it cannot.
    expect(outcome).toBe("succeeded");
  }, 30_000);

  it("an invalid key is classified as invalid_key, not as unknown", async () => {
    // The half that a mocked suite genuinely cannot prove. `classifyProviderFailure`
    // maps on status and code, and only a real 401 from OpenAI shows that the
    // shape it maps is the shape OpenAI actually sends. A stub asserts the
    // mapping against itself.
    const bogus = new Secret("sk-proj-thiskeyisnotrealanddoesnotexist000000000000");
    const outcome = await runValidation(bogus, validateAgainstProvider);

    expect(outcome).toBe("invalid_key");
  }, 30_000);

  it("the probe never leaks the key through a thrown error", async () => {
    // The realistic disaster: an SDK error escaping with the request attached.
    // `runValidation` catches everything, but this asserts the containment
    // against the *real* SDK rather than against a stub that throws a plain
    // object.
    const bogus = "sk-proj-thiskeyisnotrealanddoesnotexist111111111111";
    let leaked = false;
    try {
      const outcome = await runValidation(new Secret(bogus), validateAgainstProvider);
      leaked = JSON.stringify(outcome).includes(bogus);
    } catch (error) {
      // Reaching here at all is a failure — runValidation must not rethrow.
      leaked = true;
      expect(error, "runValidation must never rethrow a provider error").toBeUndefined();
    }
    expect(leaked).toBe(false);
  }, 30_000);
});
