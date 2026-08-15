import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.2's authenticated acceptance — `2O-ONBOARD-001` … `-011`.
 *
 * ## Why this cannot be a unit test, and cannot live in `foundation.spec.ts`
 *
 * The plan makes *"browser, authenticated, against `next start`"* a proof
 * obligation for slices 2O.1 through 2O.7, for a reason this repository has
 * paid for twice: **the RSC boundary is only tested in production**, and two
 * surfaces have shipped green and never rendered. `foundation.spec.ts` runs in
 * CI and is unauthenticated by construction — it asserts that `/app` redirects
 * to login — so the guided path, which exists only behind that redirect, has to
 * prove itself here.
 *
 * ## The account is the fixture
 *
 * A **brand-new disposable account** is the exact state onboarding is for:
 * nothing captured, nothing confirmed, no credential. So the fresh states are
 * not simulated, they are the account's real ones, read by the real loader
 * through RLS. It is deleted afterwards, and the cascade takes everything it
 * touched with it.
 *
 * No AI credential is ever configured here. That is deliberate: the blocked
 * step and the recovery are `2O-ONBOARD-011`, and an account with a key could
 * not observe either.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

test.describe("the guided path is offered to a new account and never imposed on it", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-onboarding-${crypto.randomUUID()}@example.com`;
  const password = `Onboard!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Onboarding E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("2O-ONBOARD-001/-002: a new account is offered the path, below the composer it never blocks", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app");

    const panel = page.locator('[data-onboarding="offered"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Um caminho até o primeiro resultado" })).toBeVisible();

    // Seven steps, none satisfied on an account that has done nothing.
    await expect(panel.locator("[data-step]")).toHaveCount(7);
    await expect(panel.locator('[data-step][data-state="satisfied"]')).toHaveCount(0);
    await expect(panel.locator(".onboarding-progress")).toHaveAttribute("data-done", "0");

    /*
     * The requirement is *offered, never imposed*, and this is the assertion
     * that means it: the composer is present, usable and **above** the panel in
     * the document. A guided path that had become a gate would fail here rather
     * than in review.
     */
    const composer = page.locator(".today-capture");
    await expect(composer).toBeVisible();
    const order = await page.evaluate(() => {
      const capture = document.querySelector(".today-capture");
      const guide = document.querySelector('[data-onboarding="offered"]');
      if (!capture || !guide) return "missing";
      return capture.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING
        ? "guide-after-capture"
        : "guide-before-capture";
    });
    expect(order).toBe("guide-after-capture");
  });

  test("2O-ONBOARD-011: with no credential the path says so and offers the recovery, not a dead step", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app");

    const recovery = page.locator('[data-recovery="credential"]');
    await expect(recovery).toBeVisible();
    await expect(recovery.getByRole("link")).toHaveAttribute("href", "/pt-BR/app/settings");

    // The step that cannot succeed is visible, stated, and carries no action.
    const blocked = page.locator('[data-step="interpretation_reviewed"]');
    await expect(blocked).toHaveAttribute("data-state", "blocked");
    await expect(blocked.getByRole("link")).toHaveCount(0);

    // A step that *can* succeed still carries one, so the absence above is a
    // decision rather than a panel with no links in it.
    await expect(page.locator('[data-step="entry_captured"]').getByRole("link")).toHaveCount(1);
  });

  test("2O-ONBOARD-003/-009: a step satisfied through the existing surface stops being asked, and stays that way", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    /*
     * Satisfied through the product's own form — `updateProfile`, the same
     * Server Action and schema `2O-ONBOARD-004` requires and the only writer
     * the onboarding feature is allowed to have. Nothing here posts to a path
     * this slice invented, because this slice invented none.
     */
    await page.goto("/pt-BR/app/settings");
    await page.getByLabel("Nome do assistente").fill("Aurora");
    // Named exactly, because the credential panel renders its own save above
    // this one and `.first()` would have pressed that instead.
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.locator(".settings-feedback.success")).toBeVisible();

    await page.goto("/pt-BR/app");
    const step = page.locator('[data-step="assistant_identity"]');
    await expect(step).toHaveAttribute("data-state", "satisfied");
    // `2O-ONBOARD-003` — never asked again once set.
    await expect(step.getByRole("link")).toHaveCount(0);

    /*
     * `2O-ONBOARD-009`. A second, empty browser context is a different device
     * as far as this product is concerned: no cookies, no storage, nothing but
     * the account. The step is still satisfied there, because its state was
     * never held anywhere but in the data.
     */
    const secondDevice = await page.context().browser()!.newContext();
    const secondPage = await secondDevice.newPage();
    await signInOnline(secondPage, { email, locale: "pt-BR" });
    await secondPage.goto("/pt-BR/app");
    await expect(secondPage.locator('[data-step="assistant_identity"]')).toHaveAttribute(
      "data-state",
      "satisfied",
    );
    await secondDevice.close();
  });

  test("2O-ONBOARD-010: dismissal survives a reload, and is reversible from the preferences surface", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app");

    await expect(page.locator('[data-onboarding="offered"]')).toBeVisible();
    await page.getByRole("button", { name: "Dispensar este guia" }).click();
    await expect(page.locator('[data-onboarding="offered"]')).toHaveCount(0);

    // A reload, because a panel hidden only in React state would come back.
    await page.reload();
    await expect(page.locator('[data-onboarding="offered"]')).toHaveCount(0);

    await page.goto("/pt-BR/app/settings");
    await page.getByRole("button", { name: "Mostrar o guia de novo" }).click();

    await page.goto("/pt-BR/app");
    await expect(page.locator('[data-onboarding="offered"]')).toBeVisible();
  });

  test("the path speaks the account's language, and says the same true things in it", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "en" });
    await page.goto("/en/app");

    const panel = page.locator('[data-onboarding="offered"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "A path to your first real result" })).toBeVisible();
    await expect(panel.locator("[data-step]")).toHaveCount(7);

    // `2O-ONBOARD-006` and `-007`, in the locale: what happens to a capture,
    // and that nothing is created without the owner's act.
    await expect(panel.getByText(/stored before any model runs/i)).toBeVisible();
    await expect(panel.getByText(/nothing is created without that act of yours/i)).toBeVisible();

    await expect(panel.locator('[data-recovery="credential"]')).toBeVisible();
    await expect(page.locator('[data-recovery="credential"] a')).toHaveAttribute(
      "href",
      "/en/app/settings",
    );
  });
});
