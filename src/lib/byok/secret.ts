import "server-only";

/**
 * `BYOK-ADAPTER-006` — plaintext key material, carried in something that fights
 * being written down.
 *
 * ## The failure this exists to prevent
 *
 * Nobody logs a credential on purpose. They log the object that happens to
 * contain one: a `console.error(context)` during an incident, a Sentry breadcrumb,
 * an `audit_logs` payload assembled with a spread, a Server Action result that
 * grew a field, a React prop that got serialized into the RSC payload. In every
 * one of those the value is reached through `toString`, `toJSON`, or Node's
 * inspection hook — never through anything that looks like "expose the secret".
 *
 * So all three **throw**. The only way out is `.expose()`, which is greppable,
 * reviewable, and reads at the call site as exactly what it is.
 *
 * ## Why not a plain string
 *
 * A plain string is indistinguishable from every other string in the program,
 * which means no guard can tell the difference either. `BYOK-GUARD-004`
 * round-trips every declared result shape, job payload, audit payload and
 * rendered prop through `JSON.stringify` and asserts the absence of key
 * material; that guard is only possible because serializing a `Secret` raises
 * instead of quietly emitting the value.
 */

const SECRET_BRAND: unique symbol = Symbol("byok.secret");

/** The message every accidental-serialization path produces. */
export const SECRET_SERIALIZATION_MESSAGE =
  "A BYOK Secret cannot be serialized. Call .expose() at the provider boundary if you genuinely need the value.";

export class SecretSerializationError extends Error {
  constructor() {
    super(SECRET_SERIALIZATION_MESSAGE);
    this.name = "SecretSerializationError";
  }
}

export class Secret {
  /**
   * Brands the class nominally, so a bare `{ expose: () => "..." }` is not
   * assignable where a `Secret` is required. Structural typing would otherwise
   * let a plain object impersonate one and skip every guarantee below.
   */
  private readonly [SECRET_BRAND] = true;

  /**
   * `#value` rather than `private value`: a TypeScript `private` is a
   * compile-time fiction that `Object.entries`, a spread and `JSON.stringify`
   * all walk straight through. A `#` field is genuinely unreachable from
   * outside the class at runtime, which is the property that matters when the
   * thing walking the object is a logger and not a developer.
   */
  readonly #value: string;

  constructor(value: string) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("A BYOK Secret cannot be constructed from an empty value");
    }
    this.#value = value;
  }

  /**
   * The one way out. Named so it cannot be typed by accident and cannot be
   * mistaken for anything else in a review diff.
   */
  expose(): string {
    return this.#value;
  }

  /** The length, for bounds checks that must not see the value. */
  get length(): number {
    return this.#value.length;
  }

  toString(): never {
    throw new SecretSerializationError();
  }

  toJSON(): never {
    throw new SecretSerializationError();
  }

  /**
   * Node's inspection hook, which `console.log`, `util.inspect` and most
   * structured loggers reach for **before** `toString`. Omitting it would leave
   * the most common accidental path — `console.error({ credential })` — printing
   * the field contents.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[BYOK Secret]";
  }

  /**
   * Template literals and `String(secret)` go through `Symbol.toPrimitive` when
   * it exists, bypassing `toString` entirely. Without this, `` `Bearer ${key}` ``
   * would interpolate the value while every other path threw — the single most
   * likely leak in a file that talks to an HTTP API.
   */
  [Symbol.toPrimitive](): never {
    throw new SecretSerializationError();
  }

  get [Symbol.toStringTag](): string {
    return "BYOKSecret";
  }
}

/** A type guard, for boundaries that accept `unknown`. */
export function isSecret(value: unknown): value is Secret {
  return value instanceof Secret;
}
