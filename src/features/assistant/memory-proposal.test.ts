import { describe, expect, it } from "vitest";

import { looksLikeMemoryIntent } from "./memory-intent";
import { buildMemoryProposal } from "./memory-proposal";

describe("buildMemoryProposal", () => {
  it("stores the thing remembered, not the instruction to remember it", () => {
    expect(buildMemoryProposal("Lembre disso sempre: prefiro reuniões pela manhã")).toEqual({
      content: "prefiro reuniões pela manhã",
      kind: "preference",
    });
  });

  // The opener is matched on the unaccented form but cut from the original, so
  // an accent inside the opener must not shift the slice and eat a word.
  it("keeps accents and capitalisation in the stored content", () => {
    expect(buildMemoryProposal("Nunca esqueça: Ana é a gerente do projeto")?.content).toBe(
      "Ana é a gerente do projeto",
    );
  });

  it("accepts the English openers with the same shape", () => {
    expect(buildMemoryProposal("Remember that the office closes at 6pm")).toEqual({
      content: "the office closes at 6pm",
      kind: "fact",
    });
  });

  it("drops the separator punctuation between the opener and the content", () => {
    expect(buildMemoryProposal("Guarde isso — o contrato vence em março")?.content).toBe(
      "o contrato vence em março",
    );
    expect(buildMemoryProposal("Keep in mind, I prefer async updates")?.content).toBe(
      "I prefer async updates",
    );
  });

  // "sempre" after a demonstrative opener says how often to remember; after a
  // complementizer it is part of the fact. Dropping it in the second case would
  // store the opposite of what the owner said.
  it("drops a trailing intensifier only when it modifies the instruction", () => {
    expect(buildMemoryProposal("Lembre disso sempre: uso o mesmo banco")?.content).toBe(
      "uso o mesmo banco",
    );
    expect(buildMemoryProposal("Lembre que sempre uso o mesmo banco")?.content).toBe(
      "sempre uso o mesmo banco",
    );
    expect(buildMemoryProposal("Remember that I always use the same bank")?.content).toBe(
      "I always use the same bank",
    );
  });

  it("proposes restriction when the sentence forbids something", () => {
    expect(buildMemoryProposal("Lembre que nunca me ligue depois das 20h")?.kind).toBe("restriction");
  });

  it("falls back to fact rather than guessing", () => {
    expect(buildMemoryProposal("Lembre disso: o CNPJ da empresa termina em 0001")?.kind).toBe("fact");
  });

  // An opener with nothing after it is not a memory. Proposing an empty row and
  // letting the schema refuse it would show a validation error for a sentence
  // the owner never finished.
  it("returns null when the opener is the whole utterance", () => {
    expect(buildMemoryProposal("lembre disso")).toBeNull();
    expect(buildMemoryProposal("Remember this:")).toBeNull();
  });

  // A text the router never sends here still must not throw, since the composer
  // calls this immediately after the decision and a crash would lose the turn.
  it("returns the trimmed text unchanged when no opener matches", () => {
    expect(buildMemoryProposal("qual é a minha próxima tarefa")?.content).toBe(
      "qual é a minha próxima tarefa",
    );
  });

  it("proposes something for every utterance the router recognises", () => {
    const recognised = [
      "Lembre disso sempre: uso óculos para ler",
      "lembre-se que a Ana prefere e-mail",
      "guarde essa senha do wifi: casa123",
      "não esqueça de que o aluguel vence dia 5",
      "always remember I work from home on Fridays",
      "dont forget the gym closes on Sunday",
    ];
    for (const text of recognised) {
      expect(looksLikeMemoryIntent(text), text).toBe(true);
      expect(buildMemoryProposal(text), text).not.toBeNull();
    }
  });
});
