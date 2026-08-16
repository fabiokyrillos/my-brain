/**
 * `2O-RECOVER-006` — a draft that survives navigation within the session.
 *
 * ## `sessionStorage`, and why not the two alternatives
 *
 * **Not the database.** The composer holds whatever the reader is part-way
 * through typing, which is the most sensitive unclassified text in the
 * product: it has not been interpreted, so no sensitivity level has been
 * derived for it, and it has not been confirmed, so the reader has not decided
 * they want it kept. Writing it server-side would also spend a migration
 * nobody signed.
 *
 * **Not `localStorage`.** The requirement's word is *session*, and
 * `localStorage` outlives one: a draft written on a shared or borrowed browser
 * would still be there tomorrow for whoever opens the tab next. `R-2O-28`
 * already treats `localStorage` as attacker-controlled input for the
 * appearance preference — a value that survives the session is a value an
 * attacker has longer to reach. `sessionStorage` is cleared when the tab
 * closes, which is the same lifetime the requirement asks for.
 *
 * ## The draft is text and never authority
 *
 * What is stored is the textarea's content and nothing else. In particular the
 * **idempotency key is not stored**, deliberately: `QuickCaptureForm` mints one
 * per mount and rotates it after a successful capture, so a restored draft
 * arrives with a *fresh* key and cannot replay a submission that already
 * happened. A draft that carried its key would be a stored authorization to
 * repeat an action, which is exactly the shape `2O-RECOVER-006` must not take.
 *
 * ## It never resurrects
 *
 * `clearDraft` runs on a successful capture and on an explicit discard, before
 * anything else. The failure direction is deliberate: a draft that fails to
 * save is lost (annoying), while a draft that fails to clear reappears after
 * the reader deliberately sent or discarded it (alarming, and indistinguishable
 * from the product having ignored them).
 *
 * ## Surfaces do not share a draft
 *
 * The key includes the surface and, where there is one, the conversation. Two
 * conversations are two drafts; the cockpit composer and the capture page are
 * two drafts. A single global key would have let a half-written reply to one
 * person appear under another, which is the worst available failure here.
 */

/** Bounded by the same limit the textarea enforces, so neither can exceed the other. */
export const DRAFT_MAX_LENGTH = 12000;

const PREFIX = "mb_draft";

/**
 * The storage key for one composer.
 *
 * `scope` is the surface (`home`, `capture_page`, `chat`); `thread` is the
 * conversation when the surface has more than one, and null when it does not.
 */
export function draftKey(scope: string, thread: string | null = null): string {
  const safeScope = scope.replace(/[^a-z_]/gi, "");
  const safeThread = thread === null ? "" : thread.replace(/[^a-z0-9-]/gi, "");
  return safeThread.length > 0 ? `${PREFIX}:${safeScope}:${safeThread}` : `${PREFIX}:${safeScope}`;
}

/**
 * Read a draft.
 *
 * **Recognises rather than sanitises**, the shape `safeReturnPath` took in
 * slice 2O.1: anything that is not a plain string within bounds is treated as
 * absent. `sessionStorage` throws in some privacy modes and in some embedded
 * webviews, so every access is wrapped — a composer that crashed because
 * storage was unavailable would be a far worse outcome than one with no draft.
 */
export function readDraft(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(key);
    if (typeof raw !== "string") return null;
    if (raw.length === 0 || raw.length > DRAFT_MAX_LENGTH) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Write a draft, or remove it when the composer has been emptied. */
export function writeDraft(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    // An empty composer has no draft. Storing "" would make `readDraft` and
    // "there is a draft" disagree, and would leave a key behind after the
    // reader cleared the box by hand.
    if (value.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }
    if (value.length > DRAFT_MAX_LENGTH) return;
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage full, disabled, or unavailable. The draft is a convenience and
    // never a guarantee; failing silently here loses a convenience, while
    // throwing would break the composer itself.
  }
}

/** Remove a draft. Runs on send and on discard, before anything else. */
export function clearDraft(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(key);
  } catch {
    // See `writeDraft`.
  }
}
