import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSecret, Secret, SecretSerializationError } from "./secret";

/**
 * `BYOK-ADAPTER-006` and the half of `BYOK-GUARD-004` that belongs to the type
 * itself.
 *
 * Every case here is a path somebody reaches **by accident**. That is the whole
 * design: the value is not protected from a developer who wants it — `.expose()`
 * is right there — it is protected from a logger, a serializer, a template
 * literal and a spread.
 */

const VALUE = "sk-proj-not-a-real-key-000000000000000000";

describe("Secret refuses every accidental serialization path", () => {
  it("throws on toString", () => {
    const secret = new Secret(VALUE);
    expect(() => secret.toString()).toThrow(SecretSerializationError);
  });

  it("throws on JSON.stringify, directly and nested", () => {
    const secret = new Secret(VALUE);
    expect(() => JSON.stringify(secret)).toThrow(SecretSerializationError);

    // The realistic shape: an object that grew a field. This is the case
    // BYOK-GUARD-004 scans every declared result and payload for.
    expect(() => JSON.stringify({ credential: secret, ok: true })).toThrow(
      SecretSerializationError,
    );
    expect(() => JSON.stringify([{ nested: { deep: secret } }])).toThrow(
      SecretSerializationError,
    );
  });

  it("throws on template interpolation and String()", () => {
    const secret = new Secret(VALUE);
    // `Symbol.toPrimitive` is what makes this throw. Without it a template
    // literal would bypass `toString` and interpolate the value — the single
    // most likely leak in a file that builds an Authorization header.
    expect(() => `Bearer ${secret}`).toThrow(SecretSerializationError);
    expect(() => String(secret)).toThrow(SecretSerializationError);
    expect(() => secret + "").toThrow(SecretSerializationError);
  });

  it("renders as a placeholder under util.inspect and console formatting", () => {
    const secret = new Secret(VALUE);
    // Not a throw: `inspect` is what a crash handler runs on the whole error
    // context, and making that throw would replace a leak with an outage. It
    // must render *something*, and the something must not be the value.
    const rendered = inspect({ credential: secret });
    expect(rendered).not.toContain(VALUE);
    expect(rendered).toContain("[BYOK Secret]");
  });

  it("survives being spread without leaking", () => {
    const secret = new Secret(VALUE);
    // `#value` is a real private field, so a spread copies nothing. A
    // TypeScript `private` would have been walked straight through here.
    const spread = { ...secret } as Record<string, unknown>;
    expect(JSON.stringify(spread)).not.toContain(VALUE);
    expect(Object.keys(spread)).toEqual([]);
  });

  it("is invisible to Object.entries, getOwnPropertyNames and structured cloning", () => {
    const secret = new Secret(VALUE);
    expect(JSON.stringify(Object.entries(secret))).not.toContain(VALUE);
    expect(Object.getOwnPropertyNames(secret).join(",")).not.toContain(VALUE);
    // `structuredClone` walks own enumerable properties; a `#` field is not one,
    // so the clone comes back empty rather than carrying the value into a
    // worker, a cache or an RSC payload.
    //
    // Asserted as "the value did not survive" rather than as a throw: the first
    // draft expected a throw and was wrong — a class instance clones to a plain
    // object without complaint. The absence is the property that matters, and
    // asserting the throw would have been asserting an implementation detail
    // that is not even true.
    const cloned = structuredClone(secret) as unknown as Record<string, unknown>;
    expect(Object.keys(cloned)).toEqual([]);
    expect(JSON.stringify(cloned)).not.toContain(VALUE);
  });
});

describe("Secret yields its value only through the one named door", () => {
  it("expose returns the value", () => {
    expect(new Secret(VALUE).expose()).toBe(VALUE);
  });

  it("length is available without the value", () => {
    // Bounds checks at the validation boundary need the length and must not see
    // the value; this is why `length` exists rather than callers using
    // `.expose().length`.
    expect(new Secret(VALUE).length).toBe(VALUE.length);
  });

  it("refuses to be constructed from nothing", () => {
    expect(() => new Secret("")).toThrow(/cannot be constructed from an empty value/);
    expect(() => new Secret(undefined as unknown as string)).toThrow();
  });
});

describe("Secret is nominal, not structural", () => {
  it("a plain object with an expose method is not a Secret", () => {
    // Structural typing would let an impostor satisfy `Secret` and skip every
    // guarantee above. The brand is what stops that.
    const impostor = { expose: () => VALUE };
    expect(isSecret(impostor)).toBe(false);
    expect(isSecret(new Secret(VALUE))).toBe(true);
    expect(isSecret(VALUE)).toBe(false);
    expect(isSecret(null)).toBe(false);
  });

  it("identifies itself by tag rather than as a generic object", () => {
    expect(Object.prototype.toString.call(new Secret(VALUE))).toBe("[object BYOKSecret]");
  });
});
