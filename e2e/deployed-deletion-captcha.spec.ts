import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { mintOnlineAccessToken, signInWithoutTheLoginForm } from "./support/online-session";

/**
 * The deletion challenge, on the **deployed** surface rather than on localhost.
 *
 * Every other online spec drives a locally-built app against the hosted
 * database. This one drives the deployed app, because the two things it checks
 * only exist there: the deployment carries a `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * and therefore renders a widget, and it carries the CSP that decides whether
 * that widget's script can load at all. A local run cannot observe either —
 * which is exactly how the original Turnstile rollout shipped broken.
 *
 * Opt-in through `DEPLOYED_ORIGIN`, so the ordinary lane is unaffected:
 *
 *   DEPLOYED_ORIGIN=https://my-brain-dusky.vercel.app \
 *     node scripts/online-playwright.mjs e2e/deployed-deletion-captcha.spec.ts --project=desktop
 *
 * **It deletes nothing.** Every case here is a refusal; the only account it
 * touches is the disposable one it creates and removes. The successful deletion
 * is deliberately absent — it needs an interactive Turnstile solve, and the
 * three ways to fake one (a headless solve, an always-passing test key,
 * disabling the control) are each a way of proving nothing.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const origin = process.env.DEPLOYED_ORIGIN?.replace(/\/$/, "");
const configured = Boolean(supabaseUrl && publishableKey && serviceRoleKey && origin);

const COPY = {
  deleteTitle: "Excluir a conta",
  phrase: "EXCLUIR",
  wrongPhrase: "DELETE",
  phraseError: "Digite exatamente a palavra pedida para confirmar.",
  passwordError: "A senha não confere.",
  captchaMissing:
    "A verificação de segurança não foi concluída. Recarregue a página e tente de novo.",
  captchaFailed:
    "A verificação de segurança não foi aceita. Recarregue a página e tente de novo.",
} as const;

test.describe("the deployed account-deletion challenge", () => {
  test.skip(!configured, "Set DEPLOYED_ORIGIN and the ONLINE_SUPABASE_* credentials to run this.");
  test.describe.configure({ mode: "serial" });

  const email = `codex-deployed-deletion-${crypto.randomUUID()}@example.com`;
  const password = `Deployed!${crypto.randomUUID()}A7`;
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
    const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    // Consent, through the product's own RPC — the gate is SH.4's and is not
    // what this spec is about.
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
    for (const document of ["terms", "privacy"]) {
      const { error } = await asUser.rpc("record_policy_acceptance", {
        p_document: document,
        p_surface: "interposition",
      });
      expect(error).toBeNull();
    }
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await admin().auth.admin.deleteUser(userId);
    expect(deletion.error).toBeNull();
  });

  async function openDeletionPage(page: import("@playwright/test").Page) {
    await signInWithoutTheLoginForm(page, {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
      locale: "pt-BR",
      appOrigin: origin!,
      next: `${origin}/pt-BR/app`,
    });
    await page.goto(`${origin}/pt-BR/account/delete`);
    await expect(page.getByRole("heading", { name: COPY.deleteTitle })).toBeVisible({
      timeout: 30_000,
    });
  }

  test("the deployed page really renders the widget, with a public site key only", async ({ page }) => {
    await openDeletionPage(page);

    // Present in the DOM the browser built, not merely in the HTML a fetch saw.
    const widget = page.locator(".cf-turnstile");
    await expect(widget).toHaveCount(1);
    const siteKey = await widget.getAttribute("data-sitekey");
    expect(siteKey, "the deployed page carries no site key").toBeTruthy();

    // The widget must sit inside the form, or its token is never submitted.
    await expect(page.locator("form.auth-form .cf-turnstile")).toHaveCount(1);

    // Nothing secret-shaped beyond the public site key.
    const html = await page.content();
    expect(html).not.toMatch(/TURNSTILE_SECRET|CAPTCHA_SECRET|secret_?key/i);
    const keyShaped = [...new Set(html.match(/0x[0-9A-Za-z_-]{20,}/g) ?? [])]
      .filter((value) => value !== siteKey);
    expect(keyShaped, "a second key-shaped value is in the deployed document").toEqual([]);
  });

  test("a wrong phrase refuses before the challenge is even consulted", async ({ page }) => {
    await openDeletionPage(page);
    await page.locator('input[name="confirmation"]').fill(COPY.wrongPhrase);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();

    await expect(page.locator(".form-alert")).toHaveText(COPY.phraseError, { timeout: 30_000 });
    expect(await lifecycleStatus()).toBe("active");
  });

  test("a submission carrying no token is refused as a missing challenge", async ({ page }) => {
    // An automated browser does not complete Turnstile — that refusal is
    // SH-CAPTCHA-002 working — so the form submits with no token, which is
    // exactly the tampered-or-blocked case. The deployed surface must name it
    // as a challenge problem and NOT as a wrong password: naming it wrongly is
    // the whole defect this hotfix repaired.
    await openDeletionPage(page);

    // Belt and braces: remove any response input, so this is unambiguously the
    // no-token case rather than a race with a challenge that might complete.
    await page.evaluate(() => {
      document.querySelectorAll('input[name="captchaToken"]').forEach((node) => node.remove());
    });

    await page.locator('input[name="confirmation"]').fill(COPY.phrase);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();

    const alert = page.locator(".form-alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toHaveText(COPY.captchaMissing);
    await expect(alert).not.toHaveText(COPY.passwordError);

    // Nothing was deleted on the way to saying so.
    expect(await lifecycleStatus()).toBe("active");
  });

  test("a forged token is refused BY THE PROVIDER, and named as such", async ({ page }) => {
    // The distinction the two captcha codes exist for: this submission carries
    // a token, so the application forwards it and GoTrue is what rejects it.
    // The application never verifies a token itself — it has no secret to do so.
    await openDeletionPage(page);

    await page.evaluate(() => {
      const form = document.querySelector("form.auth-form");
      if (!form) throw new Error("no deletion form");
      form.querySelectorAll('input[name="captchaToken"]').forEach((node) => node.remove());
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "captchaToken";
      input.value = "0.forged-token-that-cloudflare-never-issued";
      form.appendChild(input);
    });

    await page.locator('input[name="confirmation"]').fill(COPY.phrase);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();

    const alert = page.locator(".form-alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toHaveText(COPY.captchaFailed);
    await expect(alert).not.toHaveText(COPY.passwordError);

    expect(await lifecycleStatus()).toBe("active");
  });

  test("the account this spec provisioned is untouched by every refusal above", async () => {
    expect(await lifecycleStatus()).toBe("active");
    const { data } = await admin().auth.admin.getUserById(userId!);
    expect(data.user?.id).toBe(userId);
  });
});
