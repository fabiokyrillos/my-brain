import { expect, test, type Page } from "@playwright/test";

/**
 * UX Slice D3 — the authenticated account and session journeys (UX-26).
 *
 * Before this slice the product had **no** sign-out action and no account surface
 * on any of its sixteen authenticated routes: the only way to leave was to clear
 * cookies by hand. These journeys prove the way out actually works.
 *
 * Same placement as `work-actions.spec.ts` and `task-detail-commands.spec.ts`:
 * they need real users on a deployed database, so they belong to the deployment
 * session and skip themselves without credentials rather than passing vacuously.
 * Playwright runs them on both the desktop and the Pixel 7 project, and the
 * locators resolve the **visible** account surface — so one spec proves the
 * desktop rail foot and the mobile overflow panel with the same assertions,
 * which is the point: they are one component and must behave identically.
 *
 * Two disposable users with **distinct display names** are minted here. The
 * display name is the only identity the surface renders, so it is also the only
 * thing these journeys assert on — no email address and no user id appears in
 * any assertion, fixture name or failure message.
 *
 * ## Run these against the production build
 *
 *   npm run build && CI=1 npm run test:e2e:online -- e2e/account-session.spec.ts
 *
 * `CI=1` is what makes `playwright.config.ts` serve `npm run start` instead of
 * `npm run dev`, and the Back journey **requires** it: `next dev` replaces the
 * response's `Cache-Control` with `no-cache, must-revalidate`, dropping the
 * `no-store` that makes an authenticated page ineligible for the back/forward
 * cache. Under `next start` the dynamic-rendering default includes `no-store` and
 * the guarantee holds. That is a real difference between the two servers, not a
 * test artifact, so the journey asserts the header it depends on rather than only
 * the behaviour — a silent loss of `no-store` in either server is then a failure
 * here instead of a surprise in production.
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
  readonly signedInAs: string;
  readonly signOut: string;
  readonly signedOut: string;
  readonly settings: string;
};

const COPY: readonly Copy[] = [
  {
    locale: "pt-BR",
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    signedInAs: "Conectado como",
    signOut: "Sair da conta",
    signedOut: "Você saiu da sua conta.",
    settings: "Configurações",
  },
  {
    locale: "en",
    // Not localized: the login form renders the literal `E-mail` in both locales.
    emailLabel: "E-mail",
    passwordLabel: "Password",
    signIn: "Sign in",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signedOut: "You have been signed out.",
    settings: "Settings",
  },
];

/** Distinct, non-identifying display names, so "which account" is provable. */
const NAME_A = "Conta Alfa";
const NAME_B = "Conta Beta";

test.describe("the account and session surface", () => {
  /**
   * Serial, and it has to be.
   *
   * These journeys sign the *same two* accounts in and out, and one of them
   * revokes account A's sessions globally at the provider. Under
   * `fullyParallel` that revocation lands in the middle of every other worker
   * holding a session for A, and tests fail for a reason that has nothing to do
   * with the product — which the first live run of this spec demonstrated.
   * `online-auth.spec.ts` is serial for the same reason.
   *
   * The alternative — a disposable account per test — would mint thirteen users
   * per project to avoid a two-minute run.
   */
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const accountA = {
    email: `codex-account-d3-a-${crypto.randomUUID()}@example.com`,
    password: `Account!${crypto.randomUUID()}A7`,
    displayName: NAME_A,
    id: undefined as string | undefined,
  };
  const accountB = {
    email: `codex-account-d3-b-${crypto.randomUUID()}@example.com`,
    password: `Account!${crypto.randomUUID()}B7`,
    displayName: NAME_B,
    id: undefined as string | undefined,
  };

  async function createUser(account: typeof accountA) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { display_name: account.displayName },
      }),
    });
    // The address is deliberately absent from this message: a failure must not
    // print a fixture identity into CI output.
    expect(response.ok, `could not create the disposable ${account.displayName}`).toBe(true);
    return ((await response.json()) as { id: string }).id;
  }

  async function tokenFor(account: typeof accountA) {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey!, "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
  }

  test.beforeAll(async () => {
    accountA.id = await createUser(accountA);
    accountB.id = await createUser(accountB);
  });

  // Fail-closed: both disposable users are deleted, and every user-owned table
  // cascades from `auth.users`, so nothing of theirs survives.
  test.afterAll(async () => {
    for (const id of [accountA.id, accountB.id]) {
      if (!id) continue;
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
    }
  });

  /**
   * The one account surface this viewport actually shows.
   *
   * `:visible` is what lets a single spec prove both mounts: the rail is
   * `display:none` below 760px and the bottom bar is hidden above it, so exactly
   * one of the two `.account-menu` elements is visible on each project.
   */
  function account(page: Page) {
    return page.locator(".account-menu:visible");
  }

  async function signIn(page: Page, copy: Copy, who: typeof accountA) {
    await page.goto(`/${copy.locale}/auth/login`);
    await page.getByLabel(copy.emailLabel).fill(who.email);
    await page.getByLabel(copy.passwordLabel).fill(who.password);
    await page.getByRole("button", { name: copy.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app$`), { timeout: 30_000 });
  }

  /**
   * Brings the account control into view, whichever surface this viewport uses.
   *
   * On desktop the rail foot is always visible and there is nothing to open. On
   * mobile the account block lives **inside** the overflow panel, so the real
   * gesture is: tap `Mais`, then the account block is the first thing in it. That
   * is the design, not a workaround — the first live mobile run of this spec
   * failed because the helper looked for a control that is correctly hidden until
   * the panel is opened.
   */
  async function revealAccount(page: Page) {
    const overflow = page.locator(".mobile-more:visible");
    if (await overflow.count()) {
      await overflow.locator("> summary").click();
      // Placement requirement, proven on the real viewport: the account block is
      // the panel's first row, so it needs no scrolling to reach.
      await expect(page.locator(".mobile-more-menu > *").first()).toHaveClass(/mobile-nav-account/);
    }
    const surface = account(page);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    return surface;
  }

  async function openAccount(page: Page) {
    const surface = await revealAccount(page);
    // `<details>`: the summary is the control, and clicking it is what a user does.
    await surface.locator("summary").click();
    await expect(surface).toHaveAttribute("open", "");
    return surface;
  }

  /**
   * Whether the authenticated shell is rendered at all.
   *
   * Both mounts exist in the DOM on both viewports — one visible, one hidden by
   * the breakpoint — so counting them is the viewport-agnostic way to ask "are we
   * inside the shell", which is the question every logout assertion is really
   * asking.
   */
  function shell(page: Page) {
    return page.locator(".account-menu");
  }

  async function expectOnLogin(page: Page, copy: Copy) {
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/auth/login`), { timeout: 30_000 });
    await expect(page.getByRole("button", { name: copy.signIn })).toBeVisible();
    await expect(shell(page)).toHaveCount(0);
  }

  for (const copy of COPY) {
    test(`[${copy.locale}] the account surface names the active account and signs out`, async ({ page }) => {
      await signIn(page, copy, accountA);

      const surface = await openAccount(page);
      // Requirement 1: which display-name account is active.
      await expect(surface).toContainText(copy.signedInAs);
      await expect(surface).toContainText(NAME_A);
      // Settings is reached as the destination it already is — no new route.
      await expect(surface.getByRole("link", { name: copy.settings }))
        .toHaveAttribute("href", `/${copy.locale}/app/settings`);

      await surface.getByRole("button", { name: copy.signOut }).click();

      // Requirement: localized redirect, with the localized confirmation.
      await expectOnLogin(page, copy);
      await expect(page.getByText(copy.signedOut)).toBeVisible();
    });

    test(`[${copy.locale}] a protected route is inaccessible after signing out`, async ({ page }) => {
      await signIn(page, copy, accountA);
      await (await openAccount(page)).getByRole("button", { name: copy.signOut }).click();
      await expectOnLogin(page, copy);

      // Requirement 3: the session is really gone, so a *direct* request to a
      // protected route is redirected by `proxy.ts` rather than served.
      for (const route of ["app", "app/work", "app/settings"]) {
        const response = await page.goto(`/${copy.locale}/${route}`);
        expect(response?.status()).toBeLessThan(400);
        await expectOnLogin(page, copy);
      }
    });

    test(`[${copy.locale}] browser Back does not restore usable authenticated content`, async ({ page }) => {
      await signIn(page, copy, accountA);

      // The mechanism, asserted rather than assumed: a protected response the
      // browser is allowed to store is a response Back can hand back. The first
      // live run of this spec failed here because nothing set this header, and
      // Back returned the fully rendered shell with the account surface still
      // naming the account that had just signed out.
      const protectedResponse = await page.goto(`/${copy.locale}/app/work`);
      expect(protectedResponse?.headers()["cache-control"] ?? "").toContain("no-store");
      await expect(shell(page)).not.toHaveCount(0);

      await page.goto(`/${copy.locale}/app`);
      await (await openAccount(page)).getByRole("button", { name: copy.signOut }).click();
      await expectOnLogin(page, copy);

      // Requirement 4. `no-store` makes the entry ineligible for bfcache, so Back
      // re-fetches it, the proxy sees no claim, and the user stays out.
      await page.goBack();
      await expectOnLogin(page, copy);

      // And again, from deeper in the history.
      await page.goBack().catch(() => {});
      await expect(shell(page)).toHaveCount(0);
    });

    test(`[${copy.locale}] account A signs out and account B signs in`, async ({ page }) => {
      await signIn(page, copy, accountA);
      await expect(await openAccount(page)).toContainText(NAME_A);
      await account(page).getByRole("button", { name: copy.signOut }).click();
      await expectOnLogin(page, copy);

      // Requirement 10: switching is sign-out followed by sign-in, and the
      // surface must name the *new* account.
      await signIn(page, copy, accountB);
      const surface = await openAccount(page);
      await expect(surface).toContainText(NAME_B);
      await expect(surface).not.toContainText(NAME_A);
    });
  }

  test("an already-invalidated session still lets the user leave cleanly", async ({ page }) => {
    const copy = COPY[0];
    await signIn(page, copy, accountA);
    await expect(shell(page)).not.toHaveCount(0);

    // The session is revoked at the provider while the browser still holds its
    // cookies — the state a user meets when they come back to a tab left open
    // for a day. Requirement 5: they must still be able to leave, not be stuck
    // in a shell that cannot load with a control that refuses to work.
    const token = await tokenFor(accountA);
    await fetch(`${supabaseUrl}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: { apikey: publishableKey!, authorization: `Bearer ${token}` },
    });

    await page.reload();
    // Either the shell still renders from the unexpired access token, or the
    // proxy has already sent us to login. Both are clean; what must not happen is
    // a shell with no way out — or, as the first live run found, a redirect loop.
    if (await shell(page).count()) {
      await (await openAccount(page)).getByRole("button", { name: copy.signOut }).click();
    }
    await expectOnLogin(page, copy);

    // And the user can sign in again afterwards.
    await signIn(page, copy, accountA);
    await expect(shell(page)).not.toHaveCount(0);
  });

  test("the sign-out control refuses a second press while the first is in flight", async ({ page }) => {
    const copy = COPY[0];
    await signIn(page, copy, accountA);
    const surface = await openAccount(page);

    const button = surface.getByRole("button", { name: copy.signOut });
    await button.click();
    // Requirement 6. The control disables itself for the round, so two rounds
    // cannot race two redirects. Raced against the redirect, so a miss is
    // tolerated — the assertion that matters is that we land on login exactly
    // once, with no error state.
    await expect(button).toBeDisabled({ timeout: 2_000 }).catch(() => {});
    await expectOnLogin(page, copy);
    await expect(page.getByText(copy.signedOut)).toBeVisible();
  });

  test("sign-out is reachable and operable by keyboard alone", async ({ page }) => {
    const copy = COPY[0];
    await signIn(page, copy, accountA);

    const surface = await revealAccount(page);
    const control = surface.locator("summary");

    // Requirement 8, first half: the disclosure opens from the keyboard, and
    // Escape closes it and puts focus back on the control that opened it.
    await control.focus();
    await page.keyboard.press("Enter");
    await expect(surface).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(surface).not.toHaveAttribute("open", "");
    await expect(control).toBeFocused();

    // Second half: sign out without a pointer at any point.
    await page.keyboard.press("Enter");
    await expect(surface).toHaveAttribute("open", "");
    await surface.getByRole("button", { name: copy.signOut }).focus();
    await page.keyboard.press("Enter");
    await expectOnLogin(page, copy);
  });

  test("a pointer press outside the account panel closes it without signing out", async ({ page }) => {
    const copy = COPY[0];
    await signIn(page, copy, accountA);
    const surface = await openAccount(page);
    await expect(surface).toHaveAttribute("open", "");

    await page.locator("main").click({ position: { x: 5, y: 5 } });

    /*
     * Requirement 8, second half. Every open layer dismisses, and unlike Escape
     * that is correct: a press outside is outside *all* of them, so on mobile the
     * overflow panel goes with the account panel. Asserted without `:visible`
     * precisely because the mobile account menu becomes hidden when its
     * container closes — which is the behaviour, not a failure.
     */
    await expect(page.locator(".account-menu[open]")).toHaveCount(0);
    await expect(page.locator("details[open]")).toHaveCount(0);

    // Dismissal is not an action: the session survived it.
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app`));
    await expect(shell(page)).not.toHaveCount(0);
  });

  test("the surface names the account without ever rendering an email or a user id", async ({ page }) => {
    const copy = COPY[0];
    await signIn(page, copy, accountA);
    const surface = await openAccount(page);

    const text = (await surface.textContent()) ?? "";
    expect(text).toContain(NAME_A);
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Nor anywhere else in the authenticated shell chrome.
    const rail = await page.locator(".side-rail, .bottom-nav").allTextContents();
    expect(rail.join(" ")).not.toContain("@");
  });
});
