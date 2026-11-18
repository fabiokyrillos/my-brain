import type { PasswordGap } from "./copy";

/**
 * What a password still lacks, in the order the rule is written.
 *
 * This is **not** the validation. `schema.ts` is, on the server, and nothing
 * here can admit a password that it refuses: the hint on the register and reset
 * pages reads this to say, while the reader is still typing, what the server is
 * going to ask for — because a refusal there comes back as a redirect and an
 * emptied form.
 *
 * It restates `passwordSchema`'s five rules without importing it, so the client
 * component that calls it does not carry the schema library to a page whose
 * whole script is one caption. `password-rules.test.ts` holds the two together
 * by running both over the same table.
 */
const RULES: readonly (readonly [PasswordGap, (value: string) => boolean])[] = [
  ["length", (value) => value.length >= 12],
  ["uppercase", (value) => /[A-Z]/.test(value)],
  ["lowercase", (value) => /[a-z]/.test(value)],
  ["digit", (value) => /[0-9]/.test(value)],
  ["symbol", (value) => /[^A-Za-z0-9]/.test(value)],
];

export function passwordGaps(value: string): readonly PasswordGap[] {
  return RULES.filter(([, met]) => !met(value)).map(([gap]) => gap);
}
