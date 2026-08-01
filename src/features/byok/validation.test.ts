import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Secret } from "@/lib/byok/secret";

import {
  apiKeySchema,
  classifyProviderFailure,
  parseApiKey,
  runValidation,
  VALIDATION_OUTCOMES,
} from "./validation";

/**
 * `BYOK-VALIDATE-001…003` and `BYOK-SCHEMA-006`.
 *
 * The load-bearing property here is **containment**: whatever the provider
 * returns, exactly one of six words comes out, and nothing else crosses the
 * boundary. An OpenAI SDK error carries the request that produced it, and for a
 * validation call that request is authenticated with the key being validated.
 */

const VALID = "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("BYOK-VALIDATE-001: shape first, and the message never echoes the input", () => {
  it("accepts a plausible key", () => {
    expect(parseApiKey(VALID)).toBeInstanceOf(Secret);
    expect(parseApiKey(VALID)?.expose()).toBe(VALID);
  });

  it("rejects what cannot be a key", () => {
    for (const bad of ["", "   ", "short", "x".repeat(401), "has spaces in it", null, undefined, 42]) {
      expect(parseApiKey(bad), String(bad)).toBeNull();
    }
  });

  it("never puts the value in the issue", () => {
    // A Zod issue that quoted the input would put a key into whatever renders
    // the error, which on a form is the page.
    const result = apiKeySchema.safeParse("definitely a bad key with spaces");
    expect(result.success).toBe(false);
    if (result.success) return;
    const rendered = JSON.stringify(result.error.issues);
    expect(rendered).not.toContain("definitely a bad key");
    for (const issue of result.error.issues) expect(issue.message).toBe("invalid");
  });

  it("is deliberately loose on format and tight on size", () => {
    // OpenAI has changed its key prefixes more than once. A validator that
    // rejects a legitimate new format is an outage the user cannot work around,
    // so only length and character class are enforced.
    expect(parseApiKey("sk-newformat-2027-aaaaaaaaaaaaaaaa")).toBeInstanceOf(Secret);
    expect(parseApiKey("totally_unprefixed_but_long_enough_value")).toBeInstanceOf(Secret);
  });
});

describe("BYOK-SCHEMA-006: every provider failure becomes one of six words", () => {
  it("maps the codes it knows", () => {
    expect(classifyProviderFailure({ code: "invalid_api_key" })).toBe("invalid_key");
    expect(classifyProviderFailure({ code: "insufficient_quota" })).toBe("insufficient_quota");
    expect(classifyProviderFailure({ code: "account_deactivated" })).toBe("revoked");
  });

  it("maps the statuses it knows", () => {
    expect(classifyProviderFailure({ status: 401 })).toBe("invalid_key");
    expect(classifyProviderFailure({ status: 403 })).toBe("revoked");
    expect(classifyProviderFailure({ status: 429 })).toBe("rate_limited");
  });

  it("distinguishes the two meanings of 429", () => {
    // 429 is both "too many requests" and "you are out of credit". Telling a
    // user to try again shortly when their balance is zero is advice that never
    // comes true.
    expect(classifyProviderFailure({ status: 429, code: "insufficient_quota" })).toBe(
      "insufficient_quota",
    );
  });

  it("reads a nested error code, which is where the SDK puts it on some responses", () => {
    expect(classifyProviderFailure({ error: { code: "invalid_api_key" } })).toBe("invalid_key");
  });

  it("falls back to unknown for anything else, and never throws", () => {
    const hostiles = [
      null,
      undefined,
      "a string",
      42,
      {},
      { status: 500 },
      { status: "not a number" },
      new Error("boom"),
      // A null-prototype object: the shape a `JSON.parse` result can take, and
      // one that throws on `String()`. Labelled by index rather than by value
      // for exactly that reason — the first draft of this loop crashed in its
      // own assertion message while the function under test was fine.
      Object.create(null),
    ];

    hostiles.forEach((hostile, index) => {
      const outcome = classifyProviderFailure(hostile);
      expect(VALIDATION_OUTCOMES, `hostile input #${index}`).toContain(outcome);
    });
  });

  it("never reads the provider's message", () => {
    // Provider prose changes without notice, and matching on it is how a
    // mapping silently starts returning `unknown` for everything. A message
    // that screams "invalid api key" must still map by code or status alone.
    expect(classifyProviderFailure({ message: "Incorrect API key provided: sk-abc" })).toBe(
      "unknown",
    );
  });
});

describe("runValidation contains the provider entirely", () => {
  it("returns succeeded when the probe resolves", async () => {
    expect(await runValidation(new Secret(VALID), async () => {})).toBe("succeeded");
  });

  it("hands the probe the key and nothing else", async () => {
    const probe = vi.fn(async (key: Secret) => {
      expect(key.expose()).toBe(VALID);
    });
    await runValidation(new Secret(VALID), probe);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("swallows the error object completely", async () => {
    // The realistic shape: an SDK error carrying the request, which carries the
    // key. If any of this escaped, it would escape here.
    const hostile = Object.assign(new Error("Incorrect API key provided"), {
      status: 401,
      code: "invalid_api_key",
      request: { headers: { authorization: `Bearer ${VALID}` } },
    });

    const outcome = await runValidation(new Secret(VALID), async () => {
      throw hostile;
    });

    expect(outcome).toBe("invalid_key");
    // The whole return value, serialized: one word, no object, no key.
    expect(JSON.stringify(outcome)).toBe('"invalid_key"');
    expect(JSON.stringify(outcome)).not.toContain(VALID);
  });

  it("never rethrows, whatever the probe throws", async () => {
    for (const thrown of [new Error("x"), "a string", null, undefined, { weird: true }]) {
      const outcome = await runValidation(new Secret(VALID), async () => {
        throw thrown;
      });
      expect(VALIDATION_OUTCOMES).toContain(outcome);
    }
  });
});
