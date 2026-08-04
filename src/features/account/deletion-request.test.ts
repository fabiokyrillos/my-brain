/**
 * SH-DELETE-002/003/010 — the deletion request, called directly.
 *
 * Every case here calls the Server Action the way an attacker would: with a
 * FormData it composed itself, never through a rendered form. The point of
 * SH-DELETE-002 is that removing the confirmation control from the DOM changes
 * nothing, and that is only provable by not using the DOM.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getDeletionCopy } from "./deletion-copy";
import { idleDeletionRequestState, requestAccountDeletion } from "./actions";

const USER = { id: "user-1", email: "owner@example.test" };

type ClientOptions = {
  user?: { id: string; email?: string } | null;
  lifecycleStatus?: string;
  reauthFails?: boolean;
  reauthOtherUser?: boolean;
  rpcError?: { message: string } | null;
};

function fakeClient(options: ClientOptions = {}) {
  const rpc = vi.fn(async () => ({ data: null, error: options.rpcError ?? null }));
  const signInWithPassword = vi.fn(async () =>
    options.reauthFails
      ? { data: { user: null }, error: { message: "Invalid login credentials" } }
      : {
          data: { user: { id: options.reauthOtherUser ? "somebody-else" : USER.id } },
          error: null,
        },
  );

  return {
    rpc,
    signInWithPassword,
    client: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: options.user === undefined ? USER : options.user },
        })),
        getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })),
        signInWithPassword,
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { status: options.lifecycleStatus ?? "active" },
              error: null,
            })),
          })),
        })),
      })),
      rpc,
    },
  };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const validPtBr = {
  locale: "pt-BR",
  password: "correct horse battery staple",
  confirmation: getDeletionCopy("pt-BR").confirmationPhrase,
};

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("requestAccountDeletion", () => {
  it("starts the deletion when the session, password and phrase all check out", async () => {
    const { client, rpc } = fakeClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.status).toBe("started");
    expect(rpc).toHaveBeenCalledWith("request_account_deletion");
    // The RPC takes no arguments at all: there is no target to point elsewhere.
    expect(rpc.mock.calls[0]).toHaveLength(1);
  });

  it("refuses a wrong confirmation phrase WITHOUT asking the provider anything", async () => {
    const { client, rpc, signInWithPassword } = fakeClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(
      idleDeletionRequestState,
      form({ ...validPtBr, confirmation: "delete" }),
    );

    expect(result.code).toBe("phrase");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a missing confirmation entirely -- an absent control is not consent", async () => {
    const { client, rpc } = fakeClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(
      idleDeletionRequestState,
      form({ locale: "pt-BR", password: "x" }),
    );

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a wrong password even with the right phrase", async () => {
    const { client, rpc } = fakeClient({ reauthFails: true });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.code).toBe("password");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when re-authentication resolves to a different user", async () => {
    const { client, rpc } = fakeClient({ reauthOtherUser: true });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.code).toBe("password");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    const { client, rpc } = fakeClient({ user: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.code).toBe("session");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a non-active account to the lifecycle surface instead of deleting", async () => {
    const { client, rpc } = fakeClient({ lifecycleStatus: "suspended" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      requestAccountDeletion(idleDeletionRequestState, form(validPtBr)),
    ).rejects.toThrow("NEXT_REDIRECT:/pt-BR/account-state");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the database's lifecycle refusal to its own code, not to a generic failure", async () => {
    const { client } = fakeClient({
      rpcError: { message: "Account lifecycle does not permit this action" },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.code).toBe("lifecycle");
  });

  it("never returns a provider or database message to the user", async () => {
    const { client } = fakeClient({ rpcError: { message: "relation xyz does not exist" } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

    expect(result.code).toBe("failed");
    expect(result.message).toBe(getDeletionCopy("pt-BR").errors.failed);
    expect(result.message).not.toContain("relation");
  });

  it("compares the phrase in the caller's own locale", async () => {
    const { client, rpc } = fakeClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const english = await requestAccountDeletion(
      idleDeletionRequestState,
      form({ locale: "en", password: "x", confirmation: getDeletionCopy("en").confirmationPhrase }),
    );
    expect(english.status).toBe("started");

    rpc.mockClear();
    const crossed = await requestAccountDeletion(
      idleDeletionRequestState,
      form({ locale: "en", password: "x", confirmation: getDeletionCopy("pt-BR").confirmationPhrase }),
    );
    expect(crossed.code).toBe("phrase");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("deletion copy (SH-COPY-003)", () => {
  it.each(["pt-BR", "en"] as const)("%s states all four required claims", (locale) => {
    const copy = getDeletionCopy(locale);
    for (const claim of [copy.irreversible, copy.removes, copy.retains, copy.timeline]) {
      expect(claim.trim().length).toBeGreaterThan(20);
    }
  });

  it("the retained-fields sentence names no identifier it does not keep", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const retains = getDeletionCopy(locale).retains.toLowerCase();
      // The log holds no email, name or user id -- and the copy says so rather
      // than staying silent, which is what SH-LEGAL-014 will pin to.
      expect(retains).toMatch(/e-mail|email/);
      expect(retains).toMatch(/identificador|identifier/);
    }
  });

  it("the receipt promises counts and an ending, never a path or an id", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getDeletionCopy(locale);
      expect(copy.receiptBody).not.toMatch(/user-files|uuid|\//);
    }
  });
});
