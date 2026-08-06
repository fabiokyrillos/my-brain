import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";
import { createClient } from "@supabase/supabase-js";

/**
 * SH.2 deployed acceptance — the deletion journey on the product surface.
 *
 * ## Why this spec provisions its own account
 *
 * The journey's last act destroys the account it runs on, so a shared fixture
 * would work exactly once. `beforeAll` admin-creates a disposable account — the
 * SH-GD.3 strategy, "admin-created until signup opens" — and the journey
 * consumes it. That makes this re-runnable rather than a one-shot transcript,
 * which is the difference between an acceptance gate and a screenshot.
 *
 * ## What it proves that the database-level harness cannot
 *
 * The RPC path (`request_account_deletion`) is provable without a browser, and
 * the pgTAP suite already does that. What only a browser proves is that the two
 * gates in front of it are real *on the deployed surface*: the typed
 * confirmation phrase and the password re-authentication are both compared
 * server-side in the Server Action, so a wrong phrase and a wrong password each
 * leave the account `active` — and the account is only destroyed when both are
 * right. Steps 5–11 of the checkpoint (the `deleting` interlude, the write and
 * job-claim refusals, zero residue, the log and the vanished Auth user) are
 * covered by the companion harness against a second disposable account, because
 * observing the intermediate state requires not racing the executor that
 * `after()` fires.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Copy = {
  readonly locale: "pt-BR" | "en";
  readonly emailLabel: string;
  readonly passwordLabel: string;
  readonly signIn: string;
  readonly deleteTitle: string;
  readonly phrase: string;
  readonly wrongPhrase: string;
  readonly confirmationLabel: string;
  readonly deletePasswordLabel: string;
  readonly submit: string;
  readonly receiptTitle: string;
  readonly deletingTitle: string;
  readonly phraseError: string;
  readonly passwordError: string;
  readonly captchaMissing: string;
  readonly captchaFailed: string;
};

/**
 * One locale per project keeps the journey a journey. The phrase differs by
 * locale by design (SH-COPY-003): a user typing the English word into the
 * Portuguese surface has not confirmed anything, and that is enforced here.
 */
const COPY: Copy = {
  locale: "pt-BR",
  emailLabel: "E-mail",
  passwordLabel: "Senha",
  signIn: "Entrar",
  deleteTitle: "Excluir a conta",
  phrase: "EXCLUIR",
  // The *other* locale's phrase: right shape, wrong surface.
  wrongPhrase: "DELETE",
  confirmationLabel: "Para confirmar, digite EXCLUIR",
  deletePasswordLabel: "Confirme sua senha",
  submit: "Excluir minha conta definitivamente",
  receiptTitle: "Conta excluída",
  deletingTitle: "Exclusão em andamento",
  phraseError: "Digite exatamente a palavra pedida para confirmar.",
  passwordError: "A senha não confere.",
  captchaMissing:
    "A verificação de segurança não foi concluída. Recarregue a página e tente de novo.",
  captchaFailed:
    "A verificação de segurança não foi aceita. Recarregue a página e tente de novo.",
};

test.describe("SH.2 — account deletion on the deployed product surface", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `sh2-journey-${crypto.randomUUID()}@example.com`;
  const password = `Sh2!${crypto.randomUUID()}a7`;
  let userId: string | undefined;

  const admin = () =>
    createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function lifecycleStatus(): Promise<string | null> {
    const { data } = await admin()
      .from("account_lifecycle")
      .select("status")
      .eq("user_id", userId!)
      .maybeSingle();
    return (data as { status?: string } | null)?.status ?? null;
  }

  test.beforeAll(async () => {
    const created = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    // The consent gate is SH.4's and interposes every account that has not
    // accepted. It is not what this journey is testing, so it is satisfied
    // through the same RPC the interposition surface calls.
    // `signInWithPassword` is refused by hosted CAPTCHA (`400 captcha_failed`)
    // for every client, so the user token comes from the admin link exchange.
    const { accessToken } = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });
    const asUser = createClient(supabaseUrl!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });
    for (const document of ["terms", "privacy"]) {
      const { error } = await asUser.rpc("record_policy_acceptance", {
        p_document: document,
        p_surface: "interposition",
      });
      expect(error).toBeNull();
    }

    // Representative data, so the deletion has something to remove.
    const { error: captureError } = await asUser.rpc("capture_entry_async", {
      p_idempotency_key: crypto.randomUUID(),
      p_locale: "pt-BR",
      p_original_content: "Registro de aceitação para a jornada de exclusão",
      p_source: "web",
    });
    expect(captureError).toBeNull();
  });

  test.afterAll(async () => {
    // The journey is expected to have consumed the account. This is a net, not
    // the assertion — if the journey failed before deleting, the fixture must
    // still not survive the run.
    //
    // Storage first, then the auth row: `deleteUser` does not touch object
    // storage, so a net that ran in the other order would leave an orphan
    // behind precisely when the journey had already failed.
    if (!userId) return;
    const { data: objects } = await admin().storage.from("user-files").list(userId, { limit: 100 });
    if (objects?.length) {
      await admin()
        .storage.from("user-files")
        .remove(objects.map((object) => `${userId}/${object.name}`))
        .catch(() => undefined);
    }
    await admin().auth.admin.deleteUser(userId).catch(() => undefined);
  });

  async function signIn(page: Page) {
    await signInOnline(page, { email, locale: COPY.locale });
  }

  async function submitDeletion(page: Page, phrase: string, secret: string) {
    await page.goto(`/${COPY.locale}/account/delete`);
    await expect(page.getByRole("heading", { name: COPY.deleteTitle })).toBeVisible();
    await page.locator('input[name="confirmation"]').fill(phrase);
    await page.locator('input[name="password"]').fill(secret);
    await page.locator('form button[type="submit"]').click();
  }

  test("the wrong phrase refuses before the provider is asked anything", async ({ page }) => {
    // Executable regardless of the challenge, and that is the point: the phrase
    // is compared in the Server Action *first*, so a mistyped word costs neither
    // a password attempt nor the single-use CAPTCHA token.
    await signIn(page);

    await submitDeletion(page, COPY.wrongPhrase, password);
    await expect(page.locator(".form-alert")).toHaveText(COPY.phraseError, { timeout: 15_000 });
    expect(await lifecycleStatus()).toBe("active");
  });

  /**
   * The deployed defect, asserted from the outside.
   *
   * Hosted GoTrue enforces CAPTCHA on **password grants**, and this surface
   * performs one. Before the hotfix it forwarded no token, the provider refused
   * with `captcha_failed`, and the surface reported **`A senha não confere.`** —
   * a correct password blamed for a challenge that never ran, with account
   * deletion impossible on the deployment.
   *
   * This case reproduces exactly that provider refusal — the app under test
   * carries no `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, so no token is produced, while
   * the *provider* is the hosted one with CAPTCHA on — and asserts the surface
   * now names it correctly. It is the strongest statement available without an
   * interactive solve: the message must be the challenge one and must **not** be
   * the password one, and the account must still be `active`.
   */
  test("a provider-refused challenge is reported as a challenge, not as a wrong password", async ({
    page,
  }) => {
    await signIn(page);

    await submitDeletion(page, COPY.phrase, password);

    const alert = page.locator(".form-alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    const message = (await alert.textContent())?.trim() ?? "";

    // The two refusals the defect conflated, asserted apart.
    expect(message).not.toBe(COPY.passwordError);
    expect([COPY.captchaFailed, COPY.captchaMissing]).toContain(message);

    // And nothing was deleted on the way to saying so.
    expect(await lifecycleStatus()).toBe("active");
  });

  test("no refusal path mutates the account", async () => {
    // Restated as its own assertion rather than trusted from the two above: the
    // account this journey provisioned must still be exactly where it started.
    expect(await lifecycleStatus()).toBe("active");
    const { data } = await admin().auth.admin.getUserById(userId!);
    expect(data.user?.id).toBe(userId);
  });

  /**
   * The destructive half, executable at last — and honest about the one step
   * that is still a person's.
   *
   * ## What is automated here, and what is not
   *
   * **Not automated:** the form submit that carries a *valid* Turnstile token.
   * Hosted Turnstile declines automated browsers by design — that refusal is
   * SH-CAPTCHA-002 working — and the three ways around it are each a way of
   * proving nothing: solving it headlessly is what the control exists to
   * prevent; a Cloudflare "always passes" test key would make the assertion
   * vacuous (not hypothetical here — one already produced two wrong published
   * verdicts, and the lesson kept was that a control must not be exempt from
   * the mechanism it is testing); and disabling the control to prove the
   * control is not a proof. That step was performed **once, interactively, on
   * the deployment, on 2026-08-06**, with a disposable account, and it
   * succeeded: the challenge passed, `EXCLUIR` and the correct password were
   * accepted, and the request was recorded.
   *
   * **Automated, from here down:** everything the challenge stands in front of.
   * The account is driven to `deleting` through `request_account_deletion` —
   * the very RPC the Server Action calls once its phrase, challenge and
   * password checks pass, and the only thing those checks guard. The refusals
   * themselves are covered by the cases above, by
   * `src/features/account/deletion-request.test.ts`, and on the deployed
   * surface by `e2e/deployed-deletion-captcha.spec.ts`.
   *
   * ## Why this half needed covering at all
   *
   * Because it was broken, silently, for a day and it was this journey that
   * found it. The interactive pass reached `deleting` and **stopped there
   * forever**: `delete-account` had been deployed once on 2026-08-04 and never
   * again, while migration `202608050077` revoked the grant that build depended
   * on, so the executor answered `credential_not_erased` for every account and
   * nothing re-runs it. Two things were required to make a deletion complete —
   * the CAPTCHA hotfix to let the request through, and the executor deploy to
   * let it finish — and only the first was a code change.
   *
   * So this test asserts the terminal state rather than the request, and
   * `npm run verify:edge-parity` is what now makes the deploy half visible.
   */
  test("both correct: the account is destroyed and the Auth user is gone", async ({ page }) => {
    await signIn(page);
    // The surface the interactive pass used, reached the same way: an
    // authenticated account can open it, which is the half of the journey a
    // browser still proves.
    await page.goto(`/${COPY.locale}/account/delete`);
    await expect(page.getByRole("heading", { name: COPY.deleteTitle })).toBeVisible({
      timeout: 30_000,
    });

    // The request, through the product's own RPC as the account itself. This is
    // exactly what the Server Action does after the phrase, the challenge and
    // the password have all been accepted -- and the only thing they guard.
    const { accessToken } = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });
    const asUser = createClient(supabaseUrl!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const requested = await asUser.rpc("request_account_deletion");
    expect(requested.error).toBeNull();
    expect(await lifecycleStatus()).toBe("deleting");

    // The `deleting` interlude, in the browser: SH.1's gate refusing the
    // product to an account on its way out. This is what the interactive pass
    // saw, and what it never got past.
    await page.goto(`/${COPY.locale}/app`);
    await expect(page.getByRole("heading", { name: COPY.deletingTitle })).toBeVisible({
      timeout: 30_000,
    });

    // The executor, invoked exactly as the Server Action invokes it. Before the
    // 2026-08-06 deploy this answered `409 credential_not_erased` here, every
    // time, for every account.
    const executed = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ requestedAt: new Date().toISOString() }),
    });
    const executedBody = await executed.text();
    expect(executed.status, `executor refused: ${executedBody.slice(0, 200)}`).toBe(200);
    expect(JSON.parse(executedBody).outcome).toBe("completed");

    // The session dies with the account: a token minted while it lived must
    // stop resolving, and its refresh token must not mint another.
    const stillMe = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    expect(stillMe.ok, "the access token still resolves after deletion").toBe(false);

    // A note kept from this journey's first writing, because it is still true
    // and still surprising: the surface never shows the action's own receipt.
    // The moment `request_account_deletion` lands, the account leaves `active`,
    // the revalidation re-runs the lifecycle gate, and SH.1's account-state
    // surface interposes before React can paint the returned `started` state.
    // The receipt copy in `deletion-copy.ts` is unreachable in practice —
    // recorded as a finding rather than papered over. The interposition
    // asserted above is the stronger observation anyway.

    // The account itself. Asserted directly rather than polled: the executor
    // answered `completed` synchronously above, and polling for a state that is
    // already decided only turns a failure into a timeout.
    const { data: finalUser } = await admin().auth.admin.getUserById(userId!);
    expect(finalUser?.user ?? null).toBeNull();

    // `deleting` is one-way: the lifecycle row must be gone with the account,
    // never back to `active`.
    expect(await lifecycleStatus()).toBeNull();

    // Zero residue, asserted from the same census the executor uses.
    const { data: residue } = await admin().rpc("account_owned_row_counts", {
      p_user_id: userId!,
    });
    expect(Object.keys((residue ?? {}) as Record<string, number>)).toEqual([]);

    const { data: objects } = await admin().storage.from("user-files").list(userId!, { limit: 100 });
    expect(objects ?? []).toEqual([]);
  });
});
