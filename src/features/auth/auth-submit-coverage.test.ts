/**
 * `AUTH-SIGNIN-PENDING-STATE`, as a standing guard rather than a one-off fix.
 *
 * The owner reported the sign-in button: after tapping it, nothing on screen
 * acknowledged the tap. Every other auth form had the same bare `<button>`,
 * for the same reason — these pages are server components posting straight to
 * a Server Action, so there was nowhere for a pending state to live.
 *
 * Fixing five pages once does not keep them fixed. A sixth auth surface, or a
 * refactor that inlines a button again, would reintroduce it silently; this is
 * what notices.
 *
 * The scan is scoped to exactly these five files and does not walk the
 * repository. A recursive walk from here would also descend into `.worktrees`,
 * where another branch's checkout lives, and measure that instead.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getAuthSubmitCopy, getResendCopy, type AuthSubmitForm } from "./copy";

const ROOT = resolve(__dirname, "../../..");
const AUTH_PAGES = ["login", "register", "recover", "resend", "reset"] as const;
const FORMS: readonly AuthSubmitForm[] = ["signIn", "signUp", "recover", "reset"];
const LOCALES = ["pt-BR", "en"] as const;

function pageSource(name: string): string {
  return readFileSync(resolve(ROOT, "src/app/[locale]/auth", name, "page.tsx"), "utf8");
}

describe("AUTH-SIGNIN-PENDING-STATE: no auth form submits in silence", () => {
  for (const name of AUTH_PAGES) {
    it(`${name} submits through the button that reports its state`, () => {
      expect(pageSource(name)).toContain("<AuthSubmitButton");
    });

    it(`${name} leaves no bare button behind`, () => {
      // `<button>` with nothing on it is precisely the shape that can neither
      // disable itself nor say what is happening.
      expect(pageSource(name), `${name} still has a propless submit button`)
        .not.toMatch(/<button>/);
    });
  }
});

describe("every auth submit owns an in-flight word, in both locales", () => {
  for (const form of FORMS) {
    for (const locale of LOCALES) {
      it(`${form} / ${locale}`, () => {
        const copy = getAuthSubmitCopy(form, locale);
        expect(copy.submit.trim()).not.toBe("");
        expect(copy.submitPending.trim()).not.toBe("");
        // A pending word identical to the idle one announces nothing and
        // leaves the button looking untouched.
        expect(copy.submitPending).not.toBe(copy.submit);
      });
    }
  }

  // `resend` keeps its pair on `ResendCopy`, beside the rest of that surface's
  // words, rather than being named a second time in the shared table.
  for (const locale of LOCALES) {
    it(`resend / ${locale}`, () => {
      const copy = getResendCopy(locale);
      expect(copy.submitPending.trim()).not.toBe("");
      expect(copy.submitPending).not.toBe(copy.submit);
    });
  }
});
