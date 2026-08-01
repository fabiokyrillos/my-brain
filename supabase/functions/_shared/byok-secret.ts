/**
 * The branded-secret boundary, Deno half — `BYOK-ADAPTER-006`.
 *
 * ## Why this file duplicates `src/lib/byok/secret.ts`
 *
 * The same constraint that produced `byok-envelope.ts`: `src/lib/byok/secret.ts`
 * imports `server-only`, which throws under Deno. The answer is the repository's
 * standing one — duplicate deliberately, then **prove the two agree**
 * (`src/lib/byok/adapter-parity.test.ts`).
 *
 * ## The one declared asymmetry
 *
 * Node's copy installs `Symbol.for("nodejs.util.inspect.custom")`, because
 * `console.error({ credential })` in Node reaches for that hook before
 * `toString`. Deno's console reaches for `Symbol.for("Deno.customInspect")`
 * instead, so this copy installs **that** one. Same defence, different runtime
 * hook name; installing Node's here would leave the actual leak path open, and
 * the parity test asserts the swap explicitly so it stays a decision rather than
 * becoming a divergence nobody noticed.
 *
 * Every other member below — the brand, the `#value`, `expose`, `length`,
 * `toString`, `toJSON`, `Symbol.toPrimitive`, `Symbol.toStringTag` and the
 * serialization message — is intentionally identical to the Node copy.
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
  private readonly [SECRET_BRAND] = true;

  readonly #value: string;

  constructor(value: string) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("A BYOK Secret cannot be constructed from an empty value");
    }
    this.#value = value;
  }

  /** The one way out. Greppable, and unmistakable in a review diff. */
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

  /** Deno's inspection hook — the runtime-specific half of the declared asymmetry. */
  [Symbol.for("Deno.customInspect")](): string {
    return "[BYOK Secret]";
  }

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
