/**
 * SH-LIFECYCLE-008/009/010 — the central gate, called directly.
 *
 * `requireUser` is the one authenticated entry point (192 call sites), so its
 * lifecycle behavior is the app-side enforcement for every page and for the
 * action modules that use it; `assertActiveAccount` is the same gate for the
 * modules that authenticate inline. Both are fail-closed: an unreadable or
 * absent lifecycle row is treated as non-active, and the redirect target is
 * the dedicated account-state surface, never a product route.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { POLICY_VERSIONS } from "@/features/legal/versions";
import { assertActiveAccount, requireUser } from "./require-user";

type LifecycleAnswer = { data: { status: string } | null; error: { message: string } | null };

/**
 * SH.4 added a second gate behind the lifecycle one, so the double answers two
 * tables now. `acceptances` defaults to "both documents accepted at the current
 * version", which is what every pre-SH.4 case in this file assumes — the
 * consent gate's own cases live in `features/legal/acceptance.test.ts`.
 */
function fakeClient(
  user: { id: string } | null,
  lifecycle: LifecycleAnswer,
  acceptances: Array<{ document: string; version: string }> = [
    { document: "terms", version: POLICY_VERSIONS.terms },
    { document: "privacy", version: POLICY_VERSIONS.privacy },
  ],
) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: user ? { sub: user.id } : null } })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
    from: vi.fn((table: string) => {
      if (table === "policy_acceptances") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: acceptances, error: null })),
          })),
        };
      }
      if (table !== "account_lifecycle") throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => lifecycle) })),
        })),
      };
    }),
  };
}

const active: LifecycleAnswer = { data: { status: "active" }, error: null };
const suspended: LifecycleAnswer = { data: { status: "suspended" }, error: null };
const deleting: LifecycleAnswer = { data: { status: "deleting" }, error: null };
const absent: LifecycleAnswer = { data: null, error: null };
const unreadable: LifecycleAnswer = { data: null, error: { message: "boom" } };

beforeEach(() => {
  vi.mocked(redirect).mockClear();
  vi.mocked(createClient).mockReset();
});

describe("requireUser lifecycle gate", () => {
  it("returns the session for an active account", async () => {
    const client = fakeClient({ id: "user-1" }, active);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requireUser("pt-BR");

    expect(result.user.id).toBe("user-1");
    expect(client.auth.getClaims).toHaveBeenCalledOnce();
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still sends a signed-out visitor to login, before any lifecycle read", async () => {
    const client = fakeClient(null, active);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("en")).rejects.toThrow("NEXT_REDIRECT:/en/auth/login");
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended", suspended],
    ["deleting", deleting],
  ])("redirects a %s account to the account-state surface", async (_label, lifecycle) => {
    const client = fakeClient({ id: "user-1" }, lifecycle);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("pt-BR")).rejects.toThrow(
      "NEXT_REDIRECT:/pt-BR/account-state",
    );
  });

  it("fails closed when the lifecycle row is absent", async () => {
    const client = fakeClient({ id: "user-1" }, absent);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("en")).rejects.toThrow("NEXT_REDIRECT:/en/account-state");
  });

  it("fails closed when the lifecycle row cannot be read", async () => {
    const client = fakeClient({ id: "user-1" }, unreadable);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("en")).rejects.toThrow("NEXT_REDIRECT:/en/account-state");
  });
});

describe("assertActiveAccount (the inline-auth modules' gate)", () => {
  it("passes silently for an active account", async () => {
    const client = fakeClient({ id: "user-1" }, active);

    await expect(
      assertActiveAccount(client as never, "user-1", "pt-BR"),
    ).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects a suspended account and never returns", async () => {
    const client = fakeClient({ id: "user-1" }, suspended);

    await expect(
      assertActiveAccount(client as never, "user-1", "en"),
    ).rejects.toThrow("NEXT_REDIRECT:/en/account-state");
  });

  it("fails closed on an unreadable row", async () => {
    const client = fakeClient({ id: "user-1" }, unreadable);

    await expect(
      assertActiveAccount(client as never, "user-1", "pt-BR"),
    ).rejects.toThrow("NEXT_REDIRECT:/pt-BR/account-state");
  });
});

/**
 * SH-LEGAL-008/009 — the consent gate sits behind the lifecycle gate, and the
 * order is a decision rather than an accident.
 */
describe("requireUser consent gate", () => {
  it("interposes an account that owes an acceptance", async () => {
    const client = fakeClient({ id: "user-1" }, active, []);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("pt-BR")).rejects.toThrow("NEXT_REDIRECT:/pt-BR/consent");
  });

  it("interposes again when the accepted version is superseded", async () => {
    const client = fakeClient({ id: "user-1" }, active, [
      { document: "terms", version: "2020-01-01" },
      { document: "privacy", version: "2020-01-01" },
    ]);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("en")).rejects.toThrow("NEXT_REDIRECT:/en/consent");
  });

  it("sends a SUSPENDED account to the lifecycle surface, not to consent", async () => {
    // The order matters: asking a suspended account to accept terms it could
    // not then act under would be theatre, so the more specific state wins.
    const client = fakeClient({ id: "user-1" }, suspended, []);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(requireUser("pt-BR")).rejects.toThrow("NEXT_REDIRECT:/pt-BR/account-state");
    expect(redirect).not.toHaveBeenCalledWith("/pt-BR/consent");
  });
});
