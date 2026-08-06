/**
 * SH-DELETE-002/003/010 — the deletion request, called directly.
 *
 * Every case here calls the Server Action the way an attacker would: with a
 * FormData it composed itself, never through a rendered form. The point of
 * SH-DELETE-002 is that removing the confirmation control from the DOM changes
 * nothing, and that is only provable by not using the DOM.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const REPO = join(__dirname, "../../..");

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
// The throttle reaches `server-only`, `next/headers` and a database RPC. What
// this file is about is the action's decisions, so the admission is a seam --
// stubbed to a definite value rather than partially real, because a mock that
// silently falls back to an empty module is how a whole branch stops running
// while every assertion still passes.
vi.mock("@/features/auth/throttle", () => ({
  admitAuthEvent: vi.fn(async () => ({ admitted: true, attemptId: "attempt-1" })),
  finalizeAuthEvent: vi.fn(async () => {}),
}));

import { TURNSTILE_SCRIPT_ORIGIN } from "@/features/auth/captcha";
import { admitAuthEvent, finalizeAuthEvent } from "@/features/auth/throttle";
import { createClient } from "@/lib/supabase/server";
import { getDeletionCopy } from "./deletion-copy";
import { requestAccountDeletion } from "./actions";
import { idleDeletionRequestState } from "./deletion-request-state";

const USER = { id: "user-1", email: "owner@example.test" };

type ClientOptions = {
  user?: { id: string; email?: string } | null;
  lifecycleStatus?: string;
  reauthFails?: boolean;
  reauthCaptchaFails?: boolean;
  reauthOtherUser?: boolean;
  rpcError?: { message: string } | null;
};

function fakeClient(options: ClientOptions = {}) {
  const rpc = vi.fn(async () => ({ data: null, error: options.rpcError ?? null }));
  const signInWithPassword = vi.fn(async () =>
    options.reauthCaptchaFails
      ? {
          data: { user: null },
          error: {
            code: "captcha_protection_failed",
            message: "captcha protection: request disallowed (no captcha_token found)",
          },
        }
      : options.reauthFails
      ? { data: { user: null }, error: { code: "invalid_credentials", message: "Invalid login credentials" } }
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

const SITE_KEY = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

/**
 * A deployment that renders the widget, for the length of one case.
 *
 * `async`, and the `await` inside the `try` is the whole point: a synchronous
 * version returns the promise and then restores the environment in `finally`
 * **before** the action ever reads it, so every case silently ran against a
 * deployment with no site key and passed for the wrong reason.
 */
async function withSiteKey<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env[SITE_KEY];
  process.env[SITE_KEY] = "1x00000000000000000000AA";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[SITE_KEY];
    else process.env[SITE_KEY] = previous;
  }
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(admitAuthEvent).mockReset();
  vi.mocked(admitAuthEvent).mockResolvedValue({ admitted: true, attemptId: "attempt-1" } as never);
  vi.mocked(finalizeAuthEvent).mockReset();
  delete process.env[SITE_KEY];
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

  /**
   * The defect this hotfix exists for, pinned in every direction.
   *
   * Hosted GoTrue applies CAPTCHA enforcement to **password grants**, and this
   * action performs one. It forwarded no token from the day Turnstile was
   * enabled, so `signInWithPassword` answered `400 captcha_failed` for every
   * caller and the surface reported a wrong password to people who had typed
   * the right one — account deletion was impossible on the deployment.
   */
  describe("the challenge (the deployed defect)", () => {
    it("forwards the token to the password grant, in the option the client supports", async () => {
      const { client, signInWithPassword } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      await requestAccountDeletion(
        idleDeletionRequestState,
        form({ ...validPtBr, captchaToken: "a-turnstile-response-token" }),
      );

      expect(signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ options: { captchaToken: "a-turnstile-response-token" } }),
      );
    });

    it("refuses a missing token BEFORE the provider, when the deployment renders a widget", async () => {
      const { client, signInWithPassword, rpc } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await withSiteKey(() =>
        requestAccountDeletion(idleDeletionRequestState, form(validPtBr)),
      );

      expect(result.code).toBe("captcha-missing");
      // The password never leaves the process: a stripped hidden input must not
      // buy an attacker a password oracle.
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(admitAuthEvent).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a blank or oversized token the same way -- neither is a token", async () => {
      const { client, signInWithPassword } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      for (const tampered of ["", "   ", "x".repeat(2049)]) {
        const result = await withSiteKey(() =>
          requestAccountDeletion(
            idleDeletionRequestState,
            form({ ...validPtBr, captchaToken: tampered }),
          ),
        );
        expect(result.code).toBe("captcha-missing");
      }
      expect(signInWithPassword).not.toHaveBeenCalled();
    });

    it("does NOT require a token where no site key is configured", async () => {
      // Local development and CI run without a key on purpose (SH-CAPTCHA-005),
      // and the provider there asks for none. Refusing would make the surface
      // untestable without a hosted secret.
      const { client } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

      expect(result.status).toBe("started");
    });

    it("reports a provider-rejected token as captcha-failed, never as a wrong password", async () => {
      // This is the distinction whose absence produced the user-visible defect:
      // "A senha não confere." for a correct password.
      const { client, rpc } = fakeClient({ reauthCaptchaFails: true });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await requestAccountDeletion(
        idleDeletionRequestState,
        form({ ...validPtBr, captchaToken: "stale-token" }),
      );

      expect(result.code).toBe("captcha-failed");
      expect(result.message).toBe(getDeletionCopy("pt-BR").errors["captcha-failed"]);
      expect(result.message).not.toBe(getDeletionCopy("pt-BR").errors.password);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("still reports a wrong password as a wrong password when the token was fine", async () => {
      const { client } = fakeClient({ reauthFails: true });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const result = await requestAccountDeletion(
        idleDeletionRequestState,
        form({ ...validPtBr, captchaToken: "a-good-token" }),
      );

      expect(result.code).toBe("password");
    });

    it("verifies nothing itself -- no secret is read and no Cloudflare call is made", () => {
      // The secret lives only in hosted GoTrue. An application that verified the
      // token would need one, and a repository that holds one can leak one.
      const source = readFileSync(
        join(REPO, "src/features/account/actions.ts"),
        "utf8",
      );
      expect(source).not.toMatch(/siteverify|TURNSTILE_SECRET|CAPTCHA_SECRET|secret_?key/i);
      // Referenced through the constant rather than written out: SH-CAPTCHA-004
      // scans `src/` for that literal and permits it in exactly two files, so
      // spelling it here would have broken the requirement this test serves.
      expect(source).not.toContain(TURNSTILE_SCRIPT_ORIGIN);
    });
  });

  describe("the throttle in front of the password grant", () => {
    it("counts the attempt as what it is -- an attempt to prove a password", async () => {
      const { client } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

      expect(admitAuthEvent).toHaveBeenCalledWith(
        expect.anything(),
        "signin_failure",
        USER.email,
      );
      expect(finalizeAuthEvent).toHaveBeenCalledWith(expect.anything(), "attempt-1", "succeeded");
    });

    it("refuses a throttled attempt without asking the provider", async () => {
      const { client, signInWithPassword, rpc } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);
      vi.mocked(admitAuthEvent).mockResolvedValue({ admitted: false, reason: "throttled" } as never);

      const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

      expect(result.code).toBe("throttled");
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("distinguishes an unavailable throttle from a throttled one", async () => {
      const { client } = fakeClient();
      vi.mocked(createClient).mockResolvedValue(client as never);
      vi.mocked(admitAuthEvent).mockResolvedValue({ admitted: false, reason: "unavailable" } as never);

      const result = await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

      expect(result.code).toBe("unavailable");
    });

    it("records a refused attempt rather than leaving it reserved as unknown", async () => {
      const { client } = fakeClient({ reauthFails: true });
      vi.mocked(createClient).mockResolvedValue(client as never);

      await requestAccountDeletion(idleDeletionRequestState, form(validPtBr));

      expect(finalizeAuthEvent).toHaveBeenCalledWith(expect.anything(), "attempt-1", "refused");
    });
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
