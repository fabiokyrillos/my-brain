/**
 * The card grammar's copy, in both locales (ADR-036).
 *
 * `2K-CARD-001` requires every state to render a **distinct** localized
 * outcome — the flattening T-2K-07 describes is exactly two states sharing a
 * sentence, so distinctness is asserted rather than assumed.
 */

import { describe, expect, it } from "vitest";

import { CONVERSATION_CARD_STATES, CONVERSATION_CARD_TYPES } from "./contracts";
import { conversationCardsLocales, getConversationCardsCopy } from "./copy";

describe("2K-CARD-001: every state has distinct copy in every locale", () => {
  for (const locale of conversationCardsLocales) {
    it(`covers every state exactly once in ${locale}`, () => {
      const copy = getConversationCardsCopy(locale);
      for (const state of CONVERSATION_CARD_STATES) {
        expect(copy.states[state], `${state} has no ${locale} copy`).toBeTruthy();
      }
      const rendered = CONVERSATION_CARD_STATES.map((state) => copy.states[state]);
      expect(new Set(rendered).size, `two states share a sentence in ${locale}`)
        .toBe(CONVERSATION_CARD_STATES.length);
    });

    it(`names every card type in ${locale}`, () => {
      const copy = getConversationCardsCopy(locale);
      for (const type of CONVERSATION_CARD_TYPES) {
        expect(copy.types[type], `${type} has no ${locale} label`).toBeTruthy();
      }
    });
  }
});

describe("2K-PRIVACY-002: the mask says something is there and nothing about what", () => {
  it("offers a reveal and a hide in both locales", () => {
    for (const locale of conversationCardsLocales) {
      const copy = getConversationCardsCopy(locale);
      expect(copy.masked).toBeTruthy();
      expect(copy.reveal).toBeTruthy();
      expect(copy.hide).toBeTruthy();
      expect(copy.reveal).not.toBe(copy.hide);
    }
  });

  it("never offers an 'n hidden' count anywhere in the copy", () => {
    for (const locale of conversationCardsLocales) {
      const copy = getConversationCardsCopy(locale);
      const everything = JSON.stringify(copy);
      // A count of what was withheld is the existence oracle the central
      // contract forbids by name. Asserted on the copy because that is where a
      // well-meaning contributor would add it.
      expect(everything).not.toMatch(/\{count\}|\bocultos?\b|\bhidden\b|\bescondid/i);
    }
  });
});

describe("2K-CARD-009: the reversal sentences describe what actually happens", () => {
  it("says archived — and never deleted — for an archival reversal (OD-2K-3)", () => {
    for (const locale of conversationCardsLocales) {
      const copy = getConversationCardsCopy(locale);
      expect(copy.reversal.archival).toBeTruthy();
      expect(copy.reversal.archival).not.toMatch(/apagad|exclu[íi]d|remov|delete|erase/i);
    }
  });

  it("states the task window as a window rather than as a guarantee of permanence", () => {
    expect(getConversationCardsCopy("pt-BR").reversal.undoWindow(24)).toContain("24");
    expect(getConversationCardsCopy("en").reversal.undoWindow(24)).toContain("24");
  });
});
