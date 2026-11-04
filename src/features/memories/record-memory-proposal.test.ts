import { describe, expect, it } from "vitest";

import { recordMemoryProposal } from "./record-memory-proposal";

describe("recordMemoryProposal — a record that reads as lasting is offered as a memory", () => {
  it("offers a lasting preference as a preference, in the owner's words", () => {
    expect(recordMemoryProposal({
      concepts: ["lasting_preference"],
      content: "Prefiro consultas de manhã cedo",
      alreadyKept: false,
    })).toEqual({ content: "Prefiro consultas de manhã cedo", kind: "preference" });
  });

  it("offers a personal memory with the composer's own kind", () => {
    expect(recordMemoryProposal({
      concepts: ["personal_memory", "person_note"],
      content: "Ana faz aniversário em 5 de maio",
      alreadyKept: false,
    })).toEqual({ content: "Ana faz aniversário em 5 de maio", kind: "fact" });
  });

  it("keeps a restriction a restriction even when the reading called it a preference", () => {
    expect(recordMemoryProposal({
      concepts: ["lasting_preference"],
      content: "Nunca marcar nada às sextas",
      alreadyKept: false,
    })?.kind).toBe("restriction");
  });

  it("offers nothing for other concepts, a kept record, or a record too long to be one memory", () => {
    expect(recordMemoryProposal({ concepts: ["task"], content: "Comprar pão", alreadyKept: false })).toBeNull();
    expect(recordMemoryProposal({ concepts: ["personal_memory"], content: "Ana faz aniversário", alreadyKept: true })).toBeNull();
    expect(recordMemoryProposal({ concepts: ["personal_memory"], content: "a".repeat(4_001), alreadyKept: false })).toBeNull();
  });
});
