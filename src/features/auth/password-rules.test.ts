import { describe, expect, it } from "vitest";

import { passwordGaps } from "./password-rules";
import { resetPasswordSchema } from "./schema";

/** What the server decides, asked through the schema the action parses with. */
const accepted = (password: string) =>
  resetPasswordSchema.safeParse({ password, passwordConfirmation: password }).success;

const SAMPLES = [
  "",
  "curta",
  "Aa1!",
  "semmaiuscula1!x",
  "SEMMINUSCULA1!X",
  "SemNumero!!abcd",
  "SemSimbolo12abcd",
  "Completa-1234abcd",
  "Onze-123abc",
  "Doze-1234abc",
  "com espaço Aa1 e mais",
  "çççççççççççççA1",
  "ÁÉÍÓÚáéíóú12345",
  "a".repeat(11) + "A1!",
] as const;

describe("the password hint says what the server will ask for", () => {
  it.each(SAMPLES)("agrees with the schema on %j", (sample) => {
    expect(passwordGaps(sample).length === 0).toBe(accepted(sample));
  });

  it("is not vacuous: the table holds passwords on both sides of the rule", () => {
    const verdicts = new Set(SAMPLES.map((sample) => accepted(sample)));
    expect(verdicts).toEqual(new Set([true, false]));
  });

  it("names each missing rule once, in the order the rule is written", () => {
    expect(passwordGaps("")).toEqual(["length", "uppercase", "lowercase", "digit", "symbol"]);
    expect(passwordGaps("semmaiuscula1!x")).toEqual(["uppercase"]);
    expect(passwordGaps("Aa1!")).toEqual(["length"]);
    expect(passwordGaps("Completa-1234abcd")).toEqual([]);
  });

  it("counts an accented letter as the schema does: a symbol, not a letter", () => {
    // `passwordSchema` is ASCII-ranged. Restating it any other way would have
    // the hint promise an acceptance the server does not give.
    expect(passwordGaps("ÁÉÍÓÚáéíóú12345")).toEqual(["uppercase", "lowercase"]);
    expect(accepted("ÁÉÍÓÚáéíóú12345")).toBe(false);
  });
});
