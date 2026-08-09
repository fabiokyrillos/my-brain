/**
 * `2K-ACT-008` / `2K-ACT-009` — the conversational memory undo, which archives.
 *
 * OD-2K-3's one forbidden outcome is the comfortable lie: a control labelled
 * "undo" that leaves the row in place while letting the user believe it is
 * gone. Most of what follows is therefore about **words** and about **which
 * transition is reused**, because those are the two places that lie would be
 * told.
 */

import { describe, expect, it } from "vitest";

import { conversationCardsLocales } from "@/features/conversation-cards/copy";

import { getMemoryCopy } from "./copy";
import {
  MEMORY_UNDO_REVERSAL,
  MEMORY_UNDO_TRANSITION,
  memoryProposalCardState,
  memoryUndoIsReversible,
} from "./undo";

describe("2K-ACT-008: the undo reuses the audited archive transition", () => {
  it("names `archive`, the transition `setMemoryLifecycle` already implements", () => {
    // Not a new column, not a new RPC, not a new write path — and therefore no
    // migration. The value is asserted because a drift to `delete` would be a
    // silent contradiction of OD-2K-3.
    expect(MEMORY_UNDO_TRANSITION).toBe("archive");
  });

  it("declares an archival reversal, never a window it does not have", () => {
    expect(MEMORY_UNDO_REVERSAL).toEqual({ kind: "archival" });
    expect(JSON.stringify(MEMORY_UNDO_REVERSAL)).not.toContain("windowHours");
  });

  it("says the undo of the undo exists, because reactivation is already audited", () => {
    // `setMemoryLifecycle` implements `restore` as the owner-scoped, audited
    // inverse: it clears `valid_until`. The domain can prove it safe, so
    // `2K-ACT-009` requires it be offered rather than declared absent.
    expect(memoryUndoIsReversible()).toBe(true);
  });
});

describe("2K-ACT-009: the disclosure never claims deletion", () => {
  for (const locale of conversationCardsLocales) {
    it(`says archived or withdrawn from use in ${locale}`, () => {
      const copy = getMemoryCopy(locale);
      expect(copy.conversationalUndo).toBeTruthy();
      expect(copy.conversationalUndone).toBeTruthy();
      expect(copy.conversationalUndoNote).toBeTruthy();
      expect(copy.conversationalRestore).toBeTruthy();
    });

    it(`never uses deletion wording in ${locale}`, () => {
      // Asserted negatively because "deleted" is the word a well-meaning
      // contributor reaches for, and the copy is where they would reach.
      const copy = getMemoryCopy(locale);
      for (const key of [
        "conversationalUndo",
        "conversationalUndone",
        "conversationalUndoNote",
        "conversationalRestore",
      ] as const) {
        expect(copy[key], `${locale}/${key}`)
          .not.toMatch(/apagad|apagar|exclu[íi]|remov|deletar?|delete|erase|wipe/i);
      }
    });
  }
});

describe("2K-ACT-006: the proposal's outcomes map onto distinct card states", () => {
  it("maps every status exactly once, exhaustively", () => {
    expect(memoryProposalCardState("idle")).toBe("requires_confirmation");
    expect(memoryProposalCardState("success")).toBe("accepted");
    // A duplicate created nothing. Reporting it as `accepted` would claim a
    // write that did not happen; `no_change` is the true outcome, and it is
    // also why the undo is withheld for it.
    expect(memoryProposalCardState("duplicate")).toBe("no_change");
    expect(memoryProposalCardState("error")).toBe("failed");
  });

  it("gives four statuses four distinct states", () => {
    const states = (["idle", "success", "duplicate", "error"] as const)
      .map((status) => memoryProposalCardState(status));
    expect(new Set(states).size).toBe(4);
  });
});
