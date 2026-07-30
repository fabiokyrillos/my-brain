/**
 * Slice D3 — the sign-out Server Action.
 *
 * Three properties carry the whole guarantee, and each is easy to lose:
 *
 *   1. **The session is invalidated, not navigated away from.** The provider's
 *      `signOut` is called on every path that redirects; a redirect without it
 *      would leave a live session behind a changed URL.
 *   2. **An already-expired session still lets the user leave.** There is no
 *      session left to end, so the desired end state is already true and the
 *      only honest answer is to redirect. Reporting it as a failure would trap
 *      the user inside a shell they cannot use.
 *   3. **A genuine failure is reported, localized, and does not redirect.** A
 *      sign-out that silently did nothing while claiming success is worse than
 *      one that says it failed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { idleSignOutState } from "./sign-out-state";
import { accountCopy } from "@/features/shell/account-copy";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

type SignOutAnswer = { error: { name: string; message: string } | null };

function client(answer: SignOutAnswer | (() => never)) {
  const signOutSpy = vi.fn(async () => {
    if (typeof answer === "function") return answer();
    return answer;
  });
  vi.mocked(createClient).mockResolvedValue({ auth: { signOut: signOutSpy } } as never);
  return signOutSpy;
}

function form(locale: string) {
  const data = new FormData();
  data.set("locale", locale);
  return data;
}

function run(locale = "pt-BR") {
  return signOut(idleSignOutState, form(locale));
}

describe("signOut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ends the provider session before redirecting", async () => {
    const spy = client({ error: null });
    await run();

    expect(spy).toHaveBeenCalledOnce();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/pt-BR/auth/login?message=signed-out");
  });

  it("redirects to the login route of the locale the form carried", async () => {
    client({ error: null });
    await run("en");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/en/auth/login?message=signed-out");
  });

  it("falls back to the default locale rather than trusting an unknown value", async () => {
    client({ error: null });
    await run("de");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/pt-BR/auth/login?message=signed-out");
  });

  it("lets a user with an already-expired session leave cleanly", async () => {
    // `AuthSessionMissingError` means there is nothing left to end. Treating it
    // as a failure would leave the user inside a shell that cannot load, with a
    // sign-out control that refuses to work.
    const spy = client({
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });
    await run();

    expect(spy).toHaveBeenCalledOnce();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/pt-BR/auth/login?message=signed-out");
  });

  it("reports a genuine provider failure as localized state, and does not redirect", async () => {
    client({ error: { name: "AuthApiError", message: "upstream exploded" } });
    const state = await run();

    expect(state).toEqual({ status: "failed", message: accountCopy["pt-BR"].signOutFailed });
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });

  it("localizes that failure in English", async () => {
    client({ error: { name: "AuthApiError", message: "upstream exploded" } });
    expect((await run("en")).message).toBe(accountCopy.en.signOutFailed);
  });

  it("never echoes the provider's own message to the user", async () => {
    client({ error: { name: "AuthApiError", message: "refresh_token_already_used" } });
    const state = await run();
    expect(state.message).not.toContain("refresh_token");
  });

  it("reports a transport fault as a failure rather than claiming success", async () => {
    // A throw here left the cookies untouched, so the session may still be live.
    // Redirecting would assert something this process cannot support.
    client(() => {
      throw new TypeError("fetch failed");
    });
    const state = await run();

    expect(state.status).toBe("failed");
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });
});
