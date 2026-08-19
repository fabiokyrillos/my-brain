import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.6's authenticated acceptance — `2O-NOTIFY-001` … `-007`,
 * `2O-RECOVER-001` … `-007`.
 *
 * ## What only a browser can answer here
 *
 *  1. **The RSC boundary, again.** `NotificationFacts` and
 *     `NotificationBounds` are new Server Components mounted inside an
 *     existing one. Both compile and both are unit-tested, and neither fact
 *     means the page renders in production — the failure this repository
 *     recorded as *"the RSC boundary is only tested in production"*.
 *  2. **That the adoption actually renders.** The unit suite and the structural
 *     guard both prove things about the *source*: that surfaces import the
 *     module and that no legacy state class survives. Neither can prove a
 *     `data-ux-state` element reaches a real page — and slice 2O.6 converted
 *     roughly ninety render sites, so "it compiles" is a long way from "it
 *     renders".
 *  3. **`2O-RECOVER-006` across a real navigation.** A draft surviving a
 *     client-side route change and a return is a browser behaviour; jsdom can
 *     imitate the storage but not the navigation.
 *  4. **`2O-NOTIFY-002`'s refusal.** A fresh account has no reminder waiting,
 *     so the invitation must NOT appear — which is *"never on first arrival"*
 *     observed rather than argued.
 *
 * ## `2O-RECOVER-007`, applied to every absence assertion below
 *
 * *"The guard for this family plants a fixture marker, so an absence assertion
 * cannot pass on a page that never rendered."* Every `toHaveCount(0)` here is
 * preceded by a positive locator on the same page. A blank page satisfies all
 * of the absences and none of the markers.
 *
 * ## The account is disposable and writes nothing but its own acceptances
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

test.describe("notifications say three things, and every surface recovers in one language", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-notify-${crypto.randomUUID()}@example.com`;
  const password = `Notif!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Notify E2E" },
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

  test("2O-NOTIFY-007: consent, permission and delivery render as three separate facts", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    /*
      The three facts moved to Settings with the rest of the governance section
      in slice 2P.5 (2P-SETTINGS-008). Every assertion below is unchanged: the
      reorganization was required to move this surface without changing its
      semantics, and a retarget that also needed the expectations rewritten
      would have been the evidence that it did not.
    */
    await page.goto("/pt-BR/app/settings/notifications");

    // The RSC assertion: the new Server Component rendered at all.
    const facts = page.locator(".notification-facts");
    await expect(facts).toBeVisible();

    // Three rows, each present and each distinct. One indicator is the defect.
    await expect(facts.locator("[data-notification-fact]")).toHaveCount(3);
    for (const fact of ["consent", "permission", "delivery"]) {
      await expect(facts.locator(`[data-notification-fact="${fact}"]`)).toBeVisible();
    }

    /*
     * `2O-NOTIFY-006` read off the wire. This account has never consented and
     * this browser has never been asked, and the delivery fact is STILL
     * `unproven` — because it is unproven for every account, on every device,
     * until a delivery is confirmed on real hardware.
     */
    await expect(
      facts.locator('[data-notification-fact="delivery"][data-fact-value="unproven"]'),
    ).toBeVisible();
    await expect(facts.locator(".notification-delivery-caveat")).toContainText("HTTP 403");
    await expect(facts.locator(".notification-delivery-caveat")).toContainText("Android");

    // The marker `2O-RECOVER-007` asks for, before the absence below: the
    // section is on the page, so "no claim of delivery" is a real check.
    await expect(facts.getByText("Não comprovado.", { exact: false })).toBeVisible();
    await expect(facts.getByText("entregue com sucesso")).toHaveCount(0);
  });

  test("2O-NOTIFY-005: the bounds are stated above the control, and the missing one is declared missing", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/notifications");

    const bounds = page.locator("[data-notification-bounds]");
    await expect(bounds).toBeVisible();
    await expect(bounds.locator('[data-bound="quiet_hours"]')).toBeVisible();
    await expect(bounds.locator('[data-bound="daily_cap"]')).toBeVisible();
    /*
     * The requirement names an important-reminder override as the third bound.
     * The product has none — `decideDelivery` refuses inside quiet hours with
     * no exemption for type, priority or urgency — so the surface states the
     * absence. Promising an override the mechanism cannot honour would be the
     * exact failure this phase forbids most consistently.
     */
    await expect(bounds.locator('[data-bound="no_override"]')).toContainText("Não existe exceção");

    // `2O-NOTIFY-003`: how to stop, said at the ask.
    await expect(page.locator("[data-notification-how-to-stop]")).toBeVisible();

    /*
     * Above the control — the requirement's own reason for asking.
     *
     * Asserted as DOM order rather than as geometry, because the control has
     * two legitimate forms and the first version of this test only knew one.
     * `PushControls` renders the enable button when a sender key is configured
     * and an honest "not available here" sentence when it is not (`R-24`: a
     * control that cannot work is not rendered). Against an environment with
     * no key, `.push-controls` does not exist at all and a `boundingBox()`
     * comparison failed on a correct page.
     */
    const boundsPrecedesControl = await page.evaluate(() => {
      const section = document.querySelector(".notification-settings");
      const bounds = section?.querySelector("[data-notification-bounds]");
      // Whichever form the control region took.
      const control =
        section?.querySelector(".push-controls")
        ?? section?.querySelector(".push-controls, .quiet-state:last-of-type");
      if (!bounds || !control) return null;
      // `DOCUMENT_POSITION_FOLLOWING` = the control comes after the bounds.
      return (bounds.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(boundsPrecedesControl, "the bounds and the control region both render").not.toBeNull();
    expect(boundsPrecedesControl).toBe(true);
  });

  test("2O-NOTIFY-001: Ajustes reaches notifications, and the route keeps its list", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/notifications");

    const link = page.getByRole("link", { name: /Notifica/ }).first();
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/notifications/);
    /*
     * `exact: true`. The page now carries two headings starting with the same
     * word — the list's `<h1>Notificações</h1>` and the governance section's
     * `<h2>Notificações no aparelho</h2>` — and the loose name matched both.
     * The `<h1>` is the one that proves the LIST survived, which is the half
     * of `2O-NOTIFY-001` this test exists for.
     */
    await expect(page.getByRole("heading", { name: "Notificações", exact: true })).toBeVisible();
    // A fresh account has none, and the empty state is the vocabulary's.
    await expect(page.locator('[data-ux-state="empty"]').first()).toBeVisible();
  });

  test("2O-NOTIFY-002: a fresh account is never invited, because it has nothing waiting", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    // The fixture marker FIRST. Without it the absence below passes on a page
    // that failed to render, which is the whole hazard `2O-RECOVER-007` names.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".content-page")).toBeVisible();

    // …and only now the absence. No reminder is waiting, so there is no moment
    // of demonstrated value, so there is no invitation.
    await expect(page.locator("[data-notification-invitation]")).toHaveCount(0);
  });

  test("2O-RECOVER-001: the universal states really render, on real pages", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    /*
     * The adoption, observed rather than inferred. A fresh account is empty
     * everywhere, so each of these pages is in the `empty` state — and after
     * this slice each renders it through the shared vocabulary, which is what
     * `data-ux-state` proves and what a source scan cannot.
     */
    for (const route of ["inbox", "memories", "people", "projects", "questions", "notifications"]) {
      await page.goto(`/pt-BR/app/${route}`);
      await expect(page.locator(".content-page")).toBeVisible();
      const state = page.locator('[data-ux-state="empty"]').first();
      await expect(state, `${route} does not render the shared empty state`).toBeVisible();
      // Every universal state declares whether the reader's content is safe.
      await expect(state).toHaveAttribute("data-content-safe", "true");
    }
  });

  test("2O-RECOVER-006: a draft survives navigation, says so, and does not survive discarding it", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app");

    const composer = page.locator("#quick-entry");
    await expect(composer).toBeVisible();
    await composer.fill("um pensamento pela metade");

    // "and says so" — the note is part of the requirement, not decoration.
    await expect(page.locator('[data-composer-draft="kept"]')).toBeVisible();

    // Navigate away within the session, and back.
    await page.goto("/pt-BR/app/memories");
    await expect(page.locator(".content-page")).toBeVisible();
    await page.goto("/pt-BR/app");

    await expect(page.locator("#quick-entry")).toHaveValue("um pensamento pela metade");

    // Discarding removes it, and it does not come back on the next visit.
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.locator("#quick-entry")).toHaveValue("");
    await page.goto("/pt-BR/app/memories");
    await page.goto("/pt-BR/app");
    await expect(page.locator("#quick-entry")).toHaveValue("");
    // The marker, so "the note is gone" is not satisfied by a page that failed
    // to render the composer at all.
    await expect(page.locator("#quick-entry")).toBeVisible();
    await expect(page.locator('[data-composer-draft="kept"]')).toHaveCount(0);
  });

  test("2O-RECOVER-006: two surfaces do not share one draft", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    await page.goto("/pt-BR/app");
    await page.locator("#quick-entry").fill("rascunho do cockpit");

    await page.goto("/pt-BR/app/capture");
    const captureComposer = page.locator("#quick-entry");
    await expect(captureComposer).toBeVisible();
    // The failure this prevents is a half-written note appearing on a surface
    // the reader did not write it on.
    await expect(captureComposer).toHaveValue("");

    await page.goto("/pt-BR/app");
    await expect(page.locator("#quick-entry")).toHaveValue("rascunho do cockpit");
  });
});
