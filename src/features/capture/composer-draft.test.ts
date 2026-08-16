/**
 * `2O-RECOVER-006`.
 *
 * The properties that matter here are the refusals — a draft that outlives a
 * send, a draft that leaks between surfaces, a draft that carries authority —
 * so each has a positive control beside it. An "it does not do X" over a
 * module that stored nothing at all would pass every one of them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRAFT_MAX_LENGTH,
  clearDraft,
  draftKey,
  readDraft,
  writeDraft,
} from "./composer-draft";

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("2O-RECOVER-006: a draft survives navigation within the session", () => {
  it("reads back what was written", () => {
    const key = draftKey("home");
    writeDraft(key, "half a thought");
    expect(readDraft(key)).toBe("half a thought");
  });

  it("uses sessionStorage and never localStorage", () => {
    // The requirement's word is *session*, and the difference is a draft on a
    // shared browser still being there tomorrow.
    const local = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const store = installStorage();
    vi.stubGlobal("localStorage", local);
    writeDraft(draftKey("home"), "text");
    expect(local.setItem).not.toHaveBeenCalled();
    expect(store.get("mb_draft:home")).toBe("text");
  });
});

describe("2O-RECOVER-006: it never resurrects after a send or a discard", () => {
  it("is gone after clear", () => {
    const key = draftKey("home");
    writeDraft(key, "sent already");
    // The control: it was really there, so "gone" is a change and not the
    // initial condition.
    expect(readDraft(key)).toBe("sent already");
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it("treats an emptied composer as no draft, leaving no key behind", () => {
    const key = draftKey("home");
    const store = installStorage();
    writeDraft(key, "typed");
    expect(store.has(key)).toBe(true);
    writeDraft(key, "");
    // Not `""` — an empty string stored would make `readDraft` and "there is a
    // draft" disagree, and would survive the reader clearing the box by hand.
    expect(store.has(key)).toBe(false);
    expect(readDraft(key)).toBeNull();
  });
});

describe("2O-RECOVER-006: surfaces and conversations do not share a draft", () => {
  it("keys separately per surface", () => {
    writeDraft(draftKey("home"), "cockpit text");
    writeDraft(draftKey("capture_page"), "capture page text");
    expect(readDraft(draftKey("home"))).toBe("cockpit text");
    expect(readDraft(draftKey("capture_page"))).toBe("capture page text");
  });

  it("keys separately per conversation", () => {
    writeDraft(draftKey("chat", "conversation-a"), "to Marina");
    writeDraft(draftKey("chat", "conversation-b"), "to someone else");
    expect(readDraft(draftKey("chat", "conversation-a"))).toBe("to Marina");
    expect(readDraft(draftKey("chat", "conversation-b"))).toBe("to someone else");
    // The failure this prevents: a half-written reply appearing under the
    // wrong person.
    expect(draftKey("chat", "conversation-a")).not.toBe(draftKey("chat", "conversation-b"));
  });

  it("builds a key from a bounded alphabet, so a scope cannot forge another's", () => {
    // The key is composed, so a scope containing the separator could otherwise
    // address a different composer's draft.
    expect(draftKey("chat:evil", "x")).toBe(draftKey("chatevil", "x"));
    expect(draftKey("home")).toBe("mb_draft:home");
    expect(draftKey("chat", "abc-123")).toBe("mb_draft:chat:abc-123");
  });
});

describe("2O-RECOVER-006: the draft is text and never authority", () => {
  it("stores a string and offers no way to store anything else", () => {
    const key = draftKey("home");
    const store = installStorage();
    writeDraft(key, "plain");
    // One value, no envelope: no idempotency key, no operation key, no action.
    // A restored draft therefore cannot replay a submission that happened.
    expect([...store.values()]).toEqual(["plain"]);
    expect(store.get(key)).not.toMatch(/idempotenc|operationKey|action/i);
  });

  it("refuses a value that exceeds the composer's own limit", () => {
    const key = draftKey("home");
    const store = installStorage();
    writeDraft(key, "x".repeat(DRAFT_MAX_LENGTH + 1));
    expect(store.has(key)).toBe(false);
    // The control at the boundary: exactly the limit is accepted.
    writeDraft(key, "x".repeat(DRAFT_MAX_LENGTH));
    expect(store.get(key)?.length).toBe(DRAFT_MAX_LENGTH);
  });

  it("recognises rather than sanitises on the way out", () => {
    const key = draftKey("home");
    const store = installStorage();
    // A value written by anything else on the origin, beyond the bound.
    store.set(key, "y".repeat(DRAFT_MAX_LENGTH + 5));
    expect(readDraft(key)).toBeNull();
    store.set(key, "");
    expect(readDraft(key)).toBeNull();
  });
});

describe("2O-RECOVER-006: storage being unavailable loses a convenience, never the composer", () => {
  it("returns null rather than throwing when reads throw", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        removeItem: () => { throw new Error("denied"); },
      },
    });
    expect(() => writeDraft(draftKey("home"), "x")).not.toThrow();
    expect(() => clearDraft(draftKey("home"))).not.toThrow();
    expect(readDraft(draftKey("home"))).toBeNull();
  });

  it("is inert on the server, where there is no window at all", () => {
    vi.stubGlobal("window", undefined);
    expect(readDraft(draftKey("home"))).toBeNull();
    expect(() => writeDraft(draftKey("home"), "x")).not.toThrow();
  });
});
