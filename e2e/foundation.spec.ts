import { expect, test } from "@playwright/test";

test("unauthenticated users are sent to an accessible login", async ({ page }) => {
  await page.goto("/pt-BR/app");
  await expect(page).toHaveURL(/\/pt-BR\/auth\/login/);
  await expect(page.getByRole("heading", { name: /entre no seu brain/i })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toHaveCount(0);
});

/**
 * SH-LEGAL-001/012/013. The legal routes are the one part of this initiative
 * that is genuinely public, so they are fully provable without credentials:
 * reachable unauthenticated, exactly one `h1`, the professional-review banner
 * present, and both locales served.
 */
test("the legal routes are public, in both locales, with one h1 and the review banner", async ({
  page,
}) => {
  for (const [path, heading, banner] of [
    ["/pt-BR/legal/terms", "Termos de Uso", /revis[ãa]o jur[ií]dica/i],
    ["/pt-BR/legal/privacy", "Política de Privacidade", /revis[ãa]o jur[ií]dica/i],
    ["/en/legal/terms", "Terms of Service", /legal review/i],
    ["/en/legal/privacy", "Privacy Policy", /legal review/i],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByText(banner)).toBeVisible();
  }
});

test("signup and password reset forms expose the complete validated fields", async ({ page }) => {
  await page.goto("/pt-BR/auth/register");
  await expect(page.getByLabel("Nome")).toBeVisible();
  // SH-LEGAL-007: present, required, and unchecked by default.
  const consent = page.locator('input[name="acceptedPolicies"]');
  await expect(consent).toHaveAttribute("type", "checkbox");
  await expect(consent).not.toBeChecked();
  await expect(consent).toHaveAttribute("required", "");
  await expect(page.getByRole("link", { name: "Termos de Uso" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Política de Privacidade" })).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("minlength", "12");
  await expect(page.getByLabel("Confirme a senha")).toBeVisible();

  await page.goto("/pt-BR/auth/reset");
  await expect(page.getByRole("heading", { name: "Defina uma nova senha" })).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirme a nova senha")).toBeVisible();
});

/**
 * SH-SUSPEND-002/008. The suspended surface itself needs a genuinely suspended
 * account, which needs credentials — so its rendering is unit-proven
 * (`account-menu.test.tsx` family) and its deployed journey is SH-WORKER-004's
 * gate. What IS credential-free, and worth pinning here, is that the route
 * exists and is not a public page: an unauthenticated visitor is sent to login
 * exactly like a product route, so "account-state" can never become a surface
 * that leaks whether an account is suspended to somebody who is not it.
 */
test("the account-state surface is authenticated-only in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/account-state", "/pt-BR/auth/login"],
    ["/en/account-state", "/en/auth/login"],
  ] as const) {
    const response = await request.get(source, { maxRedirects: 0 });
    // The redirect here is the page's own `redirect()` rather than the proxy's,
    // so the status is asserted as "a redirect" rather than as one exact code.
    expect([307, 308]).toContain(response.status());
    const location = response.headers().location;
    expect(location).toBeDefined();
    expect(new URL(location!, "http://localhost:3000").pathname).toBe(target);
  }
});

test("canonical and legacy daily routes remain protected in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/app/inbox?view=needs-you", "/pt-BR/auth/login"],
    ["/en/app/inbox/entry-1", "/en/auth/login"],
    ["/pt-BR/app/work?view=waiting&page=2", "/pt-BR/auth/login"],
    ["/en/app/chat/conversation-1", "/en/auth/login"],
    ["/pt-BR/app/today?page=3", "/pt-BR/auth/login"],
    ["/en/app/tasks?page=2", "/en/auth/login"],
    ["/pt-BR/app/waiting?page=4", "/pt-BR/auth/login"],
  ] as const) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location;
    expect(location).toBeDefined();
    const redirected = new URL(location!, "http://localhost:3000");
    expect(redirected.pathname).toBe(target);
    /*
     * `2O-ENTRY-007` strengthened this assertion rather than relaxing it.
     *
     * It used to require the redirect to be *exactly* the login path, which was
     * the honest statement of what the product did: it dropped the requested
     * surface on the floor, so anyone following a link to a specific entry
     * landed on the app's home and had to find their way back. The requested
     * path now travels with the redirect, and the assertion checks that it is
     * **the path that was asked for**, which is a property the old form could
     * not express at all.
     */
    expect(redirected.searchParams.get("next"), `${source} lost the requested surface`).toBe(source);
  }
});

/*
 * ============================================================================
 * Slice 2O.1 — the public entry path.
 *
 * These run in the **unauthenticated** lane deliberately, and it is the whole
 * point: the surfaces this slice ships are public, so unlike most of this
 * product they can be proved end to end without a session — against the
 * production build, on desktop and on a Pixel 7, in both locales, in CI, on
 * every run. `2O-ENTRY-001` … `-006`.
 * ============================================================================
 */

test("2O-ENTRY-001: the front door negotiates the language instead of assuming it", async ({
  request,
}) => {
  // `pt-BR` is the fallback, not the answer. A browser that asks for English
  // used to be redirected to `/pt-BR/app` and then to a Portuguese login form.
  for (const [header, target] of [
    ["en-US,en;q=0.9", "/en"],
    ["en", "/en"],
    ["pt-BR,pt;q=0.9", "/pt-BR"],
    // Understood by neither: the fallback, and only here.
    ["ja,de;q=0.8", "/pt-BR"],
    // Ranked rather than ordered: English wins on quality despite coming second.
    ["pt;q=0.4,en;q=0.9", "/en"],
  ] as const) {
    const response = await request.get("/", {
      headers: { "Accept-Language": header },
      maxRedirects: 0,
    });
    expect(response.status(), `Accept-Language: ${header}`).toBe(307);
    const location = response.headers().location;
    expect(location, `Accept-Language: ${header}`).toBeDefined();
    expect(new URL(location!, "http://localhost:3000").pathname).toBe(target);
  }
});

test("2O-ENTRY-002: the entry page states four claims, in both locales", async ({ page }) => {
  for (const [path, lang, heading] of [
    ["/pt-BR", "pt-BR", /o que este produto faz/i],
    ["/en", "en", /what this product does/i],
  ] as const) {
    await page.goto(path);

    // The claims, counted rather than sampled: four, and a fifth would fail.
    const claims = page.getByRole("region", { name: heading }).getByRole("listitem");
    await expect(claims).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(claims.nth(index)).not.toBeEmpty();
    }

    // The page tells the truth about its own language. The root layout hardcodes
    // `<html lang="pt-BR">`, so this is the element that has to be right — and
    // this is the one surface reached by people whose browser asked for English.
    await expect(page.locator(`[lang="${lang}"]`).first()).toBeVisible();

    // Both policy documents, reachable before any account exists.
    await expect(page.locator(`a[href="/${lang}/legal/terms"]`)).toBeVisible();
    await expect(page.locator(`a[href="/${lang}/legal/privacy"]`)).toBeVisible();
  }
});

test("2O-ENTRY-003: the entry page invites no registration while the door is shut", async ({
  page,
}) => {
  for (const path of ["/pt-BR", "/en"] as const) {
    await page.goto(path);
    // A fixture marker first: an absence assertion passes on a page that never
    // rendered, and this page is reached with no session, so a proxy change
    // could silently start serving something else.
    await expect(page.locator(".entry-page")).toBeVisible();

    await expect(page.locator('a[href*="/auth/register"]')).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);
    // And the way in for someone who already has an account is still there,
    // because that is not a registration.
    await expect(page.locator(`a[href$="/auth/login"]`)).toBeVisible();
  }
});

test("2O-ENTRY-005: the register page states the closed door before asking for anything", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["/pt-BR/auth/register", /cadastro fechado/i],
    ["/en/auth/register", /registration closed/i],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    /*
     * **Before**, asserted as DOM order rather than as absence.
     *
     * The requirement's word is "before", and it presupposes the asking — the
     * form stays, and what changed is that the visitor is told the door is shut
     * before a single field appears. Comparing document positions is the only
     * way to assert that; a screenshot would not, and "the form is gone" would
     * be asserting a different requirement.
     */
    const noticeThenForm = await page.evaluate(() => {
      const notice = document.querySelector("h1");
      const form = document.querySelector("form.auth-form");
      if (!notice || !form) return null;
      // Node.DOCUMENT_POSITION_FOLLOWING === 4
      return Boolean(notice.compareDocumentPosition(form) & 4);
    });
    expect(noticeThenForm, "the closed-door statement does not precede the form").toBe(true);

    // The form is still the surface `SH-LEGAL-007` is asserted against, and the
    // action still refuses first and identically.
    await expect(page.locator('input[name="acceptedPolicies"]')).toHaveCount(1);

    // `2O-ENTRY-008`: not a dead end, and there is now a way back to the page
    // that says what the product is.
    await expect(page.locator('a[href$="/auth/login"]')).toBeVisible();
    await expect(page.locator(`a[href="${path.startsWith("/en") ? "/en" : "/pt-BR"}"]`)).toBeVisible();
  }
});

test("2O-ENTRY-006: the closed door answers identically whatever is asked of it", async ({
  page,
}) => {
  /*
   * The uniform-refusal property `SH-SIGNUP-001` exists for, re-asserted at the
   * surface. A statement that varied with a query parameter would answer a
   * question about that parameter — which is what makes a closed door a probe.
   *
   * **Two earlier formulations of this test were wrong, and both are recorded
   * because the second is the interesting one.**
   *
   * *Byte equality of the response* failed on `self.__next_r`, a per-response
   * identifier Next injects — a difference with nothing to do with the property.
   *
   * *"The query is not reflected in the response"* then failed too, and for a
   * real reason worth knowing: `searchParams` is serialized into the **RSC flight
   * payload** whether or not anything renders it. But that is the caller being
   * handed back what the caller just sent, which reveals nothing — and it is
   * not what `SH-SIGNUP-001` protects. That property is that the response must
   * not differ on facts the caller does **not** already know, above all whether
   * an address has an account.
   *
   * So the assertion is over the **user-visible content**: whatever is asked,
   * the page says the same thing. Proving the account-existence half needs a
   * registered address to compare against and belongs to the authenticated
   * suite, not to a lane with no database.
   */
  const probes = [
    "",
    "?email=known%40example.com",
    "?email=unknown%40example.com",
    "?error=signup_closed",
    "?probe=cadastro-aberto",
  ] as const;

  /*
   * **The assertion is over the statement, not over the whole card**, and the
   * third wrong formulation is what taught the difference.
   *
   * Comparing the entire card failed on `?error=signup_closed`, which renders
   * *"Não foi possível continuar. Tente novamente."* — the **generic** banner
   * `authErrorMessage` produces. That is not a leak; it is `SH-SIGNUP-001`'s
   * uniform-outcome mechanism doing its job, mapping every code to one message
   * so that no code can be told from another. Requiring the card to be
   * byte-identical would have made a correct security control fail a test
   * written to protect it.
   *
   * `2O-ENTRY-006` is about *"that statement"* — the closed door — and that is
   * what is compared.
   */
  const statements: string[] = [];
  for (const query of probes) {
    await page.goto(`/pt-BR/auth/register${query}`);
    const heading = await page.getByRole("heading", { level: 1 }).innerText();
    const notice = await page.locator("p.form-alert[role='status']").innerText();
    // The control: this really is the closed register page, so "they all match"
    // is not a statement about five blank pages.
    expect(heading, `${query} did not render the closed register page`).toMatch(/Cadastro fechado/);
    statements.push(`${heading}|${notice}`.replace(/\s+/g, " ").trim());
  }

  for (const [index, statement] of statements.entries()) {
    expect(statement, `${probes[index]} changed the closed-door statement`).toBe(statements[0]);
  }
});

test("2O-ENTRY-007: a hostile return path is refused rather than followed", async ({ request }) => {
  /*
   * The open-redirect case, asserted at the surface.
   *
   * `safeReturnPath` is unit-tested exhaustively; what this proves is that the
   * **rendered login page** does not carry an unusable value into the document,
   * so nothing downstream can submit it back. The value that matters is refused
   * in `signIn` regardless — that is the boundary — and this is the layer that
   * keeps it from ever being offered.
   */
  for (const hostile of [
    "//evil.example",
    "https://evil.example/pt-BR/app",
    "javascript:alert(1)",
    "/en/app/inbox",
    "/pt-BR/legal/terms",
    "/pt-BR/apple",
  ]) {
    const body = await (
      await request.get(`/pt-BR/auth/login?next=${encodeURIComponent(hostile)}`)
    ).text();
    expect(body, `${hostile} reached the form`).not.toContain(`name="next" value="${hostile}"`);
  }

  // The control, in the other direction: a legitimate path really is carried,
  // so the assertions above are not passing because nothing is ever rendered.
  const allowed = await (
    await request.get(`/pt-BR/auth/login?next=${encodeURIComponent("/pt-BR/app/inbox")}`)
  ).text();
  expect(allowed).toContain('name="next"');
  expect(allowed).toContain("/pt-BR/app/inbox");
});
